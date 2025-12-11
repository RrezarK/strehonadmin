/**
 * Plans Routes
 * Handles subscription plan management
 */

import { Hono } from "npm:hono";
import * as kv from "../kv_store.tsx";

const plans = new Hono();

// Get all plans
plans.get("/", async (c) => {
  try {
    const plans = await kv.getByPrefix("plan:");
    
    if (!plans || plans.length === 0) {
      return c.json({ success: true, data: [] });
    }
    
    return c.json({ success: true, data: plans });
  } catch (error) {
    console.error("[Plans] Error fetching plans:", error);
    return c.json({ success: false, error: "Failed to fetch plans" }, 500);
  }
});

// Get single plan
plans.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const plan = await kv.get(`plan:${id}`);
    
    if (!plan) {
      return c.json({ success: false, error: "Plan not found" }, 404);
    }
    
    return c.json({ success: true, data: plan });
  } catch (error) {
    console.error("[Plans] Error fetching plan:", error);
    return c.json({ success: false, error: "Failed to fetch plan" }, 500);
  }
});

// Create plan
plans.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { name, price, billing, trialDays, active, limits, features } = body;
    
    if (!name) {
      return c.json({ success: false, error: "Plan name is required" }, 400);
    }
    
    const planId = `plan_${name.toLowerCase().replace(/\s+/g, '_')}`;
    
    const plan = {
      id: planId,
      name,
      price: price || 0,
      billing: billing || 'monthly',
      trialDays: trialDays || 14,
      active: active !== undefined ? active : true,
      limits: limits || {
        rooms: 0,
        users: 0,
        properties: 0,
        apiCalls: 0,
        storage: 0
      },
      features: features || [],
      tenants: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(`plan:${planId}`, plan);
    
    return c.json({ success: true, data: plan });
  } catch (error) {
    console.error("[Plans] Error creating plan:", error);
    return c.json({ success: false, error: "Failed to create plan" }, 500);
  }
});

// Update plan
plans.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existing = await kv.get(`plan:${id}`);
    
    if (!existing) {
      return c.json({ success: false, error: "Plan not found" }, 404);
    }
    
    const updated = {
      ...existing,
      ...body,
      id,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(`plan:${id}`, updated);
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Plans] Error updating plan:", error);
    return c.json({ success: false, error: "Failed to update plan" }, 500);
  }
});

// Delete plan
plans.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const existing = await kv.get(`plan:${id}`);
    
    if (!existing) {
      return c.json({ success: false, error: "Plan not found" }, 404);
    }
    
    await kv.del(`plan:${id}`);
    
    return c.json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    console.error("[Plans] Error deleting plan:", error);
    return c.json({ success: false, error: "Failed to delete plan" }, 500);
  }
});

export default plans;

