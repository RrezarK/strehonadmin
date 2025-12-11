/**
 * Notifications Routes
 * Handles notification templates and delivery management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";

const notifications = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Helper functions
function extractTemplateVariables(body: string, subject?: string): string[] {
  const variables = new Set<string>();
  const regex = /\{\{(\w+)\}\}/g;
  
  let match;
  while ((match = regex.exec(body)) !== null) {
    variables.add(match[1]);
  }
  
  if (subject) {
    while ((match = regex.exec(subject)) !== null) {
      variables.add(match[1]);
    }
  }
  
  return Array.from(variables);
}

function substituteVariables(text: string, data: Record<string, any>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

// Get notification templates
notifications.get("/notification-templates", async (c) => {
  try {
    const templates = await kv.get('notification_templates') || [];
    return c.json({
      success: true,
      data: templates
    });
  } catch (error: any) {
    console.error('[Notifications API] Error fetching templates:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create notification template
notifications.post("/notification-templates", async (c) => {
  try {
    const body = await c.req.json();
    const { name, type, category, subject, body: templateBody, variables, active, trigger } = body;
    
    if (!name || !type || !templateBody) {
      return c.json({
        success: false,
        error: 'Name, type, and body are required'
      }, 400);
    }
    
    const templates = await kv.get('notification_templates') || [];
    
    if (templates.some((t: any) => t.name.toLowerCase() === name.toLowerCase())) {
      return c.json({
        success: false,
        error: 'A template with this name already exists'
      }, 400);
    }
    
    const extractedVariables = extractTemplateVariables(templateBody, subject);
    
    const newTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      type,
      category: category || 'general',
      subject: subject || '',
      body: templateBody,
      variables: variables || extractedVariables,
      active: active !== undefined ? active : true,
      trigger: trigger || 'manual',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      sentCount: 0,
      lastSent: null
    };
    
    templates.push(newTemplate);
    await kv.set('notification_templates', templates);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'notification_template_created',
          resource_type: 'notification_template',
          resource_id: newTemplate.id,
          details: { name, type, category },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Notifications API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: newTemplate
    });
  } catch (error: any) {
    console.error('[Notifications API] Error creating template:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update notification template
notifications.put("/notification-templates/:id", async (c) => {
  try {
    const templateId = c.req.param('id');
    const body = await c.req.json();
    const { name, type, category, subject, body: templateBody, variables, active, trigger } = body;
    
    const templates = await kv.get('notification_templates') || [];
    const templateIndex = templates.findIndex((t: any) => t.id === templateId);
    
    if (templateIndex === -1) {
      return c.json({
        success: false,
        error: 'Template not found'
      }, 404);
    }
    
    const extractedVariables = templateBody 
      ? extractTemplateVariables(templateBody, subject)
      : templates[templateIndex].variables;
    
    const updatedTemplate = {
      ...templates[templateIndex],
      name: name || templates[templateIndex].name,
      type: type || templates[templateIndex].type,
      category: category || templates[templateIndex].category,
      subject: subject !== undefined ? subject : templates[templateIndex].subject,
      body: templateBody || templates[templateIndex].body,
      variables: variables || extractedVariables,
      active: active !== undefined ? active : templates[templateIndex].active,
      trigger: trigger || templates[templateIndex].trigger,
      updated: new Date().toISOString()
    };
    
    templates[templateIndex] = updatedTemplate;
    await kv.set('notification_templates', templates);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'notification_template_updated',
          resource_type: 'notification_template',
          resource_id: templateId,
          details: { name: updatedTemplate.name },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Notifications API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: updatedTemplate
    });
  } catch (error: any) {
    console.error('[Notifications API] Error updating template:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete notification template
notifications.delete("/notification-templates/:id", async (c) => {
  try {
    const templateId = c.req.param('id');
    const templates = await kv.get('notification_templates') || [];
    const filteredTemplates = templates.filter((t: any) => t.id !== templateId);
    
    if (templates.length === filteredTemplates.length) {
      return c.json({
        success: false,
        error: 'Template not found'
      }, 404);
    }
    
    await kv.set('notification_templates', filteredTemplates);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'notification_template_deleted',
          resource_type: 'notification_template',
          resource_id: templateId,
          details: {},
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Notifications API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error: any) {
    console.error('[Notifications API] Error deleting template:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Send test notification
notifications.post("/notification-templates/:id/test", async (c) => {
  try {
    const templateId = c.req.param('id');
    const body = await c.req.json();
    const { recipient, testData } = body;
    
    if (!recipient) {
      return c.json({
        success: false,
        error: 'Recipient is required (email, phone, or user ID)'
      }, 400);
    }
    
    const templates = await kv.get('notification_templates') || [];
    const template = templates.find((t: any) => t.id === templateId);
    
    if (!template) {
      return c.json({
        success: false,
        error: 'Template not found'
      }, 404);
    }
    
    const defaultTestData = {
      user_name: 'John Doe',
      tenant_name: 'Demo Hotel',
      booking_id: 'BK123456',
      check_in: '2025-01-15',
      check_out: '2025-01-20',
      room_number: '101',
      amount: '$250.00',
      confirmation_code: 'CONF123'
    };
    
    const data = { ...defaultTestData, ...testData };
    const processedSubject = substituteVariables(template.subject, data);
    const processedBody = substituteVariables(template.body, data);
    
    const deliveryLog = {
      id: `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      templateId: template.id,
      templateName: template.name,
      type: template.type,
      recipient,
      subject: processedSubject,
      body: processedBody,
      status: 'sent',
      isTest: true,
      error: null,
      sentAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString()
    };
    
    const deliveryHistory = await kv.get('notification_delivery_history') || [];
    deliveryHistory.unshift(deliveryLog);
    
    if (deliveryHistory.length > 1000) {
      deliveryHistory.splice(1000);
    }
    
    await kv.set('notification_delivery_history', deliveryHistory);
    
    return c.json({
      success: true,
      data: {
        message: 'Test notification sent successfully',
        deliveryId: deliveryLog.id,
        preview: {
          subject: processedSubject,
          body: processedBody
        }
      }
    });
  } catch (error: any) {
    console.error('[Notifications API] Error sending test:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get delivery history
notifications.get("/notification-delivery-history", async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');
    const type = c.req.query('type');
    const status = c.req.query('status');
    
    let history = await kv.get('notification_delivery_history') || [];
    
    if (type) {
      history = history.filter((h: any) => h.type === type);
    }
    
    if (status) {
      history = history.filter((h: any) => h.status === status);
    }
    
    const limitedHistory = history.slice(0, limit);
    
    const stats = {
      total: history.length,
      sent: history.filter((h: any) => h.status === 'sent').length,
      delivered: history.filter((h: any) => h.status === 'delivered').length,
      failed: history.filter((h: any) => h.status === 'failed').length,
      pending: history.filter((h: any) => h.status === 'pending').length,
      byType: {
        email: history.filter((h: any) => h.type === 'email').length,
        sms: history.filter((h: any) => h.type === 'sms').length,
        push: history.filter((h: any) => h.type === 'push').length
      }
    };
    
    return c.json({
      success: true,
      data: {
        logs: limitedHistory,
        stats
      }
    });
  } catch (error: any) {
    console.error('[Notifications API] Error fetching delivery history:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get notification settings
notifications.get("/notification-settings", async (c) => {
  try {
    const settings = await kv.get('notification_settings') || {
      email: {
        enabled: true,
        fromEmail: 'noreply@hmsplatform.com',
        fromName: 'HMS Platform',
        replyTo: '',
        smtpConfigured: false
      },
      sms: {
        enabled: false,
        provider: 'twilio',
        configured: false
      },
      push: {
        enabled: false,
        configured: false
      },
      general: {
        retryFailed: true,
        maxRetries: 3,
        retryDelay: 300,
        batchSize: 100
      }
    };
    
    return c.json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    console.error('[Notifications API] Error fetching settings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update notification settings
notifications.put("/notification-settings", async (c) => {
  try {
    const body = await c.req.json();
    const currentSettings = await kv.get('notification_settings') || {};
    
    const updatedSettings = {
      email: { ...currentSettings.email, ...body.email },
      sms: { ...currentSettings.sms, ...body.sms },
      push: { ...currentSettings.push, ...body.push },
      general: { ...currentSettings.general, ...body.general }
    };
    
    await kv.set('notification_settings', updatedSettings);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'notification_settings_updated',
          resource_type: 'notification_settings',
          resource_id: 'global',
          details: body,
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Notifications API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: updatedSettings
    });
  } catch (error: any) {
    console.error('[Notifications API] Error updating settings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Retry failed notification
notifications.post("/notification-delivery-history/:id/retry", async (c) => {
  try {
    const deliveryId = c.req.param('id');
    const history = await kv.get('notification_delivery_history') || [];
    const deliveryIndex = history.findIndex((h: any) => h.id === deliveryId);
    
    if (deliveryIndex === -1) {
      return c.json({
        success: false,
        error: 'Delivery log not found'
      }, 404);
    }
    
    const delivery = history[deliveryIndex];
    
    if (delivery.status !== 'failed') {
      return c.json({
        success: false,
        error: 'Can only retry failed deliveries'
      }, 400);
    }
    
    delivery.status = 'pending';
    delivery.retryCount = (delivery.retryCount || 0) + 1;
    delivery.lastRetry = new Date().toISOString();
    delivery.status = 'sent';
    delivery.sentAt = new Date().toISOString();
    delivery.error = null;
    
    history[deliveryIndex] = delivery;
    await kv.set('notification_delivery_history', history);
    
    return c.json({
      success: true,
      data: delivery
    });
  } catch (error: any) {
    console.error('[Notifications API] Error retrying delivery:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get notification statistics
notifications.get("/notification-statistics", async (c) => {
  try {
    const templates = await kv.get('notification_templates') || [];
    const history = await kv.get('notification_delivery_history') || [];
    
    const stats = {
      totalTemplates: templates.length,
      activeTemplates: templates.filter((t: any) => t.active).length,
      totalSent: history.length,
      sent24h: history.filter((h: any) => {
        const sentAt = new Date(h.sentAt);
        return sentAt > new Date(Date.now() - 24 * 60 * 60 * 1000);
      }).length,
      successRate: history.length > 0 
        ? ((history.filter((h: any) => h.status === 'sent' || h.status === 'delivered').length / history.length) * 100).toFixed(1)
        : '0',
      byType: {
        email: history.filter((h: any) => h.type === 'email').length,
        sms: history.filter((h: any) => h.type === 'sms').length,
        push: history.filter((h: any) => h.type === 'push').length
      }
    };
    
    return c.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('[Notifications API] Error calculating statistics:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default notifications;

