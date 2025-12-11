/**
 * Features Routes
 * Handles feature flag management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { TenantService } from "../data-service.tsx";
import * as kv from "../kv_store.tsx";

const features = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get all feature flags
features.get("/feature-flags", async (c) => {
  try {
    const flags = await kv.getByPrefix("flag:");
    return c.json({ flags: flags || [] });
  } catch (error) {
    console.error("Error fetching feature flags:", error);
    return c.json({ error: "Failed to fetch feature flags" }, 500);
  }
});

// Create feature flag
features.post("/feature-flags", async (c) => {
  try {
    const body = await c.req.json();
    const flagId = `ff_${Date.now()}`;
    
    const flag = {
      id: flagId,
      ...body,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    
    await kv.set(`flag:${flagId}`, flag);
    
    return c.json({ flag }, 201);
  } catch (error) {
    console.error("Error creating feature flag:", error);
    return c.json({ error: "Failed to create feature flag" }, 500);
  }
});

// Get all features
features.get("/", async (c) => {
  try {
    const features = await kv.getByPrefix("feature:");
    
    return c.json({ success: true, data: features || [] });
  } catch (error) {
    console.error("Error fetching features:", error);
    return c.json({ success: false, error: "Failed to fetch features" }, 500);
  }
});

// Initialize features
features.post("/initialize", async (c) => {
  try {
    const body = await c.req.json();
    const { features } = body;
    
    const initialized: any[] = [];
    for (const feature of features) {
      const featureId = `feature:${feature.key}`;
      const featureData = {
        id: featureId,
        key: feature.key,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        status: feature.status || 'enabled',
        enabledForPlans: feature.enabledForPlans || [],
        enabledForTenants: feature.enabledForTenants || [],
        disabledForTenants: feature.disabledForTenants || [],
        rolloutPercentage: feature.rolloutPercentage || 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await kv.set(featureId, featureData);
      initialized.push(featureData);
    }
    
    return c.json({ success: true, data: initialized }, 201);
  } catch (error) {
    console.error("Error initializing features:", error);
    return c.json({ success: false, error: "Failed to initialize features" }, 500);
  }
});

// Update feature
features.put("/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const body = await c.req.json();
    
    const featureId = `feature:${key}`;
    const existing = await kv.get(featureId);
    
    if (!existing) {
      return c.json({ success: false, error: "Feature not found" }, 404);
    }
    
    const updated = {
      ...existing,
      ...body,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(featureId, updated);
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating feature:", error);
    return c.json({ success: false, error: "Failed to update feature" }, 500);
  }
});

// Toggle feature for tenant
features.post("/:key/tenants", async (c) => {
  try {
    const key = c.req.param("key");
    const body = await c.req.json();
    const { tenant_id, enabled } = body;
    
    const featureId = `feature:${key}`;
    const feature = await kv.get(featureId);
    
    if (!feature) {
      return c.json({ success: false, error: "Feature not found" }, 404);
    }
    
    let { enabledForTenants = [], disabledForTenants = [] } = feature;
    
    if (enabled) {
      if (!enabledForTenants.includes(tenant_id)) {
        enabledForTenants.push(tenant_id);
      }
      disabledForTenants = disabledForTenants.filter(id => id !== tenant_id);
    } else {
      if (!disabledForTenants.includes(tenant_id)) {
        disabledForTenants.push(tenant_id);
      }
      enabledForTenants = enabledForTenants.filter(id => id !== tenant_id);
    }
    
    const updated = {
      ...feature,
      enabledForTenants,
      disabledForTenants,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(featureId, updated);
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error toggling feature for tenant:", error);
    return c.json({ success: false, error: "Failed to toggle feature" }, 500);
  }
});

// Toggle feature for plan
features.post("/:key/plans", async (c) => {
  try {
    const key = c.req.param("key");
    const body = await c.req.json();
    const { plan, enabled } = body;
    
    const featureId = `feature:${key}`;
    const feature = await kv.get(featureId);
    
    if (!feature) {
      return c.json({ success: false, error: "Feature not found" }, 404);
    }
    
    let { enabledForPlans = [] } = feature;
    
    if (enabled) {
      if (!enabledForPlans.includes(plan)) {
        enabledForPlans.push(plan);
      }
    } else {
      enabledForPlans = enabledForPlans.filter(p => p !== plan);
    }
    
    const updated = {
      ...feature,
      enabledForPlans,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(featureId, updated);
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error toggling feature for plan:", error);
    return c.json({ success: false, error: "Failed to toggle feature" }, 500);
  }
});

// Get tenant features
features.get("/tenants/:tenantId/features", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const { tenant, source } = await TenantService.resolve(tenantId);
    
    if (!tenant) {
      return c.json({ 
        success: false, 
        error: "Tenant not found"
      }, 404);
    }
    
    const tenantIdentifiers = [tenant.id];
    if (tenant.uuid && tenant.uuid !== tenant.id) {
      tenantIdentifiers.push(tenant.uuid);
    }
    
    const allFeatures = await kv.getByPrefix("feature:");
    
    const features = allFeatures.map((feature: any) => {
      const isExplicitlyEnabled = tenantIdentifiers.some(id => 
        feature.enabledForTenants?.includes(id)
      );
      const isExplicitlyDisabled = tenantIdentifiers.some(id => 
        feature.disabledForTenants?.includes(id)
      );
      
      let enabled: boolean;
      if (isExplicitlyEnabled) {
        enabled = true;
      } else if (isExplicitlyDisabled) {
        enabled = false;
      } else {
        enabled = feature.enabledForPlans?.includes(tenant.plan) || false;
      }
      
      return {
        id: feature.id,
        key: feature.key,
        name: feature.name,
        description: feature.description,
        enabled,
        planLocked: feature.scope === 'plan',
        scope: feature.scope,
        category: feature.category,
      };
    });
    
    return c.json({ success: true, data: features });
  } catch (error: any) {
    console.error('[Features API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update tenant features
features.put("/tenants/:tenantId/features", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const body = await c.req.json();
    const { features } = body;
    
    let tenant = await kv.get(`tenant:${tenantId}`);
    let tenantUUID = tenantId;
    
    if (!tenant) {
      let { data: pgTenant, error } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('settings->>external_id', tenantId)
        .single();
      
      if (!pgTenant && error) {
        const result = await supabaseAdmin
          .from('tenants')
          .select('*')
          .eq('id', tenantId)
          .single();
        
        pgTenant = result.data;
      }
      
      if (pgTenant) {
        tenant = { id: pgTenant.settings?.external_id || pgTenant.id };
        tenantUUID = pgTenant.id;
      }
    }
    
    const kvTenantId = tenant?.id || tenantId;
    
    for (const feature of features) {
      if (!feature.planLocked) {
        await kv.set(`flag:tenant:${kvTenantId}:${feature.key}`, {
          id: `flag:tenant:${kvTenantId}:${feature.key}`,
          key: feature.key,
          enabled: feature.enabled,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          tenant_id: tenantUUID,
          action: 'tenant.features_updated',
          entity_type: 'tenant',
          entity_id: tenantUUID,
          new_values: { features: features.map((f: any) => ({ key: f.key, enabled: f.enabled })) },
          created_at: new Date().toISOString(),
        });
    } catch (auditError) {
      console.warn('[Features API] Could not log audit event:', auditError);
    }
    
    return c.json({ success: true, message: "Features updated successfully" });
  } catch (error: any) {
    console.error('[Features API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default features;

