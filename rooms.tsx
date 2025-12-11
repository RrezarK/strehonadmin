/**
 * Rooms Routes
 * Handles room and room category management
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";

const rooms = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get room categories
rooms.get("/room-categories", async (c) => {
  try {
    const tenantId = c.req.query('tenantId');
    
    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Tenant ID is required'
      }, 400);
    }
    
    let categories = await kv.get(`tenant:${tenantId}:room_categories`) || [];
    
    let needsMigration = false;
    const migratedCategories = categories.map((cat: any) => {
      if (cat.basePrice !== undefined || cat.bedConfiguration !== undefined) {
        needsMigration = true;
        const migrated = {
          ...cat,
          baseRate: cat.baseRate !== undefined ? cat.baseRate : cat.basePrice,
          bedTypes: cat.bedTypes !== undefined ? cat.bedTypes : cat.bedConfiguration
        };
        delete migrated.basePrice;
        delete migrated.bedConfiguration;
        return migrated;
      }
      return cat;
    });
    
    if (needsMigration) {
      await kv.set(`tenant:${tenantId}:room_categories`, migratedCategories);
      categories = migratedCategories;
    }
    
    return c.json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    console.error('[Room Categories API] Error fetching categories:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create room category
rooms.post("/room-categories", async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, maxOccupancy, amenities } = body;
    const baseRate = body.baseRate !== undefined ? body.baseRate : body.basePrice;
    const bedTypes = body.bedTypes !== undefined ? body.bedTypes : body.bedConfiguration;
    
    const tenantId = body.tenantId || 
                     c.req.query('tenantId') || 
                     c.req.header('x-tenant-id') ||
                     c.req.header('X-Tenant-ID');
    
    if (!tenantId || !name) {
      return c.json({
        success: false,
        error: 'Tenant ID and name are required'
      }, 400);
    }
    
    const categories = await kv.get(`tenant:${tenantId}:room_categories`) || [];
    
    if (categories.some((cat: any) => cat.name.toLowerCase() === name.toLowerCase())) {
      return c.json({
        success: false,
        error: 'A room category with this name already exists'
      }, 400);
    }
    
    const newCategory = {
      id: `rc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      description: description || '',
      baseRate: baseRate || 0,
      bedTypes: bedTypes || '',
      maxOccupancy: maxOccupancy || 2,
      amenities: amenities || [],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    
    categories.push(newCategory);
    await kv.set(`tenant:${tenantId}:room_categories`, categories);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'room_category_created',
          resource_type: 'room_category',
          resource_id: newCategory.id,
          details: { tenantId, name, baseRate, maxOccupancy },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Room Categories API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: newCategory
    });
  } catch (error: any) {
    console.error('[Room Categories API] Error creating category:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update room category
rooms.put("/room-categories/:id", async (c) => {
  try {
    const categoryId = c.req.param('id');
    const body = await c.req.json();
    const { name, description, maxOccupancy, amenities } = body;
    const baseRate = body.baseRate !== undefined ? body.baseRate : body.basePrice;
    const bedTypes = body.bedTypes !== undefined ? body.bedTypes : body.bedConfiguration;
    
    const tenantId = body.tenantId || 
                     c.req.query('tenantId') || 
                     c.req.header('x-tenant-id') ||
                     c.req.header('X-Tenant-ID');
    
    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Tenant ID is required'
      }, 400);
    }
    
    const categories = await kv.get(`tenant:${tenantId}:room_categories`) || [];
    const categoryIndex = categories.findIndex((cat: any) => cat.id === categoryId);
    
    if (categoryIndex === -1) {
      return c.json({
        success: false,
        error: 'Room category not found'
      }, 404);
    }
    
    const existingCategory = categories[categoryIndex];
    const currentBaseRate = existingCategory.baseRate !== undefined ? existingCategory.baseRate : existingCategory.basePrice;
    const currentBedTypes = existingCategory.bedTypes !== undefined ? existingCategory.bedTypes : existingCategory.bedConfiguration;
    
    const updatedCategory = {
      id: existingCategory.id,
      name: name || existingCategory.name,
      description: description !== undefined ? description : existingCategory.description,
      baseRate: baseRate !== undefined ? baseRate : currentBaseRate,
      bedTypes: bedTypes !== undefined ? bedTypes : currentBedTypes,
      maxOccupancy: maxOccupancy !== undefined ? maxOccupancy : existingCategory.maxOccupancy,
      amenities: amenities !== undefined ? amenities : existingCategory.amenities,
      created: existingCategory.created,
      updated: new Date().toISOString()
    };
    
    delete (updatedCategory as any).basePrice;
    delete (updatedCategory as any).bedConfiguration;
    
    categories[categoryIndex] = updatedCategory;
    await kv.set(`tenant:${tenantId}:room_categories`, categories);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'room_category_updated',
          resource_type: 'room_category',
          resource_id: categoryId,
          details: { tenantId, name, baseRate, maxOccupancy },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Room Categories API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: updatedCategory
    });
  } catch (error: any) {
    console.error('[Room Categories API] Error updating category:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete room category
rooms.delete("/room-categories/:id", async (c) => {
  try {
    const categoryId = c.req.param('id');
    const tenantId = c.req.query('tenantId');
    
    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Tenant ID is required'
      }, 400);
    }
    
    const categories = await kv.get(`tenant:${tenantId}:room_categories`) || [];
    const filteredCategories = categories.filter((cat: any) => cat.id !== categoryId);
    
    if (categories.length === filteredCategories.length) {
      return c.json({
        success: false,
        error: 'Room category not found'
      }, 404);
    }
    
    await kv.set(`tenant:${tenantId}:room_categories`, filteredCategories);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'room_category_deleted',
          resource_type: 'room_category',
          resource_id: categoryId,
          details: { tenantId },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Room Categories API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: 'Room category deleted successfully'
    });
  } catch (error: any) {
    console.error('[Room Categories API] Error deleting category:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Migrate room categories
rooms.post("/room-categories/migrate", async (c) => {
  try {
    const tenants = await kv.getByPrefix('tenant:T-') || [];
    let totalMigrated = 0;
    let totalCategories = 0;
    const results: any[] = [];
    
    for (const tenant of tenants) {
      const tenantId = tenant.id;
      const categories = await kv.get(`tenant:${tenantId}:room_categories`) || [];
      
      if (categories.length === 0) {
        continue;
      }
      
      totalCategories += categories.length;
      let migratedCount = 0;
      
      const migratedCategories = categories.map((cat: any) => {
        if (cat.basePrice !== undefined || cat.bedConfiguration !== undefined) {
          migratedCount++;
          const migrated = {
            ...cat,
            baseRate: cat.baseRate !== undefined ? cat.baseRate : cat.basePrice || 0,
            bedTypes: cat.bedTypes !== undefined ? cat.bedTypes : cat.bedConfiguration || ''
          };
          delete migrated.basePrice;
          delete migrated.bedConfiguration;
          return migrated;
        }
        return cat;
      });
      
      if (migratedCount > 0) {
        await kv.set(`tenant:${tenantId}:room_categories`, migratedCategories);
        totalMigrated += migratedCount;
        results.push({
          tenantId,
          categoriesTotal: categories.length,
          categoriesMigrated: migratedCount
        });
      }
    }
    
    return c.json({
      success: true,
      message: 'Room categories migration completed successfully',
      data: {
        totalTenants: tenants.length,
        tenantsWithCategories: results.length,
        totalCategories,
        totalMigrated,
        details: results
      }
    });
  } catch (error: any) {
    console.error('[Room Categories Migration] Error migrating categories:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get all rooms
rooms.get("/", async (c) => {
  try {
    const tenantId = c.req.query('tenantId');
    
    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Tenant ID is required'
      }, 400);
    }
    
    const rooms = await kv.get(`tenant:${tenantId}:rooms`) || [];
    
    return c.json({
      success: true,
      data: rooms
    });
  } catch (error: any) {
    console.error('[Rooms API] Error fetching rooms:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create room
rooms.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { roomNumber, categoryId, floor, status } = body;
    
    const tenantId = body.tenantId || 
                     c.req.query('tenantId') || 
                     c.req.header('x-tenant-id') ||
                     c.req.header('X-Tenant-ID');
    
    if (!tenantId || !roomNumber || !categoryId) {
      return c.json({
        success: false,
        error: 'Tenant ID, room number, and category ID are required'
      }, 400);
    }
    
    const rooms = await kv.get(`tenant:${tenantId}:rooms`) || [];
    
    if (rooms.some((r: any) => r.roomNumber === roomNumber)) {
      return c.json({
        success: false,
        error: 'A room with this number already exists'
      }, 400);
    }
    
    const newRoom = {
      id: `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      roomNumber,
      categoryId,
      floor: floor || 1,
      status: status || 'available',
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    
    rooms.push(newRoom);
    await kv.set(`tenant:${tenantId}:rooms`, rooms);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'room_created',
          resource_type: 'room',
          resource_id: newRoom.id,
          details: { tenantId, roomNumber, categoryId },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Rooms API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: newRoom
    });
  } catch (error: any) {
    console.error('[Rooms API] Error creating room:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update room
rooms.put("/:id", async (c) => {
  try {
    const roomId = c.req.param('id');
    const body = await c.req.json();
    
    const tenantId = body.tenantId || 
                     c.req.query('tenantId') || 
                     c.req.header('x-tenant-id') ||
                     c.req.header('X-Tenant-ID');
    
    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Tenant ID is required'
      }, 400);
    }
    
    const rooms = await kv.get(`tenant:${tenantId}:rooms`) || [];
    const roomIndex = rooms.findIndex((r: any) => r.id === roomId);
    
    if (roomIndex === -1) {
      return c.json({
        success: false,
        error: 'Room not found'
      }, 404);
    }
    
    const updatedRoom = {
      ...rooms[roomIndex],
      ...body,
      id: roomId,
      updated: new Date().toISOString()
    };
    
    rooms[roomIndex] = updatedRoom;
    await kv.set(`tenant:${tenantId}:rooms`, rooms);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'room_updated',
          resource_type: 'room',
          resource_id: roomId,
          details: { tenantId, ...body },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Rooms API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      data: updatedRoom
    });
  } catch (error: any) {
    console.error('[Rooms API] Error updating room:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete room
rooms.delete("/:id", async (c) => {
  try {
    const roomId = c.req.param('id');
    const tenantId = c.req.query('tenantId');
    
    if (!tenantId) {
      return c.json({
        success: false,
        error: 'Tenant ID is required'
      }, 400);
    }
    
    const rooms = await kv.get(`tenant:${tenantId}:rooms`) || [];
    const filteredRooms = rooms.filter((r: any) => r.id !== roomId);
    
    if (rooms.length === filteredRooms.length) {
      return c.json({
        success: false,
        error: 'Room not found'
      }, 404);
    }
    
    await kv.set(`tenant:${tenantId}:rooms`, filteredRooms);
    
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'room_deleted',
          resource_type: 'room',
          resource_id: roomId,
          details: { tenantId },
          ip_address: c.req.header('x-forwarded-for') || 'unknown'
        });
    } catch (auditError) {
      console.warn('[Rooms API] Could not log audit event:', auditError);
    }
    
    return c.json({
      success: true,
      message: 'Room deleted successfully'
    });
  } catch (error: any) {
    console.error('[Rooms API] Error deleting room:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default rooms;

