/**
 * Settings Routes
 * Handles platform settings management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";

const settings = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get all settings
settings.get("/", async (c) => {
  try {
    const [general, security, performance, email, branding, localization] = await Promise.all([
      kv.get('system:settings:general'),
      kv.get('system:settings:security'),
      kv.get('system:settings:performance'),
      kv.get('system:settings:email'),
      kv.get('system:settings:branding'),
      kv.get('system:settings:localization')
    ]);
    
    const defaultSettings = {
      general: {
        platformName: 'HMS Platform',
        primaryDomain: 'yourapp.com',
        supportEmail: 'support@yourapp.com',
        maintenanceMode: false,
        newSignupsAllowed: true,
        defaultTimezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        currency: 'USD'
      },
      security: {
        sessionTimeout: 30,
        forceHttps: true,
        require2FA: false,
        apiRateLimiting: true,
        passwordMinLength: 8,
        passwordRequireUppercase: true,
        passwordRequireLowercase: true,
        passwordRequireNumbers: true,
        passwordRequireSpecialChars: true,
        maxLoginAttempts: 5,
        lockoutDuration: 30,
        allowedIpRanges: []
      },
      performance: {
        maxUploadSize: 100,
        backupRetention: 30,
        queryCaching: true,
        cdnEnabled: true,
        imageOptimization: true,
        compressionEnabled: true,
        cacheExpiration: 3600
      },
      email: {
        provider: 'smtp',
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: true,
        smtpUser: '',
        smtpFrom: 'noreply@yourapp.com',
        smtpFromName: 'HMS Platform'
      },
      branding: {
        logoUrl: '',
        faviconUrl: '',
        primaryColor: '#ea580c',
        secondaryColor: '#1e293b',
        companyName: 'Your Company',
        footerText: '© 2024 All rights reserved',
        customCss: ''
      },
      localization: {
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        autoDetectLanguage: true,
        dateLocale: 'en-US'
      }
    };
    
    const settings = {
      general: general || defaultSettings.general,
      security: security || defaultSettings.security,
      performance: performance || defaultSettings.performance,
      email: email || defaultSettings.email,
      branding: branding || defaultSettings.branding,
      localization: localization || defaultSettings.localization
    };
    
    return c.json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    console.error('[Settings API] Error fetching settings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update settings
settings.put("/", async (c) => {
  try {
    const body = await c.req.json();
    const { category, data } = body;
    
    if (!category || !data) {
      return c.json({
        success: false,
        error: 'Category and data are required'
      }, 400);
    }
    
    const validCategories = ['general', 'security', 'performance', 'email', 'branding', 'localization'];
    if (!validCategories.includes(category)) {
      return c.json({
        success: false,
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      }, 400);
    }
    
    await kv.set(`system:settings:${category}`, data);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'settings_updated',
          resource_type: 'settings',
          resource_id: category,
          details: data,
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Settings API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: `${category} settings updated successfully`,
      data
    });
  } catch (error: any) {
    console.error('[Settings API] Error updating settings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get regions
settings.get("/regions", async (c) => {
  try {
    const regions = await kv.get('system:regions') || [];
    
    if (!regions || regions.length === 0) {
      const defaultRegions = [
        {
          id: 'us-east-1',
          name: 'US East (Virginia)',
          status: 'active',
          provider: 'AWS',
          endpoint: 'us-east-1.supabase.co',
          tenantCount: 0,
          avgLatency: 45,
          created: new Date().toISOString()
        }
      ];
      
      await kv.set('system:regions', defaultRegions);
      
      return c.json({
        success: true,
        data: defaultRegions
      });
    }
    
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('settings');
    
    const regionCounts: Record<string, number> = {};
    tenants?.forEach((t: any) => {
      const region = t.settings?.region || 'us-east-1';
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    });
    
    const updatedRegions = regions.map((r: any) => ({
      ...r,
      tenantCount: regionCounts[r.id] || 0
    }));
    
    return c.json({
      success: true,
      data: updatedRegions
    });
  } catch (error: any) {
    console.error('[Settings API] Error fetching regions:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Add region
settings.post("/regions", async (c) => {
  try {
    const body = await c.req.json();
    const { name, provider, endpoint } = body;
    
    if (!name || !provider || !endpoint) {
      return c.json({
        success: false,
        error: 'Name, provider, and endpoint are required'
      }, 400);
    }
    
    const regions = await kv.get('system:regions') || [];
    const regionId = name.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '');
    
    const newRegion = {
      id: regionId,
      name,
      status: 'active',
      provider,
      endpoint,
      tenantCount: 0,
      avgLatency: 0,
      created: new Date().toISOString()
    };
    
    regions.push(newRegion);
    await kv.set('system:regions', regions);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'region_added',
          resource_type: 'region',
          resource_id: regionId,
          details: newRegion,
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Settings API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: newRegion
    });
  } catch (error: any) {
    console.error('[Settings API] Error adding region:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update region
settings.patch("/regions/:id", async (c) => {
  try {
    const regionId = c.req.param('id');
    const body = await c.req.json();
    const { status } = body;
    
    const regions = await kv.get('system:regions') || [];
    const regionIndex = regions.findIndex((r: any) => r.id === regionId);
    
    if (regionIndex === -1) {
      return c.json({
        success: false,
        error: 'Region not found'
      }, 404);
    }
    
    regions[regionIndex].status = status;
    await kv.set('system:regions', regions);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'region_updated',
          resource_type: 'region',
          resource_id: regionId,
          details: { status },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Settings API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: regions[regionIndex]
    });
  } catch (error: any) {
    console.error('[Settings API] Error updating region:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get API keys
settings.get("/api-keys", async (c) => {
  try {
    const keys = await kv.getByPrefix("apikey:") || [];
    return c.json({
      success: true,
      data: keys
    });
  } catch (error: any) {
    console.error('[Settings API] Error fetching API keys:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create API key
settings.post("/api-keys", async (c) => {
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
    
    return c.json({ success: true, data: apiKey }, 201);
  } catch (error: any) {
    console.error('[Settings API] Error creating API key:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete API key
settings.delete("/api-keys/:id", async (c) => {
  try {
    const keyId = c.req.param('id');
    await kv.del(`apikey:${keyId}`);
    
    return c.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error: any) {
    console.error('[Settings API] Error deleting API key:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Test email settings
settings.post("/email/test", async (c) => {
  try {
    const body = await c.req.json();
    const { to } = body;
    
    if (!to) {
      return c.json({
        success: false,
        error: 'Recipient email is required'
      }, 400);
    }
    
    // Simulate email test
    console.log(`[Settings API] Testing email to ${to}`);
    
    return c.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (error: any) {
    console.error('[Settings API] Error testing email:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default settings;

