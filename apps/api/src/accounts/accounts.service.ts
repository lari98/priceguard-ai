import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

/**
 * All methods take tenantId explicitly and every query filters on it — this is the
 * project's tenant-isolation pattern (see docs/architecture/SECURITY_ARCHITECTURE.md and
 * ADR-0003; verified end-to-end by tests/e2e/tenant-isolation.e2e-spec.ts).
 */
@Injectable()
export class AccountsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Finds or creates the end account, and — importantly — keeps `pricingCountry`
   * synced to the *latest* value declared by the caller on each event. This matters
   * for the platform's own core use case: a customer's billed/pricing region can
   * legitimately change over time (a plan migration, a currency/region correction, or
   * exactly the kind of SUBSCRIPTION_REGION_CHANGE event this API models), and the risk
   * engine must score against the account's *current* declared pricing country, not
   * whatever it happened to be the first time this account was ever seen.
   *
   * Phase 8 (Scale) fix: this used to be a select-then-insert-or-update — a real
   * check-then-act race under concurrent requests for the same (tenantId, externalId),
   * which a real load test (docs/performance/PHASE_8_LOAD_TEST.md) surfaced as unhandled
   * 500s from `end_accounts_tenant_external_unique` violations. Replaced with a single
   * atomic `INSERT ... ON CONFLICT DO UPDATE`, which Postgres guarantees is race-free
   * regardless of concurrency.
   */
  async findOrCreateEndAccount(tenantId: string, externalId: string, pricingCountry: string) {
    const [account] = await this.db
      .insert(schema.endAccounts)
      .values({ tenantId, externalId, pricingCountry })
      .onConflictDoUpdate({
        target: [schema.endAccounts.tenantId, schema.endAccounts.externalId],
        set: { pricingCountry },
      })
      .returning();
    return account;
  }

  async findOrCreateDevice(
    tenantId: string,
    endAccountId: string,
    deviceHash: string,
    attrs: { osName?: string; timezone?: string; locale?: string },
  ) {
    // Phase 8 (Scale) fix: as with findOrCreateEndAccount above, the previous
    // select-then-insert-if-missing here was a real check-then-act race under concurrent
    // requests for the same (tenantId, deviceHash) — a real load test surfaced it as
    // unhandled 500s from `devices_tenant_hash_unique` violations (see
    // docs/performance/PHASE_8_LOAD_TEST.md). Replaced with an atomic
    // `INSERT ... ON CONFLICT DO UPDATE`; the `set` is a harmless self-assignment purely
    // so Postgres's RETURNING clause gives back the existing row on conflict too (an
    // `ON CONFLICT DO NOTHING` would return nothing for that case) — this intentionally
    // preserves the original behaviour of never overwriting an existing device's
    // osName/timezone/locale from a later event.
    const [device] = await this.db
      .insert(schema.devices)
      .values({ tenantId, endAccountId, deviceHash, ...attrs })
      .onConflictDoUpdate({
        target: [schema.devices.tenantId, schema.devices.deviceHash],
        set: { deviceHash: sql`${schema.devices.deviceHash}` },
      })
      .returning();

    // Record this (device, account) pairing even when the device row already existed for
    // a *different* account — see deviceAccountLinks's schema comment. onConflictDoNothing
    // keeps repeat sessions from the same account on the same device idempotent.
    await this.db
      .insert(schema.deviceAccountLinks)
      .values({ tenantId, deviceId: device.id, endAccountId })
      .onConflictDoNothing();

    return device;
  }

  async createSession(
    tenantId: string,
    endAccountId: string,
    deviceId: string | null,
    input: { ipAddress: string; derivedCountry: string; asn?: string; vpnLikelihood: number; occurredAt: Date },
  ) {
    const [created] = await this.db
      .insert(schema.sessions)
      .values({ tenantId, endAccountId, deviceId, ...input })
      .returning();
    return created;
  }

  async createPaymentSignal(
    tenantId: string,
    endAccountId: string,
    input: { providerToken?: string; issuingCountry?: string; currency?: string },
  ) {
    const [created] = await this.db
      .insert(schema.paymentSignals)
      .values({ tenantId, endAccountId, ...input })
      .returning();
    return created;
  }

  /** Sessions within the observation window, most recent first — used as scoring input. */
  async getRecentSessions(tenantId: string, endAccountId: string, since: Date) {
    return this.db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.tenantId, tenantId),
          eq(schema.sessions.endAccountId, endAccountId),
          gte(schema.sessions.occurredAt, since),
        ),
      );
  }

  /** Same as getRecentSessions, but joins the device hash — needed for the scoring
   *  service's device-stability / IP-rotation fact (see risk/scoring.service.ts). */
  async getRecentSessionsWithDeviceHash(
    tenantId: string,
    endAccountId: string,
    since: Date,
  ): Promise<Array<{ derivedCountry: string | null; occurredAt: Date; vpnLikelihood: number | null; deviceHash: string | null }>> {
    const rows = await this.db
      .select({
        derivedCountry: schema.sessions.derivedCountry,
        occurredAt: schema.sessions.occurredAt,
        vpnLikelihood: schema.sessions.vpnLikelihood,
        deviceHash: schema.devices.deviceHash,
      })
      .from(schema.sessions)
      .leftJoin(schema.devices, eq(schema.sessions.deviceId, schema.devices.id))
      .where(
        and(
          eq(schema.sessions.tenantId, tenantId),
          eq(schema.sessions.endAccountId, endAccountId),
          gte(schema.sessions.occurredAt, since),
        ),
      );
    return rows;
  }

  async getEndAccountById(tenantId: string, endAccountId: string) {
    const [account] = await this.db
      .select()
      .from(schema.endAccounts)
      .where(and(eq(schema.endAccounts.tenantId, tenantId), eq(schema.endAccounts.id, endAccountId)))
      .limit(1);
    return account ?? null;
  }

  /** Dashboard listing: every end account for the tenant, newest first. MVP scale
   *  assumption (documented in docs/PHASE_0_DISCOVERY.md §MVP scope): no server-side
   *  pagination yet, capped at `limit` rows. */
  async listEndAccounts(tenantId: string, limit = 200) {
    return this.db
      .select()
      .from(schema.endAccounts)
      .where(eq(schema.endAccounts.tenantId, tenantId))
      .orderBy(desc(schema.endAccounts.createdAt))
      .limit(limit);
  }

  /** Full detail view backing the dashboard's account-detail page: the account row,
   *  its recent sessions (most recent first), and its most recent risk score (if any
   *  risk event has ever been scored for it). */
  async getAccountDetail(tenantId: string, endAccountId: string) {
    const account = await this.getEndAccountById(tenantId, endAccountId);
    if (!account) return null;

    const recentSessions = await this.db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.tenantId, tenantId), eq(schema.sessions.endAccountId, endAccountId)))
      .orderBy(desc(schema.sessions.occurredAt))
      .limit(50);

    const recentScores = await this.db
      .select({
        riskEventId: schema.riskEvents.id,
        eventType: schema.riskEvents.eventType,
        occurredAt: schema.riskEvents.occurredAt,
        score: schema.riskScores.score,
        confidence: schema.riskScores.confidence,
        likelyPrimaryCountry: schema.riskScores.likelyPrimaryCountry,
        action: schema.policyDecisions.action,
        requiresHumanReview: schema.policyDecisions.requiresHumanReview,
      })
      .from(schema.riskEvents)
      .innerJoin(schema.riskScores, eq(schema.riskScores.riskEventId, schema.riskEvents.id))
      .leftJoin(schema.policyDecisions, eq(schema.policyDecisions.riskScoreId, schema.riskScores.id))
      .where(and(eq(schema.riskEvents.tenantId, tenantId), eq(schema.riskEvents.endAccountId, endAccountId)))
      .orderBy(desc(schema.riskEvents.occurredAt))
      .limit(50);

    return { account, recentSessions, recentScores };
  }
}
