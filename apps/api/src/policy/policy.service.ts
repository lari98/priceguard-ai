import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { PolicyEngineService, PolicyEvaluationResult, PolicyRuleInput } from './policy-engine.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { RuleCondition } from '../risk/rule-engine/rule-engine.types';
import { FactMap } from '../risk/rule-engine/rule-engine.types';

@Injectable()
export class PolicyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly policyEngine: PolicyEngineService,
  ) {}

  async createPolicy(tenantId: string, dto: CreatePolicyDto) {
    for (const rule of dto.rules) {
      this.policyEngine.validateRuleInput(rule);
    }

    const [policy] = await this.db
      .insert(schema.policies)
      .values({ tenantId, name: dto.name, version: 1, active: true })
      .returning();

    if (dto.rules.length > 0) {
      await this.db.insert(schema.rules).values(
        dto.rules.map((r) => ({
          policyId: policy.id,
          name: r.name,
          condition: r.condition,
          action: r.action,
          requiresHumanReview: r.requiresHumanReview,
          order: r.order,
        })),
      );
    }

    return this.getPolicyWithRules(tenantId, policy.id);
  }

  /** Dashboard listing: every policy for the tenant with its rules attached, so the
   *  Policy & Rules page never needs a second round trip per policy. Tenants have at
   *  most a handful of policies in the MVP, so N+1-shaped fan-out here is an accepted,
   *  documented trade-off rather than a scalability bug. */
  async listPolicies(tenantId: string) {
    const policies = await this.db.select().from(schema.policies).where(eq(schema.policies.tenantId, tenantId));
    return Promise.all(
      policies.map(async (policy) => ({
        ...policy,
        rules: await this.db.select().from(schema.rules).where(eq(schema.rules.policyId, policy.id)),
      })),
    );
  }

  async getPolicyWithRules(tenantId: string, policyId: string) {
    const [policy] = await this.db
      .select()
      .from(schema.policies)
      .where(and(eq(schema.policies.tenantId, tenantId), eq(schema.policies.id, policyId)))
      .limit(1);
    if (!policy) return null;
    const rules = await this.db.select().from(schema.rules).where(eq(schema.rules.policyId, policyId));
    return { ...policy, rules };
  }

  /** The single active policy for a tenant. MVP simplification: exactly one active policy
   *  per tenant; multiple concurrently-active policies with precedence rules is a
   *  documented follow-up, not needed for the MVP's synchronous decision path. */
  async getActivePolicyWithRules(tenantId: string) {
    const [policy] = await this.db
      .select()
      .from(schema.policies)
      .where(and(eq(schema.policies.tenantId, tenantId), eq(schema.policies.active, true)))
      .limit(1);
    if (!policy) return null;
    const rules = await this.db.select().from(schema.rules).where(eq(schema.rules.policyId, policy.id));
    return { ...policy, rules };
  }

  evaluate(rules: Array<typeof schema.rules.$inferSelect>, facts: FactMap): PolicyEvaluationResult {
    const ruleInputs: PolicyRuleInput[] = rules.map((r) => ({
      id: r.id,
      name: r.name,
      condition: r.condition as RuleCondition,
      action: r.action,
      requiresHumanReview: r.requiresHumanReview,
      order: r.order,
    }));
    return this.policyEngine.evaluate(ruleInputs, facts);
  }
}
