/**
 * Audit Routes
 * Handles audit logs and API keys
 */

import { Hono } from "npm:hono";
import * as kv from "../kv_store.tsx";

const audit = new Hono();

// Get audit logs
audit.get("/audit-logs", async (c) => {
  try {
    const logs = await kv.getByPrefix("audit:");
    return c.json({ logs: logs || [] });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return c.json({ error: "Failed to fetch audit logs" }, 500);
  }
});

// Get API keys
audit.get("/api-keys", async (c) => {
  try {
    const keys = await kv.getByPrefix("apikey:");
    return c.json({ keys: keys || [] });
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return c.json({ error: "Failed to fetch API keys" }, 500);
  }
});

// Create API key
audit.post("/api-keys", async (c) => {
  try {
    const body = await c.req.json();
    const keyId = `key_${Date.now()}`;
    
    const apiKey = {
      id: keyId,
      key: `pk_live_${Math.random().toString(36).substring(2, 15)}`,
      ...body,
      created: new Date().toISOString(),
    };
    
    await kv.set(`apikey:${keyId}`, apiKey);
    
    return c.json({ apiKey }, 201);
  } catch (error) {
    console.error("Error creating API key:", error);
    return c.json({ error: "Failed to create API key" }, 500);
  }
});

export default audit;

