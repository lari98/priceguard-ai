import { PolicyEngineService, PolicyRuleInput } from './policy-engine.service';
import { RuleEngineService } from '../risk/rule-engine/rule-engine.service';

const SUSTAINED_MISMATCH_RULE: PolicyRuleInput = {
  id: 'rule-verify',
  name: 'High-confidence sustained mismatch -> request verification',
  condition: {
    and: [
      { fact: 'pricingCountryMismatch', op: 'eq', value: true },
      { fact: 'observationDays', op: 'gte', value: 60 },
      { fact: 'travelProbability', op: 'lt', value: 0.5 },
    ],
  },
  action: 'REQUEST_VERIFICATION',
  requiresHumanReview: true,
  order: 1,
};

describe('PolicyEngineService', () => {
  let engine: PolicyEngineService;

  beforeEach(() => {
    engine = new PolicyEngineService(new RuleEngineService());
  });

  it('rejects a rule that disables human review for a severe action (Article 22 backstop)', () => {
    expect(() =>
      engine.validateRuleInput({ action: 'SUSPEND', requiresHumanReview: false }),
    ).toThrow(/requires human review/);
    expect(() =>
      engine.validateRuleInput({ action: 'REQUEST_VERIFICATION', requiresHumanReview: false }),
    ).toThrow(/requires human review/);
  });

  it('allows human review to be disabled for low-severity actions', () => {
    expect(() => engine.validateRuleInput({ action: 'NONE', requiresHumanReview: false })).not.toThrow();
    expect(() => engine.validateRuleInput({ action: 'MONITOR', requiresHumanReview: false })).not.toThrow();
    expect(() => engine.validateRuleInput({ action: 'WARN', requiresHumanReview: false })).not.toThrow();
  });

  it('Scenario 3 (sustained abuse-looking pattern) maps to REQUEST_VERIFICATION with mandatory human review', () => {
    const facts = { pricingCountryMismatch: true, observationDays: 180, travelProbability: 0.1 };
    const result = engine.evaluate([SUSTAINED_MISMATCH_RULE], facts);

    expect(result.action).toBe('REQUEST_VERIFICATION');
    expect(result.requiresHumanReview).toBe(true);
  });

  it('Scenario 6 (gradual relocation, behaviourally similar facts) maps to the SAME capped action, never SUSPEND/TERMINATE', () => {
    // Deliberately the same shape of facts a genuine relocating student could also
    // produce (see scoring.service.spec.ts's Scenario 6 comment) — the policy layer's
    // job is to make sure that even in the worst case, this cannot escalate past
    // verification without a further, separate signal (e.g. a failed verification
    // check, which is out of scope for this MVP policy set and would need its own rule).
    const facts = { pricingCountryMismatch: true, observationDays: 70, travelProbability: 0.1 };
    const result = engine.evaluate([SUSTAINED_MISMATCH_RULE], facts);

    expect(result.action).toBe('REQUEST_VERIFICATION');
    expect(result.action).not.toBe('SUSPEND');
    expect(result.action).not.toBe('TERMINATE');
    expect(result.requiresHumanReview).toBe(true);
  });

  it('falls through to NONE when no rule matches', () => {
    const result = engine.evaluate([SUSTAINED_MISMATCH_RULE], {
      pricingCountryMismatch: false,
      observationDays: 180,
      travelProbability: 0.1,
    });
    expect(result.action).toBe('NONE');
    expect(result.requiresHumanReview).toBe(false);
    expect(result.matchedRuleId).toBeNull();
  });

  it('evaluates rules in ascending order and stops at the first match', () => {
    const first: PolicyRuleInput = { ...SUSTAINED_MISMATCH_RULE, id: 'first', order: 1, action: 'WARN', requiresHumanReview: false };
    const second: PolicyRuleInput = { ...SUSTAINED_MISMATCH_RULE, id: 'second', order: 2 };
    const facts = { pricingCountryMismatch: true, observationDays: 180, travelProbability: 0.1 };
    const result = engine.evaluate([second, first], facts); // intentionally passed out of order
    expect(result.matchedRuleId).toBe('first');
    expect(result.action).toBe('WARN');
  });
});
