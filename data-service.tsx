/**
 * Data Service Layer for Multi-Tenant HMS/PMS SaaS Admin Panel
 * 
 * This service provides high-level data access functions with built-in tenant isolation,
 * pagination, filtering, and sorting capabilities. All functions interact with the KV store
 * and enforce proper key naming conventions for tenant isolation.
 */

import * as kv from './kv_store.tsx';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cache } from './cache.tsx';

// Reuse single client instance (already created in index.tsx, but create here if needed)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

const getSupabaseAdmin = () => {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }
  return _supabaseAdmin;
};

// Use the getter function - this ensures we have a client when needed
const supabaseAdmin = getSupabaseAdmin();

import type {
  Tenant,
  Plan,
  Subscription,
  Invoice,
  UsageRecord,
  UsageAlert,
  FeatureFlag,
  AuditLog,
  Integration,
  Webhook,
  WebhookDelivery,
  ApiKey,
  ComplianceRequest,
  DataRetentionPolicy,
  Notification,
  PlatformSettings,
  AdminUser,
  Guest,
  GuestVIPStatus,
  GuestSegment,
  PaginationParams,
  PaginationResult,
  FilterParams,
  SortParams,
  MetricType,
  AuditAction,
} from './models.tsx';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID with a prefix and timestamp
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a sequential reservation ID (RES-123 format)
 */
async function generateReservationId(tenantId: string): Promise<string> {
  // Get the counter for this tenant
  const counterKey = `reservation_counter:${tenantId}`;
  const currentCounter = await kv.get(counterKey) || 0;
  
  // Increment counter
  const newCounter = currentCounter + 1;
  await kv.set(counterKey, newCounter);
  
  // Return formatted ID
  return `RES-${newCounter}`;
}

/**
 * Get current period string (YYYY-MM)
 */
export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Paginate an array of items
 */
export function paginateArray<T>(
  items: T[],
  params?: PaginationParams
): PaginationResult<T> {
  const page = params?.page || 1;
  const limit = params?.limit || 50;
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  
  return {
    data: items.slice(start, end),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Sort an array of items by a field
 */
export function sortArray<T>(items: T[], params?: SortParams): T[] {
  if (!params) return items;
  
  const { field, order } = params;
  
  return [...items].sort((a: any, b: any) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal === bVal) return 0;
    
    const comparison = aVal < bVal ? -1 : 1;
    return order === 'asc' ? comparison : -comparison;
  });
}

/**
 * Filter tenants by various criteria
 */
export function filterTenants(tenants: Tenant[], filters?: FilterParams): Tenant[] {
  if (!filters) return tenants;
  
  return tenants.filter(tenant => {
    // Status filter
    if (filters.status && tenant.status !== filters.status) {
      return false;
    }
    
    // Plan filter
    if (filters.plan && tenant.plan !== filters.plan) {
      return false;
    }
    
    // Region filter
    if (filters.region && tenant.region !== filters.region) {
      return false;
    }
    
    // Search filter (searches name, subdomain, owner)
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const searchable = [
        tenant.name,
        tenant.subdomain,
        tenant.owner,
        tenant.ownerName,
        tenant.id,
      ].filter(Boolean).join(' ').toLowerCase();
      
      if (!searchable.includes(search)) {
        return false;
      }
    }
    
    // Date range filter
    if (filters.dateFrom && tenant.createdAt < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && tenant.createdAt > filters.dateTo) {
      return false;
    }
    
    return true;
  });
}

// ============================================================================
// TENANT DATA SERVICE
// ============================================================================

