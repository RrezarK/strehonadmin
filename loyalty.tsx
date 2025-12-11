/**
 * Loyalty Routes
 * Handles loyalty programs and marketing campaigns
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";

const loyalty = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Helper to extract tenant from auth token
async function getTenantFromAuth(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return null;

  const accessToken = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  
  if (error || !user) return null;
  return user.user_metadata?.tenant_id || null;
}

// Get loyalty programs
loyalty.get("/loyalty-programs", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized - No Authorization header' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized - Invalid token' }, 401);
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const programs: any[] = [];
    
    return c.json({
      success: true,
      data: programs,
      message: 'No loyalty programs configured yet',
    });
  } catch (error: any) {
    console.error('[Loyalty API] Error getting loyalty programs:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get campaigns
loyalty.get("/campaigns", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized - No Authorization header' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized - Invalid token' }, 401);
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const campaigns: any[] = [];
    
    return c.json({
      success: true,
      data: campaigns,
      message: 'No campaigns configured yet',
    });
  } catch (error: any) {
    console.error('[Campaigns API] Error getting campaigns:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get communications
loyalty.get("/communications", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized - No Authorization header' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized - Invalid token' }, 401);
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const communicationTypes = [
      { value: 'email', label: 'Email', icon: 'Mail' },
      { value: 'sms', label: 'SMS', icon: 'MessageSquare' },
      { value: 'phone', label: 'Phone Call', icon: 'Phone' },
      { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle' },
      { value: 'in-person', label: 'In Person', icon: 'Users' },
    ];
    
    return c.json({
      success: true,
      data: communicationTypes,
    });
  } catch (error: any) {
    console.error('[Communications API] Error getting communication types:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default loyalty;

