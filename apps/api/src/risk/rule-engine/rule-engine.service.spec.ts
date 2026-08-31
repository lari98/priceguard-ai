import { RuleEngineService } from './rule-engine.service';
import { RuleCondition } from './rule-engine.types';

describe('RuleEngineService', () => {
  let engine: RuleEngineService;

  beforeEach(() => {
    engine = new RuleEngineService();
  });

  it('evaluates a simple fact comparison', () => {
    const condition: RuleCondition = { fact: 'riskScore', op: 'gte', value: 80 };
    expect(engine.evaluate(condition, { riskScore: 85 })).toBe(true);
    expect(engine.evaluate(condition, { riskScore: 79 })).toBe(false);
  });

  it('evaluates nested AND correctly (all must be true)', () => {
    const condition: RuleCondition = {
      and: [
        { fact: 'primaryCountryConfidence', op: 'gte', value: 0.9 },
        { fact: 'pricingCountryMismatch', op: 'eq', value: true },
        { fact: 'observationDays', op: 'gte', value: 60 },
        { fact: 'travelProbability', op: 'lt', value: 0.2 },
      ],
    };
    const passingFacts = {
      primaryCountryConfidence: 0.94,
      pricingCountryMismatch: true,
      observationDays: 180,
      travelProbability: 0.05,
    };
    expect(engine.evaluate(condition, passingFacts)).toBe(true);

    const failingFacts = { ...passingFacts, observationDays: 10 };
    expect(engine.evaluate(condition, failingFacts)).toBe(false);
  });

  it('evaluates OR correctly (any true is enough)', () => {
    const condition: RuleCondition = {
      or: [
        { fact: 'vpnLikelihood', op: 'gte', value: 0.9 },
        { fact: 'emulatorSuspected', op: 'eq', value: true },
      ],
    };
    expect(engine.evaluate(condition, { vpnLikelihood: 0.1, emulatorSuspected: true })).toBe(true);
    expect(engine.evaluate(condition, { vpnLikelihood: 0.1, emulatorSuspected: false })).toBe(false);
  });

  it('evaluates NOT correctly', () => {
    const condition: RuleCondition = { not: { fact: 'travelProbability', op: 'gte', value: 0.5 } };
    expect(engine.evaluate(condition, { travelProbability: 0.9 })).toBe(false);
    expect(engine.evaluate(condition, { travelProbability: 0.1 })).toBe(true);
  });

  it('supports deep nesting: AND(OR(...), NOT(...))', () => {
    const condition: RuleCondition = {
      and: [
        {
          or: [
            { fact: 'vpnLikelihood', op: 'gte', value: 0.8 },
            { fact: 'residentialProxySuspected', op: 'eq', value: true },
          ],
        },
        { not: { fact: 'travelProbability', op: 'gte', value: 0.5 } },
      ],
    };
    expect(
      engine.evaluate(condition, {
        vpnLikelihood: 0.85,
        residentialProxySuspected: false,
        travelProbability: 0.1,
      }),
    ).toBe(true);

    expect(
      engine.evaluate(condition, {
        vpnLikelihood: 0.85,
        residentialProxySuspected: false,
        travelProbability: 0.9, // travel probability too high -> NOT fails
      }),
    ).toBe(false);
  });

  it('supports the "in" and "nin" operators', () => {
    expect(
      engine.evaluate({ fact: 'pricingCountry', op: 'in', value: ['PK', 'IN', 'BR'] }, { pricingCountry: 'PK' }),
    ).toBe(true);
    expect(
      engine.evaluate({ fact: 'pricingCountry', op: 'nin', value: ['PK', 'IN', 'BR'] }, { pricingCountry: 'DE' }),
    ).toBe(true);
  });

  it('throws a clear error for an unknown fact, rather than silently returning false', () => {
    expect(() => engine.evaluate({ fact: 'doesNotExist', op: 'eq', value: 1 }, { riskScore: 10 })).toThrow(
      /Unknown fact "doesNotExist"/,
    );
  });

  it('throws for a non-numeric comparison on a numeric operator', () => {
    expect(() =>
      engine.evaluate({ fact: 'pricingCountry', op: 'gte', value: 5 }, { pricingCountry: 'DE' }),
    ).toThrow(/not numeric/);
  });
});
