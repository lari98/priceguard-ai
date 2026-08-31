import { ScoringService } from './scoring.service';
import { ScoringSessionInput } from './scoring.types';

/**
 * These tests directly encode the 8 required scenarios from
 * docs/PHASE_0_DISCOVERY.md §34 (master brief §34). Country codes DE/PK are used only
 * because they are the illustrative pair from the Phase 0 discovery document — the
 * platform itself is explicitly NOT Germany/Pakistan-specific (see README.md).
 *
 * All session data below is synthetic, generated in-test — no real personal data is used
 * anywhere in this suite, per the master brief's testing rules.
 */

const NOW = new Date('2026-08-18T00:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function dailySessions(
  country: string,
  deviceHash: string,
  vpnLikelihood: number,
  fromDaysAgoInclusive: number,
  toDaysAgoInclusive: number,
): ScoringSessionInput[] {
  const sessions: ScoringSessionInput[] = [];
  for (let d = fromDaysAgoInclusive; d >= toDaysAgoInclusive; d--) {
    sessions.push({ derivedCountry: country, deviceHash, vpnLikelihood, occurredAt: daysAgo(d) });
  }
  return sessions;
}

describe('ScoringService — Phase 0 §34 required scenarios', () => {
  let scoring: ScoringService;

  beforeEach(() => {
    scoring = new ScoringService();
  });

  it('Scenario 1 — German customer, German subscription, used only from Germany: no fraud alert', () => {
    const result = scoring.score({
      pricingCountry: 'DE',
      accountCreatedAt: daysAgo(200),
      now: NOW,
      sessions: dailySessions('DE', 'dev-1', 0.02, 180, 0),
    });

    expect(result.pricingCountryMismatch).toBe(false);
    expect(result.score).toBeLessThan(15);
    expect(result.confidence).toBe('HIGH');
  });

  it('Scenario 2 — German subscriber spends two weeks in Pakistan: likely travel, no automatic suspension', () => {
    const sessions = [
      ...dailySessions('DE', 'dev-1', 0.02, 185, 15),
      ...dailySessions('PK', 'dev-1', 0.05, 14, 0),
    ];
    const result = scoring.score({
      pricingCountry: 'DE',
      accountCreatedAt: daysAgo(190),
      now: NOW,
      sessions,
    });

    // Two weeks of travel barely dents ~170 days of accumulated German history —
    // the dominant/recency-weighted country stays Germany, so no mismatch is even raised.
    expect(result.pricingCountryMismatch).toBe(false);
    expect(result.score).toBeLessThan(20);
    // The separate travel signal correctly reflects an active short trip, even though it
    // never needed to be "excused" because no mismatch was raised in the first place.
    expect(result.travelProbability).toBeGreaterThanOrEqual(0.7);
  });

  it('Scenario 3 — Pakistan pricing, ~6 months of near-exclusive German usage: high mismatch risk', () => {
    const sessions = [...dailySessions('PK', 'dev-1', 0.02, 180, 176), ...dailySessions('DE', 'dev-1', 0.02, 175, 0)];
    const result = scoring.score({
      pricingCountry: 'PK',
      accountCreatedAt: daysAgo(180),
      now: NOW,
      sessions,
    });

    expect(result.pricingCountryMismatch).toBe(true);
    expect(result.confidence).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.likelyPrimaryCountry['DE']).toBeGreaterThan(0.9);
    expect(result.evidence.map((e) => e.code)).toEqual(
      expect.arrayContaining(['PRIMARY_COUNTRY_MISMATCH', 'SUSTAINED_OBSERVATION_WINDOW', 'LOW_TRAVEL_EXPLANATION_LIKELIHOOD']),
    );
  });

  it('Scenario 4 — German user, single session via a Pakistani VPN: signal present, insufficient alone', () => {
    const sessions = [
      ...dailySessions('DE', 'dev-1', 0.02, 180, 1),
      { derivedCountry: 'PK', deviceHash: 'dev-1', vpnLikelihood: 0.9, occurredAt: daysAgo(0) },
    ];
    const result = scoring.score({
      pricingCountry: 'DE',
      accountCreatedAt: daysAgo(190),
      now: NOW,
      sessions,
    });

    // ~180 days of German history is not overturned by one VPN-flagged session.
    expect(result.pricingCountryMismatch).toBe(false);
    // The VPN signal is present in the evidence but explicitly capped low —
    // this is the platform's core "never a single signal" principle in action.
    expect(result.evidence.some((e) => e.code === 'ISOLATED_VPN_SIGNAL_NO_SUSTAINED_MISMATCH')).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(30);
  });

  it('Scenario 5 — Pakistani resident legitimately visiting Germany: travel considered, no issue raised', () => {
    const sessions = [...dailySessions('PK', 'dev-1', 0.02, 180, 11), ...dailySessions('DE', 'dev-1', 0.02, 10, 0)];
    const result = scoring.score({
      pricingCountry: 'PK',
      accountCreatedAt: daysAgo(200),
      now: NOW,
      sessions,
    });

    expect(result.pricingCountryMismatch).toBe(false);
    expect(result.travelProbability).toBeGreaterThanOrEqual(0.7);
    expect(result.score).toBeLessThan(20);
  });

  it('Scenario 6 — student gradually relocates Pakistan -> Germany: elevated but distinguishable from Scenario 3', () => {
    const sessions = [...dailySessions('PK', 'dev-1', 0.02, 300, 71), ...dailySessions('DE', 'dev-1', 0.02, 70, 0)];
    const gradual = scoring.score({
      pricingCountry: 'PK', // declared pricing not yet updated by the student
      accountCreatedAt: daysAgo(310),
      now: NOW,
      sessions,
    });

    const sustainedAbuseLooking = scoring.score({
      pricingCountry: 'PK',
      accountCreatedAt: daysAgo(180),
      now: NOW,
      sessions: [...dailySessions('PK', 'dev-1', 0.02, 180, 176), ...dailySessions('DE', 'dev-1', 0.02, 175, 0)],
    });

    // The system does flag a mismatch once the recency-weighted usage has genuinely
    // shifted to Germany — that part of the evidence is real and should not be hidden.
    expect(gradual.pricingCountryMismatch).toBe(true);
    // But a genuinely gradual, recent transition carries less accumulated evidence and
    // lower confidence than six full months of sustained mismatch (Scenario 3) — the
    // scoring service surfaces that difference on its own, without needing to guess intent.
    expect(gradual.confidence).not.toBe('HIGH');
    expect(gradual.score).toBeLessThan(sustainedAbuseLooking.score);
    // IMPORTANT: raw behavioural signals alone cannot and must not be trusted to tell
    // "abuse" and "genuine relocation" apart with certainty — see scoring.service.ts's
    // top-of-file design note. The system's answer to that uncertainty is enforced in the
    // POLICY layer (capping the action at verification/manual-review, never suspension,
    // for this fact pattern), not by pretending the score alone can resolve intent — see
    // policy.service.spec.ts for the corresponding policy-layer assertion.
  });

  it('Scenario 7 — rotating residential proxies, stable device: behavioural/device signals still flag anomaly', () => {
    const countries = ['DE', 'FR', 'NL', 'BE', 'IT', 'ES'];
    const sessions: ScoringSessionInput[] = [];
    for (let d = 29; d >= 0; d--) {
      sessions.push({
        derivedCountry: countries[d % countries.length],
        deviceHash: 'dev-rotator', // the device stays the same even though the IP-derived country rotates
        vpnLikelihood: 0.6,
        occurredAt: daysAgo(d),
      });
    }
    const result = scoring.score({
      pricingCountry: 'PK',
      accountCreatedAt: daysAgo(30),
      now: NOW,
      sessions,
    });

    expect(result.facts.ipRotationSuspected).toBe(true);
    expect(result.evidence.some((e) => e.code === 'HIGH_IP_ROTATION_WITH_STABLE_DEVICE')).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  // Scenario 8 — "large group of accounts share devices and payment methods; graph engine
  // detects suspicious cluster" — deliberately NOT implemented here. Per
  // docs/PHASE_0_DISCOVERY.md §O and ADR-0002/0003, the account-relationship fraud graph
  // is a Phase 5 deliverable. Faking a graph-cluster detection result in the MVP's
  // per-account scoring service would violate the master brief's explicit rule against
  // pretending unimplemented functionality exists (brief §50). This test is intentionally
  // left as a todo, pointing at the phase that must implement it.
  it.todo('Scenario 8 — shared-device/payment account-farm cluster detection requires the Phase 5 Fraud Graph (not implemented in this MVP)');
});
