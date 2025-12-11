# Backend Refactoring Plan

## Overview
Refactoring the monolithic `index.tsx` (15,471 lines, 267 routes) into a modular route-based architecture.

## Structure

```
supabase/functions/server/
├── lib/                    # Shared utilities
│   ├── supabase.tsx       # Supabase client singleton
│   ├── constants.tsx      # Constants (PLAN_UUIDS, ROLE_UUIDS, etc.)
│   └── helpers.tsx        # Helper functions (generateUserId, resolveUserId, etc.)
├── routes/                 # Route modules
│   ├── index.tsx          # Route exports
│   ├── health.tsx         # Health checks ✓
│   ├── admin.tsx          # Admin endpoints ✓
│   ├── tenants.tsx        # Tenant management
│   ├── users.tsx          # User management
│   ├── guests.tsx         # Guest CRM
│   ├── reservations.tsx   # Reservations
│   ├── loyalty.tsx        # Loyalty programs
│   ├── marketing.tsx     # Marketing campaigns
│   ├── dashboard.tsx     # Dashboard/analytics
│   ├── plans.tsx          # Subscription plans
│   ├── features.tsx       # Feature flags
│   ├── usage.tsx          # Usage tracking
│   ├── integrations.tsx   # Integrations
│   ├── webhooks.tsx       # Webhooks
│   ├── compliance.tsx     # Compliance/GDPR
│   ├── security.tsx       # Security
│   ├── settings.tsx       # Settings
│   ├── rooms.tsx          # Room management
│   ├── notifications.tsx  # Notifications
│   └── system.tsx         # System/diagnostics
├── index.tsx              # Main entry (OLD - to be replaced)
└── index.new.tsx          # New modular entry point
```

## Route Groups

### 1. Health & System (2 routes)
- `/health` ✓
- `/system/health`

### 2. Admin (3 routes)
- `/create-admin` ✓
- `/admin/me` ✓
- `/admin/orphaned-users/:email`

### 3. Tenants (12 routes)
- `/tenants` (GET, POST)
- `/tenants/:id` (GET, PUT, DELETE)
- `/tenants/:id/suspend`
- `/tenants/:id/unsuspend`
- `/tenants/:tenantId/settings` (GET, PUT)
- `/tenants/:tenantId/features` (GET, PUT)
- `/tenants/:tenantId/usage` (GET, POST, DELETE)
- `/tenants/:tenantId/integrations`
- `/tenants/:tenantId/audit-logs`
- `/tenants/:tenantId/users` (GET, POST)

### 4. Users (8 routes)
- `/users` (GET)
- `/users/:email` (GET)
- `/tenants/:tenantId/users` (GET, POST)
- `/tenants/:tenantId/users/:userId` (PUT, DELETE)
- `/tenants/:tenantId/users/:userId/reset-password`
- `/tenants/:tenantId/users/:userId/toggle-mfa`

### 5. Guests & Reservations (TBD - need to check)
- Guest routes
- Reservation routes

### 6. Plans (5 routes)
- `/plans` (GET, POST)
- `/plans/:id` (GET, PUT, DELETE)

### 7. Features (7 routes)
- `/feature-flags` (GET, POST)
- `/features` (GET)
- `/features/initialize`
- `/features/:key` (PUT)
- `/features/:key/tenants`
- `/features/:key/plans`

### 8. Usage (10 routes)
- `/usage/:tenantId` (GET)
- `/usage/global` (GET)
- `/usage/global/24h`
- `/usage/alerts`
- `/usage/tenants`
- `/usage/:tenantId/increment`
- `/tenants/:tenantId/usage/:metric/increment`
- `/tenants/:tenantId/usage/:metric/set`
- `/tenants/:tenantId/usage/reset`
- `/tenants/:tenantId/usage` (DELETE)

### 9. Dashboard (5 routes)
- `/dashboard/metrics`
- `/dashboard/revenue`
- `/dashboard/signups`
- `/dashboard/plan-distribution`
- `/dashboard/incidents`

### 10. Integrations (7 routes)
- `/integrations` (GET, POST)
- `/integrations/catalog`
- `/integrations/:id` (GET, PUT, DELETE)
- `/integrations/:id/test`
- `/integrations/:id/rotate-keys`

### 11. Webhooks (3 routes)
- `/webhooks` (GET)
- `/webhooks/:id/test`

### 12. Compliance (3 routes)
- `/compliance/requests`
- `/compliance/export/:tenantId`
- `/compliance/deletion`

### 13. Security (6 routes)
- `/security/admins` (GET, POST)
- `/security/admins/:id/mfa`
- `/security/permissions`
- `/security/policies` (GET, PUT)
- `/security/rls-status`

### 14. Settings (7 routes)
- `/settings` (GET, PUT)
- `/settings/regions` (GET, POST)
- `/settings/regions/:id` (PATCH)
- `/settings/api-keys` (GET, POST)
- `/settings/api-keys/:id` (DELETE)
- `/settings/email/test`

### 15. Developers (6 routes)
- `/developers/api-docs`
- `/developers/webhooks` (GET, POST)
- `/developers/webhooks/:id` (DELETE)
- `/developers/webhooks/:id/test`
- `/developers/api-logs`
- `/developers/rate-limits`
- `/developers/webhook-events`
- `/developers/diagnostics`

### 16. Rooms (9 routes)
- `/room-categories` (GET, POST)
- `/room-categories/:id` (PUT, DELETE)
- `/room-categories/migrate`
- `/rooms` (GET, POST)
- `/rooms/:id` (PUT, DELETE)

### 17. Notifications (8 routes)
- `/notification-templates` (GET, POST)
- `/notification-templates/:id` (PUT, DELETE)
- `/notification-templates/:id/test`
- `/notification-delivery-history` (GET)
- `/notification-delivery-history/:id/retry`
- `/notification-settings` (GET, PUT)
- `/notification-statistics`

### 18. System/Diagnostics (10 routes)
- `/verify-database`
- `/diagnose-user/:email`
- `/sync-to-postgres`
- `/init-plans`
- `/init-roles`
- `/check-tenants-direct`
- `/diagnostic/roles`
- `/diagnostic/user-role/:userId`
- `/verify-roles`
- `/verify-plans`
- `/seed` (POST, DELETE)
- `/diagnostic/test-user-query/:email`
- `/auth/profile`

### 19. Status (4 routes)
- `/status/services`
- `/status/incidents` (GET, POST)
- `/status/incidents/:id` (PATCH)
- `/status/uptime`

### 20. Audit Logs (2 routes)
- `/audit-logs`
- `/api-keys` (GET, POST)

## Migration Strategy

1. ✅ Create shared utilities (`lib/`)
2. ✅ Create route structure
3. ✅ Create health and admin routes
4. ⏳ Extract and create remaining route modules
5. ⏳ Update main index.tsx to use modular routes
6. ⏳ Test all endpoints
7. ⏳ Remove old monolithic code

## Benefits

- **Maintainability**: Each domain in its own file
- **Scalability**: Easy to add new routes
- **Testability**: Routes can be tested independently
- **Performance**: Better code splitting and tree-shaking
- **Developer Experience**: Easier to navigate and understand

## Next Steps

1. Continue extracting routes into modules
2. Ensure all imports are correct
3. Test each route module
4. Replace old index.tsx with new modular version

