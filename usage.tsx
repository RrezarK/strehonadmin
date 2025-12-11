/**
 * Usage Routes
 * Handles usage tracking and quotas
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";
import { cache } from "../cache.tsx";

const usage = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Helper function to track usage
async function trackUsage(tenantId: string, metric: string, amount: number = 1) {
  try {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `usage:${tenantId}:${period}:${metric}`;
    
    const existing = await kv.get(key);
    
    if (!existing) {
      const tenant = await kv.get(`tenant:${tenantId}`);
      let limit = 1000;
      
      if (tenant) {
        const planKey = `plan:plan_${tenant.plan.toLowerCase()}`;
        const planData = await kv.get(planKey);
        
        if (planData && planData.limits) {
          const metricKey = metric === 'api_calls' ? 'apiCalls' : metric;
          limit = planData.limits[metricKey] || limit;
        }
      }
      
      await kv.set(key, {
        metric,
        current: amount,
        limit: limit,
        period,
        updated_at: new Date().toISOString(),
      });
    } else {
      await kv.set(key, {
        ...existing,
        current: (existing.current || 0) + amount,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`[Usage Tracker] Error tracking ${metric}:`, error);
  }
}

// Get usage for tenant
usage.get("/:tenantId", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const usage = await kv.get(`usage:${tenantId}`);
    
    return c.json({ usage: usage || {} });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return c.json({ error: "Failed to fetch usage" }, 500);
  }
});

// Get global usage
usage.get("/global", async (c) => {
  try {
    const usage = await kv.getByPrefix("usage:");
    return c.json({ usage: usage || [] });
  } catch (error) {
    console.error("Error fetching global usage:", error);
    return c.json({ error: "Failed to fetch global usage" }, 500);
  }
});

// Get tenant usage with metrics
usage.get("/tenants/:tenantId/usage", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    
    let tenant = await kv.get(`tenant:${tenantId}`);
    
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
        error = result.error;
      }
      
      if (!pgTenant || error) {
        return c.json({ success: false, error: "Tenant not found" }, 404);
      }
      
      tenant = {
        id: pgTenant.settings?.external_id || pgTenant.id,
        uuid: pgTenant.id,
        plan: pgTenant.settings?.plan || 'Trial',
        status: pgTenant.status,
      };
    }
    
    if (!tenant) {
      return c.json({ success: false, error: "Tenant not found" }, 404);
    }
    
    const kvTenantId = tenant.id || tenantId;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const usageRecords = await kv.getByPrefix(`usage:${kvTenantId}:${period}:`);
    
    if (usageRecords.length === 0) {
      const planKey = `plan:plan_${tenant.plan.toLowerCase()}`;
      const planData = await kv.get(planKey);
      
      const fallbackLimits: Record<string, any> = {
        'Trial': { rooms: 10, users: 3, properties: 1, api_calls: 1000, storage: 1 },
        'Basic': { rooms: 25, users: 5, properties: 1, api_calls: 10000, storage: 10 },
        'Pro': { rooms: 35, users: 10, properties: 2, api_calls: 100000, storage: 50 },
        'Enterprise': { rooms: 50, users: 15, properties: 3, api_calls: 999999, storage: 500 },
      };
      
      const limits = planData?.limits || fallbackLimits[tenant.plan] || fallbackLimits['Trial'];
      const defaultMetrics = ['rooms', 'users', 'properties', 'api_calls', 'storage'];
      
      const usage = defaultMetrics.map(metric => ({
        metric,
        current: 0,
        limit: limits[metric === 'api_calls' ? 'apiCalls' : metric] || limits[metric] || 0,
        unit: metric === 'storage' ? 'GB' : metric === 'api_calls' ? '/month' : '',
      }));
      
      for (const metric of defaultMetrics) {
        const key = `usage:${kvTenantId}:${period}:${metric}`;
        await kv.set(key, {
          metric,
          current: 0,
          limit: limits[metric === 'api_calls' ? 'apiCalls' : metric] || limits[metric] || 0,
          period,
          updated_at: new Date().toISOString(),
        });
      }
      
      return c.json({ success: true, data: usage });
    }
    
    const planKey = `plan:plan_${tenant.plan.toLowerCase()}`;
    const planData = await kv.get(planKey);
    
    let currentPlanLimits: Record<string, number> = {};
    
    if (planData && planData.limits) {
      currentPlanLimits = {
        rooms: planData.limits.rooms || 0,
        users: planData.limits.users || 0,
        properties: planData.limits.properties || 0,
        api_calls: planData.limits.apiCalls || planData.limits.api_calls || 0,
        storage: planData.limits.storage || 0,
      };
    } else {
      const fallbackLimits: Record<string, any> = {
        'Trial': { rooms: 10, users: 3, properties: 1, api_calls: 1000, storage: 1 },
        'Basic': { rooms: 25, users: 5, properties: 1, api_calls: 10000, storage: 10 },
        'Pro': { rooms: 35, users: 10, properties: 2, api_calls: 100000, storage: 50 },
        'Enterprise': { rooms: 50, users: 15, properties: 3, api_calls: 999999, storage: 500 },
      };
      currentPlanLimits = fallbackLimits[tenant.plan] || fallbackLimits['Trial'];
    }
    
    const usage: Array<{ metric: string; current: number; limit: number; unit: string }> = [];
    for (const record of usageRecords) {
      const metric = record.metric;
      const correctLimit = currentPlanLimits[metric] || record.limit;
      
      if (correctLimit !== record.limit) {
        const key = `usage:${kvTenantId}:${period}:${metric}`;
        await kv.set(key, {
          ...record,
          limit: correctLimit,
          updated_at: new Date().toISOString(),
        });
      }
      
      usage.push({
        metric: metric,
        current: record.current,
        limit: correctLimit,
        unit: metric === 'storage' ? 'GB' : metric === 'api_calls' ? '/month' : '',
      });
    }
    
    const existingMetrics = usageRecords.map((r: any) => r.metric);
    const requiredMetrics = ['rooms', 'users', 'properties', 'api_calls', 'storage'];
    
    for (const metric of requiredMetrics) {
      if (!existingMetrics.includes(metric)) {
        const limit = currentPlanLimits[metric] || 0;
        const key = `usage:${kvTenantId}:${period}:${metric}`;
        await kv.set(key, {
          metric,
          current: 0,
          limit: limit,
          period,
          updated_at: new Date().toISOString(),
        });
        
        usage.push({
          metric: metric,
          current: 0,
          limit: limit,
          unit: metric === 'storage' ? 'GB' : metric === 'api_calls' ? '/month' : '',
        });
      }
    }
    
    return c.json({ success: true, data: usage });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get global 24h usage
usage.get("/global/24h", async (c) => {
  try {
    const now = new Date();
    const hourlyData: Array<{ hour: string; apiCalls: number; reservations: number }> = [];
    
    for (let i = 5; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
      const hourStr = `${String(hour.getHours()).padStart(2, '0')}:00`;
      
      const allUsage = await kv.getByPrefix('usage:');
      
      let totalApiCalls = 0;
      let totalReservations = 0;
      
      for (const record of allUsage) {
        if (record.metric === 'api_calls') {
          totalApiCalls += record.current || 0;
        }
        if (record.metric === 'reservations') {
          totalReservations += record.current || 0;
        }
      }
      
      const variation = 1 - (i * 0.1);
      hourlyData.push({
        hour: hourStr,
        apiCalls: Math.floor(totalApiCalls * variation),
        reservations: Math.floor(totalReservations * variation)
      });
    }
    
    return c.json({ success: true, data: hourlyData });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Increment usage metric
usage.post("/tenants/:tenantId/usage/:metric/increment", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const metric = c.req.param("metric");
    const body = await c.req.json();
    const amount = body.amount || 1;
    
    await trackUsage(tenantId, metric, amount);
    
    return c.json({ success: true, message: `Usage incremented for ${metric}` });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Set usage metric
usage.post("/tenants/:tenantId/usage/:metric/set", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const metric = c.req.param("metric");
    const body = await c.req.json();
    const { value } = body;
    
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `usage:${tenantId}:${period}:${metric}`;
    
    const existing = await kv.get(key);
    const limit = existing?.limit || 1000;
    
    await kv.set(key, {
      metric,
      current: value,
      limit: limit,
      period,
      updated_at: new Date().toISOString(),
    });
    
    return c.json({ success: true, message: `Usage set for ${metric}` });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Reset usage
usage.post("/tenants/:tenantId/usage/reset", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const usageRecords = await kv.getByPrefix(`usage:${tenantId}:${period}:`);
    
    for (const record of usageRecords) {
      const key = `usage:${tenantId}:${period}:${record.metric}`;
      await kv.set(key, {
        ...record,
        current: 0,
        updated_at: new Date().toISOString(),
      });
    }
    
    return c.json({ success: true, message: "Usage reset successfully" });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete usage
usage.delete("/tenants/:tenantId/usage", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const usageRecords = await kv.getByPrefix(`usage:${tenantId}:${period}:`);
    
    for (const record of usageRecords) {
      await kv.del(`usage:${tenantId}:${period}:${record.metric}`);
    }
    
    return c.json({ success: true, message: "Usage deleted successfully" });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get usage alerts
usage.get("/alerts", async (c) => {
  try {
    const alerts = await kv.getByPrefix("alert:");
    return c.json({ success: true, data: alerts || [] });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get usage for all tenants
usage.get("/tenants", async (c) => {
  try {
    const allUsage = await kv.getByPrefix("usage:");
    return c.json({ success: true, data: allUsage || [] });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Increment usage (legacy endpoint)
usage.post("/:tenantId/increment", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const body = await c.req.json();
    const { metric, amount = 1 } = body;
    
    await trackUsage(tenantId, metric, amount);
    
    return c.json({ success: true, message: `Usage incremented for ${metric}` });
  } catch (error: any) {
    console.error('[Usage API] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default usage;

