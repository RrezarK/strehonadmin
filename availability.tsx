/**
 * Availability Routes
 * Handles room availability and rate management
 */

import { Hono } from "npm:hono";
import * as kv from "../kv_store.tsx";

const availability = new Hono();

// Get availability rates
availability.get("/availability-rates", async (c) => {
  try {
    const tenantId = c.req.query('tenantId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    
    if (!tenantId || !startDate || !endDate) {
      return c.json({
        success: false,
        error: 'Missing required parameters: tenantId, startDate, endDate'
      }, 400);
    }
    
    const pattern = `availability:${tenantId}:*`;
    const allRates = await kv.getByPrefix(pattern);
    
    const rates = allRates
      .filter((rate: any) => {
        if (!rate || !rate.date) return false;
        return rate.date >= startDate && rate.date <= endDate;
      });
    
    return c.json({
      success: true,
      rates: rates
    });
  } catch (error: any) {
    console.error('[Availability Rates] Error fetching rates:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch availability rates',
      details: error.message
    }, 500);
  }
});

// Update availability rates
availability.put("/availability-rates", async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, categoryId, date, rate, available, total } = body;
    
    if (!tenantId || !categoryId || !date) {
      return c.json({
        success: false,
        error: 'Missing required parameters: tenantId, categoryId, date'
      }, 400);
    }
    
    const key = `availability:${tenantId}:${categoryId}:${date}`;
    const existing = await kv.get(key);
    
    const rateRecord = {
      id: existing?.id || `${categoryId}-${date}`,
      tenantId,
      categoryId,
      date,
      rate: rate !== undefined ? rate : (existing?.rate || 0),
      available: available !== undefined ? available : (existing?.available || 0),
      total: total !== undefined ? total : (existing?.total || 0),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(key, rateRecord);
    
    return c.json({
      success: true,
      rate: rateRecord
    });
  } catch (error: any) {
    console.error('[Availability Rates] Error updating rate:', error);
    return c.json({
      success: false,
      error: 'Failed to update availability rate',
      details: error.message
    }, 500);
  }
});

// Bulk update availability rates
availability.put("/availability-rates/bulk", async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, updates } = body;
    
    if (!tenantId || !updates || !Array.isArray(updates)) {
      return c.json({
        success: false,
        error: 'Missing required parameters: tenantId, updates (array)'
      }, 400);
    }
    
    const results: any[] = [];
    for (const update of updates) {
      const { categoryId, date, rate, available, total } = update;
      
      if (!categoryId || !date) continue;
      
      const key = `availability:${tenantId}:${categoryId}:${date}`;
      const existing = await kv.get(key);
      
      const rateRecord = {
        id: existing?.id || `${categoryId}-${date}`,
        tenantId,
        categoryId,
        date,
        rate: rate !== undefined ? rate : (existing?.rate || 0),
        available: available !== undefined ? available : (existing?.available || 0),
        total: total !== undefined ? total : (existing?.total || 0),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await kv.set(key, rateRecord);
      results.push(rateRecord);
    }
    
    return c.json({
      success: true,
      updatedCount: results.length,
      rates: results
    });
  } catch (error: any) {
    console.error('[Availability Rates] Error bulk updating rates:', error);
    return c.json({
      success: false,
      error: 'Failed to bulk update availability rates',
      details: error.message
    }, 500);
  }
});

// Initialize availability rates
availability.post("/availability-rates/initialize", async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, categoryId, startDate, endDate, rate, available, total } = body;
    
    if (!tenantId || !categoryId || !startDate || !endDate) {
      return c.json({
        success: false,
        error: 'Missing required parameters: tenantId, categoryId, startDate, endDate'
      }, 400);
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }
    
    const results: any[] = [];
    for (const date of dates) {
      const key = `availability:${tenantId}:${categoryId}:${date}`;
      
      const existing = await kv.get(key);
      if (existing) continue;
      
      const rateRecord = {
        id: `${categoryId}-${date}`,
        tenantId,
        categoryId,
        date,
        rate: rate !== undefined ? rate : 0,
        available: available !== undefined ? available : 0,
        total: total !== undefined ? total : 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await kv.set(key, rateRecord);
      results.push(rateRecord);
    }
    
    return c.json({
      success: true,
      message: `Initialized ${results.length} rate entries`,
      rates: results
    });
  } catch (error: any) {
    console.error('[Availability Rates] Error initializing rates:', error);
    return c.json({
      success: false,
      error: 'Failed to initialize availability rates',
      details: error.message
    }, 500);
  }
});

export default availability;

