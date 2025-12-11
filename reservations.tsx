/**
 * Reservations Routes
 * Handles reservation management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { ReservationService } from "../data-service.tsx";
import * as kv from "../kv_store.tsx";

const reservations = new Hono();
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

// Helper to track usage
async function trackUsage(tenantId: string, metric: string, amount: number = 1) {
  try {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `usage:${tenantId}:${period}:${metric}`;
    
    const existing = await kv.get(key);
    if (!existing) {
      await kv.set(key, {
        metric,
        current: amount,
        limit: 1000,
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

// Get all reservations (convenience endpoint - uses auth token)
reservations.get("/", async (c) => {
  try {
    const tenantId = c.req.query('tenantId');
    
    if (tenantId) {
      // Legacy endpoint with tenantId in query
      const pattern = `reservation:${tenantId}:*`;
      const allReservations = await kv.getByPrefix(pattern);
      const reservations = allReservations.map((item: any) => item.value || item);
      
      return c.json({
        success: true,
        reservations: reservations
      });
    }
    
    // New endpoint using auth token
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ success: false, error: 'Unauthorized - No Authorization header' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (userError || !user) {
      return c.json({ success: false, error: 'Unauthorized - Invalid token' }, 401);
    }

    const authTenantId = user.user_metadata?.tenant_id;
    if (!authTenantId) {
      return c.json({ success: false, error: 'User has no tenant_id' }, 400);
    }

    const status = c.req.query('status') as any;
    const guestId = c.req.query('guestId');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const result = await ReservationService.list(authTenantId, {
      status,
      guestId,
      pagination: { page, limit },
    });
    
    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('[Reservations API] Error listing reservations:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create reservation (convenience endpoint)
reservations.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, guestName, guestEmail, guestPhone, roomId, checkIn, checkOut, status, totalAmount, paidAmount, adults, children, specialRequests, source } = body;

    if (!tenantId || !guestName || !roomId || !checkIn || !checkOut) {
      return c.json({
        success: false,
        error: 'Missing required parameters: tenantId, guestName, roomId, checkIn, checkOut'
      }, 400);
    }

    const reservationId = `res-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const key = `reservation:${tenantId}:${reservationId}`;
    
    const reservation = {
      id: reservationId,
      tenantId,
      guestName,
      guestEmail: guestEmail || '',
      guestPhone: guestPhone || '',
      roomId,
      checkIn,
      checkOut,
      status: status || 'pending',
      totalAmount: totalAmount || 0,
      paidAmount: paidAmount || 0,
      adults: adults || 1,
      children: children || 0,
      specialRequests: specialRequests || '',
      source: source || 'direct',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await kv.set(key, reservation);

    return c.json({
      success: true,
      reservation: reservation
    });
  } catch (error: any) {
    console.error('[Reservations] Error creating reservation:', error);
    return c.json({
      success: false,
      error: 'Failed to create reservation',
      details: error.message
    }, 500);
  }
});

// Update reservation (convenience endpoint)
reservations.put("/:reservationId", async (c) => {
  try {
    const reservationId = c.req.param('reservationId');
    const body = await c.req.json();
    const { tenantId, ...updates } = body;

    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Missing required parameter: tenantId'
      }, 400);
    }

    const key = `reservation:${tenantId}:${reservationId}`;
    const existing = await kv.get(key);

    if (!existing) {
      return c.json({
        success: false,
        error: 'Reservation not found'
      }, 404);
    }

    const reservation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await kv.set(key, reservation);

    return c.json({
      success: true,
      reservation: reservation
    });
  } catch (error: any) {
    console.error('[Reservations] Error updating reservation:', error);
    return c.json({
      success: false,
      error: 'Failed to update reservation',
      details: error.message
    }, 500);
  }
});

// Delete reservation (convenience endpoint)
reservations.delete("/:reservationId", async (c) => {
  try {
    const reservationId = c.req.param('reservationId');
    const tenantId = c.req.query('tenantId');

    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Missing required parameter: tenantId'
      }, 400);
    }

    const key = `reservation:${tenantId}:${reservationId}`;
    await kv.del(key);

    return c.json({
      success: true
    });
  } catch (error: any) {
    console.error('[Reservations] Error deleting reservation:', error);
    return c.json({
      success: false,
      error: 'Failed to delete reservation',
      details: error.message
    }, 500);
  }
});

// Get tenant reservations
reservations.get("/tenants/:tenantId/reservations", async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const status = c.req.query('status') as any;
    const guestId = c.req.query('guestId');
    const checkInDate = c.req.query('checkInDate');
    const checkOutDate = c.req.query('checkOutDate');
    const search = c.req.query('search');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const result = await ReservationService.list(tenantId, {
      status,
      guestId,
      checkInDate,
      checkOutDate,
      search,
      pagination: { page, limit },
    });
    
    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('[Reservations API] Error listing reservations:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get single reservation
reservations.get("/tenants/:tenantId/reservations/:reservationId", async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const reservationId = c.req.param('reservationId');
    
    const reservation = await ReservationService.get(tenantId, reservationId);
    
    if (!reservation) {
      return c.json({ success: false, error: 'Reservation not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: reservation,
    });
  } catch (error: any) {
    console.error('[Reservations API] Error getting reservation:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create tenant reservation
reservations.post("/tenants/:tenantId/reservations", async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const body = await c.req.json();
    
    const reservation = await ReservationService.create(tenantId, body);
    
    await trackUsage(tenantId, 'reservations', 1);
    
    return c.json({
      success: true,
      data: reservation,
    }, 201);
  } catch (error: any) {
    console.error('[Reservations API] Error creating reservation:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update tenant reservation
reservations.put("/tenants/:tenantId/reservations/:reservationId", async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const reservationId = c.req.param('reservationId');
    const body = await c.req.json();
    
    const reservation = await ReservationService.update(tenantId, reservationId, body);
    
    if (!reservation) {
      return c.json({ success: false, error: 'Reservation not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: reservation,
    });
  } catch (error: any) {
    console.error('[Reservations API] Error updating reservation:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete tenant reservation
reservations.delete("/tenants/:tenantId/reservations/:reservationId", async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const reservationId = c.req.param('reservationId');
    
    const success = await ReservationService.delete(tenantId, reservationId);
    
    if (!success) {
      return c.json({ success: false, error: 'Reservation not found' }, 404);
    }
    
    return c.json({
      success: true,
      message: 'Reservation deleted successfully',
    });
  } catch (error: any) {
    console.error('[Reservations API] Error deleting reservation:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get reservation statistics
reservations.get("/tenants/:tenantId/reservations/stats", async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const stats = await ReservationService.getStats(tenantId);
    
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Reservations API] Error getting reservation statistics:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default reservations;

