import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt, ne } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

/**
 * Implements the tenant-configurable retention windows from
 * docs/architecture/GDPR_DATA_MAP.md / the "Privacy Control Center" concept in
 * docs/PHASE_0_DISCOVERY.md. Runs daily; also callable directly (e.g. from a test, or an
 * ops script) via runForAllTenants().
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledRun() {
    await this.runForAllTenants();
  }

  async runForAllTenants(): Promise<void> {
    const tenants = await this.db.select().from(schema.tenants);
    for (const tenant of tenants) {
      await this.runForTenant(tenant.id);
    }
  }

  async runForTenant(tenantId: string): Promise<{ ipRedacted: number; riskEventsDeleted: number; auditLogDeleted: number }> {
    const [policy] = await this.db
      .select()
      .from(schema.retentionPolicies)
      .where(eq(schema.retentionPolicies.tenantId, tenantId))
      .limit(1);

    // Conservative platform-floor defaults if a tenant has no explicit policy row yet.
    const rawIpDays = policy?.rawIpDays ?? 7;
    const riskEventDays = policy?.riskEventDays ?? 180;
    const auditLogDays = policy?.auditLogDays ?? null;

    const now = Date.now();
    const rawIpCutoff = new Date(now - rawIpDays * 24 * 60 * 60 * 1000);
    const riskEventCutoff = new Date(now - riskEventDays * 24 * 60 * 60 * 1000);

    const redacted = await this.db
      .update(schema.sessions)
      .set({ ipAddress: 'REDACTED' })
      .where(
        and(
          eq(schema.sessions.tenantId, tenantId),
          lt(schema.sessions.occurredAt, rawIpCutoff),
          ne(schema.sessions.ipAddress, 'REDACTED'),
        ),
      )
      .returning({ id: schema.sessions.id });

    const deletedEvents = await this.db
      .delete(schema.riskEvents)
      .where(and(eq(schema.riskEvents.tenantId, tenantId), lt(schema.riskEvents.occurredAt, riskEventCutoff)))
      .returning({ id: schema.riskEvents.id });

    let deletedAuditRows: { id: string }[] = [];
    if (auditLogDays !== null) {
      const auditCutoff = new Date(now - auditLogDays * 24 * 60 * 60 * 1000);
      deletedAuditRows = await this.db
        .delete(schema.auditLogEntries)
        .where(and(eq(schema.auditLogEntries.tenantId, tenantId), lt(schema.auditLogEntries.createdAt, auditCutoff)))
        .returning({ id: schema.auditLogEntries.id });
    }

    this.logger.log(
      `Retention run for tenant ${tenantId}: redacted ${redacted.length} raw IPs, deleted ${deletedEvents.length} expired risk events, deleted ${deletedAuditRows.length} audit rows.`,
    );

    return { ipRedacted: redacted.length, riskEventsDeleted: deletedEvents.length, auditLogDeleted: deletedAuditRows.length };
  }
}
