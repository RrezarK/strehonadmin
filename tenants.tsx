/**
 * Tenants Routes
 * Handles tenant management operations
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { getPlanUUID, getRoleUUID } from "../lib/constants.tsx";
import { generateUserId } from "../lib/helpers.tsx";
import * as kv from "../kv_store.tsx";
import { TenantService } from "../data-service.tsx";

const tenants = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// List all tenants
tenants.get("/", async (c) => {
  try {
    console.log('[Tenants API] Fetching tenants from Postgres...');
    
    const { data: pgTenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Tenants API] Error fetching from Postgres:', error);
      throw error;
    }
    
    const { data: userCounts } = await supabaseAdmin
      .from('users')
      .select('tenant_id');
    
    const userCountMap = new Map<string, number>();
    if (userCounts) {
      userCounts.forEach((u: any) => {
        const count = userCountMap.get(u.tenant_id) || 0;
        userCountMap.set(u.tenant_id, count + 1);
      });
    }
    
    const plans = await kv.getByPrefix("plan:") || [];
    const planPriceMap = new Map<string, number>();
    plans.forEach((plan: any) => {
      if (plan.name && plan.price !== undefined) {
        planPriceMap.set(plan.name, plan.price);
      }
    });
    
    const tenants = (pgTenants || []).map((t: any) => {
      const planName = t.settings?.plan || 'Trial';
      const planPrice = planPriceMap.get(planName) || 0;
      
      return {
        id: t.settings?.external_id || t.id,
        uuid: t.id,
        name: t.name,
        status: t.status,
        plan: planName,
        tenantEmail: t.settings?.tenantEmail,
        tenantPhone: t.settings?.tenantPhone,
        owner: t.settings?.owner || 'Unknown',
        ownerName: t.settings?.ownerName,
        ownerUserId: t.settings?.ownerUserId,
        subdomain: t.settings?.subdomain,
        legalName: t.settings?.legalName,
        billingEntity: t.settings?.billingEntity,
        industry: t.settings?.industry,
        propertyCount: t.settings?.propertyCount,
        roomCount: t.settings?.roomCount,
        userCount: userCountMap.get(t.id) || 0,
        usagePercent: 0,
        mrr: planPrice,
        created: t.created_at,
        settings: t.settings
      };
    });
    
    return c.json({ 
      success: true,
      data: tenants,
      count: tenants.length
    });
  } catch (error: any) {
    console.error("[Tenants API] Error fetching tenants:", error);
    return c.json({ 
      success: false,
      error: "Failed to fetch tenants",
      details: error.message 
    }, 500);
  }
});

// Get single tenant
tenants.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    let { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('settings->>external_id', id)
      .single();
    
    if (!tenant && error) {
      const result = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', id)
        .single();
      
      tenant = result.data;
      error = result.error;
    }
    
    if (error || !tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    
    const planName = tenant.settings?.plan || 'Trial';
    const plan = await kv.get(`plan:${planName}`);
    const planPrice = plan?.price || 0;
    
    const transformedTenant = {
      id: tenant.settings?.external_id || tenant.id,
      uuid: tenant.id,
      name: tenant.name,
      status: tenant.status,
      plan: planName,
      tenantEmail: tenant.settings?.tenantEmail,
      tenantPhone: tenant.settings?.tenantPhone,
      owner: tenant.settings?.owner || 'Unknown',
      ownerName: tenant.settings?.ownerName,
      ownerUserId: tenant.settings?.ownerUserId,
      region: tenant.settings?.region || 'US-East',
      subdomain: tenant.settings?.subdomain,
      legalName: tenant.settings?.legalName,
      billingEntity: tenant.settings?.billingEntity,
      industry: tenant.settings?.industry,
      propertyCount: tenant.settings?.propertyCount,
      roomCount: tenant.settings?.roomCount,
      usagePercent: 0,
      mrr: planPrice,
      created: tenant.created_at,
      settings: tenant.settings
    };
    
    return c.json({ 
      success: true,
      tenant: transformedTenant 
    });
  } catch (error: any) {
    console.error("[Tenants API] Error fetching tenant:", error);
    return c.json({ 
      success: false,
      error: "Failed to fetch tenant",
      details: error.message 
    }, 500);
  }
});

// Create new tenant
tenants.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { 
      legalName, 
      billingEntity, 
      subdomain, 
      region, 
      plan, 
      ownerName, 
      ownerEmail,
      ownerRoleId,
      ownerPassword,
      tenantEmail,
      tenantPhone
    } = body;

    if (!legalName || !subdomain || !plan || !tenantEmail) {
      return c.json({ 
        error: "Missing required fields",
        required: ['legalName', 'subdomain', 'plan', 'tenantEmail']
      }, 400);
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(tenantEmail)) {
      return c.json({ 
        error: "Invalid tenant email format"
      }, 400);
    }
    
    if ((ownerName && !ownerEmail) || (!ownerName && ownerEmail)) {
      return c.json({ 
        error: "If creating an owner account, both ownerName and ownerEmail must be provided"
      }, 400);
    }

    const tenantUUID = crypto.randomUUID();
    
    let tenantCounter = 1;
    try {
      const counterKey = 'system:tenant_counter';
      const currentCounter = await kv.get(counterKey);
      
      if (currentCounter && typeof currentCounter === 'number') {
        tenantCounter = currentCounter;
      }
      
      await kv.set(counterKey, tenantCounter + 1);
    } catch (error) {
      tenantCounter = Math.floor(Date.now() / 1000) % 10000;
    }
    
    const tenantId = `T-${tenantCounter}`;
    const password = ownerPassword || `Temp${Math.random().toString(36).substr(2, 12)}!`;
    
    let ownerUserId: string | null = null;
    let ownerUserExternalId: string | null = null;
    let userCreationError: string | null = null;
    
    if (ownerName && ownerEmail) {
      try {
        const customUserId = await generateUserId();
        ownerUserExternalId = customUserId;
        
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
          email: ownerEmail,
          password: password,
          email_confirm: true,
          user_metadata: {
            name: ownerName,
            external_id: customUserId,
            tenant_id: tenantUUID,
            tenant_code: tenantId,
            role: 'tenant_owner',
            tenant_name: legalName,
          }
        });

        if (userError) {
          userCreationError = userError.message;
        } else if (userData?.user) {
          ownerUserId = userData.user.id;
        }
      } catch (authError: any) {
        userCreationError = authError.message;
      }
    }
    
    const tenantStatus = plan === 'Trial' ? 'trial' : 'active';
    const mrr = plan === 'Trial' ? 0 : plan === 'Basic' ? 99 : plan === 'Pro' ? 299 : 999;
    
    let tenantsTableError = null;
    try {
      const { error: insertTenantError } = await supabaseAdmin
        .from('tenants')
        .insert({
          id: tenantUUID,
          name: legalName,
          plan_id: getPlanUUID(plan),
          status: tenantStatus,
          mrr: mrr,
          settings: {
            external_id: tenantId,
            plan: plan,
            subdomain: subdomain,
            region: region || null,
            billingEntity: billingEntity || legalName,
            tenantEmail: tenantEmail,
            tenantPhone: tenantPhone || null,
            owner: ownerEmail || null,
            ownerName: ownerName || null,
            ownerUserId: ownerUserId || null,
          },
          created_at: new Date().toISOString(),
        });

      if (insertTenantError) {
        tenantsTableError = insertTenantError.message;
      }
    } catch (dbError: any) {
      tenantsTableError = dbError.message;
    }
    
    let usersTableError = null;
    if (ownerUserId && !tenantsTableError) {
      try {
        const { error: insertUserError } = await supabaseAdmin
          .from('users')
          .insert({
            id: ownerUserId,
            email: ownerEmail,
            name: ownerName,
            tenant_id: tenantUUID,
            role_id: ownerRoleId || getRoleUUID('tenant_owner'),
          });

        if (insertUserError) {
          usersTableError = insertUserError.message;
        }
      } catch (dbError: any) {
        usersTableError = dbError.message;
      }
    }
    
    const tenant = {
      id: tenantId,
      uuid: tenantUUID,
      name: legalName,
      billingEntity: billingEntity || legalName,
      subdomain,
      region: region || null,
      plan,
      tenantEmail: tenantEmail,
      tenantPhone: tenantPhone || null,
      owner: ownerEmail || null,
      ownerName: ownerName || null,
      ownerUserId: ownerUserId || null,
      status: tenantStatus,
      usagePercent: 0,
      mrr: mrr,
      created: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      tempPassword: ownerUserId ? password : null,
      userCreationError: userCreationError,
      tenantsTableError: tenantsTableError,
      usersTableError: usersTableError,
    };
    
    await kv.set(`tenant:${tenantId}`, tenant);
    await kv.set(`tenant_uuid:${tenantUUID}`, { customId: tenantId, uuid: tenantUUID });
    
    await kv.set(`audit:${Date.now()}`, {
      action: "tenant.created",
      tenantId,
      timestamp: new Date().toISOString(),
      data: {
        ...tenant,
        tempPassword: undefined,
      },
    });

    const warnings: Array<{ field: string; message: string }> = [];
    let successMessage = ownerName && ownerEmail 
      ? "Tenant and owner user created successfully in all systems"
      : "Tenant created successfully (owner user can be added later)";
    
    if (userCreationError) {
      warnings.push({
        field: 'auth.users',
        message: `Auth user creation failed: ${userCreationError}`
      });
      successMessage = "Tenant creation incomplete";
    }
    
    if (tenantsTableError) {
      warnings.push({
        field: 'public.tenants',
        message: `Tenants table insert failed: ${tenantsTableError}`
      });
      successMessage = "Tenant creation incomplete";
    }
    
    if (usersTableError) {
      warnings.push({
        field: 'public.users',
        message: `Users table insert failed: ${usersTableError}`
      });
      successMessage = "Tenant creation incomplete";
    }
    
    const isSuccess = !tenantsTableError && (ownerName && ownerEmail ? !userCreationError && !usersTableError : true);
    
    return c.json({ 
      success: isSuccess,
      message: successMessage,
      data: tenant,
      warnings: warnings,
      creationStatus: {
        authUser: ownerName && ownerEmail ? !userCreationError : null,
        tenantsTable: !tenantsTableError,
        usersTable: ownerName && ownerEmail ? !usersTableError : null,
        kvStore: true,
      }
    }, warnings.length > 0 ? 207 : 201);
  } catch (error: any) {
    console.error("Error creating tenant:", error);
    return c.json({ 
      error: "Failed to create tenant",
      details: error.message 
    }, 500);
  }
});

// Update tenant
tenants.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existing = await kv.get(`tenant:${id}`);
    if (!existing) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    
    const tenant = {
      ...existing,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`tenant:${id}`, tenant);

    if (existing.uuid) {
      try {
        const { data: currentTenant } = await supabaseAdmin
          .from('tenants')
          .select('settings')
          .eq('id', existing.uuid)
          .single();

        if (currentTenant) {
          const updatedSettings = {
            ...currentTenant.settings,
            ...body,
          };

          await supabaseAdmin
            .from('tenants')
            .update({
              settings: updatedSettings,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.uuid);
        }
      } catch (pgError: any) {
        console.error('[Tenants] Error updating Postgres tenant:', pgError);
      }
    }
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          tenant_id: id,
          action: 'tenant.updated',
          entity_type: 'tenant',
          entity_id: id,
          new_values: body,
          created_at: new Date().toISOString(),
        });
    } catch (auditError) {
      console.warn('[Tenants] Could not log audit event:', auditError);
    }
    
    return c.json({ 
      success: true,
      message: "Tenant updated successfully",
      data: tenant 
    });
  } catch (error) {
    console.error("Error updating tenant:", error);
    return c.json({ error: "Failed to update tenant" }, 500);
  }
});

// Suspend tenant
tenants.post("/:id/suspend", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existing = await kv.get(`tenant:${id}`);
    if (!existing) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    
    const tenant = {
      ...existing,
      status: "suspended",
      suspendedAt: new Date().toISOString(),
      suspensionReason: body.reason,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`tenant:${id}`, tenant);
    
    return c.json({ 
      success: true,
      message: "Tenant suspended successfully",
      data: tenant 
    });
  } catch (error) {
    console.error("Error suspending tenant:", error);
    return c.json({ error: "Failed to suspend tenant" }, 500);
  }
});

// Unsuspend tenant
tenants.post("/:id/unsuspend", async (c) => {
  try {
    const id = c.req.param("id");
    
    const existing = await kv.get(`tenant:${id}`);
    if (!existing) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    
    const tenant = {
      ...existing,
      status: "active",
      unsuspendedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`tenant:${id}`, tenant);
    
    return c.json({ 
      success: true,
      message: "Tenant unsuspended successfully",
      data: tenant 
    });
  } catch (error) {
    console.error("Error unsuspending tenant:", error);
    return c.json({ error: "Failed to unsuspend tenant" }, 500);
  }
});

// Delete tenant
tenants.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    let { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('settings->>external_id', id)
      .single();
    
    if (!tenant && error) {
      const result = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', id)
        .single();
      
      tenant = result.data;
      error = result.error;
    }
    
    if (error || !tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    
    const tenantUUID = tenant.id;
    const externalId = tenant.settings?.external_id || id;
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          tenant_id: tenantUUID,
          action: 'tenant.deleted',
          entity_type: 'tenant',
          entity_id: tenantUUID,
          old_values: tenant,
          created_at: new Date().toISOString(),
        });
    } catch (auditError) {
      console.warn('[Tenants] Could not log audit event:', auditError);
    }
    
    const { error: deleteError } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenantUUID);
    
    if (deleteError) {
      return c.json({ 
        error: "Failed to delete tenant from database",
        details: deleteError.message 
      }, 500);
    }
    
    try {
      await kv.del(`tenant:${externalId}`);
    } catch (kvError) {
      console.warn(`[Tenants] Could not delete from KV store:`, kvError);
    }

    return c.json({ 
      success: true,
      message: "Tenant deleted successfully"
    });
  } catch (error: any) {
    console.error("[Tenants API] Error deleting tenant:", error);
    return c.json({ 
      error: "Failed to delete tenant",
      details: error.message 
    }, 500);
  }
});

// Get tenant settings
tenants.get("/:tenantId/settings", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    
    let { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('settings->>external_id', tenantId)
      .single();
    
    if (!tenant && error) {
      const result = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();
      
      tenant = result.data;
      error = result.error;
    }
    
    if (error || !tenant) {
      return c.json({ 
        success: false,
        error: "Tenant not found" 
      }, 404);
    }
    
    const propertySettings = tenant.settings?.property || {
      propertyName: tenant.name || '',
      contactEmail: tenant.settings?.tenantEmail || '',
      address: '',
      checkInTime: '02:00 PM',
      checkOutTime: '11:00 AM',
      currency: '$ - US Dollar (USD)',
      frontDeskEnabled: true,
      onlineBookingEnabled: false,
    };
    
    const roomsSettings = tenant.settings?.rooms || {
      defaultCapacity: 2,
      allowOverbooking: false,
    };
    
    const notificationsSettings = tenant.settings?.notifications || {
      emailNotifications: true,
      smsNotifications: false,
      bookingConfirmations: true,
    };
    
    const securitySettings = tenant.settings?.security || {
      twoFactorAuth: false,
      sessionTimeout: 30,
    };
    
    const integrationsSettings = tenant.settings?.integrations || {
      paymentGateway: 'stripe',
      channelManager: null,
    };
    
    return c.json({
      success: true,
      data: {
        property: propertySettings,
        rooms: roomsSettings,
        notifications: notificationsSettings,
        security: securitySettings,
        integrations: integrationsSettings,
      }
    });
  } catch (error: any) {
    console.error('[Tenant Settings] Error fetching settings:', error);
    return c.json({ 
      success: false,
      error: error.message || 'Failed to fetch settings' 
    }, 500);
  }
});

// Update tenant settings
tenants.put("/:tenantId/settings", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const body = await c.req.json();
    
    let settingsUpdate = body;
    if (body.category && body.data) {
      settingsUpdate = { [body.category]: body.data };
    }
    
    let { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('settings->>external_id', tenantId)
      .single();
    
    if (!tenant && error) {
      const result = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();
      
      tenant = result.data;
      error = result.error;
    }
    
    if (error || !tenant) {
      return c.json({ 
        success: false,
        error: "Tenant not found" 
      }, 404);
    }
    
    const tenantUUID = tenant.id;
    const currentSettings = tenant.settings || {};
    const updatedSettings = {
      ...currentSettings,
      ...settingsUpdate,
    };
    
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantUUID);
    
    if (updateError) {
      return c.json({ 
        success: false,
        error: "Failed to update settings",
        details: updateError.message 
      }, 500);
    }
    
    try {
      const externalId = tenant.settings?.external_id || tenantId;
      const kvTenant = await kv.get(`tenant:${externalId}`);
      if (kvTenant && typeof kvTenant === 'object') {
        await kv.set(`tenant:${externalId}`, {
          ...kvTenant,
          settings: updatedSettings,
        });
      }
    } catch (kvError) {
      console.warn(`[Tenant Settings] Could not update KV store:`, kvError);
    }
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          tenant_id: tenantUUID,
          action: 'tenant.settings_updated',
          entity_type: 'tenant',
          entity_id: tenantUUID,
          new_values: settingsUpdate,
          created_at: new Date().toISOString(),
        });
    } catch (auditError) {
      console.warn('[Tenant Settings] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: "Settings updated successfully",
      data: updatedSettings
    });
  } catch (error: any) {
    console.error('[Tenant Settings] Error updating settings:', error);
    return c.json({ 
      success: false,
      error: error.message || 'Failed to update settings' 
    }, 500);
  }
});

export default tenants;

