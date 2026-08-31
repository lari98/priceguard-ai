import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { AccountsService } from '../accounts/accounts.service';
import { ScoringService } from './scoring.service';
import { PolicyService } from '../policy/policy.service';
import { AuditService } from '../audit/audit.service';
import { InvestigationsService } from '../investigations/investigations.service';
import { IP_INTELLIGENCE_PROVIDER, IpIntelligenceProvider } from './ip-intelligence/ip-intelligence.interface';
import { RiskEventInputDto } from './dto/risk-event-input.dto';

const OBSERVATION_WINDOW_DAYS = 365;

export interface RiskDecisionResponse {
  riskScore: number;
  confidence: string;
  likelyPrimaryCountry: Record<string, number>;
  vpnProbability: number;
  travelProbability: number;
  policyAction: string;
  requiresHumanReview: boolean;
  reasonCodes: string[];
  modelVersion: string;
  policyVersion: string;
  investigationId: string | null;
}

@Injectable()
export class RiskService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly accountsService: AccountsService,
    private readonly scoringService: ScoringService,
    private readonly policyService: PolicyService,
    private readonly auditService: AuditService,
    private readonly investigationsService: InvestigationsService,
    @Inject(IP_INTELLIGENCE_PROVIDER) private readonly ipIntelligence: IpIntelligenceProvider,
  ) {}

  async ingest(tenantId: string, actorId: string, input: RiskEventInputDto): Promise<RiskDecisionResponse> {
    const now = new Date(input.timestamp);

    const account = await this.accountsService.findOrCreateEndAccount(tenantId, input.accountId, input.pricingCountry);
    const ipIntel = await this.ipIntelligence.lookup(input.ipAddress);

    const device = await this.accountsService.findOrCreateDevice(tenantId, account.id, input.deviceId, {
      timezone: input.timezone,
      locale: input.locale,
    });

    const session = await this.accountsService.createSession(tenantId, account.id, device.id, {
      ipAddress: input.ipAddress,
      derivedCountry: ipIntel.country,
      asn: ipIntel.asn,
      vpnLikelihood: ipIntel.vpnLikelihood,
      occurredAt: now,
    });

    if (input.paymentCountry) {
      await this.accountsService.createPaymentSignal(tenantId, account.id, { issuingCountry: input.paymentCountry });
    }

    const since = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const history = await this.accountsService.getRecentSessionsWithDeviceHash(tenantId, account.id, since);

    const scoringResult = this.scoringService.score({
      pricingCountry: account.pricingCountry,
      paymentCountry: input.paymentCountry,
      accountCreatedAt: account.createdAt,
      now,
      sessions: history.map((s) => ({
        derivedCountry: s.derivedCountry ?? 'UNKNOWN',
        occurredAt: s.occurredAt,
        vpnLikelihood: s.vpnLikelihood ?? 0,
        deviceHash: s.deviceHash ?? 'UNKNOWN',
      })),
    });

    const [riskEvent] = await this.db
      .insert(schema.riskEvents)
      .values({ tenantId, endAccountId: account.id, sessionId: session.id, eventType: input.eventType, occurredAt: now })
      .returning();

    const activePolicy = await this.policyService.getActivePolicyWithRules(tenantId);
    const decision = activePolicy
      ? this.policyService.evaluate(activePolicy.rules, scoringResult.facts)
      : { action: 'NONE' as const, requiresHumanReview: false, matchedRuleId: null, matchedRuleName: null };

    const [riskScore] = await this.db
      .insert(schema.riskScores)
      .values({
        riskEventId: riskEvent.id,
        score: scoringResult.score,
        confidence: scoringResult.confidence,
        likelyPrimaryCountry: scoringResult.likelyPrimaryCountry,
        evidence: scoringResult.evidence,
        reasonCodes: scoringResult.evidence.map((e) => e.customerDescription),
        modelVersion: this.scoringService.MODEL_VERSION,
        policyVersion: activePolicy ? `${activePolicy.id}:${activePolicy.version}` : 'none',
      })
      .returning();

    const [policyDecision] = await this.db
      .insert(schema.policyDecisions)
      .values({
        riskScoreId: riskScore.id,
        policyId: activePolicy?.id ?? null,
        matchedRuleId: decision.matchedRuleId,
        action: decision.action,
        requiresHumanReview: decision.requiresHumanReview,
      })
      .returning();

    let investigationId: string | null = null;
    if (decision.requiresHumanReview) {
      const investigation = await this.investigationsService.createForDecision(tenantId, policyDecision.id);
      investigationId = investigation.id;
    }

    await this.auditService.log({
      tenantId,
      actorId,
      actorType: 'API_KEY',
      action: 'RISK_EVENT_SCORED',
      afterState: {
        riskEventId: riskEvent.id,
        score: riskScore.score,
        action: decision.action,
        requiresHumanReview: decision.requiresHumanReview,
      },
    });

    return {
      riskScore: scoringResult.score,
      confidence: scoringResult.confidence,
      likelyPrimaryCountry: scoringResult.likelyPrimaryCountry,
      vpnProbability: scoringResult.vpnProbability,
      travelProbability: scoringResult.travelProbability,
      policyAction: decision.action,
      requiresHumanReview: decision.requiresHumanReview,
      reasonCodes: scoringResult.evidence.map((e) => e.customerDescription),
      modelVersion: this.scoringService.MODEL_VERSION,
      policyVersion: activePolicy ? `${activePolicy.id}:${activePolicy.version}` : 'none',
      investigationId,
    };
  }

  /** Dashboard listing: recent scored risk events for the tenant, newest first, joined
   *  with the account external id (so the UI never has to show a raw internal uuid as
   *  the primary label) and the policy decision that was made on them. */
  async listRecentEvents(tenantId: string, limit = 200) {
    return this.db
      .select({
        id: schema.riskEvents.id,
        eventType: schema.riskEvents.eventType,
        occurredAt: schema.riskEvents.occurredAt,
        endAccountId: schema.riskEvents.endAccountId,
        endAccountExternalId: schema.endAccounts.externalId,
        pricingCountry: schema.endAccounts.pricingCountry,
        score: schema.riskScores.score,
        confidence: schema.riskScores.confidence,
        likelyPrimaryCountry: schema.riskScores.likelyPrimaryCountry,
        action: schema.policyDecisions.action,
        requiresHumanReview: schema.policyDecisions.requiresHumanReview,
      })
      .from(schema.riskEvents)
      .innerJoin(schema.endAccounts, eq(schema.endAccounts.id, schema.riskEvents.endAccountId))
      .innerJoin(schema.riskScores, eq(schema.riskScores.riskEventId, schema.riskEvents.id))
      .leftJoin(schema.policyDecisions, eq(schema.policyDecisions.riskScoreId, schema.riskScores.id))
      .where(eq(schema.riskEvents.tenantId, tenantId))
      .orderBy(desc(schema.riskEvents.occurredAt))
      .limit(limit);
  }
}
