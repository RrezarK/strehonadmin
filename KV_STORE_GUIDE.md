# KV Store Data Model Guide

## Overview

This guide explains the complete data model architecture for the multi-tenant HMS/PMS SaaS Admin Panel using the Supabase KV store. The system enforces **strict tenant isolation** at the data layer using hierarchical key naming conventions.

## Architecture Principles

### 1. **Tenant Isolation**
- Every data entity is scoped by `tenant_id` where applicable
- Key naming follows a consistent pattern: `<entity>:<scope>:<id>`
- Queries use prefix matching for efficient data retrieval

### 2. **Data Modeling in KV Store**
Instead of traditional relational tables, we store entities as JSON objects with structured keys:

```typescript
// Traditional SQL
SELECT * FROM tenants WHERE id = 'tn_123';

// KV Store
await kv.get('tenant:tn_123');
```

### 3. **No Migrations Required**
- Schema is defined in TypeScript interfaces (`models.tsx`)
- Data structure can evolve without database migrations
- New fields can be added to existing entities seamlessly

## Key Naming Conventions

### Tenants
```
tenant:<tenantId>
```
**Example:** `tenant:tn_1634567890_abc123`

**Data:** Full tenant object with metadata, subscription info, branding, etc.

### Subscriptions & Billing
```
plan:<planId>                              // Plan definitions
subscription:<tenantId>                     // One subscription per tenant
invoice:<tenantId>:<invoiceId>             // Invoices for tenant
```

**Examples:**
- `plan:Trial`
- `subscription:tn_1634567890_abc123`
- `invoice:tn_1634567890_abc123:inv_1634567900_xyz789`

### Usage Metrics
```
usage:<tenantId>:<metric>:<period>
alert:<tenantId>:<alertId>
```

**Examples:**
- `usage:tn_123:api_calls:2025-10` (October 2025 API calls for tenant)
- `usage:tn_123:storage:2025-10` (October 2025 storage for tenant)
- `alert:tn_123:alert_1634567890_abc`

**Metrics:** `users`, `properties`, `rooms`, `bookings`, `api_calls`, `storage`

### Feature Flags
```
flag:<flagId>                              // Global feature flag
flag:<tenantId>:<flagId>                   // Tenant-specific override
```

**Examples:**
- `flag:ff_1634567890_advanced_analytics`
- `flag:tn_123:ff_1634567890_advanced_analytics` (override for specific tenant)

### Audit Logs
```
audit:<timestamp>:<random>                 // Global audit logs
audit:<tenantId>:<timestamp>:<random>      // Tenant-scoped logs
```

**Examples:**
- `audit:2025-10-19T12:00:00.000Z:abc123`
- `audit:tn_123:2025-10-19T12:00:00.000Z:xyz789`

**Note:** All audit logs include `tenantId` in the data, but tenant-scoped keys enable efficient filtering.

### Integrations
```
integration:<tenantId>:<provider>
```

**Examples:**
- `integration:tn_123:stripe`
- `integration:tn_123:quickbooks`
- `integration:tn_123:salesforce`

### Webhooks
```
webhook:<webhookId>                        // Webhook configuration
delivery:<webhookId>:<timestamp>           // Delivery records
```

**Examples:**
- `webhook:webhook_1634567890_abc123`
- `delivery:webhook_1634567890_abc123:2025-10-19T12:00:00.000Z`

### API Keys
```
apikey:<keyId>
```

**Example:** `apikey:key_1634567890_abc123`

**Note:** API keys include `tenantId` in the data if scoped to a tenant.

### Compliance
```
compliance:<tenantId>:<requestId>
policy:<policyId>
```

**Examples:**
- `compliance:tn_123:req_1634567890_export`
- `policy:policy_audit_logs`

### Notifications
```
notification:<tenantId>:<notificationId>   // Tenant notifications
notification:global:<notificationId>        // Platform-wide notifications
```

**Examples:**
- `notification:tn_123:notif_1634567890_abc`
- `notification:global:notif_1634567890_maintenance`

### Platform Settings
```
platform:settings                          // Singleton for global settings
```

**Example:** `platform:settings`

### Admin Users
```
admin:<userId>
```

**Example:** `admin:usr_abc123`

