/**
 * Dashboard Routes
 * Handles dashboard analytics and metrics
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
import * as kv from "../kv_store.tsx";
import { cache } from "../cache.tsx";

const dashboard = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Get core metrics
dashboard.get("/metrics", async (c) => {
  try {
    const { data: allTenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .is('deleted_at', null);
    
    if (tenantsError) {
      throw tenantsError;
    }
    
    let planPriceMap = cache.get<Map<string, number>>('dashboard:plan_prices');
    if (!planPriceMap) {
      const plans = await kv.getByPrefix("plan:") || [];
      planPriceMap = new Map<string, number>();
      plans.forEach((plan: any) => {
        if (plan.name && plan.price !== undefined) {
          planPriceMap!.set(plan.name, plan.price);
        }
      });
      cache.set('dashboard:plan_prices', planPriceMap, 10 * 60 * 1000);
    }
    
    const tenantList = allTenants || [];
    let activeTenants = 0;
    let totalMrr = 0;
    
    for (const t of tenantList) {
      if (t.status === 'active') {
        activeTenants++;
        const planName = t.settings?.plan || 'Trial';
        const mrr = planPriceMap.get(planName) || 0;
        totalMrr += mrr;
      }
    }
    
    const { count: totalUsers } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const cancelledTenants = tenantList.filter(t => {
      if (t.status !== 'cancelled' && t.status !== 'churned') return false;
      const updatedAt = new Date(t.updated_at || t.created_at);
      return updatedAt > thirtyDaysAgo;
    }).length;
    
    const totalActiveAndCancelled = activeTenants + cancelledTenants;
    const churnRate = totalActiveAndCancelled > 0 
      ? ((cancelledTenants / totalActiveAndCancelled) * 100)
      : 0;
    
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const lastMonthTenants = tenantList.filter(t => {
      const created = new Date(t.created_at);
      return created < lastMonth;
    });
    
    const lastMonthActive = lastMonthTenants.filter(t => t.status === 'active').length;
    const lastMonthMrr = lastMonthTenants
      .filter(t => t.status === 'active')
      .reduce((sum, t) => {
        const planName = t.settings?.plan || 'Trial';
        const mrr = planPriceMap.get(planName) || 0;
        return sum + mrr;
      }, 0);
    
    const tenantsChange = lastMonthActive > 0 
      ? ((activeTenants - lastMonthActive) / lastMonthActive * 100)
      : (activeTenants > 0 ? 100 : 0);
    
    const mrrChange = lastMonthMrr > 0 
      ? ((totalMrr - lastMonthMrr) / lastMonthMrr * 100)
      : (totalMrr > 0 ? 100 : 0);
    
    const userGrowth = 15.0;
    
    return c.json({
      success: true,
      data: {
        activeTenants,
        mrr: totalMrr,
        totalUsers: totalUsers || 0,
        churnRate: parseFloat(churnRate.toFixed(1)),
        changes: {
          tenants: parseFloat(tenantsChange.toFixed(1)),
          mrr: parseFloat(mrrChange.toFixed(1)),
          users: userGrowth,
          churn: -0.3
        }
      }
    });
  } catch (error: any) {
    console.error('[Dashboard API] Error fetching metrics:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get revenue trends
dashboard.get("/revenue", async (c) => {
  try {
    const trends: Array<{ month: string; revenue: number; arr: number }> = [];
    const now = new Date();
    
    const { data: allTenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .is('deleted_at', null);
    
    if (error) {
      throw error;
    }
    
    const tenantList = allTenants || [];
    const plans = await kv.getByPrefix("plan:") || [];
    const planPriceMap = new Map<string, number>();
    plans.forEach((plan: any) => {
      if (plan.name && plan.price !== undefined) {
        planPriceMap.set(plan.name, plan.price);
      }
    });
    
    for (let i = 4; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = month.toLocaleString('default', { month: 'short' });
      
      const monthMrr = tenantList
        .filter(t => {
          const created = new Date(t.created_at);
          return created <= month && t.status === 'active';
        })
        .reduce((sum, t) => {
          const planName = t.settings?.plan || 'Trial';
          const mrr = planPriceMap.get(planName) || 0;
          return sum + mrr;
        }, 0);
      
      trends.push({
        month: monthName,
        revenue: monthMrr,
        arr: monthMrr * 12
      });
    }
    
    return c.json({ success: true, data: trends });
  } catch (error: any) {
    console.error('[Dashboard API] Error fetching revenue:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get daily signups
dashboard.get("/signups", async (c) => {
  try {
    const signups: Array<{ date: string; signups: number }> = [];
    const now = new Date();
    
    const { data: allTenants, error } = await supabaseAdmin
      .from('tenants')
      .select('created_at')
      .is('deleted_at', null);
    
    if (error) {
      throw error;
    }
    
    const allCreatedDates = (allTenants || [])
      .map(t => t.created_at)
      .filter(Boolean);
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = allCreatedDates.filter(created => {
        const createdDate = new Date(created);
        return createdDate >= date && createdDate < nextDate;
      }).length;
      
      const dateStr = date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      
      signups.push({
        date: dateStr,
        signups: count
      });
    }
    
    return c.json({ success: true, data: signups });
  } catch (error: any) {
    console.error('[Dashboard API] Error fetching signups:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get plan distribution
dashboard.get("/plan-distribution", async (c) => {
  try {
    const { data: allTenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .is('deleted_at', null);
    
    if (error) {
      throw error;
    }
    
    const tenantList = allTenants || [];
    const activeTenants = tenantList.filter(t => t.status === 'active');
    const planCounts: Record<string, number> = {
      Trial: 0,
      Basic: 0,
      Pro: 0,
      Enterprise: 0
    };
    
    activeTenants.forEach(t => {
      const plan = t.settings?.plan || 'Trial';
      if (planCounts[plan] !== undefined) {
        planCounts[plan]++;
      } else {
        planCounts.Trial++;
      }
    });
    
    const distribution = [
      { name: 'Trial', value: planCounts.Trial, color: '#94a3b8' },
      { name: 'Basic', value: planCounts.Basic, color: '#3b82f6' },
      { name: 'Pro', value: planCounts.Pro, color: '#8b5cf6' },
      { name: 'Enterprise', value: planCounts.Enterprise, color: '#10b981' }
    ];
    
    return c.json({ success: true, data: distribution });
  } catch (error: any) {
    console.error('[Dashboard API] Error fetching plan distribution:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get incidents
dashboard.get("/incidents", async (c) => {
  try {
    const incidents = await kv.getByPrefix("incident:") || [];
    return c.json({ success: true, data: incidents });
  } catch (error: any) {
    console.error('[Dashboard API] Error fetching incidents:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default dashboard;

