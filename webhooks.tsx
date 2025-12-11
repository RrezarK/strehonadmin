/**
 * Webhooks Routes
 * Handles webhook management
 */

import { Hono } from "npm:hono";
import * as kv from "../kv_store.tsx";

const webhooks = new Hono();

// Get all webhooks
webhooks.get("/", async (c) => {
  try {
    const webhooks = await kv.getByPrefix("webhook:");
    return c.json({ webhooks: webhooks || [] });
  } catch (error) {
    console.error("Error fetching webhooks:", error);
    return c.json({ error: "Failed to fetch webhooks" }, 500);
  }
});

// Test webhook
webhooks.post("/:id/test", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const webhook = await kv.get(`webhook:${id}`);
    if (!webhook) {
      return c.json({ error: "Webhook not found" }, 404);
    }
    
    console.log(`Testing webhook ${id} with event ${body.eventType}`);
    
    return c.json({ success: true, message: "Webhook test initiated" });
  } catch (error) {
    console.error("Error testing webhook:", error);
    return c.json({ error: "Failed to test webhook" }, 500);
  }
});

export default webhooks;

