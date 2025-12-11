/**
 * Guests Routes
 * Handles guest CRM operations
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { GuestService } from "../data-service.tsx";

const guests = new Hono();
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

// Get all guests
guests.get("/", async (c) => {
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
      return c.json({ 
        success: false, 
        error: 'User has no tenant_id. Please contact support.'
      }, 400);
    }

    const search = c.req.query('search');
    const segment = c.req.query('segment') as any;
    const vipStatus = c.req.query('vipStatus') as any;
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const result = await GuestService.list(tenantId, {
      search,
      segment,
      vipStatus,
      pagination: { page, limit },
    });
    
    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      tenantId,
    });
  } catch (error: any) {
    console.error('[Guests API] Error listing guests:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create guest
guests.post("/", async (c) => {
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
      return c.json({ 
        success: false, 
        error: 'User has no tenant_id. Please contact support.'
      }, 400);
    }
    
    const guestData = await c.req.json();
    const guest = await GuestService.create(tenantId, guestData);
    
    return c.json({
      success: true,
      data: guest,
      tenantId,
    });
  } catch (error: any) {
    console.error('[Guests API] Error creating guest:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get single guest
guests.get("/:guestId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const guestId = c.req.param('guestId');
    const guest = await GuestService.get(tenantId, guestId);
    
    if (!guest) {
      return c.json({ success: false, error: 'Guest not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: guest,
      tenantId,
    });
  } catch (error: any) {
    console.error('[Guests API] Error getting guest:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update guest
guests.put("/:guestId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const guestId = c.req.param('guestId');
    const updates = await c.req.json();
    
    const guest = await GuestService.update(tenantId, guestId, updates);
    
    if (!guest) {
      return c.json({ success: false, error: 'Guest not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: guest,
      tenantId,
    });
  } catch (error: any) {
    console.error('[Guests API] Error updating guest:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete guest
guests.delete("/:guestId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const guestId = c.req.param('guestId');
    const success = await GuestService.delete(tenantId, guestId);
    
    if (!success) {
      return c.json({ success: false, error: 'Guest not found' }, 404);
    }
    
    return c.json({
      success: true,
      message: 'Guest deleted successfully',
      tenantId,
    });
  } catch (error: any) {
    console.error('[Guests API] Error deleting guest:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default guests;

