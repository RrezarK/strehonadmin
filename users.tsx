/**
 * Users Routes
 * Handles user management operations
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { getRoleUUID } from "../lib/constants.tsx";
import { generateUserId, resolveUserId } from "../lib/helpers.tsx";
import { TenantService } from "../data-service.tsx";
import * as kv from "../kv_store.tsx";

const users = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get user by email
users.get("/:email", async (c) => {
  try {
    const email = c.req.param("email");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      return c.json({ error: "Failed to fetch users" }, 500);
    }
    
    const user = data.users.find(u => u.email === email);
    
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    
    return c.json({ 
      success: true,
      data: {
        id: user.id,
        email: user.email,
        tenant_id: user.user_metadata?.tenant_id,
        name: user.user_metadata?.name,
        role: user.user_metadata?.role,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      }
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

// Get all users
users.get("/", async (c) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      return c.json({ error: "Failed to fetch users" }, 500);
    }
    
    const users = data.users.map(u => ({
      id: u.id,
      email: u.email,
      tenant_id: u.user_metadata?.tenant_id,
      name: u.user_metadata?.name,
      role: u.user_metadata?.role,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));
    
    return c.json({ 
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

// Get tenant users
users.get("/tenants/:tenantId/users", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const { tenant, source } = await TenantService.resolve(tenantId);
    
    if (!tenant) {
      return c.json({ 
        success: false, 
        error: "Tenant not found"
      }, 404);
    }
    
    const pgTenantId = tenant.uuid || tenant.id;
    
    const result = await supabaseAdmin
      .from('users')
      .select('id, email, name, tenant_id, role_id, is_active, last_login_at, created_at, updated_at')
      .eq('tenant_id', pgTenantId)
      .order('created_at', { ascending: false });
    
    if (result.error) {
      return c.json({ 
        success: false,
        error: 'Failed to fetch users',
        details: result.error.message 
      }, 500);
    }
    
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
    const authUsers = authData?.users || [];
    
    const users = (result.data || []).map(user => {
      const authUser = authUsers.find(au => au.id === user.id);
      const userMetadata = authUser?.user_metadata || {};
      return {
        id: userMetadata.external_id || user.id,
        uuid: user.id,
        email: user.email,
        name: user.name,
        phoneNumber: userMetadata.phone_number || null,
        jobTitle: userMetadata.job_title || null,
        department: userMetadata.department || null,
        role: 'User',
        roleId: user.role_id,
        status: user.is_active ? 'active' : 'inactive',
        isActive: user.is_active,
        mfaEnabled: authUser?.app_metadata?.mfa_enabled || false,
        lastLoginAt: user.last_login_at || authUser?.last_sign_in_at,
        createdAt: user.created_at,
      };
    });
    
    return c.json({ 
      success: true,
      data: users,
      count: users.length
    });
  } catch (error: any) {
    console.error("[Users API] Error fetching tenant users:", error);
    return c.json({ 
      success: false,
      error: "Failed to fetch tenant users",
      details: error.message 
    }, 500);
  }
});

// Create tenant user
users.post("/tenants/:tenantId/users", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const body = await c.req.json();
    const { email, name, phoneNumber, jobTitle, department, roleId, password, autoGeneratePassword } = body;
    
    if (!email || !name) {
      return c.json({ 
        success: false,
        error: "Email and name are required" 
      }, 400);
    }
    
    const { tenant: resolvedTenant } = await TenantService.resolve(tenantId);
    
    if (!resolvedTenant) {
      return c.json({ 
        success: false,
        error: "Tenant not found"
      }, 404);
    }
    
    const pgTenantId = resolvedTenant.uuid || resolvedTenant.id;
    
    const { data: existingUsers } = await supabaseAdmin
      .from('users')
      .select('id, email, tenant_id')
      .ilike('email', email);
    
    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.tenant_id === pgTenantId) {
        return c.json({ 
          success: false,
          error: "A user with this email already exists for this tenant",
          code: "USER_ALREADY_EXISTS"
        }, 409);
      }
    }
    
    const userPassword = password || (autoGeneratePassword ? 
      `Temp${Math.random().toString(36).substr(2, 12)}!` : null);
    
    if (!userPassword) {
      return c.json({ 
        success: false,
        error: "Password must be provided or auto-generation enabled" 
      }, 400);
    }
    
    const customUserId = await generateUserId();
    
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        name,
        external_id: customUserId,
        phone_number: phoneNumber || null,
        job_title: jobTitle || null,
        department: department || null,
        tenant_id: pgTenantId,
        role: roleId || getRoleUUID('tenant_user'),
        tenant_name: resolvedTenant.name,
        created_via: 'admin_panel',
        created_at: new Date().toISOString(),
      }
    });
    
    if (userError) {
      return c.json({ 
        success: false,
        error: userError.message
      }, 400);
    }
    
    if (!userData?.user) {
      return c.json({ 
        success: false,
        error: 'User creation returned no data'
      }, 500);
    }
    
    const { data: dbUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userData.user.id,
        email,
        name,
        tenant_id: pgTenantId,
        role_id: roleId || getRoleUUID('tenant_user'),
        is_active: true,
      })
      .select(`
        id,
        email,
        name,
        tenant_id,
        role_id,
        is_active,
        created_at
      `)
      .single();
    
    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      return c.json({ 
        success: false,
        error: insertError.message
      }, 500);
    }
    
    return c.json({ 
      success: true,
      message: "User created successfully",
      data: {
        id: customUserId,
        uuid: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        roleId: dbUser.role_id,
        status: dbUser.is_active ? 'active' : 'inactive',
        isActive: dbUser.is_active,
        createdAt: dbUser.created_at,
        tempPassword: autoGeneratePassword ? userPassword : undefined,
      }
    }, 201);
  } catch (error: any) {
    console.error("[Users API] Error creating user:", error);
    return c.json({ 
      success: false,
      error: "Failed to create user",
      details: error.message 
    }, 500);
  }
});

// Update tenant user
users.put("/tenants/:tenantId/users/:userId", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { name, phoneNumber, jobTitle, department, roleId, isActive, password } = body;
    
    const { tenant: resolvedTenant } = await TenantService.resolve(tenantId);
    
    if (!resolvedTenant) {
      return c.json({ 
        success: false,
        error: "Tenant not found"
      }, 404);
    }
    
    const pgTenantId = resolvedTenant.uuid || resolvedTenant.id;
    const resolvedUserId = await resolveUserId(userId);
    
    if (!resolvedUserId) {
      return c.json({ 
        success: false,
        error: "User not found"
      }, 404);
    }
    
    const { data: dbUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        name: name !== undefined ? name : undefined,
        role_id: roleId !== undefined ? roleId : undefined,
        is_active: isActive !== undefined ? isActive : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedUserId)
      .eq('tenant_id', pgTenantId)
      .select('id, email, name, role_id, is_active')
      .single();
    
    if (updateError) {
      return c.json({ 
        success: false,
        error: updateError.message
      }, 500);
    }
    
    const authUpdate: any = {};
    const metadataUpdate: any = {};
    if (name !== undefined) metadataUpdate.name = name;
    if (phoneNumber !== undefined) metadataUpdate.phone_number = phoneNumber;
    if (jobTitle !== undefined) metadataUpdate.job_title = jobTitle;
    if (department !== undefined) metadataUpdate.department = department;
    
    if (Object.keys(metadataUpdate).length > 0) {
      authUpdate.user_metadata = metadataUpdate;
    }
    
    if (password && password.length >= 8) {
      authUpdate.password = password;
    }
    
    if (Object.keys(authUpdate).length > 0) {
      await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, authUpdate);
    }
    
    const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(resolvedUserId);
    const externalId = authUserData?.user?.user_metadata?.external_id || dbUser.id;
    
    return c.json({ 
      success: true,
      message: "User updated successfully",
      data: {
        id: externalId,
        uuid: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        roleId: dbUser.role_id,
        status: dbUser.is_active ? 'active' : 'inactive',
        isActive: dbUser.is_active,
      }
    });
  } catch (error: any) {
    console.error("[Users API] Error updating user:", error);
    return c.json({ 
      success: false,
      error: "Failed to update user",
      details: error.message 
    }, 500);
  }
});

// Delete tenant user
users.delete("/tenants/:tenantId/users/:userId", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const userId = c.req.param("userId");
    
    const { tenant: resolvedTenant } = await TenantService.resolve(tenantId);
    
    if (!resolvedTenant) {
      return c.json({ 
        success: false,
        error: "Tenant not found"
      }, 404);
    }
    
    const pgTenantId = resolvedTenant.uuid || resolvedTenant.id;
    const resolvedUserId = await resolveUserId(userId);
    
    if (!resolvedUserId) {
      return c.json({ 
        success: false,
        error: "User not found"
      }, 404);
    }
    
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', resolvedUserId)
      .eq('tenant_id', pgTenantId);
    
    if (deleteError) {
      return c.json({ 
        success: false,
        error: deleteError.message
      }, 500);
    }
    
    await supabaseAdmin.auth.admin.deleteUser(resolvedUserId);
    
    return c.json({ 
      success: true,
      message: "User deleted successfully"
    });
  } catch (error: any) {
    console.error("[Users API] Error deleting user:", error);
    return c.json({ 
      success: false,
      error: "Failed to delete user",
      details: error.message 
    }, 500);
  }
});

// Reset user password
users.post("/tenants/:tenantId/users/:userId/reset-password", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { password } = body;
    
    const resolvedUserId = await resolveUserId(userId);
    
    if (!resolvedUserId) {
      return c.json({ 
        success: false,
        error: "User not found"
      }, 404);
    }
    
    if (!password || password.length < 8) {
      return c.json({ 
        success: false,
        error: "Password must be at least 8 characters"
      }, 400);
    }
    
    await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
      password: password
    });
    
    return c.json({ 
      success: true,
      message: "Password reset successfully"
    });
  } catch (error: any) {
    console.error("[Users API] Error resetting password:", error);
    return c.json({ 
      success: false,
      error: "Failed to reset password",
      details: error.message 
    }, 500);
  }
});

// Toggle MFA
users.post("/tenants/:tenantId/users/:userId/toggle-mfa", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { enabled } = body;
    
    const resolvedUserId = await resolveUserId(userId);
    
    if (!resolvedUserId) {
      return c.json({ 
        success: false,
        error: "User not found"
      }, 404);
    }
    
    await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
      app_metadata: {
        mfa_enabled: enabled
      }
    });
    
    return c.json({ 
      success: true,
      message: `MFA ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error: any) {
    console.error("[Users API] Error toggling MFA:", error);
    return c.json({ 
      success: false,
      error: "Failed to toggle MFA",
      details: error.message 
    }, 500);
  }
});

export default users;