## Data Service Layer

### Using the Data Service

Instead of directly calling KV store functions, use the data service layer in `data-service.tsx`:

```typescript
import { TenantService, UsageService, AuditService } from './data-service.tsx';

// List tenants with filtering and pagination
const result = await TenantService.list(
  { status: 'active', plan: 'Pro' },  // Filters
  { field: 'createdAt', order: 'desc' },  // Sorting
  { page: 1, limit: 20 }  // Pagination
);

// Record usage
await UsageService.record('tn_123', 'api_calls', 1500, 10000);

// Create audit log
await AuditService.log('tenant.created', 'tenant', 'tn_123', {
  tenantId: 'tn_123',
  userId: 'admin_456',
  userEmail: 'admin@example.com',
  data: { name: 'New Hotel' }
});
```

### Available Services

1. **TenantService**
   - `list()` - List with filtering, sorting, pagination
   - `get(tenantId)` - Get single tenant
   - `create(data)` - Create new tenant
   - `update(tenantId, updates)` - Update tenant
   - `delete(tenantId)` - Delete tenant and associated data
   - `countByStatus()` - Get tenant counts by status
   - `countByPlan()` - Get tenant counts by plan
   - `calculateTotalMRR()` - Calculate total MRR

2. **SubscriptionService**
   - `get(tenantId)` - Get subscription
   - `upsert(tenantId, data)` - Create or update
   - `cancel(tenantId, cancelAtPeriodEnd)` - Cancel subscription

3. **UsageService**
   - `get(tenantId, metric, period)` - Get usage record
   - `getAll(tenantId, period)` - Get all metrics for tenant
   - `record(tenantId, metric, value, limit, period)` - Record usage
   - `increment(tenantId, metric, amount, limit, period)` - Increment usage
   - `isOverLimit(tenantId, metric, period)` - Check if over limit

4. **FeatureFlagService**
   - `list()` - List all flags
   - `get(flagId)` - Get single flag
   - `create(data)` - Create flag
   - `update(flagId, updates)` - Update flag
   - `isEnabled(flagKey, tenantId, planType)` - Check if enabled for tenant

5. **AuditService**
   - `list(tenantId, pagination)` - List logs
   - `log(action, resource, resourceId, options)` - Create log entry
   - `getByResource(resource, resourceId)` - Get logs for resource

6. **IntegrationService**
   - `list(tenantId)` - List integrations
   - `get(tenantId, provider)` - Get integration
   - `connect(tenantId, provider, data)` - Connect integration
   - `disconnect(tenantId, provider)` - Disconnect integration
   - `updateSyncStatus(tenantId, provider, status, error)` - Update sync

7. **NotificationService**
   - `list(tenantId, pagination)` - List notifications
   - `create(data, tenantId)` - Create notification
   - `markAsRead(id, userId)` - Mark as read

8. **PlatformSettingsService**
   - `get()` - Get settings
   - `update(updates, userId)` - Update settings

9. **ApiKeyService**
   - `list(tenantId)` - List API keys
   - `generate(name, scopes, options)` - Generate new key
   - `revoke(keyId)` - Revoke key
   - `trackUsage(keyId)` - Track usage

10. **ComplianceService**
    - `list(tenantId)` - List requests
    - `createRequest(tenantId, type, requestedBy, requestedByEmail, options)` - Create request
    - `updateStatus(id, status, options)` - Update status

## Common Patterns

### 1. Creating a New Tenant with Full Setup

```typescript
// Create tenant
const tenant = await TenantService.create({
  name: 'Grand Hotel',
  subdomain: 'grand-hotel',
  region: 'us-east-1',
  plan: 'Pro',
  owner: 'owner@grandhotel.com',
  ownerName: 'John Doe',
  status: 'trial',
  usagePercent: 0,
  mrr: 299,
});

// Create subscription
await SubscriptionService.upsert(tenant.id, {
  planId: 'plan:Pro',
  status: 'trialing',
  currentPeriodStart: new Date().toISOString(),
  currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  cancelAtPeriodEnd: false,
});

// Initialize usage tracking
const limits = { api_calls: 100000, storage: 100 };
await UsageService.record(tenant.id, 'api_calls', 0, limits.api_calls);
await UsageService.record(tenant.id, 'storage', 0, limits.storage);

// Log creation
await AuditService.log('tenant.created', 'tenant', tenant.id, {
  tenantId: tenant.id,
  userId: 'admin_123',
  data: { name: tenant.name, plan: tenant.plan }
});
```

