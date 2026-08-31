/**
 * PriceGuard AI — Phase 2 MVP database schema (Drizzle ORM).
 *
 * This is the source of truth for docs/architecture/ERD.md and
 * docs/architecture/GDPR_DATA_MAP.md — keep those in sync with any change here
 * (see CONTRIBUTING.md). Originally authored as a Prisma schema; ported to Drizzle
 * per ADR-0005 (docs/adr/0005-drizzle-not-prisma.md) without changing the data model.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const dataResidencyEnum = pgEnum('data_residency', ['EU', 'OTHER']);
export const tenantRoleEnum = pgEnum('tenant_role', ['ADMIN', 'ANALYST', 'VIEWER']);
export const policyActionEnum = pgEnum('policy_action', [
  'NONE',
  'MONITOR',
  'WARN',
  'REQUEST_VERIFICATION',
  'RESTRICT',
  'MANUAL_REVIEW',
  'SUSPEND',
  'TERMINATE',
]);
export const confidenceEnum = pgEnum('confidence', ['LOW', 'MEDIUM', 'HIGH']);
export const investigationStatusEnum = pgEnum('investigation_status', [
  'PENDING',
  'IN_REVIEW',
  'RESOLVED',
]);
export const appealStatusEnum = pgEnum('appeal_status', ['OPEN', 'UPHELD', 'OVERTURNED']);
export const actorTypeEnum = pgEnum('actor_type', ['USER', 'SYSTEM', 'API_KEY']);
export const riskEventTypeEnum = pgEnum('risk_event_type', [
  'LOGIN',
  'SESSION_START',
  'PAYMENT',
  'SUBSCRIPTION_REGION_CHANGE',
]);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  dataResidency: dataResidencyEnum('data_residency').notNull().default('EU'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantUsers = pgTable(
  'tenant_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: tenantRoleEnum('role').notNull().default('ANALYST'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('tenant_users_tenant_email_unique').on(t.tenantId, t.email), index('tenant_users_tenant_idx').on(t.tenantId)],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    keyPrefix: text('key_prefix').notNull().unique(),
    keyHash: text('key_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_tenant_idx').on(t.tenantId)],
);

export const endAccounts = pgTable(
  'end_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    pricingCountry: text('pricing_country').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('end_accounts_tenant_external_unique').on(t.tenantId, t.externalId),
    index('end_accounts_tenant_idx').on(t.tenantId),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    endAccountId: uuid('end_account_id')
      .notNull()
      .references(() => endAccounts.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    osName: text('os_name'),
    timezone: text('timezone'),
    locale: text('locale'),
    emulatorSuspected: boolean('emulator_suspected').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('devices_tenant_hash_unique').on(t.tenantId, t.deviceHash),
    index('devices_tenant_account_idx').on(t.tenantId, t.endAccountId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    endAccountId: uuid('end_account_id')
      .notNull()
      .references(() => endAccounts.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    ipAddress: text('ip_address').notNull(),
    derivedCountry: text('derived_country'),
    asn: text('asn'),
    vpnLikelihood: real('vpn_likelihood').default(0),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_tenant_account_time_idx').on(t.tenantId, t.endAccountId, t.occurredAt)],
);

export const paymentSignals = pgTable(
  'payment_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    endAccountId: uuid('end_account_id')
      .notNull()
      .references(() => endAccounts.id, { onDelete: 'cascade' }),
    // Nullable: the MVP ingestion API accepts an already-derived payment-country signal
    // from the tenant's own PSP integration without requiring a specific token format —
    // real PSP token-based lookup is a documented follow-up (see ADR-0002).
    providerToken: text('provider_token'),
    issuingCountry: text('issuing_country'),
    currency: text('currency'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_signals_tenant_account_idx').on(t.tenantId, t.endAccountId)],
);

export const riskEvents = pgTable(
  'risk_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    endAccountId: uuid('end_account_id')
      .notNull()
      .references(() => endAccounts.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    eventType: riskEventTypeEnum('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('risk_events_tenant_account_time_idx').on(t.tenantId, t.endAccountId, t.occurredAt)],
);

export const riskScores = pgTable('risk_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  riskEventId: uuid('risk_event_id')
    .notNull()
    .unique()
    .references(() => riskEvents.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  confidence: confidenceEnum('confidence').notNull(),
  likelyPrimaryCountry: jsonb('likely_primary_country').notNull(),
  evidence: jsonb('evidence').notNull(),
  reasonCodes: jsonb('reason_codes').notNull(),
  // The raw rule-engine FactMap (ScoringResult.facts) used to evaluate policy rules for
  // this score — added in Phase 4 so the ML shadow model can be scored on the exact same
  // features the production rule engine used (train/serve feature parity), rather than
  // re-deriving an approximation from `evidence`'s human-readable strings.
  facts: jsonb('facts').notNull().default({}),
  modelVersion: text('model_version').notNull(),
  policyVersion: text('policy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('policies_tenant_active_idx').on(t.tenantId, t.active)],
);

export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    condition: jsonb('condition').notNull(),
    action: policyActionEnum('action').notNull(),
    requiresHumanReview: boolean('requires_human_review').notNull().default(true),
    order: integer('order').notNull().default(0),
  },
  (t) => [index('rules_policy_idx').on(t.policyId)],
);

export const policyDecisions = pgTable('policy_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  riskScoreId: uuid('risk_score_id')
    .notNull()
    .unique()
    .references(() => riskScores.id, { onDelete: 'cascade' }),
  // Nullable: a brand-new tenant may not have configured a policy yet — ingestion must
  // not fail in that case (see risk.service.ts), it just records action=NONE with no
  // policy attribution.
  policyId: uuid('policy_id').references(() => policies.id, { onDelete: 'set null' }),
  matchedRuleId: uuid('matched_rule_id'),
  action: policyActionEnum('action').notNull(),
  requiresHumanReview: boolean('requires_human_review').notNull(),
  approved: boolean('approved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const investigations = pgTable(
  'investigations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Denormalised on purpose (also reachable via policyDecision -> riskScore ->
    // riskEvent -> tenantId) so every investigations/appeals query can filter on
    // tenantId directly, matching the same defense-in-depth isolation pattern used
    // everywhere else (docs/architecture/SECURITY_ARCHITECTURE.md).
    tenantId: uuid('tenant_id').notNull(),
    policyDecisionId: uuid('policy_decision_id')
      .notNull()
      .unique()
      .references(() => policyDecisions.id, { onDelete: 'cascade' }),
    status: investigationStatusEnum('status').notNull().default('PENDING'),
    assignedToUserId: uuid('assigned_to_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('investigations_tenant_idx').on(t.tenantId)],
);

export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    investigationId: uuid('investigation_id')
      .notNull()
      .references(() => investigations.id, { onDelete: 'cascade' }),
    submittedByExternalId: text('submitted_by_external_id').notNull(),
    message: text('message').notNull(),
    status: appealStatusEnum('status').notNull().default('OPEN'),
    decisionNotes: text('decision_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('appeals_tenant_investigation_idx').on(t.tenantId, t.investigationId)],
);

export const auditLogEntries = pgTable(
  'audit_log_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    actorId: text('actor_id'),
    actorType: actorTypeEnum('actor_type').notNull(),
    action: text('action').notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_tenant_time_idx').on(t.tenantId, t.createdAt)],
);

export const retentionPolicies = pgTable('retention_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  rawIpDays: integer('raw_ip_days').notNull().default(7),
  derivedFeatureDays: integer('derived_feature_days').notNull().default(90),
  riskEventDays: integer('risk_event_days').notNull().default(180),
  auditLogDays: integer('audit_log_days'), // null = compliance-defined, never auto-deleted (ADR-0004)
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

// --- Phase 3: Advanced Analytics — feature store ---
//
// A daily, tenant-scoped, pre-aggregated snapshot of per-account signals (event counts,
// distinct-country counts, VPN ratio, average/max risk score). Computed by
// `FeatureStoreService.computeDailySnapshots()` (analytics module) reading straight off
// `risk_events`/`risk_scores`/`sessions` — a real streaming platform (Kafka/Redpanda +
// a dedicated analytics DB such as ClickHouse) is deferred per ADR-0002 until real
// ingestion volume justifies the operational cost; this table is the "feature store"
// concept implemented at MVP-appropriate scale (batch aggregation, not stream
// aggregation), so Phase 4's model training has a real, versioned feature source instead
// of ad hoc joins.
export const accountFeatureSnapshots = pgTable(
  'account_feature_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    endAccountId: uuid('end_account_id')
      .notNull()
      .references(() => endAccounts.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { withTimezone: true, mode: 'date' }).notNull(),
    eventCount: integer('event_count').notNull().default(0),
    distinctCountryCount: integer('distinct_country_count').notNull().default(0),
    distinctIpCount: integer('distinct_ip_count').notNull().default(0),
    vpnEventRatio: real('vpn_event_ratio').notNull().default(0),
    avgRiskScore: real('avg_risk_score'),
    maxRiskScore: integer('max_risk_score'),
    featureVersion: text('feature_version').notNull().default('v1'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('feature_snapshots_tenant_account_date_unique').on(
      t.tenantId,
      t.endAccountId,
      t.snapshotDate,
    ),
    index('feature_snapshots_tenant_date_idx').on(t.tenantId, t.snapshotDate),
  ],
);

// --- Phase 4: ML — model registry, shadow evaluation, staged rollout ---
//
// Implements the shadow-model promotion pipeline from the master brief (production model
// vs. shadow candidate -> comparison -> false-positive evaluation -> human approval ->
// staged 5/25/50/100% rollout), adopted as-is per docs/PHASE_0_DISCOVERY.md §"Testing".
// The model itself is a small logistic-regression classifier trained on the synthetic
// abuse-scenario dataset (docs/ml/ABUSE_SCENARIO_CATALOGUE.md) — illustrative and
// intentionally small-scale, not production-grade fraud ML; see
// docs/adr/0006-ml-shadow-rollout.md for the honest scope statement.
export const mlModels = pgTable('ml_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  weights: jsonb('weights').notNull(), // { bias: number, features: Record<string, number> }
  featureNames: jsonb('feature_names').notNull(), // string[]
  trainingExampleCount: integer('training_example_count').notNull(),
  holdoutAccuracy: real('holdout_accuracy').notNull(),
  trainedAt: timestamp('trained_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mlRolloutConfig = pgTable('ml_rollout_config', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  shadowModelVersion: text('shadow_model_version'),
  rolloutPercentage: integer('rollout_percentage').notNull().default(0), // 0/5/25/50/100
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

export const mlShadowEvaluations = pgTable(
  'ml_shadow_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    riskScoreId: uuid('risk_score_id')
      .notNull()
      .references(() => riskScores.id, { onDelete: 'cascade' }),
    modelVersion: text('model_version').notNull(),
    productionScore: integer('production_score').notNull(),
    shadowScore: integer('shadow_score').notNull(),
    agreement: boolean('agreement').notNull(), // same side of the REQUEST_VERIFICATION threshold
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ml_shadow_evaluations_tenant_model_idx').on(t.tenantId, t.modelVersion)],
);

// --- Relations (used by Drizzle's relational query API in read-heavy services) ---

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  users: many(tenantUsers),
  apiKeys: many(apiKeys),
  endAccounts: many(endAccounts),
  policies: many(policies),
  retentionPolicy: one(retentionPolicies),
}));

export const endAccountsRelations = relations(endAccounts, ({ many }) => ({
  devices: many(devices),
  sessions: many(sessions),
  paymentSignals: many(paymentSignals),
  riskEvents: many(riskEvents),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  endAccount: one(endAccounts, { fields: [sessions.endAccountId], references: [endAccounts.id] }),
  device: one(devices, { fields: [sessions.deviceId], references: [devices.id] }),
  riskEvents: many(riskEvents),
}));

export const riskEventsRelations = relations(riskEvents, ({ one }) => ({
  session: one(sessions, { fields: [riskEvents.sessionId], references: [sessions.id] }),
  endAccount: one(endAccounts, { fields: [riskEvents.endAccountId], references: [endAccounts.id] }),
  riskScore: one(riskScores, { fields: [riskEvents.id], references: [riskScores.riskEventId] }),
}));

export const policiesRelations = relations(policies, ({ many }) => ({
  rules: many(rules),
}));

export const investigationsRelations = relations(investigations, ({ many }) => ({
  appeals: many(appeals),
}));
