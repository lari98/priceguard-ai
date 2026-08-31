import { Injectable, BadRequestException } from '@nestjs/common';
import { RuleEngineService } from '../risk/rule-engine/rule-engine.service';
import { RuleCondition, FactMap } from '../risk/rule-engine/rule-engine.types';

export type PolicyActionValue =
  | 'NONE'
  | 'MONITOR'
  | 'WARN'
  | 'REQUEST_VERIFICATION'
  | 'RESTRICT'
  | 'MANUAL_REVIEW'
  | 'SUSPEND'
  | 'TERMINATE';

/**
 * Actions severe enough that the master brief's Article 22 analysis
 * (docs/PHASE_0_DISCOVERY.md §I) requires a human-review safeguard. A policy rule may not
 * disable human review for any of these — enforced in validateRuleInput below, not just
 * suggested in the dashboard UI. This is the technical backstop referenced by
 * docs/architecture/THREAT_MODEL.md row #5 and PRIVACY.md.
 */
const ACTIONS_REQUIRING_MANDATORY_HUMAN_REVIEW: ReadonlySet<PolicyActionValue> = new Set([
  'REQUEST_VERIFICATION',
  'RESTRICT',
  'MANUAL_REVIEW',
  'SUSPEND',
  'TERMINATE',
]);

export interface PolicyRuleInput {
  id?: string;
  name: string;
  condition: RuleCondition;
  action: PolicyActionValue;
  requiresHumanReview: boolean;
  order: number;
}

export interface PolicyEvaluationResult {
  action: PolicyActionValue;
  requiresHumanReview: boolean;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
}

@Injectable()
export class PolicyEngineService {
  constructor(private readonly ruleEngine: RuleEngineService) {}

  /**
   * Throws if a rule tries to disable human review for an action severe enough to need
   * it. This is intentionally a hard server-side rule, not a UI nudge — see
   * docs/PHASE_0_DISCOVERY.md §I (Article 22) and ADR-0003.
   */
  validateRuleInput(rule: Pick<PolicyRuleInput, 'action' | 'requiresHumanReview'>): void {
    if (!rule.requiresHumanReview && ACTIONS_REQUIRING_MANDATORY_HUMAN_REVIEW.has(rule.action)) {
      throw new BadRequestException(
        `Action "${rule.action}" requires human review and cannot be configured with requiresHumanReview=false. ` +
          'This is a platform-level Article 22 safeguard, not a per-tenant configuration choice.',
      );
    }
  }

  /**
   * Evaluates an ordered list of rules against a fact set and returns the first match.
   * Rules are evaluated in ascending `order`; the first rule whose condition is true wins
   * (no partial/weighted combination — this mirrors how the brief's no-code rule builder
   * is meant to read, top to bottom, like a firewall ruleset).
   */
  evaluate(rules: PolicyRuleInput[], facts: FactMap): PolicyEvaluationResult {
    const sorted = [...rules].sort((a, b) => a.order - b.order);
    for (const rule of sorted) {
      if (this.ruleEngine.evaluate(rule.condition, facts)) {
        return {
          action: rule.action,
          requiresHumanReview: rule.requiresHumanReview,
          matchedRuleId: rule.id ?? null,
          matchedRuleName: rule.name,
        };
      }
    }
    return { action: 'NONE', requiresHumanReview: false, matchedRuleId: null, matchedRuleName: null };
  }
}
