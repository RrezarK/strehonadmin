/**
 * Data Models for Multi-Tenant HMS/PMS SaaS Admin Panel
 * 
 * This file defines all TypeScript interfaces and types for the KV store data model.
 * All entities are designed with tenant isolation in mind.
 */

// ============================================================================
// TENANT MODELS
// ============================================================================

export type TenantStatus = 'active' | 'trial' | 'suspended' | 'cancelled' | 'pending';
export type PlanType = 'Trial' | 'Basic' | 'Pro' | 'Enterprise';
export type Region = 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'ap-southeast-1' | 'ap-northeast-1';

export interface Tenant {
  id: string; // Format: T-{number} (e.g., T-123, T-456)
  uuid?: string; // Postgres UUID (if synced to database)
  name: string; // Legal business name
  billingEntity?: string; // Billing entity name (defaults to name)
  subdomain: string; // Unique subdomain for tenant
  region?: Region | null; // AWS region for data residency (optional)
  plan: PlanType; // Current subscription plan
  status: TenantStatus; // Current tenant status
  
  // Owner Information
  owner: string; // Owner email
  ownerName: string; // Owner display name
  ownerUserId?: string; // Supabase Auth user ID
  
  // Custom Domain (no branding fields)
  customDomain?: string; // Custom domain (if whitelabel)
  
  // Metrics
  usagePercent: number; // Current usage percentage (0-100)
  mrr: number; // Monthly recurring revenue
  
  // Timestamps
  created: string; // Creation date (YYYY-MM-DD format for display)
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  suspendedAt?: string; // ISO timestamp
  unsuspendedAt?: string; // ISO timestamp
  cancelledAt?: string; // ISO timestamp
  trialEndsAt?: string; // ISO timestamp
  
  // Suspension details
  suspensionReason?: string;
  
  // Temporary credentials (cleared after first use)
  tempPassword?: string | null;
  userCreationError?: string | null;
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Additional properties that may exist in database
  email?: string;
  settings?: Record<string, any>;
}

// ============================================================================
// SUBSCRIPTION & BILLING MODELS
// ============================================================================

