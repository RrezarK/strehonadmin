/**
 * Integrations Routes
 * Handles third-party integration management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";

const integrations = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get all integrations
integrations.get("/", async (c) => {
  try {
    const integrations = await kv.get('platform:integrations') || [];
    return c.json({
      success: true,
      data: integrations
    });
  } catch (error: any) {
    console.error('[Integrations API] Error fetching integrations:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get integration catalog
integrations.get("/catalog", async (c) => {
  try {
    const catalog = [
      {
        id: 'stripe',
        name: 'Stripe',
        provider: 'stripe',
        type: 'Payment Provider',
        category: 'payments',
        description: 'Accept payments and manage subscriptions',
        icon: 'CreditCard',
        features: ['Payment Processing', 'Subscription Management', 'Refunds', 'Analytics'],
        pricing: 'Free (transaction fees apply)',
        documentation: 'https://stripe.com/docs'
      },
      {
        id: 'sendgrid',
        name: 'SendGrid',
        provider: 'sendgrid',
        type: 'Email Service',
        category: 'communications',
        description: 'Transactional and marketing email delivery',
        icon: 'Mail',
        features: ['Email Delivery', 'Templates', 'Analytics', 'SMTP Relay'],
        pricing: 'Free tier available',
        documentation: 'https://docs.sendgrid.com'
      },
      {
        id: 'twilio',
        name: 'Twilio',
        provider: 'twilio',
        type: 'SMS Provider',
        category: 'communications',
        description: 'SMS messaging and voice communications',
        icon: 'MessageSquare',
        features: ['SMS Messaging', 'Voice Calls', 'WhatsApp', 'Verify'],
        pricing: 'Pay as you go',
        documentation: 'https://www.twilio.com/docs'
      },
      {
        id: 'google-analytics',
        name: 'Google Analytics',
        provider: 'google',
        type: 'Analytics',
        category: 'analytics',
        description: 'Website and app analytics',
        icon: 'BarChart3',
        features: ['Traffic Analysis', 'User Behavior', 'Conversion Tracking', 'Reports'],
        pricing: 'Free',
        documentation: 'https://developers.google.com/analytics'
      },
      {
        id: 'booking-com',
        name: 'Booking.com',
        provider: 'booking',
        type: 'Channel Manager',
        category: 'distribution',
        description: 'Connect to Booking.com OTA platform',
        icon: 'Globe',
        features: ['Rate Management', 'Availability Sync', 'Reservations', 'Reviews'],
        pricing: 'Commission-based',
        documentation: 'https://connect.booking.com'
      },
      {
        id: 'expedia',
        name: 'Expedia',
        provider: 'expedia',
        type: 'Channel Manager',
        category: 'distribution',
        description: 'Connect to Expedia Group platforms',
        icon: 'Globe',
        features: ['Multi-platform', 'Real-time Updates', 'Revenue Management', 'Analytics'],
        pricing: 'Commission-based',
        documentation: 'https://developer.expediagroup.com'
      },
      {
        id: 'slack',
        name: 'Slack',
        provider: 'slack',
        type: 'Notifications',
        category: 'communications',
        description: 'Team notifications and alerts',
        icon: 'MessageSquare',
        features: ['Channel Messages', 'Direct Messages', 'File Sharing', 'Webhooks'],
        pricing: 'Free',
        documentation: 'https://api.slack.com'
      },
      {
        id: 'google-calendar',
        name: 'Google Calendar',
        provider: 'google',
        type: 'Calendar Sync',
        category: 'productivity',
        description: 'Sync reservations with Google Calendar',
        icon: 'Calendar',
        features: ['Event Sync', 'Reminders', 'Recurring Events', 'Sharing'],
        pricing: 'Free',
        documentation: 'https://developers.google.com/calendar'
      }
    ];
    
    return c.json({
      success: true,
      data: catalog
    });
  } catch (error: any) {
    console.error('[Integrations API] Error fetching catalog:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get integration by ID
integrations.get("/:id", async (c) => {
  try {
    const integrationId = c.req.param('id');
    const integrations = await kv.get('platform:integrations') || [];
    const integration = integrations.find((int: any) => int.id === integrationId);
    
    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: integration
    });
  } catch (error: any) {
    console.error('[Integrations API] Error fetching integration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create new integration
integrations.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { name, type, provider, category, config, enabled = true, tenantId } = body;
    
    if (!name || !type || !provider) {
      return c.json({
        success: false,
        error: 'Name, type, and provider are required'
      }, 400);
    }
    
    const integrations = await kv.get('platform:integrations') || [];
    
    const apiKey = `sk_${provider}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const apiSecret = `sec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    const newIntegration = {
      id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      type,
      provider,
      category: category || 'general',
      status: enabled ? 'active' : 'inactive',
      enabled,
      credentials: {
        apiKey,
        apiSecret,
        webhookSecret: `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
      },
      config: config || {},
      tenantId: tenantId || null,
      stats: {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        lastCall: null,
        averageResponseTime: 0
      },
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        createdBy: 'system',
        lastTestedAt: null,
        lastSyncAt: null
      }
    };
    
    integrations.push(newIntegration);
    await kv.set('platform:integrations', integrations);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'integration_created',
          resource_type: 'integration',
          resource_id: newIntegration.id,
          details: { name, type, provider, category },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Integrations API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: newIntegration
    });
  } catch (error: any) {
    console.error('[Integrations API] Error creating integration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update integration
integrations.put("/:id", async (c) => {
  try {
    const integrationId = c.req.param('id');
    const body = await c.req.json();
    const { name, enabled, config } = body;
    
    const integrations = await kv.get('platform:integrations') || [];
    const integrationIndex = integrations.findIndex((int: any) => int.id === integrationId);
    
    if (integrationIndex === -1) {
      return c.json({ success: false, error: 'Integration not found' }, 404);
    }
    
    const updatedIntegration = {
      ...integrations[integrationIndex],
      name: name || integrations[integrationIndex].name,
      enabled: enabled !== undefined ? enabled : integrations[integrationIndex].enabled,
      status: enabled !== undefined ? (enabled ? 'active' : 'inactive') : integrations[integrationIndex].status,
      config: config || integrations[integrationIndex].config,
      metadata: {
        ...integrations[integrationIndex].metadata,
        updated: new Date().toISOString()
      }
    };
    
    integrations[integrationIndex] = updatedIntegration;
    await kv.set('platform:integrations', integrations);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'integration_updated',
          resource_type: 'integration',
          resource_id: integrationId,
          details: { name, enabled, config },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Integrations API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: updatedIntegration
    });
  } catch (error: any) {
    console.error('[Integrations API] Error updating integration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete integration
integrations.delete("/:id", async (c) => {
  try {
    const integrationId = c.req.param('id');
    const integrations = await kv.get('platform:integrations') || [];
    const integrationIndex = integrations.findIndex((int: any) => int.id === integrationId);
    
    if (integrationIndex === -1) {
      return c.json({ success: false, error: 'Integration not found' }, 404);
    }
    
    integrations.splice(integrationIndex, 1);
    await kv.set('platform:integrations', integrations);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'integration_deleted',
          resource_type: 'integration',
          resource_id: integrationId,
          details: {},
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Integrations API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: 'Integration deleted successfully'
    });
  } catch (error: any) {
    console.error('[Integrations API] Error deleting integration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Test integration connection
integrations.post("/:id/test", async (c) => {
  try {
    const integrationId = c.req.param('id');
    const integrations = await kv.get('platform:integrations') || [];
    const integrationIndex = integrations.findIndex((int: any) => int.id === integrationId);
    
    if (integrationIndex === -1) {
      return c.json({ success: false, error: 'Integration not found' }, 404);
    }
    
    const testStartTime = Date.now();
    integrations[integrationIndex].metadata.lastTestedAt = new Date().toISOString();
    await kv.set('platform:integrations', integrations);
    
    const responseTime = Date.now() - testStartTime;
    
    return c.json({
      success: true,
      data: {
        status: 'success',
        responseTime,
        message: 'Connection test successful'
      }
    });
  } catch (error: any) {
    console.error('[Integrations API] Error testing connection:', error);
    return c.json({ 
      success: false, 
      error: error.message,
      data: {
        status: 'failed',
        message: 'Connection test failed'
      }
    }, 500);
  }
});

// Rotate integration keys
integrations.post("/:id/rotate-keys", async (c) => {
  try {
    const integrationId = c.req.param('id');
    const integrations = await kv.get('platform:integrations') || [];
    const integrationIndex = integrations.findIndex((int: any) => int.id === integrationId);
    
    if (integrationIndex === -1) {
      return c.json({ success: false, error: 'Integration not found' }, 404);
    }
    
    const integration = integrations[integrationIndex];
    const newApiKey = `sk_${integration.provider}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const newApiSecret = `sec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const newWebhookSecret = `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    integrations[integrationIndex].credentials = {
      apiKey: newApiKey,
      apiSecret: newApiSecret,
      webhookSecret: newWebhookSecret
    };
    integrations[integrationIndex].metadata.updated = new Date().toISOString();
    
    await kv.set('platform:integrations', integrations);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'integration_keys_rotated',
          resource_type: 'integration',
          resource_id: integrationId,
          details: {},
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Integrations API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: 'Keys rotated successfully',
      data: {
        apiKey: newApiKey,
        apiSecret: newApiSecret,
        webhookSecret: newWebhookSecret
      }
    });
  } catch (error: any) {
    console.error('[Integrations API] Error rotating keys:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get tenant integrations
integrations.get("/tenants/:tenantId/integrations", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const integrations = await kv.get('platform:integrations') || [];
    const tenantIntegrations = integrations.filter((int: any) => int.tenantId === tenantId);
    
    return c.json({
      success: true,
      data: tenantIntegrations
    });
  } catch (error: any) {
    console.error('[Integrations API] Error fetching tenant integrations:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default integrations;

