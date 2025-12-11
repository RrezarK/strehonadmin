/**
 * Developers Routes
 * Handles API documentation and developer resources
 */

import { Hono } from "npm:hono";
import * as kv from "../kv_store.tsx";

const developers = new Hono();

// Get API documentation
developers.get("/api-docs", async (c) => {
  try {
    const docs = {
      version: '2.0.0',
      baseUrl: '/make-server-0bdba248',
      endpoints: [
        {
          path: '/health',
          method: 'GET',
          description: 'Health check endpoint'
        },
        {
          path: '/tenants',
          method: 'GET',
          description: 'List all tenants'
        },
        {
          path: '/tenants/:id',
          method: 'GET',
          description: 'Get single tenant'
        },
        {
          path: '/users',
          method: 'GET',
          description: 'List all users'
        },
        {
          path: '/dashboard/metrics',
          method: 'GET',
          description: 'Get dashboard metrics'
        }
      ]
    };
    
    return c.json({
      success: true,
      data: docs
    });
  } catch (error: any) {
    console.error('[Developers API] Error fetching API docs:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get webhooks documentation
developers.get("/webhooks", async (c) => {
  try {
    const webhooks = await kv.getByPrefix("webhook:");
    
    const docs = {
      webhooks: webhooks || [],
      events: [
        'tenant.created',
        'tenant.updated',
        'user.created',
        'reservation.created',
        'payment.received'
      ],
      format: {
        url: 'https://your-app.com/webhook',
        secret: 'webhook_secret',
        events: ['tenant.created', 'user.created']
      }
    };
    
    return c.json({
      success: true,
      data: docs
    });
  } catch (error: any) {
    console.error('[Developers API] Error fetching webhooks docs:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default developers;