export type BillingInterval = 'monthly' | 'yearly';
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface Plan {
  id: string; // Format: plan_<name>
  name: PlanType;
  displayName: string;
  description: string;
  price: number; // Price in cents
  interval: BillingInterval;
  
  // Limits
  limits: {
    users: number;
    properties: number;
    rooms: number;
    bookings: number; // Per month
    apiCalls: number; // Per month
    storage: number; // In GB
    customDomains: number;
  };
  
  // Features
  features: string[];
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface Subscription {
  id: string; // Format: sub_<timestamp>_<random>
  tenantId: string; // Foreign key to tenant
  planId: string; // Foreign key to plan
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  
  // Billing
  currentPeriodStart: string; // ISO timestamp
  currentPeriodEnd: string; // ISO timestamp
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string; // ISO timestamp
  
  // Payment
  paymentMethod?: 'card' | 'invoice' | 'wire';
  lastPaymentStatus?: PaymentStatus;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string; // Format: inv_<timestamp>_<random>
  tenantId: string;
  subscriptionId: string;
  
  // Amounts (in cents)
  amount: number;
  tax: number;
  total: number;
  
  // Status
  status: PaymentStatus;
  dueDate: string; // ISO timestamp
  paidAt?: string; // ISO timestamp
  
  // Line items
  lineItems: {
    description: string;
    quantity: number;
    amount: number;
  }[];
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
}

// ============================================================================
// USAGE & QUOTA MODELS
// ============================================================================

export type MetricType = 'users' | 'properties' | 'rooms' | 'bookings' | 'api_calls' | 'storage';

export interface UsageRecord {
  id: string; // Format: usage:<tenantId>:<metric>:<period>
  tenantId: string;
  metric: MetricType;
  period: string; // Format: YYYY-MM (monthly period)
  
  // Values
  current: number; // Current usage
  limit: number; // Plan limit
  percentage: number; // Percentage used (0-100)
  
  // History (daily breakdown)
  daily?: Record<string, number>; // { "YYYY-MM-DD": value }
  
  // Metadata
  metadata?: Record<string, any>;
  updatedAt: string;
}

export interface UsageAlert {
  id: string; // Format: alert_<timestamp>_<random>
  tenantId: string;
  metric: MetricType;
  threshold: number; // Percentage threshold (e.g., 80)
  triggered: boolean;
  triggeredAt?: string; // ISO timestamp
  resolvedAt?: string; // ISO timestamp
  notified: boolean;
  createdAt: string;
}

// ============================================================================
// FEATURE FLAG MODELS
// ============================================================================

export type FeatureFlagStatus = 'enabled' | 'disabled' | 'beta';
export type FeatureFlagScope = 'global' | 'plan' | 'tenant';

export interface FeatureFlag {
  id: string; // Format: ff_<timestamp>
  key: string; // Unique key (e.g., 'advanced_analytics')
  name: string; // Display name
  description: string;
  
  // Scope and targeting
  scope: FeatureFlagScope;
  status: FeatureFlagStatus;
  
  // Targeting rules
  enabledForPlans?: PlanType[]; // Plans that have access
  enabledForTenants?: string[]; // Specific tenant IDs
  disabledForTenants?: string[]; // Explicitly disabled for these tenants
  
  // Rollout percentage (0-100)
  rolloutPercentage?: number;
  
  // Metadata
  metadata?: Record<string, any>;
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
  createdBy?: string; // Admin user ID
}

// ============================================================================
// AUDIT LOG MODELS
// ============================================================================

export type AuditAction = 
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.suspended'
  | 'tenant.unsuspended'
  | 'tenant.deleted'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.cancelled'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'feature_flag.created'
  | 'feature_flag.updated'
  | 'integration.connected'
  | 'integration.disconnected'
  | 'compliance.export'
  | 'compliance.deletion'
  | 'settings.updated';

export interface AuditLog {
  id: string; // Format: audit:<timestamp>:<random>
  action: AuditAction;
  tenantId?: string; // Tenant affected (if applicable)
  userId?: string; // Admin user who performed action
  userEmail?: string; // Admin user email
  
  // Details
  resource: string; // Resource type (e.g., 'tenant', 'subscription')
  resourceId: string; // ID of the affected resource
  
  // Changes
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  
  // Metadata
  data?: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp: string; // ISO timestamp
}

// ============================================================================
// INTEGRATION MODELS
// ============================================================================

export type IntegrationType = 
  | 'payment_gateway'
  | 'accounting'
  | 'crm'
  | 'analytics'
  | 'email'
  | 'sms'
  | 'channel_manager'
  | 'property_management';

export interface Integration {
  id: string; // Format: integration:<tenantId>:<provider>
  tenantId: string;
  provider: string; // e.g., 'stripe', 'quickbooks', 'salesforce'
  type: IntegrationType;
  
  // Status
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  enabled: boolean;
  
  // Configuration
  config: Record<string, any>; // Provider-specific config
  credentials?: Record<string, string>; // Encrypted credentials
  
  // Sync details
  lastSyncAt?: string; // ISO timestamp
  lastSyncStatus?: 'success' | 'failed';
  lastSyncError?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  connectedAt: string; // ISO timestamp
  updatedAt?: string;
}

// ============================================================================
// WEBHOOK MODELS
// ============================================================================

export type WebhookEvent = 
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.suspended'
  | 'subscription.created'
  | 'subscription.updated'
  | 'invoice.created'
  | 'invoice.paid'
  | 'usage.alert';

export interface Webhook {
  id: string; // Format: webhook_<timestamp>_<random>
  tenantId?: string; // Optional: if webhook is tenant-specific
  url: string; // Webhook endpoint URL
  
  // Events
  events: WebhookEvent[];
  
  // Security
  secret: string; // Secret for signature verification
  
  // Status
  enabled: boolean;
  status: 'active' | 'failed' | 'disabled';
  
  // Delivery tracking
  lastDeliveryAt?: string; // ISO timestamp
  lastDeliveryStatus?: 'success' | 'failed';
  failureCount: number;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface WebhookDelivery {
  id: string; // Format: delivery_<timestamp>_<random>
  webhookId: string;
  event: WebhookEvent;
  
  // Payload
  payload: Record<string, any>;
  
  // Delivery details
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  responseBody?: string;
  error?: string;
  
  // Retry tracking
  attemptCount: number;
  nextRetryAt?: string; // ISO timestamp
  
  // Timestamps
  createdAt: string; // ISO timestamp
  deliveredAt?: string; // ISO timestamp
}

// ============================================================================
// API KEY MODELS
// ============================================================================

export interface ApiKey {
  id: string; // Format: key_<timestamp>
  key: string; // The actual API key (e.g., pk_live_...)
  tenantId?: string; // Optional: for tenant-specific keys
  
  // Details
  name: string; // Human-readable name
  description?: string;
  
  // Permissions
  scopes: string[]; // e.g., ['read:tenants', 'write:subscriptions']
  
  // Status
  enabled: boolean;
  
  // Usage tracking
  lastUsedAt?: string; // ISO timestamp
  usageCount: number;
  
  // Expiration
  expiresAt?: string; // ISO timestamp
  
  // Metadata
  metadata?: Record<string, any>;
  created: string; // ISO timestamp
  createdBy?: string; // Admin user ID
}

// ============================================================================
// COMPLIANCE MODELS
// ============================================================================

export type ComplianceRequestType = 'export' | 'deletion';
export type ComplianceStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ExportFormat = 'json' | 'csv' | 'pdf';

export interface ComplianceRequest {
  id: string; // Format: req_<timestamp>
  tenantId: string;
  type: ComplianceRequestType;
  
  // Request details
  format?: ExportFormat; // For export requests
  dataTypes?: string[]; // Types of data to export/delete
  
  // Status
  status: ComplianceStatus;
  progress?: number; // 0-100
  
  // Results
  downloadUrl?: string; // For export requests
  expiresAt?: string; // Download link expiration
  error?: string;
  
  // Metadata
  requestedBy: string; // User ID
  requestedByEmail: string;
  metadata?: Record<string, any>;
  created: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
}

export interface DataRetentionPolicy {
  id: string; // Format: policy_<type>
  type: string; // e.g., 'audit_logs', 'invoices', 'usage_records'
  retentionDays: number;
  enabled: boolean;
  
  // Execution
  lastRunAt?: string; // ISO timestamp
  nextRunAt?: string; // ISO timestamp
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// NOTIFICATION MODELS
// ============================================================================

export type NotificationType = 'info' | 'warning' | 'error' | 'success';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string; // Format: notif_<timestamp>_<random>
  tenantId?: string; // Optional: for tenant-specific notifications
  
  // Content
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  
  // Targeting
  targetUsers?: string[]; // Specific user IDs
  targetRoles?: string[]; // Specific roles
  
  // Status
  read: boolean;
  readAt?: string; // ISO timestamp
  readBy?: string[]; // User IDs who have read
  
  // Actions
  actionLabel?: string;
  actionUrl?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  expiresAt?: string; // ISO timestamp
}

// ============================================================================
// PLATFORM SETTINGS MODELS
// ============================================================================

export interface PlatformSettings {
  id: 'platform:settings'; // Fixed ID for singleton
  
  // General
  platformName: string;
  platformUrl: string;
  supportEmail: string;
  
  // Features
  enableSignups: boolean;
  enableTrials: boolean;
  trialDurationDays: number;
  
  // Limits
  maxTenantsPerPlan: Record<PlanType, number>;
  
  // Security
  enforceSSO: boolean;
  require2FA: boolean;
  sessionTimeoutMinutes: number;
  
  // Compliance
  gdprEnabled: boolean;
  ccpaEnabled: boolean;
  dataRetentionDays: number;
  
  // Notifications
  emailNotifications: boolean;
  slackWebhookUrl?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  updatedAt: string;
  updatedBy?: string; // Admin user ID
}

// ============================================================================
// ADMIN USER MODELS
// ============================================================================

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'read_only';

export interface AdminUser {
  id: string; // Format: admin_<user_id>
  userId: string; // Supabase Auth user ID
  email: string;
  name: string;
  role: AdminRole;
  
  // Permissions
  permissions: string[]; // Granular permissions
  
  // Status
  enabled: boolean;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

// ============================================================================
// GUEST CRM MODELS
// ============================================================================

export type GuestVIPStatus = 'None' | 'Regular' | 'VIP' | 'VVIP';
export type GuestSegment = 'Regular' | 'Business' | 'Leisure' | 'Group';

export interface Guest {
  id: string; // Format: guest_<timestamp>_<random>
  tenantId: string; // Tenant that owns this guest
  
  // Personal Information
  firstName: string;
  lastName: string;
  fullName: string; // Computed: firstName + lastName
  email: string;
  phone?: string;
  address?: string;
  
  // Guest Segmentation
  segment: GuestSegment;
  vipStatus: GuestVIPStatus;
  
  // Guest Metrics
  totalBookings: number; // Total number of reservations
  totalSpent: number; // Total amount spent (in cents)
  lifetimeValue: number; // Lifetime value (in cents)
  averageRating?: number; // Average rating (1-5)
  
  // Preferences
  preferences?: {
    roomType?: string;
    bedType?: string;
    smokingPreference?: 'smoking' | 'non-smoking';
    floor?: string;
    specialRequests?: string[];
  };
  
  // Communication preferences
  communicationPreferences?: {
    email: boolean;
    sms: boolean;
    phone: boolean;
    marketing: boolean;
  };
  
  // Additional notes
  notes?: string;
  tags?: string[];
  
  // Loyalty
  loyaltyPoints?: number;
  loyaltyTier?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  lastStayAt?: string; // ISO timestamp of last stay
}

// ============================================================================
// RESERVATION MODELS (HMS/PMS)
// ============================================================================

export type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type ReservationSource = 'direct' | 'phone' | 'email' | 'ota' | 'walk_in' | 'agent';

export interface Reservation {
  id: string; // Format: RES-123 (sequential per tenant)
  tenantId: string; // Tenant that owns this reservation
  
  // Guest Information
  guestId?: string; // Link to Guest if exists
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  
  // Reservation Details
  confirmationNumber: string; // Unique confirmation code
  status: ReservationStatus;
  source: ReservationSource;
  
  // Dates
  checkInDate: string; // ISO date
  checkOutDate: string; // ISO date
  numberOfNights: number;
  
  // Room Details
  roomCategoryId?: string; // Link to room category
  roomCategory: string; // e.g., "Deluxe Suite"
  roomNumber?: string; // Assigned when available
  numberOfRooms: number;
  
  // Guest Count
  numberOfAdults: number;
  numberOfChildren: number;
  
  // Pricing
  ratePerNight: number; // In cents
  totalAmount: number; // In cents
  currency: string; // e.g., "USD"
  
  // Payment
  depositPaid: number; // In cents
  balanceDue: number; // In cents
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  
  // Special Requests
  specialRequests?: string;
  notes?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  createdBy?: string; // User ID
  modifiedBy?: string; // User ID
  cancelledAt?: string; // ISO timestamp
  cancellationReason?: string;
}

// ============================================================================
// LOYALTY PROGRAM MODELS
// ============================================================================

export type LoyaltyTierLevel = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export type LoyaltyTransactionType = 'earn' | 'redeem' | 'expire' | 'adjust' | 'bonus';

export interface LoyaltyProgram {
  id: string; // Format: loyalty_<timestamp>_<random>
  tenantId: string; // Tenant that owns this program
  
  // Program Details
  name: string; // e.g., "Rewards Plus"
  description?: string;
  enabled: boolean;
  
  // Tier Configuration
  tiers: {
    name: LoyaltyTierLevel;
    requiredPoints: number;
    benefits: string[];
    multiplier: number; // Points earning multiplier
  }[];
  
  // Earning Rules
  pointsPerDollar: number; // e.g., 10 points per $1 spent
  bonusPointsFirstStay: number;
  bonusPointsBirthday: number;
  
  // Redemption Rules
  pointsValue: number; // Value of 1 point in cents
  minimumRedemption: number; // Minimum points to redeem
  
  // Expiration
  pointsExpirationDays?: number; // Points expire after X days
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
}

export interface LoyaltyMember {
  id: string; // Format: member_<timestamp>_<random>
  tenantId: string;
  programId: string; // Link to LoyaltyProgram
  guestId: string; // Link to Guest
  
  // Membership Details
  membershipNumber: string; // Unique membership number
  currentTier: LoyaltyTierLevel;
  totalPoints: number;
  availablePoints: number; // Total minus redeemed/expired
  lifetimePoints: number;
  
  // Status
  status: 'active' | 'inactive' | 'suspended';
  enrolledAt: string; // ISO timestamp
  
  // Tier Progress
  pointsToNextTier?: number;
  nextTier?: LoyaltyTierLevel;
  tierAchievedAt?: string; // ISO timestamp
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
}

export interface LoyaltyTransaction {
  id: string; // Format: ltx_<timestamp>_<random>
  tenantId: string;
  programId: string;
  memberId: string;
  guestId: string;
  
  // Transaction Details
  type: LoyaltyTransactionType;
  points: number;
  description: string;
  
  // Reference
  referenceType?: string; // e.g., "reservation", "purchase"
  referenceId?: string; // ID of related entity
  
  // Balance
  balanceBefore: number;
  balanceAfter: number;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  expiresAt?: string; // ISO timestamp for earned points
}

// ============================================================================
// MARKETING CAMPAIGN MODELS
// ============================================================================

export type CampaignType = 'email' | 'sms' | 'push' | 'in_app';
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
export type CampaignTargetAudience = 'all_guests' | 'segment' | 'vip' | 'loyalty_tier' | 'custom';

export interface MarketingCampaign {
  id: string; // Format: campaign_<timestamp>_<random>
  tenantId: string;
  
  // Campaign Details
  name: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  
  // Content
  subject?: string; // For email/push
  message: string;
  templateId?: string; // Reference to email template
  
  // Targeting
  targetAudience: CampaignTargetAudience;
  targetSegments?: GuestSegment[]; // When targetAudience = 'segment'
  targetVIPStatuses?: GuestVIPStatus[]; // When targetAudience = 'vip'
  targetLoyaltyTiers?: LoyaltyTierLevel[]; // When targetAudience = 'loyalty_tier'
  customFilters?: Record<string, any>; // When targetAudience = 'custom'
  
  // Scheduling
  scheduledAt?: string; // ISO timestamp - when to send
  sendImmediately: boolean;
  
  // Delivery Window
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  
  // Performance Metrics
  targetCount?: number; // Estimated recipients
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  convertedCount: number;
  unsubscribedCount: number;
  bouncedCount: number;
  
  // Rates (calculated)
  openRate?: number; // Percentage
  clickRate?: number; // Percentage
  conversionRate?: number; // Percentage
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  createdBy?: string; // User ID
  launchedAt?: string; // ISO timestamp - when campaign went live
  completedAt?: string; // ISO timestamp
}

export interface CampaignRecipient {
  id: string; // Format: recipient_<timestamp>_<random>
  tenantId: string;
  campaignId: string;
  guestId: string;
  
  // Recipient Details
  email?: string;
  phone?: string;
  
  // Delivery Status
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'converted' | 'bounced' | 'unsubscribed' | 'failed';
  
  // Engagement
  sentAt?: string; // ISO timestamp
  deliveredAt?: string; // ISO timestamp
  openedAt?: string; // ISO timestamp
  clickedAt?: string; // ISO timestamp
  convertedAt?: string; // ISO timestamp
  
  // Error Handling
  error?: string;
  bounceReason?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
}

// ============================================================================
// GUEST PREFERENCES MODELS (Extended)
// ============================================================================

export interface GuestPreference {
  id: string; // Format: pref_<timestamp>_<random>
  tenantId: string;
  guestId: string;
  
  // Room Preferences
  roomType?: string; // e.g., "Suite", "Standard"
  bedType?: 'king' | 'queen' | 'twin' | 'double';
  smokingPreference?: 'smoking' | 'non-smoking';
  floorPreference?: 'low' | 'mid' | 'high' | 'specific';
  specificFloor?: number;
  viewPreference?: string; // e.g., "Ocean View", "City View"
  
  // Amenity Preferences
  pillowType?: string;
  roomTemperature?: number; // In Celsius
  newspaper?: string; // e.g., "Wall Street Journal"
  
  // Food & Beverage
  dietaryRestrictions?: string[]; // e.g., ["vegetarian", "gluten-free"]
  allergies?: string[];
  favoriteFood?: string[];
  favoriteDrinks?: string[];
  
  // Service Preferences
  housekeepingTime?: 'morning' | 'afternoon' | 'evening' | 'skip';
  wakeUpCall?: boolean;
  wakeUpTime?: string; // HH:MM format
  
  // Special Occasions
  occasionType?: 'birthday' | 'anniversary' | 'honeymoon' | 'business';
  occasionDate?: string; // ISO date
  specialRequests?: string[];
  
  // Accessibility
  accessibilityNeeds?: string[]; // e.g., ["wheelchair", "hearing_impaired"]
  
  // Language
  preferredLanguage?: string; // ISO language code
  
  // Metadata
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
}

// ============================================================================
// COMMUNICATION LOG MODELS
// ============================================================================

export type CommunicationType = 'email' | 'sms' | 'phone' | 'in_person' | 'chat' | 'other';
export type CommunicationDirection = 'inbound' | 'outbound';

export interface CommunicationLog {
  id: string; // Format: comm_<timestamp>_<random>
  tenantId: string;
  guestId: string;
  
  // Communication Details
  type: CommunicationType;
  direction: CommunicationDirection;
  subject?: string;
  message: string;
  
  // Participants
  fromUser?: string; // User ID or system
  fromEmail?: string;
  fromPhone?: string;
  toEmail?: string;
  toPhone?: string;
  
  // Status
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';
  
  // Related Records
  relatedType?: string; // e.g., "reservation", "campaign"
  relatedId?: string;
  campaignId?: string; // If part of campaign
  
  // Engagement
  sentAt?: string; // ISO timestamp
  deliveredAt?: string; // ISO timestamp
  readAt?: string; // ISO timestamp
  
  // Error Handling
  error?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string; // ISO timestamp
}

// ============================================================================
// KEY NAMING CONVENTIONS
// ============================================================================

/**
 * KV Store Key Naming Conventions for Tenant Isolation
 * 
 * All keys follow a hierarchical pattern: <entity>:<scope>:<id>:<detail>
 * 
 * TENANTS:
 * - tenant:<tenantId> - Tenant details
 * 
 * SUBSCRIPTIONS & BILLING:
 * - plan:<planId> - Plan details
 * - subscription:<tenantId> - Subscription for tenant
 * - invoice:<tenantId>:<invoiceId> - Invoice for tenant
 * 
 * USAGE & QUOTAS:
 * - usage:<tenantId>:<metric>:<period> - Usage for tenant, metric, and period
 * - alert:<tenantId>:<alertId> - Usage alert for tenant
 * 
 * FEATURE FLAGS:
 * - flag:<flagId> - Global feature flag
 * - flag:<tenantId>:<flagId> - Tenant-specific override
 * 
 * AUDIT LOGS:
 * - audit:<timestamp>:<random> - Global audit log (includes tenantId in data)
 * - audit:<tenantId>:<timestamp>:<random> - Tenant-scoped audit log
 * 
 * INTEGRATIONS:
 * - integration:<tenantId>:<provider> - Integration for tenant
 * 
 * WEBHOOKS:
 * - webhook:<webhookId> - Global webhook (includes tenantId in data if applicable)
 * - delivery:<webhookId>:<timestamp> - Webhook delivery record
 * 
 * API KEYS:
 * - apikey:<keyId> - API key (includes tenantId in data if applicable)
 * 
 * COMPLIANCE:
 * - compliance:<tenantId>:<requestId> - Compliance request for tenant
 * - policy:<policyId> - Data retention policy
 * 
 * NOTIFICATIONS:
 * - notification:<tenantId>:<notificationId> - Notification for tenant
 * - notification:global:<notificationId> - Global notification
 * 
 * PLATFORM SETTINGS:
 * - platform:settings - Global platform settings (singleton)
 * 
 * ADMIN USERS:
 * - admin:<userId> - Admin user details
 * 
 * GUEST CRM:
 * - guest:<tenantId>:<guestId> - Guest profile for tenant
 * - pref:<tenantId>:<guestId> - Guest preferences for tenant
 * - comm:<tenantId>:<guestId>:<commId> - Communication log for guest
 * 
 * RESERVATIONS (HMS/PMS):
 * - reservation:<tenantId>:<reservationId> - Reservation for tenant
 * 
 * LOYALTY PROGRAMS:
 * - loyalty_program:<tenantId>:<programId> - Loyalty program for tenant
 * - loyalty_member:<tenantId>:<memberId> - Loyalty member for tenant
 * - loyalty_tx:<tenantId>:<transactionId> - Loyalty transaction for tenant
 * 
 * MARKETING CAMPAIGNS:
 * - campaign:<tenantId>:<campaignId> - Marketing campaign for tenant
 * - campaign_recipient:<tenantId>:<campaignId>:<recipientId> - Campaign recipient
 */

// ============================================================================
// QUERY HELPERS
// ============================================================================

export interface PaginationParams {
  page?: number; // 1-indexed
  limit?: number; // Items per page
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FilterParams {
  status?: string;
  plan?: PlanType;
  region?: Region;
  search?: string; // Free-text search
  dateFrom?: string; // ISO timestamp
  dateTo?: string; // ISO timestamp
}

export interface SortParams {
  field: string;
  order: 'asc' | 'desc';
}
