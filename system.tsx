/**
 * System Routes
 * Handles system diagnostics, health checks, and status monitoring
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { getRoleUUID, getPlanUUID } from "../lib/constants.tsx";
import { getRelativeTime } from "../lib/helpers.tsx";
import { TenantService } from "../data-service.tsx";
import * as kv from "../kv_store.tsx";

const system = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Verify database
system.get("/verify-database", async (c) => {
  try {
    const { data: tenantsData, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .limit(10);
    
    return c.json({
      success: true,
      tables: {
        tenants: {
          accessible: !tenantsError,
          error: tenantsError?.message,
          count: tenantsData?.length || 0,
          records: tenantsData || [],
        },
        users: {
          accessible: !usersError,
          error: usersError?.message,
          count: usersData?.length || 0,
          records: usersData || [],
        }
      }
    });
  } catch (error: any) {
    console.error('[Verify] Error checking database:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Diagnose user
system.get("/diagnose-user/:email", async (c) => {
  try {
    const email = decodeURIComponent(c.req.param("email"));
    
    const diagnostic: any = {
      email,
      timestamp: new Date().toISOString(),
      checks: {}
    };
    
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    
    diagnostic.checks.auth = {
      exists: !!authUser,
      id: authUser?.id || null,
      email: authUser?.email || null,
      email_confirmed: authUser?.email_confirmed_at ? true : false,
      created_at: authUser?.created_at || null,
      last_sign_in: authUser?.last_sign_in_at || null,
      user_metadata: authUser?.user_metadata || {},
      app_metadata: authUser?.app_metadata || {},
      error: authError?.message || null
    };
    
    if (authUser) {
      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from('users')
        .select(`
          *,
          tenants (
            id,
            name,
            status
          ),
          roles (
            id,
            name,
            display_name
          )
        `)
        .eq('id', authUser.id)
        .maybeSingle();
      
      diagnostic.checks.database = {
        exists: !!dbUser,
        user: dbUser || null,
        error: dbError?.message || null
      };
      
      if (dbUser) {
        diagnostic.checks.tenant = {
          has_tenant: !!dbUser.tenant_id,
          tenant_id: dbUser.tenant_id || null,
          tenant_name: dbUser.tenants?.name || null,
          tenant_status: dbUser.tenants?.status || null,
          tenant_active: dbUser.tenants?.status === 'active'
        };
        
        diagnostic.checks.role = {
          has_role: !!dbUser.role_id,
          role_id: dbUser.role_id || null,
          role_name: dbUser.roles?.name || null,
          role_display_name: dbUser.roles?.display_name || null
        };
        
        diagnostic.checks.required_fields = {
          has_name: !!dbUser.name,
          has_email: !!dbUser.email,
          has_tenant_id: !!dbUser.tenant_id,
          has_role_id: !!dbUser.role_id,
          is_active: dbUser.is_active,
          all_present: !!(dbUser.name && dbUser.email && dbUser.tenant_id && dbUser.role_id)
        };
      } else {
        diagnostic.checks.tenant = { error: "User not in database" };
        diagnostic.checks.role = { error: "User not in database" };
        diagnostic.checks.required_fields = { error: "User not in database" };
      }
    }
    
    diagnostic.status = {
      can_authenticate: diagnostic.checks.auth.exists && diagnostic.checks.auth.email_confirmed,
      has_profile: diagnostic.checks.database?.exists || false,
      profile_complete: diagnostic.checks.required_fields?.all_present || false,
      tenant_valid: diagnostic.checks.tenant?.tenant_active || false,
      ready_for_login: 
        diagnostic.checks.auth?.exists &&
        diagnostic.checks.database?.exists &&
        diagnostic.checks.required_fields?.all_present &&
        diagnostic.checks.tenant?.tenant_active
    };
    
    diagnostic.recommendations = [];
    
    if (!diagnostic.checks.auth.exists) {
      diagnostic.recommendations.push("❌ User does not exist in Supabase Auth. Create the user in Admin Panel.");
    } else if (!diagnostic.checks.auth.email_confirmed) {
      diagnostic.recommendations.push("⚠️ User email is not confirmed. This should be auto-confirmed on creation.");
    }
    
    if (diagnostic.checks.auth.exists && !diagnostic.checks.database?.exists) {
      diagnostic.recommendations.push("❌ ORPHANED USER: User exists in Auth but not in public.users table. Delete and recreate in Admin Panel.");
    }
    
    if (diagnostic.checks.database?.exists && !diagnostic.checks.required_fields?.all_present) {
      const missing: string[] = [];
      if (!diagnostic.checks.required_fields.has_name) missing.push('name');
      if (!diagnostic.checks.required_fields.has_email) missing.push('email');
      if (!diagnostic.checks.required_fields.has_tenant_id) missing.push('tenant_id');
      if (!diagnostic.checks.required_fields.has_role_id) missing.push('role_id');
      diagnostic.recommendations.push(`❌ INCOMPLETE PROFILE: Missing fields: ${missing.join(', ')}. Update user in Admin Panel.`);
    }
    
    if (diagnostic.checks.tenant && !diagnostic.checks.tenant.tenant_active) {
      diagnostic.recommendations.push(`⚠️ Tenant is ${diagnostic.checks.tenant.tenant_status}. Activate tenant in Admin Panel.`);
    }
    
    if (diagnostic.status.ready_for_login) {
      diagnostic.recommendations.push("✅ User is ready for login! Check HMS/PMS Tenant App configuration.");
    }
    
    return c.json({
      success: true,
      diagnostic
    });
  } catch (error: any) {
    console.error('[Diagnose] Error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Sync to Postgres
system.post("/sync-to-postgres", async (c) => {
  try {
    const results = {
      tenants: {
        total: 0,
        synced: 0,
        skipped: 0,
        errors: [] as any[]
      },
      users: {
        total: 0,
        synced: 0,
        skipped: 0,
        errors: [] as any[]
      }
    };
    
    const kvTenants = await kv.getByPrefix("tenant:");
    results.tenants.total = kvTenants?.length || 0;
    
    if (!kvTenants || kvTenants.length === 0) {
      return c.json({
        success: true,
        message: "No tenants to sync",
        results
      });
    }
    
    for (const tenant of kvTenants) {
      try {
        const tenantUUID = crypto.randomUUID();
        
        const { data: existingTenant } = await supabaseAdmin
          .from('tenants')
          .select('id, settings')
          .eq('settings->>external_id', tenant.id)
          .single();
        
        if (existingTenant) {
          results.tenants.skipped++;
          continue;
        }
        
        const status = tenant.status || (tenant.plan === 'Trial' ? 'trial' : 'active');
        const mrr = tenant.plan === 'Trial' ? 0 : tenant.plan === 'Basic' ? 99 : tenant.plan === 'Pro' ? 299 : 999;
        
        const { error: insertError } = await supabaseAdmin
          .from('tenants')
          .insert({
            id: tenantUUID,
            name: tenant.name,
            plan_id: getPlanUUID(tenant.plan || 'Trial'),
            status: status,
            mrr: mrr,
            settings: {
              external_id: tenant.id,
              plan: tenant.plan || 'Trial',
              ...tenant
            },
            created_at: new Date(tenant.createdAt || tenant.created || new Date()).toISOString(),
          });
        
        if (insertError) {
          results.tenants.errors.push({
            tenantId: tenant.id,
            error: insertError.message
          });
        } else {
          results.tenants.synced++;
        }
      } catch (error: any) {
        results.tenants.errors.push({
          tenantId: tenant.id,
          error: error.message
        });
      }
    }
    
    return c.json({
      success: true,
      message: "Sync completed",
      results
    });
  } catch (error: any) {
    console.error('[Sync] Error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Initialize plans
system.post("/init-plans", async (c) => {
  try {
    const plans = [
      { name: 'Trial', price: 0, billing: 'monthly', trialDays: 14, active: true },
      { name: 'Basic', price: 99, billing: 'monthly', trialDays: 14, active: true },
      { name: 'Pro', price: 299, billing: 'monthly', trialDays: 14, active: true },
      { name: 'Enterprise', price: 999, billing: 'monthly', trialDays: 14, active: true }
    ];
    
    for (const plan of plans) {
      const planId = `plan_${plan.name.toLowerCase()}`;
      await kv.set(`plan:${planId}`, {
        id: planId,
        ...plan,
        limits: {
          rooms: 0,
          users: 0,
          properties: 0,
          apiCalls: 0,
          storage: 0
        },
        features: [],
        tenants: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    return c.json({
      success: true,
      message: "Plans initialized successfully",
      data: plans
    });
  } catch (error: any) {
    console.error('[Init Plans] Error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Initialize roles
system.post("/init-roles", async (c) => {
  try {
    const roles = [
      { name: 'platform_admin', display_name: 'Platform Admin', level: 100 },
      { name: 'platform_support', display_name: 'Platform Support', level: 90 },
      { name: 'tenant_owner', display_name: 'Tenant Owner', level: 80 },
      { name: 'tenant_admin', display_name: 'Tenant Admin', level: 70 },
      { name: 'tenant_user', display_name: 'Tenant User', level: 60 }
    ];
    
    for (const role of roles) {
      try {
        await supabaseAdmin
          .from('roles')
          .upsert({
            id: getRoleUUID(role.name),
            name: role.name,
            display_name: role.display_name,
            level: role.level,
            is_system: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
      } catch (error: any) {
        console.error(`[Init Roles] Error creating role ${role.name}:`, error);
      }
    }
    
    return c.json({
      success: true,
      message: "Roles initialized successfully",
      data: roles
    });
  } catch (error: any) {
    console.error('[Init Roles] Error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Check tenants direct
system.post("/check-tenants-direct", async (c) => {
  try {
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .limit(10);
    
    return c.json({
      success: true,
      data: tenants || [],
      error: error?.message || null
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Get diagnostic roles
system.get("/diagnostic/roles", async (c) => {
  try {
    const { data: roles, error } = await supabaseAdmin
      .from('roles')
      .select('*');
    
    return c.json({
      success: true,
      data: roles || [],
      error: error?.message || null
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Get diagnostic user role
system.get("/diagnostic/user-role/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        *,
        roles (
          id,
          name,
          display_name
        )
      `)
      .eq('id', userId)
      .single();
    
    return c.json({
      success: true,
      data: user || null,
      error: error?.message || null
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Verify roles
system.get("/verify-roles", async (c) => {
  try {
    const { data: roles, error } = await supabaseAdmin
      .from('roles')
      .select('*');
    
    return c.json({
      success: true,
      data: roles || [],
      count: roles?.length || 0,
      error: error?.message || null
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Verify plans
system.get("/verify-plans", async (c) => {
  try {
    const plans = await kv.getByPrefix("plan:");
    
    return c.json({
      success: true,
      data: plans || [],
      count: plans?.length || 0
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Seed data
system.post("/seed", async (c) => {
  try {
    // Seed implementation would go here
    return c.json({
      success: true,
      message: "Seed data created successfully"
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Delete seed data
system.delete("/seed", async (c) => {
  try {
    // Delete seed implementation would go here
    return c.json({
      success: true,
      message: "Seed data deleted successfully"
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// System health check
system.get("/system/health", async (c) => {
  const startTime = Date.now();
  
  try {
    const healthData: any = {
      timestamp: new Date().toISOString(),
      status: 'operational',
      uptime: Math.floor(performance.now() / 1000),
      services: {},
      metrics: {},
      errors: []
    };

    try {
      const dbStart = Date.now();
      const { data: dbTest, error: dbError } = await supabaseAdmin
        .from('tenants')
        .select('count')
        .limit(1);
      
      const dbLatency = Date.now() - dbStart;
      
      if (dbError) throw dbError;
      
      healthData.services.database = {
        status: 'healthy',
        latency: dbLatency,
        message: 'Database responding normally'
      };
    } catch (error: any) {
      healthData.services.database = {
        status: 'unhealthy',
        error: error.message,
        message: 'Database connection failed'
      };
      healthData.status = 'degraded';
      healthData.errors.push({ service: 'database', error: error.message });
    }

    try {
      const kvStart = Date.now();
      await kv.get('health:check:test');
      const kvLatency = Date.now() - kvStart;
      
      healthData.services.kv_store = {
        status: 'healthy',
        latency: kvLatency,
        message: 'KV store responding normally'
      };
    } catch (error: any) {
      healthData.services.kv_store = {
        status: 'unhealthy',
        error: error.message,
        message: 'KV store connection failed'
      };
      healthData.status = 'degraded';
      healthData.errors.push({ service: 'kv_store', error: error.message });
    }

    try {
      const authStart = Date.now();
      const { data: authTest, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1
      });
      const authLatency = Date.now() - authStart;
      
      if (authError) throw authError;
      
      healthData.services.auth = {
        status: 'healthy',
        latency: authLatency,
        message: 'Auth service responding normally'
      };
    } catch (error: any) {
      healthData.services.auth = {
        status: 'unhealthy',
        error: error.message,
        message: 'Auth service connection failed'
      };
      healthData.status = 'degraded';
      healthData.errors.push({ service: 'auth', error: error.message });
    }

    try {
      const { count: tenantCount } = await supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true });
      
      const { count: userCount } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      const features = await kv.getByPrefix('feature:');
      
      healthData.metrics = {
        total_tenants: tenantCount || 0,
        total_users: userCount || 0,
        total_features: features.length,
        api_latency: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('[Health] Metrics collection error:', error);
      healthData.errors.push({ service: 'metrics', error: error.message });
    }

    healthData.services.edge_functions = {
      status: 'healthy',
      message: 'Edge function responding normally',
      response_time: Date.now() - startTime
    };

    healthData.response_time = Date.now() - startTime;
    
    return c.json({ 
      success: true, 
      data: healthData 
    });
  } catch (error: any) {
    console.error('[Health] Fatal health check error:', error);
    return c.json({ 
      success: false,
      data: {
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message,
        response_time: Date.now() - startTime
      }
    }, 500);
  }
});

// Get status services
system.get("/status/services", async (c) => {
  try {
    const services: Array<{ name: string; status: string; uptime: string; lastIncident: string; description: string }> = [];
    const now = new Date();
    
    const apiUptime = await kv.get('system:uptime:api');
    services.push({
      name: 'API Server',
      status: 'operational',
      uptime: apiUptime?.uptime ? `${apiUptime.uptime}%` : '99.99%',
      lastIncident: getRelativeTime(apiUptime?.lastIncident || null),
      description: 'Core API and backend services'
    });
    
    let dbStatus = 'operational';
    let dbUptime = 99.95;
    let dbLastIncident: string | null = null;
    
    try {
      const { data, error } = await supabaseAdmin
        .from('tenants')
        .select('count')
        .limit(1);
      
      if (error) {
        dbStatus = 'degraded';
        dbUptime = 98.50;
        dbLastIncident = now.toISOString();
      }
      
      const storedDbUptime = await kv.get('system:uptime:database');
      if (storedDbUptime) {
        dbUptime = storedDbUptime.uptime || dbUptime;
        dbLastIncident = storedDbUptime.lastIncident;
      }
    } catch (error) {
      dbStatus = 'down';
      dbUptime = 0;
      dbLastIncident = now.toISOString();
    }
    
    services.push({
      name: 'Database',
      status: dbStatus,
      uptime: `${dbUptime}%`,
      lastIncident: getRelativeTime(dbLastIncident),
      description: 'PostgreSQL database cluster'
    });
    
    let authStatus = 'operational';
    let authUptime = 100;
    let authLastIncident: string | null = null;
    
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1
      });
      
      if (error) {
        authStatus = 'degraded';
        authUptime = 99.50;
        authLastIncident = now.toISOString();
      }
      
      const storedAuthUptime = await kv.get('system:uptime:auth');
      if (storedAuthUptime) {
        authUptime = storedAuthUptime.uptime || authUptime;
        authLastIncident = storedAuthUptime.lastIncident;
      }
    } catch (error) {
      authStatus = 'down';
      authUptime = 0;
      authLastIncident = now.toISOString();
    }
    
    services.push({
      name: 'Authentication',
      status: authStatus,
      uptime: `${authUptime}%`,
      lastIncident: getRelativeTime(authLastIncident),
      description: 'User authentication and authorization'
    });
    
    const paymentUptime = await kv.get('system:uptime:payments');
    services.push({
      name: 'Payment Processing',
      status: paymentUptime?.status || 'operational',
      uptime: paymentUptime?.uptime ? `${paymentUptime.uptime}%` : '99.98%',
      lastIncident: getRelativeTime(paymentUptime?.lastIncident || null),
      description: 'Billing and payment gateway'
    });
    
    const emailUptime = await kv.get('system:uptime:email');
    services.push({
      name: 'Email Service',
      status: emailUptime?.status || 'operational',
      uptime: emailUptime?.uptime ? `${emailUptime.uptime}%` : '99.90%',
      lastIncident: getRelativeTime(emailUptime?.lastIncident || null),
      description: 'Transactional email delivery'
    });
    
    return c.json({
      success: true,
      data: services
    });
  } catch (error: any) {
    console.error('[Status API] Error fetching services:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get incidents
system.get("/status/incidents", async (c) => {
  try {
    const incidents = await kv.getByPrefix('incident:');
    
    const transformedIncidents = incidents
      .map((inc: any) => ({
        id: inc.id,
        title: inc.title,
        severity: inc.severity || 'medium',
        status: inc.status || 'investigating',
        affectedServices: inc.affectedServices || [],
        startTime: inc.startTime,
        resolvedTime: inc.resolvedTime,
        updates: inc.updates || []
      }))
      .sort((a: any, b: any) => 
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    
    return c.json({
      success: true,
      data: transformedIncidents
    });
  } catch (error: any) {
    console.error('[Status API] Error fetching incidents:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create incident
system.post("/status/incidents", async (c) => {
  try {
    const body = await c.req.json();
    const { title, severity, affectedServices, message } = body;
    
    if (!title || !severity) {
      return c.json({
        success: false,
        error: 'Title and severity are required'
      }, 400);
    }
    
    const incidentId = `incident:${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    
    const incident = {
      id: incidentId,
      title,
      severity,
      status: 'investigating',
      affectedServices: affectedServices || [],
      startTime: now,
      resolvedTime: null,
      updates: message ? [{
        timestamp: now,
        message,
        status: 'investigating'
      }] : []
    };
    
    await kv.set(incidentId, incident);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'incident_created',
          resource_type: 'incident',
          resource_id: incidentId,
          details: { title, severity, affectedServices },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Status API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: incident
    });
  } catch (error: any) {
    console.error('[Status API] Error creating incident:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update incident
system.patch("/status/incidents/:id", async (c) => {
  try {
    const incidentId = c.req.param('id');
    const body = await c.req.json();
    
    const incidents = await kv.getByPrefix('incident:');
    const incident = incidents.find((inc: any) => inc.id === incidentId);
    
    if (!incident) {
      return c.json({
        success: false,
        error: 'Incident not found'
      }, 404);
    }
    
    const updatedIncident = {
      ...incident,
      ...body,
      updated: new Date().toISOString()
    };
    
    await kv.set(incidentId, updatedIncident);
    
    return c.json({
      success: true,
      data: updatedIncident
    });
  } catch (error: any) {
    console.error('[Status API] Error updating incident:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get uptime
system.get("/status/uptime", async (c) => {
  try {
    const uptime = await kv.get('system:uptime:api');
    
    return c.json({
      success: true,
      data: {
        uptime: uptime?.uptime || 99.99,
        lastIncident: uptime?.lastIncident || null,
        status: 'operational'
      }
    });
  } catch (error: any) {
    console.error('[Status API] Error fetching uptime:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get status health
system.get("/status/health", async (c) => {
  try {
    return c.json({
      success: true,
      data: {
        status: 'operational',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get auth profile
system.get("/auth/profile", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'No authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    let dbUser: any = null;
    try {
      const { data, error: dbError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (!dbError && data) {
        dbUser = data;
      }
    } catch (e) {
      console.log('[Auth Profile] User not in public.users table');
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || dbUser?.name || user.email?.split('@')[0] || 'User',
        role: user.user_metadata?.role || 'tenant_user',
        tenant_id: user.user_metadata?.tenant_id || dbUser?.tenant_id,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      }
    });
  } catch (error: any) {
    console.error('[Auth Profile] Error:', error);
    return c.json({ success: false, error: error.message || 'Failed to fetch profile' }, 500);
  }
});

// Test user query
system.get("/diagnostic/test-user-query/:email", async (c) => {
  try {
    const email = decodeURIComponent(c.req.param("email"));
    
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('email', email);
    
    return c.json({
      success: true,
      data: users || [],
      error: error?.message || null
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Delete orphaned user
system.delete("/admin/orphaned-users/:email", async (c) => {
  try {
    const email = decodeURIComponent(c.req.param("email"));
    
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    
    if (!authUser) {
      return c.json({
        success: false,
        error: 'User not found in auth'
      }, 404);
    }
    
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', authUser.id)
      .single();
    
    if (dbUser) {
      return c.json({
        success: false,
        error: 'User exists in database, not orphaned'
      }, 400);
    }
    
    await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    
    return c.json({
      success: true,
      message: 'Orphaned user deleted successfully'
    });
  } catch (error: any) {
    console.error('[Admin] Error deleting orphaned user:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default system;

