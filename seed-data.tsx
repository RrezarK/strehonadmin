/**
 * Seed Data Script for Multi-Tenant HMS/PMS SaaS Admin Panel
 * 
 * This script initializes the KV store with sample data for testing and development.
 * Run this once to populate the system with demo tenants, plans, feature flags, etc.
 */

import * as kv from './kv_store.tsx';
import type {
  Tenant,
  Plan,
  FeatureFlag,
  PlatformSettings,
  PlanType,
} from './models.tsx';

/**
 * Seed Plans
 */
export async function seedPlans(): Promise<void> {
  console.log('Seeding plans...');
  
  const plans: Plan[] = [
    {
      id: 'plan:Trial',
      name: 'Trial',
      displayName: 'Free Trial',
      description: '14-day free trial with basic features',
      price: 0,
      interval: 'monthly',
      limits: {
        users: 3,
        properties: 1,
        rooms: 10,
        bookings: 50,
        apiCalls: 1000,
        storage: 1,
        customDomains: 0,
      },
      features: [
        'Basic property management',
        'Up to 10 rooms',
        'Email support',
        'Mobile app access',
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'plan:Basic',
      name: 'Basic',
      displayName: 'Basic Plan',
      description: 'Essential features for small properties',
      price: 9900, // $99.00
      interval: 'monthly',
      limits: {
        users: 10,
        properties: 3,
        rooms: 50,
        bookings: 500,
        apiCalls: 10000,
        storage: 10,
        customDomains: 1,
      },
      features: [
        'Multi-property management',
        'Up to 50 rooms per property',
        'Priority email support',
        'Mobile app access',
        'Basic analytics',
        '1 custom domain',
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'plan:Pro',
      name: 'Pro',
      displayName: 'Professional Plan',
      description: 'Advanced features for growing businesses',
      price: 29900, // $299.00
      interval: 'monthly',
      limits: {
        users: 50,
        properties: 10,
        rooms: 200,
        bookings: 5000,
        apiCalls: 100000,
        storage: 50,
        customDomains: 5,
      },
      features: [
        'Unlimited properties',
        'Up to 200 rooms per property',
        'Priority phone & email support',
        'Mobile app access',
        'Advanced analytics & reporting',
        'API access',
        'Custom integrations',
        '5 custom domains',
        'White-label branding',
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'plan:Enterprise',
      name: 'Enterprise',
      displayName: 'Enterprise Plan',
      description: 'Full-featured solution for large organizations',
      price: 99900, // $999.00
      interval: 'monthly',
      limits: {
        users: 999,
        properties: 999,
        rooms: 9999,
        bookings: 999999,
        apiCalls: 999999,
        storage: 500,
        customDomains: 99,
      },
      features: [
        'Unlimited properties & rooms',
        'Unlimited users',
        'Dedicated account manager',
        '24/7 priority support',
        'Mobile app access',
        'Advanced analytics & reporting',
        'Full API access',
        'Custom integrations',
        'Unlimited custom domains',
        'White-label branding',
        'SSO & advanced security',
        'SLA guarantee',
        'Custom training',
      ],
      createdAt: new Date().toISOString(),
    },
  ];
  
  for (const plan of plans) {
    await kv.set(plan.id, plan);
  }
  
  console.log(`✅ Seeded ${plans.length} plans`);
}

/**
 * Seed Sample Tenants
 */
export async function seedTenants(): Promise<void> {
  console.log('Seeding sample tenants...');
  
  const tenants: Tenant[] = [
    {
      id: 'tn_1634567890_sample001',
      name: 'Grand Plaza Hotel',
      billingEntity: 'Grand Plaza Hospitality Inc.',
      subdomain: 'grand-plaza',
      region: 'us-east-1',
      plan: 'Enterprise',
      status: 'active',
      owner: 'owner@grandplaza.com',
      ownerName: 'Sarah Johnson',
      usagePercent: 67,
      mrr: 999,
      created: '2024-01-15',
      createdAt: '2024-01-15T08:00:00.000Z',
    },
    {
      id: 'tn_1634567891_sample002',
      name: 'Sunset Beach Resort',
      billingEntity: 'Sunset Beach Resort LLC',
      subdomain: 'sunset-beach',
      region: 'us-west-2',
      plan: 'Pro',
      status: 'active',
      owner: 'admin@sunsetbeach.com',
      ownerName: 'Michael Chen',
      usagePercent: 45,
      mrr: 299,
      created: '2024-03-20',
      createdAt: '2024-03-20T10:30:00.000Z',
    },
    {
      id: 'tn_1634567892_sample003',
      name: 'Downtown Boutique Inn',
      billingEntity: 'Downtown Boutique Hospitality',
      subdomain: 'downtown-boutique',
      region: 'eu-west-1',
      plan: 'Basic',
      status: 'active',
      owner: 'contact@downtowninn.com',
      ownerName: 'Emma Rodriguez',
      usagePercent: 23,
      mrr: 99,
      created: '2024-06-10',
      createdAt: '2024-06-10T14:15:00.000Z',
    },
    {
      id: 'tn_1634567893_sample004',
      name: 'Mountain View Lodge',
      subdomain: 'mountain-view',
      region: 'us-west-2',
      plan: 'Trial',
      status: 'trial',
      owner: 'info@mountainview.com',
      ownerName: 'David Park',
      usagePercent: 12,
      mrr: 0,
      created: '2024-10-05',
      createdAt: '2024-10-05T09:00:00.000Z',
      trialEndsAt: '2024-10-19T09:00:00.000Z',
    },
    {
      id: 'tn_1634567894_sample005',
      name: 'Harbor View Hotel',
      billingEntity: 'Harbor View Enterprises',
      subdomain: 'harbor-view',
      region: 'ap-southeast-1',
      plan: 'Pro',
      status: 'suspended',
      owner: 'billing@harborview.com',
      ownerName: 'Lisa Wang',
      usagePercent: 89,
      mrr: 299,
      created: '2023-11-08',
      createdAt: '2023-11-08T11:20:00.000Z',
      suspendedAt: '2024-09-01T00:00:00.000Z',
      suspensionReason: 'Payment overdue',
    },
  ];
  
  for (const tenant of tenants) {
    await kv.set(`tenant:${tenant.id}`, tenant);
  }
  
  console.log(`✅ Seeded ${tenants.length} sample tenants`);
}

/**
 * Seed Feature Flags
 */
export async function seedFeatureFlags(): Promise<void> {
  console.log('Seeding feature flags...');
  
  const flags: FeatureFlag[] = [
    {
      id: 'ff_1634567890_analytics',
      key: 'advanced_analytics',
      name: 'Advanced Analytics',
      description: 'Access to advanced analytics and reporting dashboards',
      scope: 'plan',
      status: 'enabled',
      enabledForPlans: ['Pro', 'Enterprise'],
      rolloutPercentage: 100,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: 'ff_1634567891_whitelabel',
      key: 'white_label_branding',
      name: 'White Label Branding',
      description: 'Custom branding and white-labeling features',
      scope: 'plan',
      status: 'enabled',
      enabledForPlans: ['Pro', 'Enterprise'],
      rolloutPercentage: 100,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: 'ff_1634567892_api',
      key: 'api_access',
      name: 'API Access',
      description: 'Full REST API access for custom integrations',
      scope: 'plan',
      status: 'enabled',
      enabledForPlans: ['Pro', 'Enterprise'],
      rolloutPercentage: 100,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: 'ff_1634567893_sso',
      key: 'sso_authentication',
      name: 'SSO Authentication',
      description: 'Single Sign-On with SAML and OAuth providers',
      scope: 'plan',
      status: 'enabled',
      enabledForPlans: ['Enterprise'],
      rolloutPercentage: 100,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: 'ff_1634567894_aiassistant',
      key: 'ai_assistant',
      name: 'AI Assistant',
      description: 'AI-powered booking assistant and recommendations',
      scope: 'global',
      status: 'beta',
      rolloutPercentage: 25,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: 'ff_1634567895_mobile',
      key: 'mobile_app_v2',
      name: 'Mobile App V2',
      description: 'Next-generation mobile application',
      scope: 'global',
      status: 'beta',
      rolloutPercentage: 50,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];
  
  for (const flag of flags) {
    await kv.set(`flag:${flag.id}`, flag);
  }
  
  console.log(`✅ Seeded ${flags.length} feature flags`);
}

/**
 * Seed Platform Settings
 */
export async function seedPlatformSettings(): Promise<void> {
  console.log('Seeding platform settings...');
  
  const settings: PlatformSettings = {
    id: 'platform:settings',
    platformName: 'HMS/PMS Admin Portal',
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
    metadata: {
      version: '1.0.0',
      environment: 'development',
    },
    updatedAt: new Date().toISOString(),
  };
  
  await kv.set('platform:settings', settings);
  
  console.log('✅ Seeded platform settings');
}

/**
 * Seed Sample Usage Data
 */
export async function seedUsageData(): Promise<void> {
  console.log('Seeding usage data...');
  
  const tenantIds = [
    'tn_1634567890_sample001',
    'tn_1634567891_sample002',
    'tn_1634567892_sample003',
    'tn_1634567893_sample004',
    'tn_1634567894_sample005',
  ];
  
  const currentPeriod = getCurrentPeriod();
  const metrics: Array<{ metric: string; limit: number; usage: number }> = [
    { metric: 'api_calls', limit: 100000, usage: 67000 },
    { metric: 'storage', limit: 50, usage: 23 },
    { metric: 'users', limit: 50, usage: 12 },
    { metric: 'properties', limit: 10, usage: 3 },
    { metric: 'rooms', limit: 200, usage: 89 },
    { metric: 'bookings', limit: 5000, usage: 2341 },
  ];
  
  for (const tenantId of tenantIds) {
    for (const { metric, limit, usage } of metrics) {
      const actualUsage = Math.floor(usage * (0.5 + Math.random() * 0.5));
      const id = `usage:${tenantId}:${metric}:${currentPeriod}`;
      
      await kv.set(id, {
        id,
        tenantId,
        metric,
        period: currentPeriod,
        current: actualUsage,
        limit,
        percentage: Math.min(100, Math.round((actualUsage / limit) * 100)),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  
  console.log(`✅ Seeded usage data for ${tenantIds.length} tenants`);
}

/**
 * Seed Sample Audit Logs
 */
export async function seedAuditLogs(): Promise<void> {
  console.log('Seeding audit logs...');
  
  const logs = [
    {
      action: 'tenant.created' as const,
      tenantId: 'tn_1634567890_sample001',
      resource: 'tenant',
      resourceId: 'tn_1634567890_sample001',
      userId: 'admin_system',
      userEmail: 'system@example.com',
      timestamp: '2024-01-15T08:00:00.000Z',
      data: { name: 'Grand Plaza Hotel', plan: 'Enterprise' },
    },
    {
      action: 'tenant.updated' as const,
      tenantId: 'tn_1634567894_sample005',
      resource: 'tenant',
      resourceId: 'tn_1634567894_sample005',
      userId: 'admin_123',
      userEmail: 'admin@example.com',
      timestamp: '2024-09-01T00:00:00.000Z',
      changes: {
        before: { status: 'active' },
        after: { status: 'suspended' },
      },
    },
    {
      action: 'feature_flag.created' as const,
      resource: 'feature_flag',
      resourceId: 'ff_1634567894_aiassistant',
      userId: 'admin_123',
      userEmail: 'admin@example.com',
      timestamp: new Date().toISOString(),
      data: { key: 'ai_assistant', status: 'beta' },
    },
  ];
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const id = `audit:${log.timestamp}:${i.toString().padStart(3, '0')}`;
    await kv.set(id, { ...log, id });
  }
  
  console.log(`✅ Seeded ${logs.length} audit logs`);
}

/**
 * Helper: Get current period (YYYY-MM)
 */
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Run all seed functions
 */
export async function seedAll(): Promise<void> {
  console.log('🌱 Starting database seed...\n');
  
  try {
    await seedPlans();
    await seedTenants();
    await seedFeatureFlags();
    await seedPlatformSettings();
    await seedUsageData();
    await seedAuditLogs();
    
    console.log('\n✅ Database seeding completed successfully!');
    console.log('\nSeeded data:');
    console.log('  - 4 subscription plans');
    console.log('  - 5 sample tenants');
    console.log('  - 6 feature flags');
    console.log('  - 1 platform settings');
    console.log('  - Usage data for all tenants');
    console.log('  - 3 audit logs');
    console.log('\nYou can now deploy the edge function and test the admin panel!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

/**
 * Clear all data (use with caution!)
 */
export async function clearAll(): Promise<void> {
  console.log('⚠️  Clearing all data from KV store...\n');
  
  const prefixes = [
    'tenant:',
    'plan:',
    'subscription:',
    'usage:',
    'flag:',
    'audit:',
    'integration:',
    'webhook:',
    'apikey:',
    'compliance:',
    'notification:',
    'platform:',
    'admin:',
  ];
  
  for (const prefix of prefixes) {
    const items = await kv.getByPrefix(prefix);
    if (items.length > 0) {
      const keys = items.map((item: any) => item.id || `${prefix}${item.key || item.name}`);
      await kv.mdel(keys);
      console.log(`  Deleted ${keys.length} items with prefix "${prefix}"`);
    }
  }
  
  console.log('\n✅ All data cleared');
}
