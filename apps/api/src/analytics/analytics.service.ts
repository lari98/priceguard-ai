import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

export interface RiskTrendPoint {
  date: string;
  eventCount: number;
  avgScore: number | null;
  highConfidenceCount: number;
}

export interface CountryBreakdownEntry {
  country: string;
  weightedFlags: number;
}

export interface PolicyActionBreakdownEntry {
  action: string;
  count: number;
}

export interface AnalyticsSummary {
  windowDays: number;
  totalEvents: number;
  totalAccountsSeen: number;
  avgScore: number | null;
  trend: RiskTrendPoint[];
  topCountries: CountryBreakdownEntry[];
  policyActionBreakdown: PolicyActionBreakdownEntry[];
}

/**
 * Phase 3 (Advanced Analytics) read-side aggregation.
 *
 * Deliberately kept as straightforward SQL over the existing OLTP tables rather than a
 * dedicated analytics warehouse — see feature-store.service.ts's header for why a real
 * columnar store is deferred. `windowDays` is capped so this never accidentally becomes an
 * unbounded full-table scan against real production volume.
 */
@Injectable()
export class AnalyticsService {
  private static readonly MAX_WINDOW_DAYS = 90;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getSummary(tenantId: string, windowDaysRequested: number): Promise<AnalyticsSummary> {
    const windowDays = Math.min(Math.max(1, windowDaysRequested), AnalyticsService.MAX_WINDOW_DAYS);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [trend, countries, policyActions, totals] = await Promise.all([
      this.getTrend(tenantId, since),
      this.getTopCountries(tenantId, since),
      this.getPolicyActionBreakdown(tenantId, since),
      this.getTotals(tenantId, since),
    ]);

    return {
      windowDays,
      totalEvents: totals.totalEvents,
      totalAccountsSeen: totals.totalAccountsSeen,
      avgScore: totals.avgScore,
      trend,
      topCountries: countries,
      policyActionBreakdown: policyActions,
    };
  }

  private async getTrend(tenantId: string, since: Date): Promise<RiskTrendPoint[]> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.riskEvents.occurredAt}), 'YYYY-MM-DD')`,
        eventCount: sql<number>`count(*)::int`,
        avgScore: sql<number | null>`avg(${schema.riskScores.score})`,
        highConfidenceCount: sql<number>`count(*) filter (where ${schema.riskScores.confidence} = 'HIGH')::int`,
      })
      .from(schema.riskEvents)
      .leftJoin(schema.riskScores, eq(schema.riskScores.riskEventId, schema.riskEvents.id))
      .where(and(eq(schema.riskEvents.tenantId, tenantId), gte(schema.riskEvents.occurredAt, since)))
      .groupBy(sql`date_trunc('day', ${schema.riskEvents.occurredAt})`)
      .orderBy(sql`date_trunc('day', ${schema.riskEvents.occurredAt})`);

    return rows.map((r) => ({
      date: r.day,
      eventCount: r.eventCount,
      avgScore: r.avgScore === null ? null : Number(r.avgScore),
      highConfidenceCount: r.highConfidenceCount,
    }));
  }

  /**
   * `likelyPrimaryCountry` is a jsonb share-map (`{ "DE": 0.7, "FR": 0.3 }`), not a single
   * column, so this is computed in application code over a bounded window rather than as
   * a single SQL aggregate — acceptable at MVP/batch scale, flagged the same way as the
   * rest of this module for a future real analytics-store implementation.
   */
  private async getTopCountries(tenantId: string, since: Date): Promise<CountryBreakdownEntry[]> {
    const rows = await this.db
      .select({ likelyPrimaryCountry: schema.riskScores.likelyPrimaryCountry })
      .from(schema.riskScores)
      .innerJoin(schema.riskEvents, eq(schema.riskEvents.id, schema.riskScores.riskEventId))
      .where(and(eq(schema.riskEvents.tenantId, tenantId), gte(schema.riskEvents.occurredAt, since)));

    const totals = new Map<string, number>();
    for (const row of rows) {
      const shareMap = row.likelyPrimaryCountry as Record<string, number>;
      for (const [country, share] of Object.entries(shareMap ?? {})) {
        totals.set(country, (totals.get(country) ?? 0) + share);
      }
    }

    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, weightedFlags]) => ({ country, weightedFlags: Number(weightedFlags.toFixed(2)) }));
  }

  private async getPolicyActionBreakdown(tenantId: string, since: Date): Promise<PolicyActionBreakdownEntry[]> {
    const rows = await this.db
      .select({
        action: schema.policyDecisions.action,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.policyDecisions)
      .innerJoin(schema.riskScores, eq(schema.riskScores.id, schema.policyDecisions.riskScoreId))
      .innerJoin(schema.riskEvents, eq(schema.riskEvents.id, schema.riskScores.riskEventId))
      .where(and(eq(schema.riskEvents.tenantId, tenantId), gte(schema.riskEvents.occurredAt, since)))
      .groupBy(schema.policyDecisions.action)
      .orderBy(desc(sql`count(*)`));

    return rows.map((r) => ({ action: r.action, count: r.count }));
  }

  private async getTotals(
    tenantId: string,
    since: Date,
  ): Promise<{ totalEvents: number; totalAccountsSeen: number; avgScore: number | null }> {
    const [row] = await this.db
      .select({
        totalEvents: sql<number>`count(distinct ${schema.riskEvents.id})::int`,
        totalAccountsSeen: sql<number>`count(distinct ${schema.riskEvents.endAccountId})::int`,
        avgScore: sql<number | null>`avg(${schema.riskScores.score})`,
      })
      .from(schema.riskEvents)
      .leftJoin(schema.riskScores, eq(schema.riskScores.riskEventId, schema.riskEvents.id))
      .where(and(eq(schema.riskEvents.tenantId, tenantId), gte(schema.riskEvents.occurredAt, since)));

    return {
      totalEvents: row?.totalEvents ?? 0,
      totalAccountsSeen: row?.totalAccountsSeen ?? 0,
      avgScore: row?.avgScore === null || row?.avgScore === undefined ? null : Number(row.avgScore),
    };
  }
}