### 2. Tracking API Usage

```typescript
// Increment API calls for current month
await UsageService.increment('tn_123', 'api_calls', 1, 100000);

// Check if over limit
const isOverLimit = await UsageService.isOverLimit('tn_123', 'api_calls');
if (isOverLimit) {
  // Send notification
  await NotificationService.create({
    title: 'API Limit Exceeded',
    message: 'Your API usage has exceeded the plan limit.',
    type: 'warning',
    priority: 'high',
  }, 'tn_123');
}
```

### 3. Managing Feature Flags

```typescript
// Create a feature flag
const flag = await FeatureFlagService.create({
  key: 'advanced_analytics',
  name: 'Advanced Analytics',
  description: 'Advanced analytics dashboard',
  scope: 'plan',
  status: 'enabled',
  enabledForPlans: ['Pro', 'Enterprise'],
  rolloutPercentage: 100,
});

// Check if enabled for a tenant
const tenant = await TenantService.get('tn_123');
const isEnabled = await FeatureFlagService.isEnabled(
  'advanced_analytics',
  tenant.id,
  tenant.plan
);
```

### 4. Handling Compliance Requests

```typescript
// Create export request
const request = await ComplianceService.createRequest(
  'tn_123',
  'export',
  'admin_456',
  'admin@example.com',
  {
    format: 'json',
    dataTypes: ['tenants', 'users', 'bookings']
  }
);

// Update status to processing
await ComplianceService.updateStatus(request.id, 'processing', {
  progress: 50
});

// Complete request
await ComplianceService.updateStatus(request.id, 'completed', {
  progress: 100,
  downloadUrl: 'https://storage.example.com/exports/export_123.json',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
});
```

### 5. Querying with Filters and Pagination

```typescript
// Get active Pro plan tenants, sorted by MRR
const result = await TenantService.list(
  { status: 'active', plan: 'Pro' },
  { field: 'mrr', order: 'desc' },
  { page: 1, limit: 20 }
);

console.log(`Found ${result.pagination.total} tenants`);
console.log(`Page ${result.pagination.page} of ${result.pagination.totalPages}`);
result.data.forEach(tenant => {
  console.log(`${tenant.name}: $${tenant.mrr}/mo`);
});
```

### 6. Cascading Deletes

When deleting a tenant, all associated data is automatically removed:

```typescript
// Deletes tenant and all associated:
// - Subscriptions
// - Usage records
// - Integrations
// - Compliance requests
// - Notifications
await TenantService.delete('tn_123');

// Audit log for deletion
await AuditService.log('tenant.deleted', 'tenant', 'tn_123', {
  userId: 'admin_456',
  userEmail: 'admin@example.com',
});
```

## Performance Considerations

### 1. Prefix Queries
Use `getByPrefix()` for efficient bulk queries:
```typescript
// Get all tenants
const tenants = await kv.getByPrefix('tenant:');

// Get all usage for a tenant
const usage = await kv.getByPrefix('usage:tn_123:');
```

### 2. Batch Operations
Use `mget()`, `mset()`, and `mdel()` for multiple operations:
```typescript
// Delete multiple keys at once
await kv.mdel([
  'usage:tn_123:api_calls:2025-10',
  'usage:tn_123:storage:2025-10',
  'usage:tn_123:bookings:2025-10',
]);
```

### 3. Caching
For frequently accessed data, consider in-memory caching:
```typescript
// Simple cache example
const cache = new Map<string, { data: any; expires: number }>();

async function getCachedPlatformSettings() {
  const cached = cache.get('platform:settings');
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  const settings = await PlatformSettingsService.get();
  cache.set('platform:settings', {
    data: settings,
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  
  return settings;
}
```

## Data Retention & Cleanup

### Automatic Cleanup Patterns

