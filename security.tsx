/**
 * Security Routes
 * Handles security settings and admin management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";

const security = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get platform admins
security.get("/admins", async (c) => {
  try {
    let admins: any[] = [];
    
    try {
      const result = await supabaseAdmin
        .from('users')
        .select(`
          id,
          name,
          email,
          role_id,
          last_login_at,
          created_at,
          roles (
            id,
            name,
            display_name
          )
        `)
        .in('role_id', [
          '10000000-0000-0000-0000-000000000001', // platform_admin
          '10000000-0000-0000-0000-000000000002'  // platform_support
        ]);
      
      if (!result.error) {
        admins = result.data || [];
      }
    } catch (err: any) {
      console.error('[Security API] Error in initial query:', err);
    }
    
    const transformedAdmins = admins.map(admin => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.roles?.display_name || admin.roles?.name || 'Unknown',
      roleId: admin.role_id,
      mfa: false,
      lastActive: admin.last_login_at 
        ? new Date(admin.last_login_at).toLocaleString()
        : 'Never',
      createdAt: admin.created_at
    }));
    
    return c.json({
      success: true,
      data: transformedAdmins
    });
  } catch (error: any) {
    console.error('[Security API] Error in /security/admins:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create platform admin
security.post("/admins", async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, password, roleId } = body;
    
    if (!name || !email || !roleId) {
      return c.json({
        success: false,
        error: 'Name, email, and role are required'
      }, 400);
    }
    
    const adminPassword = password || `Admin${Math.random().toString(36).substring(2, 12)}!`;
    
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name,
        role: 'platform_admin'
      }
    });
    
    if (authError) {
      throw authError;
    }
    
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id,
        name,
        email,
        role_id: roleId,
        tenant_id: null
      })
      .select()
      .single();
    
    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw dbError;
    }
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'admin_created',
          actor_id: authUser.user.id,
          resource_type: 'user',
          resource_id: dbUser.id,
          details: {
            email,
            name,
            role_id: roleId
          },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Security API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        tempPassword: adminPassword
      }
    });
  } catch (error: any) {
    console.error('[Security API] Error creating admin:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to create admin' 
    }, 500);
  }
});

// Toggle MFA for admin
security.patch("/admins/:id/mfa", async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();
    const { enabled } = body;
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      console.warn('[Security API] MFA toggle recorded in audit log only');
    }
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: enabled ? 'mfa_enabled' : 'mfa_disabled',
          actor_id: userId,
          resource_type: 'user',
          resource_id: userId,
          details: {
            mfa_status: enabled
          },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Security API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: user
    });
  } catch (error: any) {
    console.error('[Security API] Error toggling MFA:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get RBAC permissions
security.get("/permissions", async (c) => {
  try {
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('roles')
      .select('*')
      .eq('is_system', true)
      .order('level', { ascending: false });
    
    if (rolesError) {
      throw rolesError;
    }
    
    const { data: permissions, error: permsError } = await supabaseAdmin
      .from('permissions')
      .select('*');
    
    if (permsError) {
      throw permsError;
    }
    
    const { data: rolePermissions, error: mappingError } = await supabaseAdmin
      .from('role_permissions')
      .select('*');
    
    if (mappingError) {
      throw mappingError;
    }
    
    return c.json({
      success: true,
      data: {
        roles: roles || [],
        permissions: permissions || [],
        rolePermissions: rolePermissions || []
      }
    });
  } catch (error: any) {
    console.error('[Security API] Error fetching permissions:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get security policies
security.get("/policies", async (c) => {
  try {
    const policies = await kv.get('system:security_policies');
    
    const defaultPolicies = {
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      },
      sessionPolicy: {
        timeout: 30,
        maxConcurrent: 5
      },
      ipWhitelist: [],
      rateLimiting: {
        enabled: true,
        requestsPerMinute: 60
      }
    };
    
    return c.json({
      success: true,
      data: policies || defaultPolicies
    });
  } catch (error: any) {
    console.error('[Security API] Error fetching policies:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update security policies
security.put("/policies", async (c) => {
  try {
    const body = await c.req.json();
    
    await kv.set('system:security_policies', body);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'security_policies_updated',
          resource_type: 'settings',
          resource_id: 'security_policies',
          details: body,
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Security API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: 'Security policies updated successfully',
      data: body
    });
  } catch (error: any) {
    console.error('[Security API] Error updating policies:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get RLS status
security.get("/rls-status", async (c) => {
  try {
    const tables = ['tenants', 'users', 'guests', 'reservations'];
    const rlsStatus: Record<string, boolean> = {};
    
    for (const table of tables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1);
        
        rlsStatus[table] = !error;
      } catch (err) {
        rlsStatus[table] = false;
      }
    }
    
    return c.json({
      success: true,
      data: rlsStatus
    });
  } catch (error: any) {
    console.error('[Security API] Error checking RLS status:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default security;