export const TenantService = {
  /**
   * List all tenants with optional filtering, sorting, and pagination
   */
  async list(
    filters?: FilterParams,
    sort?: SortParams,
    pagination?: PaginationParams
  ): Promise<PaginationResult<Tenant>> {
    let tenants = await kv.getByPrefix('tenant:') as Tenant[];
    
    // Apply filters
    if (filters) {
      tenants = filterTenants(tenants, filters);
    }
    
    // Apply sorting
    if (sort) {
      tenants = sortArray(tenants, sort);
    }
    
    // Apply pagination
    return paginateArray(tenants, pagination);
  },
  
  /**
   * Get a single tenant by ID (KV only)
   */
  async get(tenantId: string): Promise<Tenant | null> {
    return await kv.get(`tenant:${tenantId}`);
  },
  
  /**
   * Resolve tenant by ID or external_id (checks both KV and Postgres)
   * This is the recommended method for looking up tenants when you might have either a UUID or external_id
   */
  async resolve(identifier: string): Promise<{ tenant: Tenant | null; source: 'kv' | 'postgres' | null }> {
    console.log(`[TenantService] Resolving tenant: ${identifier}`);
    
    // Try KV first (fastest)
    let tenant = await kv.get(`tenant:${identifier}`);
    if (tenant) {
      console.log(`[TenantService] Found in KV`);
      return { tenant, source: 'kv' };
    }
    
    console.log(`[TenantService] Not in KV, checking Postgres...`);
    
    // Try Postgres by UUID
    if (identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.log(`[TenantService] Identifier looks like UUID, searching by id...`);
      const { data: pgTenant } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', identifier)
        .single();
      
      if (pgTenant) {
        console.log(`[TenantService] Found by UUID in Postgres`);
        // Convert to KV format
        tenant = {
          id: pgTenant.settings?.external_id || pgTenant.id,
          uuid: pgTenant.id,
          name: pgTenant.name,
          status: pgTenant.status,
          plan: pgTenant.settings?.plan || 'Trial',
          email: pgTenant.email || '',
          phone: pgTenant.phone || '',
          address: pgTenant.settings?.address || '',
          city: pgTenant.settings?.city || '',
          state: pgTenant.settings?.state || '',
          country: pgTenant.settings?.country || '',
          postalCode: pgTenant.settings?.postal_code || '',
          website: pgTenant.settings?.website || '',
          industry: pgTenant.settings?.industry || '',
          size: pgTenant.settings?.size || '',
          timezone: pgTenant.settings?.timezone || 'UTC',
          currency: pgTenant.settings?.currency || 'USD',
          logo: pgTenant.settings?.logo || '',
          primaryColor: pgTenant.settings?.primary_color || '#ea580c',
          createdAt: pgTenant.created_at,
          created: pgTenant.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          lastActiveAt: pgTenant.settings?.last_active_at,
        };
        return { tenant, source: 'postgres' };
      }
    }
    
    // OPTIMIZED: Try by external_id using JSONB query instead of loading all tenants
    console.log(`[TenantService] Searching by external_id in Postgres...`);
    const { data: pgTenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('settings->>external_id', identifier)
      .maybeSingle();
    
    if (pgTenant) {
      console.log(`[TenantService] Found by external_id in Postgres`);
      // Convert to KV format
      tenant = {
        id: pgTenant.settings?.external_id || pgTenant.id,
        uuid: pgTenant.id,
        name: pgTenant.name,
        status: pgTenant.status,
        plan: pgTenant.settings?.plan || 'Trial',
        email: pgTenant.email || '',
        phone: pgTenant.phone || '',
        address: pgTenant.settings?.address || '',
        city: pgTenant.settings?.city || '',
        state: pgTenant.settings?.state || '',
        country: pgTenant.settings?.country || '',
        postalCode: pgTenant.settings?.postal_code || '',
        website: pgTenant.settings?.website || '',
        industry: pgTenant.settings?.industry || '',
        size: pgTenant.settings?.size || '',
        timezone: pgTenant.settings?.timezone || 'UTC',
        currency: pgTenant.settings?.currency || 'USD',
        logo: pgTenant.settings?.logo || '',
        primaryColor: pgTenant.settings?.primary_color || '#ea580c',
        createdAt: pgTenant.created_at,
        created: pgTenant.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        lastActiveAt: pgTenant.settings?.last_active_at,
      };
      return { tenant, source: 'postgres' };
    }
    
    console.log(`[TenantService] Tenant not found anywhere`);
    return { tenant: null, source: null };
  },
  
  /**
   * Create a new tenant
   */
  async create(data: Omit<Tenant, 'id' | 'createdAt' | 'created'>): Promise<Tenant> {
    const tenantId = generateId('tn');
    const now = new Date();
    
    const tenant: Tenant = {
      ...data,
      id: tenantId,
      createdAt: now.toISOString(),
      created: now.toISOString().split('T')[0],
    };
    
    await kv.set(`tenant:${tenantId}`, tenant);
    return tenant;
  },
  
  /**
   * Update a tenant
   */
  async update(tenantId: string, updates: Partial<Tenant>): Promise<Tenant | null> {
    const existing = await kv.get(`tenant:${tenantId}`);
    if (!existing) return null;
    
    const tenant: Tenant = {
      ...existing,
      ...updates,
      id: tenantId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`tenant:${tenantId}`, tenant);
    return tenant;
  },
  
  /**
   * Delete a tenant and all associated data
   */
  async delete(tenantId: string): Promise<boolean> {
    const tenant = await kv.get(`tenant:${tenantId}`);
    if (!tenant) return false;
    
    // Delete tenant
    await kv.del(`tenant:${tenantId}`);
    
    // Delete associated data
    await Promise.all([
      // Subscriptions
      kv.del(`subscription:${tenantId}`),
      
      // Usage records (get all periods)
      (async () => {
        const usageRecords = await kv.getByPrefix(`usage:${tenantId}:`);
        const keys = usageRecords.map((r: UsageRecord) => r.id);
        if (keys.length > 0) await kv.mdel(keys);
      })(),
      
      // Integrations
      (async () => {
        const integrations = await kv.getByPrefix(`integration:${tenantId}:`);
        const keys = integrations.map((i: Integration) => i.id);
        if (keys.length > 0) await kv.mdel(keys);
      })(),
      
      // Compliance requests
      (async () => {
        const requests = await kv.getByPrefix(`compliance:${tenantId}:`);
        const keys = requests.map((r: ComplianceRequest) => r.id);
        if (keys.length > 0) await kv.mdel(keys);
      })(),
      
      // Notifications
      (async () => {
        const notifications = await kv.getByPrefix(`notification:${tenantId}:`);
        const keys = notifications.map((n: Notification) => n.id);
        if (keys.length > 0) await kv.mdel(keys);
      })(),
    ]);
    
    return true;
  },
  
  /**
   * Get tenant count by status
   */
  async countByStatus(): Promise<Record<string, number>> {
    const tenants = await kv.getByPrefix('tenant:') as Tenant[];
    const counts: Record<string, number> = {};
    
    tenants.forEach(tenant => {
      counts[tenant.status] = (counts[tenant.status] || 0) + 1;
    });
    
    return counts;
  },
  
  /**
   * Get tenant count by plan
   */
  async countByPlan(): Promise<Record<string, number>> {
    const tenants = await kv.getByPrefix('tenant:') as Tenant[];
    const counts: Record<string, number> = {};
    
    tenants.forEach(tenant => {
      counts[tenant.plan] = (counts[tenant.plan] || 0) + 1;
    });
    
    return counts;
  },
  
  /**
   * Calculate total MRR
   */
  async calculateTotalMRR(): Promise<number> {
    const tenants = await kv.getByPrefix('tenant:') as Tenant[];
    return tenants
      .filter(t => t.status === 'active' || t.status === 'trial')
      .reduce((sum, t) => sum + (t.mrr || 0), 0);
  },
};

// ============================================================================
// SUBSCRIPTION DATA SERVICE
// ============================================================================

export const SubscriptionService = {
  /**
   * Get subscription for a tenant
   */
  async get(tenantId: string): Promise<Subscription | null> {
    return await kv.get(`subscription:${tenantId}`);
  },
  
  /**
   * Create or update subscription for a tenant
   */
  async upsert(tenantId: string, data: Omit<Subscription, 'id' | 'tenantId' | 'createdAt'>): Promise<Subscription> {
    const existing = await kv.get(`subscription:${tenantId}`);
    
    const subscription: Subscription = {
      id: existing?.id || generateId('sub'),
      tenantId,
      ...data,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`subscription:${tenantId}`, subscription);
    return subscription;
  },
  
  /**
   * Cancel subscription
   */
  async cancel(tenantId: string, cancelAtPeriodEnd: boolean = true): Promise<Subscription | null> {
    const subscription = await kv.get(`subscription:${tenantId}`);
    if (!subscription) return null;
    
    const updated: Subscription = {
      ...subscription,
      status: cancelAtPeriodEnd ? 'active' : 'cancelled',
      cancelAtPeriodEnd,
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`subscription:${tenantId}`, updated);
    return updated;
  },
};

// ============================================================================
// USAGE DATA SERVICE
// ============================================================================

export const UsageService = {
  /**
   * Get usage for a tenant, metric, and period
   */
  async get(tenantId: string, metric: MetricType, period?: string): Promise<UsageRecord | null> {
    const p = period || getCurrentPeriod();
    return await kv.get(`usage:${tenantId}:${metric}:${p}`);
  },
  
  /**
   * Get all usage for a tenant in a period
   */
  async getAll(tenantId: string, period?: string): Promise<UsageRecord[]> {
    const p = period || getCurrentPeriod();
    return await kv.getByPrefix(`usage:${tenantId}:`) as UsageRecord[];
  },
  
  /**
   * Record usage for a tenant
   */
  async record(
    tenantId: string,
    metric: MetricType,
    value: number,
    limit: number,
    period?: string
  ): Promise<UsageRecord> {
    const p = period || getCurrentPeriod();
    const id = `usage:${tenantId}:${metric}:${p}`;
    const today = new Date().toISOString().split('T')[0];
    
    const existing = await kv.get(id);
    const daily = existing?.daily || {};
    daily[today] = value;
    
    const usage: UsageRecord = {
      id,
      tenantId,
      metric,
      period: p,
      current: value,
      limit,
      percentage: Math.min(100, Math.round((value / limit) * 100)),
      daily,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(id, usage);
    return usage;
  },
  
  /**
   * Increment usage for a tenant
   */
  async increment(
    tenantId: string,
    metric: MetricType,
    amount: number = 1,
    limit: number,
    period?: string
  ): Promise<UsageRecord> {
    const existing = await this.get(tenantId, metric, period);
    const currentValue = existing?.current || 0;
    return await this.record(tenantId, metric, currentValue + amount, limit, period);
  },
  
  /**
   * Check if tenant is over limit
   */
  async isOverLimit(tenantId: string, metric: MetricType, period?: string): Promise<boolean> {
    const usage = await this.get(tenantId, metric, period);
    return usage ? usage.current >= usage.limit : false;
  },
};

// ============================================================================
// FEATURE FLAG DATA SERVICE
// ============================================================================

export const FeatureFlagService = {
  /**
   * List all feature flags
   */
  async list(): Promise<FeatureFlag[]> {
    return await kv.getByPrefix('flag:') as FeatureFlag[];
  },
  
  /**
   * Get a feature flag
   */
  async get(flagId: string): Promise<FeatureFlag | null> {
    return await kv.get(`flag:${flagId}`);
  },
  
  /**
   * Create a feature flag
   */
  async create(data: Omit<FeatureFlag, 'id' | 'created' | 'updated'>): Promise<FeatureFlag> {
    const flagId = generateId('ff');
    const now = new Date().toISOString();
    
    const flag: FeatureFlag = {
      ...data,
      id: flagId,
      created: now,
      updated: now,
    };
    
    await kv.set(`flag:${flagId}`, flag);
    return flag;
  },
  
  /**
   * Update a feature flag
   */
  async update(flagId: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag | null> {
    const existing = await kv.get(`flag:${flagId}`);
    if (!existing) return null;
    
    const flag: FeatureFlag = {
      ...existing,
      ...updates,
      id: flagId,
      updated: new Date().toISOString(),
    };
    
    await kv.set(`flag:${flagId}`, flag);
    return flag;
  },
  
  /**
   * Check if a feature is enabled for a tenant
   */
  async isEnabled(flagKey: string, tenantId: string, planType?: string): Promise<boolean> {
    const flags = await this.list();
    const flag = flags.find(f => f.key === flagKey);
    
    if (!flag || flag.status === 'disabled') return false;
    
    // Check tenant-specific overrides
    if (flag.disabledForTenants?.includes(tenantId)) return false;
    if (flag.enabledForTenants?.includes(tenantId)) return true;
    
    // Check plan-based access
    if (planType && flag.enabledForPlans && !flag.enabledForPlans.includes(planType as any)) {
      return false;
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      // Simple hash-based rollout (consistent per tenant)
      const hash = tenantId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const percentage = hash % 100;
      return percentage < flag.rolloutPercentage;
    }
    
    return flag.status === 'enabled';
  },
};

// ============================================================================
// AUDIT LOG DATA SERVICE
// ============================================================================

export const AuditService = {
  /**
   * List all audit logs with optional filtering and pagination
   */
  async list(
    tenantId?: string,
    pagination?: PaginationParams
  ): Promise<PaginationResult<AuditLog>> {
    const prefix = tenantId ? `audit:${tenantId}:` : 'audit:';
    let logs = await kv.getByPrefix(prefix) as AuditLog[];
    
    // Sort by timestamp descending
    logs = sortArray(logs, { field: 'timestamp', order: 'desc' });
    
    return paginateArray(logs, pagination);
  },
  
  /**
   * Create an audit log entry
   */
  async log(
    action: AuditAction,
    resource: string,
    resourceId: string,
    options?: {
      tenantId?: string;
      userId?: string;
      userEmail?: string;
      changes?: { before?: any; after?: any };
      data?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): Promise<AuditLog> {
    const timestamp = new Date().toISOString();
    const random = Math.random().toString(36).substr(2, 9);
    const id = options?.tenantId 
      ? `audit:${options.tenantId}:${timestamp}:${random}`
      : `audit:${timestamp}:${random}`;
    
    const log: AuditLog = {
      id,
      action,
      resource,
      resourceId,
      timestamp,
      tenantId: options?.tenantId,
      userId: options?.userId,
      userEmail: options?.userEmail,
      changes: options?.changes,
      data: options?.data,
      metadata: options?.metadata,
    };
    
    await kv.set(id, log);
    return log;
  },
  
  /**
   * Get audit logs for a specific resource
   */
  async getByResource(resource: string, resourceId: string): Promise<AuditLog[]> {
    const allLogs = await kv.getByPrefix('audit:') as AuditLog[];
    return allLogs
      .filter(log => log.resource === resource && log.resourceId === resourceId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
};

// ============================================================================
// INTEGRATION DATA SERVICE
// ============================================================================

export const IntegrationService = {
  /**
   * Get all integrations for a tenant
   */
  async list(tenantId: string): Promise<Integration[]> {
    return await kv.getByPrefix(`integration:${tenantId}:`) as Integration[];
  },
  
  /**
   * Get a specific integration
   */
  async get(tenantId: string, provider: string): Promise<Integration | null> {
    return await kv.get(`integration:${tenantId}:${provider}`);
  },
  
  /**
   * Connect an integration
   */
  async connect(
    tenantId: string,
    provider: string,
    data: Omit<Integration, 'id' | 'tenantId' | 'provider' | 'connectedAt'>
  ): Promise<Integration> {
    const id = `integration:${tenantId}:${provider}`;
    
    const integration: Integration = {
      ...data,
      id,
      tenantId,
      provider,
      connectedAt: new Date().toISOString(),
    };
    
    await kv.set(id, integration);
    return integration;
  },
  
  /**
   * Disconnect an integration
   */
  async disconnect(tenantId: string, provider: string): Promise<boolean> {
    const id = `integration:${tenantId}:${provider}`;
    const existing = await kv.get(id);
    if (!existing) return false;
    
    await kv.del(id);
    return true;
  },
  
  /**
   * Update integration sync status
   */
  async updateSyncStatus(
    tenantId: string,
    provider: string,
    status: 'success' | 'failed',
    error?: string
  ): Promise<Integration | null> {
    const integration = await this.get(tenantId, provider);
    if (!integration) return null;
    
    const updated: Integration = {
      ...integration,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: status,
      lastSyncError: error,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(integration.id, updated);
    return updated;
  },
};

// ============================================================================
// NOTIFICATION DATA SERVICE
// ============================================================================

export const NotificationService = {
  /**
   * List notifications for a tenant
   */
  async list(tenantId?: string, pagination?: PaginationParams): Promise<PaginationResult<Notification>> {
    const prefix = tenantId ? `notification:${tenantId}:` : 'notification:global:';
    let notifications = await kv.getByPrefix(prefix) as Notification[];
    
    // Sort by creation date descending
    notifications = sortArray(notifications, { field: 'createdAt', order: 'desc' });
    
    return paginateArray(notifications, pagination);
  },
  
  /**
   * Create a notification
   */
  async create(
    data: Omit<Notification, 'id' | 'createdAt' | 'read' | 'readBy'>,
    tenantId?: string
  ): Promise<Notification> {
    const id = tenantId 
      ? `notification:${tenantId}:${generateId('notif')}`
      : `notification:global:${generateId('notif')}`;
    
    const notification: Notification = {
      ...data,
      id,
      tenantId,
      read: false,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(id, notification);
    return notification;
  },
  
  /**
   * Mark notification as read
   */
  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await kv.get(id);
    if (!notification) return null;
    
    const updated: Notification = {
      ...notification,
      read: true,
      readAt: new Date().toISOString(),
      readBy: [...(notification.readBy || []), userId],
    };
    
    await kv.set(id, updated);
    return updated;
  },
};

// ============================================================================
// PLATFORM SETTINGS DATA SERVICE
// ============================================================================

export const PlatformSettingsService = {
  /**
   * Get platform settings
   */
  async get(): Promise<PlatformSettings | null> {
    return await kv.get('platform:settings');
  },
  
  /**
   * Update platform settings
   */
  async update(updates: Partial<PlatformSettings>, userId?: string): Promise<PlatformSettings> {
    const existing = await this.get();
    
    const settings: PlatformSettings = {
      ...(existing || {
        id: 'platform:settings',
        platformName: 'HMS/PMS Admin',
        platformUrl: 'https://admin.example.com',
        supportEmail: 'support@example.com',
        enableSignups: true,
        enableTrials: true,
        trialDurationDays: 14,
        maxTenantsPerPlan: {
          Trial: 1000,
          Basic: 10000,
          Pro: 50000,
          Enterprise: 999999,
        },
        enforceSSO: false,
        require2FA: false,
        sessionTimeoutMinutes: 60,
        gdprEnabled: true,
        ccpaEnabled: true,
        dataRetentionDays: 730,
        emailNotifications: true,
      }),
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
    
    await kv.set('platform:settings', settings);
    return settings;
  },
};

// ============================================================================
// API KEY DATA SERVICE
// ============================================================================

export const ApiKeyService = {
  /**
   * List all API keys
   */
  async list(tenantId?: string): Promise<ApiKey[]> {
    const allKeys = await kv.getByPrefix('apikey:') as ApiKey[];
    if (!tenantId) return allKeys;
    return allKeys.filter(key => key.tenantId === tenantId);
  },
  
  /**
   * Generate a new API key
   */
  async generate(
    name: string,
    scopes: string[],
    options?: {
      tenantId?: string;
      description?: string;
      expiresAt?: string;
      createdBy?: string;
    }
  ): Promise<ApiKey> {
    const keyId = generateId('key');
    const key = `pk_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    const apiKey: ApiKey = {
      id: keyId,
      key,
      name,
      scopes,
      enabled: true,
      usageCount: 0,
      created: new Date().toISOString(),
      tenantId: options?.tenantId,
      description: options?.description,
      expiresAt: options?.expiresAt,
      createdBy: options?.createdBy,
    };
    
    await kv.set(`apikey:${keyId}`, apiKey);
    return apiKey;
  },
  
  /**
   * Revoke an API key
   */
  async revoke(keyId: string): Promise<boolean> {
    const apiKey = await kv.get(`apikey:${keyId}`);
    if (!apiKey) return false;
    
    const updated: ApiKey = {
      ...apiKey,
      enabled: false,
    };
    
    await kv.set(`apikey:${keyId}`, updated);
    return true;
  },
  
  /**
   * Track API key usage
   */
  async trackUsage(keyId: string): Promise<void> {
    const apiKey = await kv.get(`apikey:${keyId}`);
    if (!apiKey) return;
    
    const updated: ApiKey = {
      ...apiKey,
      usageCount: (apiKey.usageCount || 0) + 1,
      lastUsedAt: new Date().toISOString(),
    };
    
    await kv.set(`apikey:${keyId}`, updated);
  },
};

// ============================================================================
// COMPLIANCE DATA SERVICE
// ============================================================================

export const ComplianceService = {
  /**
   * List compliance requests
   */
  async list(tenantId?: string): Promise<ComplianceRequest[]> {
    const prefix = tenantId ? `compliance:${tenantId}:` : 'compliance:';
    return await kv.getByPrefix(prefix) as ComplianceRequest[];
  },
  
  /**
   * Create a compliance request
   */
  async createRequest(
    tenantId: string,
    type: 'export' | 'deletion',
    requestedBy: string,
    requestedByEmail: string,
    options?: {
      format?: 'json' | 'csv' | 'pdf';
      dataTypes?: string[];
    }
  ): Promise<ComplianceRequest> {
    const requestId = generateId('req');
    const id = `compliance:${tenantId}:${requestId}`;
    
    const request: ComplianceRequest = {
      id,
      tenantId,
      type,
      status: 'pending',
      requestedBy,
      requestedByEmail,
      format: options?.format,
      dataTypes: options?.dataTypes,
      created: new Date().toISOString(),
    };
    
    await kv.set(id, request);
    return request;
  },
  
  /**
   * Update request status
   */
  async updateStatus(
    id: string,
    status: 'processing' | 'completed' | 'failed',
    options?: {
      progress?: number;
      downloadUrl?: string;
      expiresAt?: string;
      error?: string;
    }
  ): Promise<ComplianceRequest | null> {
    const request = await kv.get(id);
    if (!request) return null;
    
    const updated: ComplianceRequest = {
      ...request,
      status,
      progress: options?.progress,
      downloadUrl: options?.downloadUrl,
      expiresAt: options?.expiresAt,
      error: options?.error,
      completedAt: status === 'completed' ? new Date().toISOString() : request.completedAt,
    };
    
    await kv.set(id, updated);
    return updated;
  },
};

// ============================================================================
// GUEST CRM DATA SERVICE
// ============================================================================

export const GuestService = {
  /**
   * List all guests for a tenant with optional filtering and pagination
   */
  async list(
    tenantId: string,
    options?: {
      search?: string;
      segment?: GuestSegment;
      vipStatus?: GuestVIPStatus;
      pagination?: PaginationParams;
    }
  ): Promise<PaginationResult<Guest>> {
    const guests = await kv.getByPrefix(`guest:${tenantId}:`) as Guest[];
    
    // Combine all filters in a single pass for efficiency
    const searchLower = options?.search?.toLowerCase();
    const segment = options?.segment;
    const vipStatus = options?.vipStatus;
    
    const filtered = guests.filter(guest => {
      // Search filter (combined check)
      if (searchLower) {
        const matchesSearch = 
          guest.fullName.toLowerCase().includes(searchLower) ||
          guest.email.toLowerCase().includes(searchLower) ||
          guest.phone?.toLowerCase().includes(searchLower) ||
          guest.id.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Segment filter
      if (segment && guest.segment !== segment) return false;
      
      // VIP status filter
      if (vipStatus && guest.vipStatus !== vipStatus) return false;
      
      return true;
    });
    
    // Sort by most recent first
    const sorted = sortArray(filtered, { field: 'createdAt', order: 'desc' });
    
    return paginateArray(sorted, options?.pagination);
  },
  
  /**
   * Get a single guest by ID
   */
  async get(tenantId: string, guestId: string): Promise<Guest | null> {
    return await kv.get(`guest:${tenantId}:${guestId}`);
  },
  
  /**
   * Create a new guest
   */
  async create(
    tenantId: string,
    data: Omit<Guest, 'id' | 'tenantId' | 'fullName' | 'totalBookings' | 'totalSpent' | 'lifetimeValue' | 'createdAt'>
  ): Promise<Guest> {
    const guestId = generateId('guest');
    const now = new Date().toISOString();
    
    const guest: Guest = {
      ...data,
      id: guestId,
      tenantId,
      fullName: `${data.firstName} ${data.lastName}`,
      totalBookings: 0,
      totalSpent: 0,
      lifetimeValue: 0,
      createdAt: now,
    };
    
    await kv.set(`guest:${tenantId}:${guestId}`, guest);
    return guest;
  },
  
  /**
   * Update a guest
   */
  async update(
    tenantId: string,
    guestId: string,
    updates: Partial<Omit<Guest, 'id' | 'tenantId' | 'createdAt'>>
  ): Promise<Guest | null> {
    const existing = await kv.get(`guest:${tenantId}:${guestId}`);
    if (!existing) return null;
    
    // Recompute fullName if firstName or lastName changed
    let fullName = existing.fullName;
    if (updates.firstName || updates.lastName) {
      fullName = `${updates.firstName || existing.firstName} ${updates.lastName || existing.lastName}`;
    }
    
    const guest: Guest = {
      ...existing,
      ...updates,
      id: guestId,
      tenantId,
      fullName,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`guest:${tenantId}:${guestId}`, guest);
    return guest;
  },
  
  /**
   * Delete a guest
   */
  async delete(tenantId: string, guestId: string): Promise<boolean> {
    const guest = await kv.get(`guest:${tenantId}:${guestId}`);
    if (!guest) return false;
    
    await kv.del(`guest:${tenantId}:${guestId}`);
    return true;
  },
  
  /**
   * Get guest statistics for a tenant
   */
  async getStats(tenantId: string): Promise<{
    total: number;
    bySegment: Record<string, number>;
    byVIPStatus: Record<string, number>;
    totalLifetimeValue: number;
    averageLifetimeValue: number;
  }> {
    const guests = await kv.getByPrefix(`guest:${tenantId}:`) as Guest[];
    
    const bySegment: Record<string, number> = {};
    const byVIPStatus: Record<string, number> = {};
    let totalLifetimeValue = 0;
    
    guests.forEach(guest => {
      bySegment[guest.segment] = (bySegment[guest.segment] || 0) + 1;
      byVIPStatus[guest.vipStatus] = (byVIPStatus[guest.vipStatus] || 0) + 1;
      totalLifetimeValue += guest.lifetimeValue || 0;
    });
    
    return {
      total: guests.length,
      bySegment,
      byVIPStatus,
      totalLifetimeValue,
      averageLifetimeValue: guests.length > 0 ? totalLifetimeValue / guests.length : 0,
    };
  },
  
  /**
   * Search guests by email
   */
  async findByEmail(tenantId: string, email: string): Promise<Guest | null> {
    const guests = await kv.getByPrefix(`guest:${tenantId}:`) as Guest[];
    return guests.find(guest => guest.email.toLowerCase() === email.toLowerCase()) || null;
  },
};

// ============================================================================
// RESERVATION DATA SERVICE (HMS/PMS)
// ============================================================================

import type { Reservation, ReservationStatus, ReservationSource } from './models.tsx';

export const ReservationService = {
  /**
   * List all reservations for a tenant with optional filtering and pagination
   */
  async list(
    tenantId: string,
    options?: {
      status?: ReservationStatus;
      guestId?: string;
      checkInDate?: string;
      checkOutDate?: string;
      search?: string;
      pagination?: PaginationParams;
    }
  ): Promise<PaginationResult<Reservation>> {
    const reservations = await kv.getByPrefix(`reservation:${tenantId}:`) as Reservation[];
    
    // Combine all filters in a single pass for efficiency
    const searchLower = options?.search?.toLowerCase();
    const status = options?.status;
    const guestId = options?.guestId;
    const checkInDate = options?.checkInDate;
    const checkOutDate = options?.checkOutDate;
    
    const filtered = reservations.filter(r => {
      // Status filter
      if (status && r.status !== status) return false;
      
      // Guest ID filter
      if (guestId && r.guestId !== guestId) return false;
      
      // Date range filters
      if (checkInDate && r.checkInDate < checkInDate) return false;
      if (checkOutDate && r.checkOutDate > checkOutDate) return false;
      
      // Search filter (combined check)
      if (searchLower) {
        const matchesSearch = 
          r.guestName.toLowerCase().includes(searchLower) ||
          r.guestEmail.toLowerCase().includes(searchLower) ||
          r.confirmationNumber.toLowerCase().includes(searchLower) ||
          r.id.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    // Sort by check-in date descending
    const sorted = sortArray(filtered, { field: 'checkInDate', order: 'desc' });
    
    return paginateArray(sorted, options?.pagination);
  },
  
  /**
   * Get a single reservation by ID
   */
  async get(tenantId: string, reservationId: string): Promise<Reservation | null> {
    return await kv.get(`reservation:${tenantId}:${reservationId}`);
  },
  
  /**
   * Get reservation by confirmation number
   */
  async getByConfirmation(tenantId: string, confirmationNumber: string): Promise<Reservation | null> {
    const reservations = await kv.getByPrefix(`reservation:${tenantId}:`) as Reservation[];
    return reservations.find(r => r.confirmationNumber === confirmationNumber) || null;
  },
  
  /**
   * Create a new reservation
   */
  async create(
    tenantId: string,
    data: Omit<Reservation, 'id' | 'tenantId' | 'createdAt' | 'confirmationNumber'>
  ): Promise<Reservation> {
    // Generate sequential reservation ID (RES-123 format)
    const reservationId = await generateReservationId(tenantId);
    const now = new Date().toISOString();
    
    // Generate confirmation number
    const confirmationNumber = `${tenantId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    
    const reservation: Reservation = {
      ...data,
      id: reservationId,
      tenantId,
      confirmationNumber,
      createdAt: now,
    };
    
    await kv.set(`reservation:${tenantId}:${reservationId}`, reservation);
    return reservation;
  },
  
  /**
   * Update a reservation
   */
  async update(
    tenantId: string,
    reservationId: string,
    updates: Partial<Omit<Reservation, 'id' | 'tenantId' | 'createdAt' | 'confirmationNumber'>>
  ): Promise<Reservation | null> {
    const existing = await kv.get(`reservation:${tenantId}:${reservationId}`);
    if (!existing) return null;
    
    const reservation: Reservation = {
      ...existing,
      ...updates,
      id: reservationId,
      tenantId,
      confirmationNumber: existing.confirmationNumber,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`reservation:${tenantId}:${reservationId}`, reservation);
    return reservation;
  },
  
  /**
   * Delete a reservation
   */
  async delete(tenantId: string, reservationId: string): Promise<boolean> {
    const reservation = await kv.get(`reservation:${tenantId}:${reservationId}`);
    if (!reservation) return false;
    
    await kv.del(`reservation:${tenantId}:${reservationId}`);
    return true;
  },
  
  /**
   * Get reservation statistics for a tenant
   */
  async getStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalRevenue: number;
    averageValue: number;
    upcomingCheckIns: number;
    currentGuests: number;
  }> {
    const reservations = await kv.getByPrefix(`reservation:${tenantId}:`) as Reservation[];
    const today = new Date().toISOString().split('T')[0];
    
    const byStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let upcomingCheckIns = 0;
    let currentGuests = 0;
    
    reservations.forEach(reservation => {
      byStatus[reservation.status] = (byStatus[reservation.status] || 0) + 1;
      totalRevenue += reservation.totalAmount || 0;
      
      if (reservation.checkInDate === today && reservation.status !== 'cancelled') {
        upcomingCheckIns++;
      }
      
      if (reservation.status === 'checked_in') {
        currentGuests++;
      }
    });
    
    return {
      total: reservations.length,
      byStatus,
      totalRevenue,
      averageValue: reservations.length > 0 ? totalRevenue / reservations.length : 0,
      upcomingCheckIns,
      currentGuests,
    };
  },
};

// ============================================================================
// LOYALTY PROGRAM DATA SERVICE
// ============================================================================

import type { 
  LoyaltyProgram, 
  LoyaltyMember, 
  LoyaltyTransaction,
  LoyaltyTierLevel,
  LoyaltyTransactionType 
} from './models.tsx';

export const LoyaltyProgramService = {
  /**
   * List all loyalty programs for a tenant
   */
  async list(tenantId: string): Promise<LoyaltyProgram[]> {
    return await kv.getByPrefix(`loyalty_program:${tenantId}:`) as LoyaltyProgram[];
  },
  
  /**
   * Get a loyalty program by ID
   */
  async get(tenantId: string, programId: string): Promise<LoyaltyProgram | null> {
    return await kv.get(`loyalty_program:${tenantId}:${programId}`);
  },
  
  /**
   * Create a loyalty program
   */
  async create(
    tenantId: string,
    data: Omit<LoyaltyProgram, 'id' | 'tenantId' | 'createdAt'>
  ): Promise<LoyaltyProgram> {
    const programId = generateId('lp');
    const now = new Date().toISOString();
    
    const program: LoyaltyProgram = {
      ...data,
      id: programId,
      tenantId,
      createdAt: now,
    };
    
    await kv.set(`loyalty_program:${tenantId}:${programId}`, program);
    return program;
  },
  
  /**
   * Update a loyalty program
   */
  async update(
    tenantId: string,
    programId: string,
    updates: Partial<Omit<LoyaltyProgram, 'id' | 'tenantId' | 'createdAt'>>
  ): Promise<LoyaltyProgram | null> {
    const existing = await kv.get(`loyalty_program:${tenantId}:${programId}`);
    if (!existing) return null;
    
    const program: LoyaltyProgram = {
      ...existing,
      ...updates,
      id: programId,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`loyalty_program:${tenantId}:${programId}`, program);
    return program;
  },
  
  /**
   * Delete a loyalty program
   */
  async delete(tenantId: string, programId: string): Promise<boolean> {
    const program = await kv.get(`loyalty_program:${tenantId}:${programId}`);
    if (!program) return false;
    
    await kv.del(`loyalty_program:${tenantId}:${programId}`);
    return true;
  },
};

export const LoyaltyMemberService = {
  /**
   * List all loyalty members for a tenant/program
   */
  async list(
    tenantId: string,
    options?: {
      programId?: string;
      tier?: LoyaltyTierLevel;
      status?: 'active' | 'inactive' | 'suspended';
      pagination?: PaginationParams;
    }
  ): Promise<PaginationResult<LoyaltyMember>> {
    let members = await kv.getByPrefix(`loyalty_member:${tenantId}:`) as LoyaltyMember[];
    
    if (options?.programId) {
      members = members.filter(m => m.programId === options.programId);
    }
    
    if (options?.tier) {
      members = members.filter(m => m.currentTier === options.tier);
    }
    
    if (options?.status) {
      members = members.filter(m => m.status === options.status);
    }
    
    members = sortArray(members, { field: 'totalPoints', order: 'desc' });
    
    return paginateArray(members, options?.pagination);
  },
  
  /**
   * Get a loyalty member by ID
   */
  async get(tenantId: string, memberId: string): Promise<LoyaltyMember | null> {
    return await kv.get(`loyalty_member:${tenantId}:${memberId}`);
  },
  
  /**
   * Get loyalty member by guest ID
   */
  async getByGuest(tenantId: string, guestId: string): Promise<LoyaltyMember | null> {
    const members = await kv.getByPrefix(`loyalty_member:${tenantId}:`) as LoyaltyMember[];
    return members.find(m => m.guestId === guestId) || null;
  },
  
  /**
   * Create a loyalty member
   */
  async create(
    tenantId: string,
    data: Omit<LoyaltyMember, 'id' | 'tenantId' | 'membershipNumber' | 'createdAt'>
  ): Promise<LoyaltyMember> {
    const memberId = generateId('lm');
    const now = new Date().toISOString();
    
    // Generate membership number
    const membershipNumber = `${tenantId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    
    const member: LoyaltyMember = {
      ...data,
      id: memberId,
      tenantId,
      membershipNumber,
      createdAt: now,
    };
    
    await kv.set(`loyalty_member:${tenantId}:${memberId}`, member);
    return member;
  },
  
  /**
   * Update a loyalty member
   */
  async update(
    tenantId: string,
    memberId: string,
    updates: Partial<Omit<LoyaltyMember, 'id' | 'tenantId' | 'membershipNumber' | 'createdAt'>>
  ): Promise<LoyaltyMember | null> {
    const existing = await kv.get(`loyalty_member:${tenantId}:${memberId}`);
    if (!existing) return null;
    
    const member: LoyaltyMember = {
      ...existing,
      ...updates,
      id: memberId,
      tenantId,
      membershipNumber: existing.membershipNumber,
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`loyalty_member:${tenantId}:${memberId}`, member);
    return member;
  },
  
  /**
   * Get member statistics for a program
   */
  async getStats(tenantId: string, programId?: string): Promise<{
    total: number;
    byTier: Record<string, number>;
    byStatus: Record<string, number>;
    totalPoints: number;
    averagePoints: number;
  }> {
    let members = await kv.getByPrefix(`loyalty_member:${tenantId}:`) as LoyaltyMember[];
    
    if (programId) {
      members = members.filter(m => m.programId === programId);
    }
    
    const byTier: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalPoints = 0;
    
    members.forEach(member => {
      byTier[member.currentTier] = (byTier[member.currentTier] || 0) + 1;
      byStatus[member.status] = (byStatus[member.status] || 0) + 1;
      totalPoints += member.totalPoints || 0;
    });
    
    return {
      total: members.length,
      byTier,
      byStatus,
      totalPoints,
      averagePoints: members.length > 0 ? totalPoints / members.length : 0,
    };
  },
};

export const LoyaltyTransactionService = {
  /**
   * List transactions for a member
   */
  async list(
    tenantId: string,
    memberId: string,
    pagination?: PaginationParams
  ): Promise<PaginationResult<LoyaltyTransaction>> {
    let transactions = await kv.getByPrefix(`loyalty_tx:${tenantId}:`) as LoyaltyTransaction[];
    transactions = transactions.filter(t => t.memberId === memberId);
    transactions = sortArray(transactions, { field: 'createdAt', order: 'desc' });
    
    return paginateArray(transactions, pagination);
  },
  
  /**
   * Create a loyalty transaction
   */
  async create(
    tenantId: string,
    data: Omit<LoyaltyTransaction, 'id' | 'tenantId' | 'createdAt'>
  ): Promise<LoyaltyTransaction> {
    const txId = generateId('ltx');
    const now = new Date().toISOString();
    
    const transaction: LoyaltyTransaction = {
      ...data,
      id: txId,
      tenantId,
      createdAt: now,
    };
    
    await kv.set(`loyalty_tx:${tenantId}:${txId}`, transaction);
    return transaction;
  },
};

// ============================================================================
// MARKETING CAMPAIGN DATA SERVICE
// ============================================================================

import type { 
  MarketingCampaign, 
  CampaignRecipient,
  CampaignStatus,
  CampaignType 
} from './models.tsx';

export const CampaignService = {
  /**
   * List all campaigns for a tenant
   */
  async list(
    tenantId: string,
    options?: {
      status?: CampaignStatus;
      type?: CampaignType;
      pagination?: PaginationParams;
    }
  ): Promise<PaginationResult<MarketingCampaign>> {
    let campaigns = await kv.getByPrefix(`campaign:${tenantId}:`) as MarketingCampaign[];
    
    if (options?.status) {
      campaigns = campaigns.filter(c => c.status === options.status);
    }
    
    if (options?.type) {
      campaigns = campaigns.filter(c => c.type === options.type);
    }
    
    campaigns = sortArray(campaigns, { field: 'createdAt', order: 'desc' });
    
    return paginateArray(campaigns, options?.pagination);
  },
  
  /**
   * Get a campaign by ID
   */
  async get(tenantId: string, campaignId: string): Promise<MarketingCampaign | null> {
    return await kv.get(`campaign:${tenantId}:${campaignId}`);
  },
  
  /**
   * Create a campaign
   */
  async create(
    tenantId: string,
    data: Omit<MarketingCampaign, 'id' | 'tenantId' | 'createdAt' | 'sentCount' | 'deliveredCount' | 'openedCount' | 'clickedCount' | 'convertedCount' | 'unsubscribedCount' | 'bouncedCount'>
  ): Promise<MarketingCampaign> {
    const campaignId = generateId('camp');
    const now = new Date().toISOString();
    
    const campaign: MarketingCampaign = {
      ...data,
      id: campaignId,
      tenantId,
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
      convertedCount: 0,
      unsubscribedCount: 0,
      bouncedCount: 0,
      createdAt: now,
    };
    
    await kv.set(`campaign:${tenantId}:${campaignId}`, campaign);
    return campaign;
  },
  
  /**
   * Update a campaign
   */
  async update(
    tenantId: string,
    campaignId: string,
    updates: Partial<Omit<MarketingCampaign, 'id' | 'tenantId' | 'createdAt'>>
  ): Promise<MarketingCampaign | null> {
    const existing = await kv.get(`campaign:${tenantId}:${campaignId}`);
    if (!existing) return null;
    
    const campaign: MarketingCampaign = {
      ...existing,
      ...updates,
      id: campaignId,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    
    // Recalculate rates
    if (campaign.sentCount > 0) {
      campaign.openRate = (campaign.openedCount / campaign.sentCount) * 100;
      campaign.clickRate = (campaign.clickedCount / campaign.sentCount) * 100;
      campaign.conversionRate = (campaign.convertedCount / campaign.sentCount) * 100;
    }
    
    await kv.set(`campaign:${tenantId}:${campaignId}`, campaign);
    return campaign;
  },
  
  /**
   * Delete a campaign
   */
  async delete(tenantId: string, campaignId: string): Promise<boolean> {
    const campaign = await kv.get(`campaign:${tenantId}:${campaignId}`);
    if (!campaign) return false;
    
    await kv.del(`campaign:${tenantId}:${campaignId}`);
    return true;
  },
  
  /**
   * Get campaign statistics
   */
  async getStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalSent: number;
    averageOpenRate: number;
    averageClickRate: number;
  }> {
    const campaigns = await kv.getByPrefix(`campaign:${tenantId}:`) as MarketingCampaign[];
    
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalSent = 0;
    let totalOpenRate = 0;
    let totalClickRate = 0;
    let campaignsWithMetrics = 0;
    
    campaigns.forEach(campaign => {
      byStatus[campaign.status] = (byStatus[campaign.status] || 0) + 1;
      byType[campaign.type] = (byType[campaign.type] || 0) + 1;
      totalSent += campaign.sentCount;
      
      if (campaign.openRate !== undefined) {
        totalOpenRate += campaign.openRate;
        campaignsWithMetrics++;
      }
      if (campaign.clickRate !== undefined) {
        totalClickRate += campaign.clickRate;
      }
    });
    
    return {
      total: campaigns.length,
      byStatus,
      byType,
      totalSent,
      averageOpenRate: campaignsWithMetrics > 0 ? totalOpenRate / campaignsWithMetrics : 0,
      averageClickRate: campaignsWithMetrics > 0 ? totalClickRate / campaignsWithMetrics : 0,
    };
  },
};

// ============================================================================
// GUEST PREFERENCES DATA SERVICE
// ============================================================================

import type { GuestPreference } from './models.tsx';

export const GuestPreferenceService = {
  /**
   * Get preferences for a guest
   */
  async get(tenantId: string, guestId: string): Promise<GuestPreference | null> {
    return await kv.get(`pref:${tenantId}:${guestId}`);
  },
  
  /**
   * Create or update guest preferences
   */
  async upsert(
    tenantId: string,
    guestId: string,
    data: Omit<GuestPreference, 'id' | 'tenantId' | 'guestId' | 'createdAt'>
  ): Promise<GuestPreference> {
    const existing = await kv.get(`pref:${tenantId}:${guestId}`);
    const now = new Date().toISOString();
    
    const preference: GuestPreference = {
      ...data,
      id: `pref_${guestId}`,
      tenantId,
      guestId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    
    await kv.set(`pref:${tenantId}:${guestId}`, preference);
    return preference;
  },
  
  /**
   * Delete guest preferences
   */
  async delete(tenantId: string, guestId: string): Promise<boolean> {
    const preference = await kv.get(`pref:${tenantId}:${guestId}`);
    if (!preference) return false;
    
    await kv.del(`pref:${tenantId}:${guestId}`);
    return true;
  },
};

// ============================================================================
// COMMUNICATION LOG DATA SERVICE
// ============================================================================

import type { CommunicationLog, CommunicationType } from './models.tsx';

export const CommunicationService = {
  /**
   * List communications for a guest
   */
  async list(
    tenantId: string,
    guestId: string,
    options?: {
      type?: CommunicationType;
      pagination?: PaginationParams;
    }
  ): Promise<PaginationResult<CommunicationLog>> {
    let logs = await kv.getByPrefix(`comm:${tenantId}:${guestId}:`) as CommunicationLog[];
    
    if (options?.type) {
      logs = logs.filter(l => l.type === options.type);
    }
    
    logs = sortArray(logs, { field: 'createdAt', order: 'desc' });
    
    return paginateArray(logs, options?.pagination);
  },
  
  /**
   * Get all communications for a tenant
   */
  async listAll(
    tenantId: string,
    options?: {
      type?: CommunicationType;
      pagination?: PaginationParams;
    }
  ): Promise<PaginationResult<CommunicationLog>> {
    let logs = await kv.getByPrefix(`comm:${tenantId}:`) as CommunicationLog[];
    
    if (options?.type) {
      logs = logs.filter(l => l.type === options.type);
    }
    
    logs = sortArray(logs, { field: 'createdAt', order: 'desc' });
    
    return paginateArray(logs, options?.pagination);
  },
  
  /**
   * Create a communication log
   */
  async create(
    tenantId: string,
    guestId: string,
    data: Omit<CommunicationLog, 'id' | 'tenantId' | 'guestId' | 'createdAt'>
  ): Promise<CommunicationLog> {
    const commId = generateId('comm');
    const now = new Date().toISOString();
    
    const log: CommunicationLog = {
      ...data,
      id: commId,
      tenantId,
      guestId,
      createdAt: now,
    };
    
    await kv.set(`comm:${tenantId}:${guestId}:${commId}`, log);
    return log;
  },
  
  /**
   * Get communication statistics
   */
  async getStats(tenantId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byDirection: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const logs = await kv.getByPrefix(`comm:${tenantId}:`) as CommunicationLog[];
    
    const byType: Record<string, number> = {};
    const byDirection: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    
    logs.forEach(log => {
      byType[log.type] = (byType[log.type] || 0) + 1;
      byDirection[log.direction] = (byDirection[log.direction] || 0) + 1;
      byStatus[log.status] = (byStatus[log.status] || 0) + 1;
    });
    
    return {
      total: logs.length,
      byType,
      byDirection,
      byStatus,
    };
  },
};
