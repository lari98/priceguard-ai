import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { AuditService } from '../audit/audit.service';

/**
 * Phase 6 DSAR self-service export: the "right to access/portability" complement to
 * ErasureService's "right to erasure" (ADR-0004). Gathers every row of personal data this
 * platform holds for one end-account across all tables that reference it, as a single
 * machine-readable export — a real GDPR Art. 15/20 access request needs the *content* of
 * personal data, not just proof it was deleted.
 *
 * Deliberately redacts the raw payment provider token (never surfaced anywhere in this
 * codebase, including here) and full IP addresses are included as-is since they are the
 * actual personal data being requested — a DSAR export is not the place to also apply
 * the retention-policy IP redaction meant for a different purpose (data minimisation over
 * time, not obscuring data from the subject who has a right to see it).
 */
@Injectable()
export class DsarExportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  async exportEndAccount(tenantId: string, endAccountId: string, requestedBy: string) {
    const [account] = await this.db
      .select()
      .from(schema.endAccounts)
      .where(and(eq(schema.endAccounts.tenantId, tenantId), eq(schema.endAccounts.id, endAccountId)))
      .limit(1);
    if (!account) {
      throw new NotFoundException(`End account ${endAccountId} not found`);
    }

    const [devices, sessions, paymentSignals, riskEvents] = await Promise.all([
      this.db.select().from(schema.devices).where(eq(schema.devices.endAccountId, endAccountId)),
      this.db.select().from(schema.sessions).where(eq(schema.sessions.endAccountId, endAccountId)),
      this.db
        .select({
          id: schema.paymentSignals.id,
          issuingCountry: schema.paymentSignals.issuingCountry,
          currency: schema.paymentSignals.currency,
          createdAt: schema.paymentSignals.createdAt,
        })
        .from(schema.paymentSignals)
        .where(eq(schema.paymentSignals.endAccountId, endAccountId)),
      this.db.select().from(schema.riskEvents).where(eq(schema.riskEvents.endAccountId, endAccountId)),
    ]);

    const riskEventIds = riskEvents.map((e) => e.id);
    const riskScores = riskEventIds.length
      ? await this.db.select().from(schema.riskScores).where(inArray(schema.riskScores.riskEventId, riskEventIds))
      : [];

    const riskScoreIds = riskScores.map((s) => s.id);
    const policyDecisions = riskScoreIds.length
      ? await this.db.select().from(schema.policyDecisions).where(inArray(schema.policyDecisions.riskScoreId, riskScoreIds))
      : [];

    const policyDecisionIds = policyDecisions.map((d) => d.id);
    const relevantInvestigations = policyDecisionIds.length
      ? await this.db.select().from(schema.investigations).where(inArray(schema.investigations.policyDecisionId, policyDecisionIds))
      : [];

    const investigationIds = relevantInvestigations.map((i) => i.id);
    const appeals = investigationIds.length
      ? await this.db.select().from(schema.appeals).where(inArray(schema.appeals.investigationId, investigationIds))
      : [];

    await this.auditService.log({
      tenantId,
      actorId: requestedBy,
      actorType: 'USER',
      action: 'END_ACCOUNT_DATA_EXPORTED',
      beforeState: { endAccountId, externalId: account.externalId },
    });

    return {
      exportedAt: new Date().toISOString(),
      account,
      devices,
      sessions,
      paymentSignals,
      riskEvents,
      riskScores,
      policyDecisions,
      investigations: relevantInvestigations,
      appeals,
    };
  }
}
