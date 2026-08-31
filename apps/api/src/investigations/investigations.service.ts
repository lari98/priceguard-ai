import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InvestigationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  async createForDecision(tenantId: string, policyDecisionId: string) {
    const [investigation] = await this.db
      .insert(schema.investigations)
      .values({ tenantId, policyDecisionId, status: 'PENDING' })
      .returning();

    await this.auditService.log({
      tenantId,
      actorId: null,
      actorType: 'SYSTEM',
      action: 'INVESTIGATION_OPENED',
      afterState: investigation,
    });

    return investigation;
  }

  async submitAppeal(tenantId: string, investigationId: string, submittedByExternalId: string, message: string) {
    const investigation = await this.getInvestigation(tenantId, investigationId);
    const [appeal] = await this.db
      .insert(schema.appeals)
      .values({ tenantId, investigationId: investigation.id, submittedByExternalId, message, status: 'OPEN' })
      .returning();

    await this.auditService.log({
      tenantId,
      actorId: null,
      actorType: 'SYSTEM',
      action: 'APPEAL_SUBMITTED',
      afterState: appeal,
    });

    return appeal;
  }

  async decideAppeal(
    tenantId: string,
    appealId: string,
    outcome: 'UPHELD' | 'OVERTURNED',
    decisionNotes: string | undefined,
    decidingUserId: string,
  ) {
    const [existing] = await this.db
      .select()
      .from(schema.appeals)
      .where(and(eq(schema.appeals.tenantId, tenantId), eq(schema.appeals.id, appealId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundException(`Appeal ${appealId} not found`);
    }

    const [updated] = await this.db
      .update(schema.appeals)
      .set({ status: outcome, decisionNotes, decidedAt: new Date() })
      .where(eq(schema.appeals.id, appealId))
      .returning();

    await this.auditService.log({
      tenantId,
      actorId: decidingUserId,
      actorType: 'USER',
      action: `APPEAL_${outcome}`,
      beforeState: existing,
      afterState: updated,
    });

    return updated;
  }

  /** Dashboard listing: investigations joined all the way down to the end account, so
   *  the review queue can show a human-meaningful account id, score and action without
   *  a second round trip. Ordered newest-first; PENDING/IN_REVIEW naturally sort to the
   *  top of an analyst's attention in practice because they are the most recent. */
  async listForTenant(tenantId: string, limit = 200) {
    return this.db
      .select({
        id: schema.investigations.id,
        status: schema.investigations.status,
        createdAt: schema.investigations.createdAt,
        resolvedAt: schema.investigations.resolvedAt,
        action: schema.policyDecisions.action,
        score: schema.riskScores.score,
        endAccountId: schema.riskEvents.endAccountId,
        endAccountExternalId: schema.endAccounts.externalId,
      })
      .from(schema.investigations)
      .innerJoin(schema.policyDecisions, eq(schema.policyDecisions.id, schema.investigations.policyDecisionId))
      .innerJoin(schema.riskScores, eq(schema.riskScores.id, schema.policyDecisions.riskScoreId))
      .innerJoin(schema.riskEvents, eq(schema.riskEvents.id, schema.riskScores.riskEventId))
      .innerJoin(schema.endAccounts, eq(schema.endAccounts.id, schema.riskEvents.endAccountId))
      .where(eq(schema.investigations.tenantId, tenantId))
      .orderBy(desc(schema.investigations.createdAt))
      .limit(limit);
  }

  /** Dashboard listing for the appeals review queue, joined with the investigation it
   *  was filed against so an analyst can see the original action/score inline. */
  async listAppealsForTenant(tenantId: string, limit = 200) {
    return this.db
      .select({
        id: schema.appeals.id,
        investigationId: schema.appeals.investigationId,
        submittedByExternalId: schema.appeals.submittedByExternalId,
        message: schema.appeals.message,
        status: schema.appeals.status,
        decisionNotes: schema.appeals.decisionNotes,
        createdAt: schema.appeals.createdAt,
        decidedAt: schema.appeals.decidedAt,
        investigationStatus: schema.investigations.status,
        originalAction: schema.policyDecisions.action,
        originalScore: schema.riskScores.score,
      })
      .from(schema.appeals)
      .innerJoin(schema.investigations, eq(schema.investigations.id, schema.appeals.investigationId))
      .innerJoin(schema.policyDecisions, eq(schema.policyDecisions.id, schema.investigations.policyDecisionId))
      .innerJoin(schema.riskScores, eq(schema.riskScores.id, schema.policyDecisions.riskScoreId))
      .where(eq(schema.appeals.tenantId, tenantId))
      .orderBy(desc(schema.appeals.createdAt))
      .limit(limit);
  }

  private async getInvestigation(tenantId: string, investigationId: string) {
    const [investigation] = await this.db
      .select()
      .from(schema.investigations)
      .where(and(eq(schema.investigations.tenantId, tenantId), eq(schema.investigations.id, investigationId)))
      .limit(1);
    if (!investigation) {
      throw new NotFoundException(`Investigation ${investigationId} not found`);
    }
    return investigation;
  }
}
