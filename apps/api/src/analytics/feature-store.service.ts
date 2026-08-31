import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

const FEATURE_VERSION = 'v1';

/**
 * Phase 3 (Advanced Analytics) feature store.
 *
 * Computes a daily, per-tenant, per-account snapshot of aggregated signals
 * (`account_feature_snapshots`) from the raw `risk_events` / `sessions` / `risk_scores`
 * tables. This is a *batch* feature store, not a streaming one: a real streaming platform
 * (Kafka/Redpanda feeding a columnar analytics store such as ClickHouse) is the documented
 * target once ingestion volume justifies the operational cost (see ADR-0002 and
 * docs/architecture/C4_DIAGRAMS.md's "not yet in scope" section) — this is the batch
 * equivalent, built at MVP-appropriate scale, and is intentionally what Phase 4's model
 * training reads from instead of ad hoc joins over raw event tables.
 */
@Injectable()
export class FeatureStoreService {
  private readonly logger = new Logger(FeatureStoreService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledRun() {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await this.computeDailySnapshots(startOfUtcDay(yesterday));
  }

  /**
   * Computes (or recomputes) snapshots for every account with activity on `day`.
   * Pass `tenantId` to scope a manual/admin-triggered run to a single tenant (used by the
   * `/analytics/feature-snapshots/run` endpoint) — the unscoped nightly cron run
   * (`scheduledRun`) covers every tenant.
   */
  async computeDailySnapshots(day: Date, tenantId?: string): Promise<{ snapshotsWritten: number }> {
    const dayStart = startOfUtcDay(day);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const timeFilter = and(gte(schema.riskEvents.occurredAt, dayStart), lt(schema.riskEvents.occurredAt, dayEnd));
    const accounts = await this.db
      .selectDistinct({
        tenantId: schema.riskEvents.tenantId,
        endAccountId: schema.riskEvents.endAccountId,
      })
      .from(schema.riskEvents)
      .where(tenantId ? and(timeFilter, eq(schema.riskEvents.tenantId, tenantId)) : timeFilter);

    let written = 0;
    for (const { tenantId, endAccountId } of accounts) {
      await this.computeSnapshotForAccount(tenantId, endAccountId, dayStart, dayEnd);
      written += 1;
    }

    this.logger.log(`Feature store: computed ${written} account snapshot(s) for ${dayStart.toISOString().slice(0, 10)}.`);
    return { snapshotsWritten: written };
  }

  async computeSnapshotForAccount(
    tenantId: string,
    endAccountId: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<void> {
    const events = await this.db
      .select({
        id: schema.riskEvents.id,
        sessionId: schema.riskEvents.sessionId,
      })
      .from(schema.riskEvents)
      .where(
        and(
          eq(schema.riskEvents.tenantId, tenantId),
          eq(schema.riskEvents.endAccountId, endAccountId),
          gte(schema.riskEvents.occurredAt, dayStart),
          lt(schema.riskEvents.occurredAt, dayEnd),
        ),
      );

    const sessionIds = [...new Set(events.map((e) => e.sessionId))];
    const sessions = sessionIds.length
      ? await this.db.select().from(schema.sessions).where(inArray(schema.sessions.id, sessionIds))
      : [];

    const distinctCountries = new Set(sessions.map((s) => s.derivedCountry).filter(Boolean));
    const distinctIps = new Set(sessions.map((s) => s.ipAddress));
    const vpnEvents = sessions.filter((s) => (s.vpnLikelihood ?? 0) >= 0.5).length;
    const vpnEventRatio = sessions.length > 0 ? vpnEvents / sessions.length : 0;

    const eventIds = events.map((e) => e.id);
    const scores = eventIds.length
      ? await this.db.select().from(schema.riskScores).where(inArray(schema.riskScores.riskEventId, eventIds))
      : [];
    const avgRiskScore = scores.length ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : null;
    const maxRiskScore = scores.length ? Math.max(...scores.map((s) => s.score)) : null;

    await this.db
      .insert(schema.accountFeatureSnapshots)
      .values({
        tenantId,
        endAccountId,
        snapshotDate: dayStart,
        eventCount: events.length,
        distinctCountryCount: distinctCountries.size,
        distinctIpCount: distinctIps.size,
        vpnEventRatio,
        avgRiskScore,
        maxRiskScore,
        featureVersion: FEATURE_VERSION,
      })
      .onConflictDoUpdate({
        target: [
          schema.accountFeatureSnapshots.tenantId,
          schema.accountFeatureSnapshots.endAccountId,
          schema.accountFeatureSnapshots.snapshotDate,
        ],
        set: {
          eventCount: events.length,
          distinctCountryCount: distinctCountries.size,
          distinctIpCount: distinctIps.size,
          vpnEventRatio,
          avgRiskScore,
          maxRiskScore,
          featureVersion: FEATURE_VERSION,
        },
      });
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
