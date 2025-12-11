/**
 * Compliance Routes
 * Handles GDPR/compliance requests
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import { TenantService } from "../data-service.tsx";
import { GuestService, ReservationService, CommunicationService } from "../data-service.tsx";
import * as kv from "../kv_store.tsx";

const compliance = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get all compliance requests
compliance.get("/requests", async (c) => {
  try {
    const exportRequests = await kv.getByPrefix('compliance:export:') || [];
    const deletionRequests = await kv.getByPrefix('compliance:deletion:') || [];
    
    const allRequests = [
      ...exportRequests.map((req: any) => ({ ...req, type: 'export' })),
      ...deletionRequests.map((req: any) => ({ ...req, type: 'deletion' }))
    ];
    
    allRequests.sort((a, b) => {
      const dateA = new Date(a.requestDate || a.created_at || 0).getTime();
      const dateB = new Date(b.requestDate || b.created_at || 0).getTime();
      return dateB - dateA;
    });
    
    return c.json({
      success: true,
      data: allRequests,
      count: allRequests.length
    });
  } catch (error: any) {
    console.error('[Compliance] Error fetching requests:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch compliance requests',
      details: error.message
    }, 500);
  }
});

// Export tenant data
compliance.post("/export/:tenantId", async (c) => {
  try {
    const tenantId = c.req.param("tenantId");
    const body = await c.req.json();
    const { format = 'json', includeData = {} } = body;

    const { tenant, source } = await TenantService.resolve(tenantId);
    
    if (!tenant) {
      return c.json({ 
        success: false, 
        error: "Tenant not found"
      }, 404);
    }

    const pgTenantId = tenant.uuid || tenant.id;
    const exportData: any = {
      tenantInfo: {
        id: tenant.id,
        uuid: tenant.uuid,
        name: tenant.name,
        email: tenant.email || '',
        status: tenant.status,
        plan: tenant.plan || tenant.settings?.plan || 'Trial',
        created_at: tenant.createdAt || tenant.created
      },
      exportedAt: new Date().toISOString(),
      format: format
    };

    const recordCounts: any = {};

    if (includeData.reservations) {
      try {
        const result = await ReservationService.list(pgTenantId, { pagination: { page: 1, limit: 10000 } });
        exportData.reservations = result.data || [];
        recordCounts.reservations = exportData.reservations.length;
      } catch (error: any) {
        exportData.reservations = [];
        recordCounts.reservations = 0;
      }
    }

    if (includeData.guests) {
      try {
        const result = await GuestService.list(pgTenantId, { pagination: { page: 1, limit: 10000 } });
        exportData.guests = result.data || [];
        recordCounts.guests = exportData.guests.length;
      } catch (error: any) {
        exportData.guests = [];
        recordCounts.guests = 0;
      }
    }

    if (includeData.guestCRM) {
      try {
        const guestPreferences = await kv.getByPrefix(`pref:${pgTenantId}:`) || [];
        const commResult = await CommunicationService.listAll(pgTenantId, { pagination: { page: 1, limit: 10000 } });
        exportData.guestCRM = {
          preferences: guestPreferences,
          communications: commResult.data || []
        };
        recordCounts.guestPreferences = guestPreferences.length;
        recordCounts.communications = commResult.data?.length || 0;
      } catch (error: any) {
        exportData.guestCRM = { preferences: [], communications: [] };
        recordCounts.guestPreferences = 0;
        recordCounts.communications = 0;
      }
    }

    const exportId = `export_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const exportRequest = {
      id: exportId,
      tenantId: tenantId,
      tenantUUID: pgTenantId,
      status: 'completed',
      format: format,
      recordCounts: recordCounts,
      requestDate: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      downloadUrl: `/compliance/export/${exportId}/download`
    };

    await kv.set(`compliance:export:${exportId}`, exportRequest);
    await kv.set(`compliance:export:data:${exportId}`, exportData);

    return c.json({
      success: true,
      data: exportRequest
    });
  } catch (error: any) {
    console.error('[Compliance Export] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to export tenant data',
      details: error.message
    }, 500);
  }
});

// Download export
compliance.get("/export/:exportId/download", async (c) => {
  try {
    const exportId = c.req.param("exportId");
    const exportData = await kv.get(`compliance:export:data:${exportId}`);
    
    if (!exportData) {
      return c.json({ success: false, error: 'Export not found' }, 404);
    }
    
    return c.json({
      success: true,
      data: exportData
    });
  } catch (error: any) {
    console.error('[Compliance] Error downloading export:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Request data deletion
compliance.post("/deletion", async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, reason, confirmation } = body;

    if (!confirmation || confirmation !== 'DELETE') {
      return c.json({
        success: false,
        error: 'Deletion requires confirmation with "DELETE" keyword'
      }, 400);
    }

    const { tenant } = await TenantService.resolve(tenantId);
    
    if (!tenant) {
      return c.json({ 
        success: false, 
        error: "Tenant not found"
      }, 404);
    }

    const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const deletionRequest = {
      id: deletionId,
      tenantId: tenantId,
      status: 'pending',
      reason: reason || 'GDPR Right to Erasure',
      requestDate: new Date().toISOString(),
      confirmation: confirmation
    };

    await kv.set(`compliance:deletion:${deletionId}`, deletionRequest);

    return c.json({
      success: true,
      message: 'Deletion request created. Review and approve to proceed.',
      data: deletionRequest
    });
  } catch (error: any) {
    console.error('[Compliance] Error creating deletion request:', error);
    return c.json({
      success: false,
      error: 'Failed to create deletion request',
      details: error.message
    }, 500);
  }
});

export default compliance;