```typescript
// Clean up old audit logs (older than retention policy)
const retentionDays = 730; // 2 years
const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

const allLogs = await kv.getByPrefix('audit:') as AuditLog[];
const oldLogs = allLogs.filter(log => log.timestamp < cutoffDate.toISOString());
const keysToDelete = oldLogs.map(log => log.id);

if (keysToDelete.length > 0) {
  await kv.mdel(keysToDelete);
  console.log(`Deleted ${keysToDelete.length} old audit logs`);
}
```

## Security Best Practices

### 1. Tenant Isolation Verification
Always verify tenant access before returning data:

```typescript
async function getTenantData(tenantId: string, requestingUserId: string) {
  // Verify user has access to this tenant
  const user = await supabaseAdmin.auth.admin.getUserById(requestingUserId);
  const userTenantId = user.data.user?.user_metadata?.tenant_id;
  
  if (userTenantId !== tenantId) {
    throw new Error('Unauthorized: Access denied to tenant data');
  }
  
  return await TenantService.get(tenantId);
}
```

### 2. Sensitive Data
Encrypt sensitive fields before storing:

```typescript
// When storing integration credentials
const integration = await IntegrationService.connect(
  'tn_123',
  'stripe',
  {
    type: 'payment_gateway',
    status: 'connected',
    enabled: true,
    config: { webhookUrl: 'https://...' },
    credentials: {
      // In production, encrypt these values
      apiKey: 'sk_live_...',
      publishableKey: 'pk_live_...',
    }
  }
);
```

### 3. Audit Everything
Log all sensitive operations:

```typescript
// After any data modification
await AuditService.log('tenant.updated', 'tenant', tenantId, {
  tenantId,
  userId: adminUserId,
  userEmail: adminEmail,
  changes: {
    before: { status: 'active' },
    after: { status: 'suspended' }
  }
});
```

## Testing

### Unit Test Example

```typescript
// Test tenant creation with full lifecycle
async function testTenantLifecycle() {
  // Create
  const tenant = await TenantService.create({
    name: 'Test Hotel',
    subdomain: 'test-hotel',
    region: 'us-east-1',
    plan: 'Trial',
    owner: 'test@example.com',
    ownerName: 'Test User',
    status: 'trial',
    usagePercent: 0,
    mrr: 0,
  });
  
  console.assert(tenant.id.startsWith('tn_'), 'Tenant ID has correct prefix');
  
  // Read
  const retrieved = await TenantService.get(tenant.id);
  console.assert(retrieved?.name === 'Test Hotel', 'Tenant retrieved correctly');
  
  // Update
  const updated = await TenantService.update(tenant.id, { status: 'active' });
  console.assert(updated?.status === 'active', 'Tenant updated correctly');
  
  // Delete
  const deleted = await TenantService.delete(tenant.id);
  console.assert(deleted === true, 'Tenant deleted successfully');
  
  const notFound = await TenantService.get(tenant.id);
  console.assert(notFound === null, 'Tenant no longer exists');
  
  console.log('✅ All tests passed');
}
```

## Migration from Traditional Database

If you're coming from a SQL background, here's how concepts map:

| SQL Concept | KV Store Equivalent |
|------------|---------------------|
| `SELECT * FROM tenants WHERE status = 'active'` | `getByPrefix('tenant:')` + filter in code |
| `INSERT INTO tenants VALUES (...)` | `kv.set('tenant:id', data)` |
| `UPDATE tenants SET ... WHERE id = ?` | `kv.set('tenant:id', updatedData)` |
| `DELETE FROM tenants WHERE id = ?` | `kv.del('tenant:id')` |
| Foreign keys | Store IDs in object and query separately |
| Indexes | Prefix-based key naming |
| Transactions | Use try-catch with compensating actions |
| Joins | Denormalize or fetch related objects |

## Summary

The KV store data model provides:

✅ **Tenant Isolation** - Enforced at the key level  
✅ **Flexibility** - Schema evolves without migrations  
✅ **Performance** - Prefix queries are fast  
✅ **Simplicity** - JSON objects, no complex SQL  
✅ **Type Safety** - TypeScript interfaces for all entities  
✅ **Audit Trail** - Built-in logging for all operations  

For production use at scale, consider migrating to a traditional database, but for prototyping and MVPs, the KV store is perfectly adequate and significantly faster to develop with.
