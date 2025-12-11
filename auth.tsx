/**
 * Auth Routes
 * Handles authentication and user profile
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";

const auth = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get user profile
auth.get("/profile", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }
    
    const accessToken = authHeader.split(' ')[1];
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (authError || !authUser) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
    
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();
    
    if (userError || !user) {
      return c.json({ 
        error: 'User profile not found',
        message: 'Your account exists but your user profile is incomplete. Please contact your administrator.'
      }, 404);
    }
    
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, status, plan_id')
      .eq('id', user.tenant_id)
      .single();
    
    if (tenantError || !tenant) {
      return c.json({ 
        error: 'Tenant not found',
        message: 'Your tenant organization could not be found. Please contact your administrator.'
      }, 404);
    }
    
    const { data: role } = await supabaseAdmin
      .from('roles')
      .select('id, name, display_name')
      .eq('id', user.role_id)
      .single();
    
    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('name, display_name')
      .eq('id', tenant.plan_id)
      .single();
    
    const kvUser = await kv.get(`user:${user.id}`);
    const humanId = kvUser?.human_id || user.id.substring(0, 8);
    
    const profile = {
      id: user.id,
      humanId: humanId,
      email: user.email,
      name: user.name,
      tenantId: user.tenant_id,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
      roleId: user.role_id,
      roleName: role?.display_name || role?.name || 'User',
      plan: plan?.display_name || plan?.name || 'Unknown',
      isActive: user.is_active,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    };
    
    return c.json({
      success: true,
      profile
    });
  } catch (error: any) {
    console.error('[Auth Profile] Error:', error);
    return c.json({ 
      error: 'Failed to load profile',
      message: error.message 
    }, 500);
  }
});

export default auth;

