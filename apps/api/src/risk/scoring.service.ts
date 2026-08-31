import { Injectable } from '@nestjs/common';
import { ConfidenceBand, EvidenceItem, ScoringInput, ScoringResult, ScoringSessionInput } from './scoring.types';

/**
 * Rule-based (not ML) explainable risk scoring for the Phase 2 MVP.
 *
 * Per docs/PHASE_0_DISCOVERY.md §M/§N, ML (gradient-boosted trees, sequence models, etc.)
 * is explicitly a Phase 4 deliverable. This service implements the *behavioural,
 * evidence-based* scoring the MVP needs using transparent, hand-specified weights —
 * every number below is a documented design decision, not a learned parameter, and is
 * expected to be superseded by a trained, evaluated model in Phase 4 (with this service's
 * output kept as an explainable baseline / fallback, not deleted).
 *
 * Core technique: recency-weighted country dominance. Each session's contribution to its
 * country's "share" decays exponentially with age (half-life below), so:
 *  - A short trip (Scenario 2/5) barely dents months of accumulated weight in the
 *    genuine home country → no mismatch is even detected, because "dominant country"
 *    doesn't change.
 *  - A sustained six-month shift (Scenario 3) accumulates enough recent weight to become
 *    dominant, correctly flips "dominant country" away from the pricing country → mismatch
 *    detected, and low travel-probability because the shift is not a bounded, returning trip.
 *  - A single VPN-flagged session (Scenario 4) does not change the dominant country at all
 *    (one session's weight is negligible against months of history) → no mismatch, only a
 *    small, explicit "isolated VPN signal" evidence item, capped so it alone cannot drive
 *    a high score (this directly implements the master brief's core principle: never
 *    conclude abuse from a single signal).
 *
 * IMPORTANT DESIGN RULE (see docs/adr and docs/PHASE_0_DISCOVERY.md §I/§13): this service
 * deliberately does NOT try to distinguish "deliberate regional-pricing abuse" (Scenario 3)
 * from "genuine permanent relocation" (Scenario 6) by score alone — behaviourally, they can
 * look identical, and the brief explicitly lists relocation as a legitimate scenario that
 * must not be punished the same as abuse. The score/evidence produced here answers only
 * "how inconsistent is billed pricing country with observed primary-usage country, and how
 * confident/sustained is that". The POLICY layer (see apps/api/src/policy) is responsible
 * for capping the *action* at verification/manual-review rather than suspension/termination
 * for this fact pattern, precisely because the raw signals cannot make that distinction —
 * only a verification step (or the customer's own declaration) can.
 */
@Injectable()
export class ScoringService {
  private readonly DECAY_HALF_LIFE_DAYS = 60;
  private readonly MIN_SESSIONS_FOR_FULL_CONFIDENCE = 5;
  private readonly TRAVEL_WINDOW_DAYS = 30;
  private readonly SUSTAINED_SHIFT_DAYS = 45;
  private readonly IP_ROTATION_MIN_DISTINCT_COUNTRIES = 4;
  private readonly IP_ROTATION_MIN_ENTROPY = 0.7;

  readonly MODEL_VERSION = 'rule-based-v0.1.0-mvp';

  score(input: ScoringInput): ScoringResult {
    const { pricingCountry, paymentCountry, accountCreatedAt, now, sessions } = input;

    if (sessions.length === 0) {
      return this.noEvidenceResult(pricingCountry);
    }

    const shares = this.weightedCountryShares(sessions, now);
    const [dominantCountry, dominantShare] = this.argmax(shares);
    // Observation window is measured from whichever is EARLIER: the account's own
    // creation time, or the earliest session we actually have evidence for. The latter
    // matters because account.createdAt reflects when the database row was inserted,
    // which is not necessarily the same moment as "how long we've had behavioural
    // evidence for" (e.g. a backfilled session history, or — as importantly — simply an
    // implementation detail of *when* the first API call happened to reach us). Using
    // the earlier of the two avoids understating real observation length.
    const earliestSessionAt = sessions.reduce(
      (earliest, s) => (s.occurredAt < earliest ? s.occurredAt : earliest),
      sessions[0].occurredAt,
    );
    const effectiveStart = accountCreatedAt < earliestSessionAt ? accountCreatedAt : earliestSessionAt;
    const observationDays = Math.max(0, this.daysBetween(effectiveStart, now));
    const sampleSizeFactor = Math.min(1, sessions.length / this.MIN_SESSIONS_FOR_FULL_CONFIDENCE);
    const primaryCountryConfidence = dominantShare * sampleSizeFactor;

    const trailingRun = this.trailingRun(sessions, now);
    const travelProbability = this.estimateTravelProbability(trailingRun, dominantCountry);

    const mostRecentSession = [...sessions].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    const vpnProbability = mostRecentSession.vpnLikelihood;

    const distinctCountries = new Set(sessions.map((s) => s.derivedCountry)).size;
    const distinctDevices = new Set(sessions.map((s) => s.deviceHash)).size;
    const entropy = this.normalisedEntropy(shares);
    const ipRotationSuspected =
      distinctCountries >= this.IP_ROTATION_MIN_DISTINCT_COUNTRIES &&
      entropy >= this.IP_ROTATION_MIN_ENTROPY &&
      distinctDevices === 1;

    const pricingCountryMismatch = dominantCountry !== pricingCountry;
    const paymentCountryMismatch = Boolean(paymentCountry) && paymentCountry !== pricingCountry;

    const confidence = this.confidenceBand(primaryCountryConfidence, sessions.length);

    const evidence: EvidenceItem[] = [];
    let score = 0;

    if (pricingCountryMismatch) {
      const mismatchPoints = Math.round(40 * primaryCountryConfidence);
      score += mismatchPoints;
      evidence.push({
        code: 'PRIMARY_COUNTRY_MISMATCH',
        internalDescription: `Recency-weighted dominant usage country is ${dominantCountry} (share ${(dominantShare * 100).toFixed(1)}%, confidence ${(primaryCountryConfidence * 100).toFixed(1)}%), which differs from the billed pricing country ${pricingCountry}.`,
        customerDescription:
          'The account’s usage pattern is not consistent with the billed pricing region.',
        pointsContribution: mismatchPoints,
      });

      const observationPoints = Math.round(20 * Math.min(1, observationDays / 180));
      score += observationPoints;
      evidence.push({
        code: 'SUSTAINED_OBSERVATION_WINDOW',
        internalDescription: `Mismatch observed over ${observationDays} days (of a 180-day reference window).`,
        customerDescription: 'This pattern has been observed over an extended period, not a single session.',
        pointsContribution: observationPoints,
      });

      // Scaled by sampleSizeFactor too: with very little evidence (e.g. a single
      // session), we cannot confidently rule travel in OR out, so "low travel
      // probability" should not contribute strongly yet — see risk-ingestion.e2e-spec.ts
      // "single VPN-flagged session" case, which this scaling is specifically for.
      const travelAdjustedPoints = Math.round(25 * (1 - travelProbability) * sampleSizeFactor);
      score += travelAdjustedPoints;
      evidence.push({
        code: 'LOW_TRAVEL_EXPLANATION_LIKELIHOOD',
        internalDescription: `Estimated travel probability ${(travelProbability * 100).toFixed(1)}% (trailing contiguous run in ${trailingRun.country} for ${trailingRun.runDays} days${trailingRun.country === dominantCountry ? ', currently in the dominant country' : ''}); sample-size confidence factor ${(sampleSizeFactor * 100).toFixed(0)}%.`,
        customerDescription: 'The observed pattern does not resemble a short trip or vacation.',
        pointsContribution: travelAdjustedPoints,
      });

      if (paymentCountryMismatch) {
        score += 10;
        evidence.push({
          code: 'PAYMENT_COUNTRY_CONSISTENT_WITH_MISMATCH',
          internalDescription: `Payment-country signal (${paymentCountry}) also differs from the billed pricing country ${pricingCountry}.`,
          customerDescription: 'Payment method details are also inconsistent with the billed pricing region.',
          pointsContribution: 10,
        });
      }

      const vpnPoints = Math.round(5 * vpnProbability);
      if (vpnPoints > 0) {
        score += vpnPoints;
        evidence.push({
          code: 'RECENT_SESSION_VPN_SIGNAL',
          internalDescription: `Most recent session VPN/proxy likelihood ${(vpnProbability * 100).toFixed(1)}% — a minor corroborating signal, deliberately weighted low on its own per the platform's core "never a single signal" principle.`,
          customerDescription: 'Some network-level signals are also present.',
          pointsContribution: vpnPoints,
        });
      }
    } else {
      // No sustained mismatch. Any VPN/proxy or rotation signal is reported as
      // evidence for monitoring, explicitly capped low — this is Scenario 4
      // ("insufficient evidence alone for enforcement").
      const isolatedVpnPoints = Math.round(15 * vpnProbability);
      if (isolatedVpnPoints > 0) {
        score += isolatedVpnPoints;
        evidence.push({
          code: 'ISOLATED_VPN_SIGNAL_NO_SUSTAINED_MISMATCH',
          internalDescription: `A session showed VPN/proxy likelihood ${(vpnProbability * 100).toFixed(1)}%, but the recency-weighted dominant country (${dominantCountry}) still matches the billed pricing country. Single-session network signals are capped and never alone drive a high score.`,
          customerDescription: 'A network-level signal was observed in one session; no other evidence of abuse was found.',
          pointsContribution: isolatedVpnPoints,
        });
      }
    }

    if (ipRotationSuspected) {
      const rotationPoints = 15;
      score += rotationPoints;
      evidence.push({
        code: 'HIGH_IP_ROTATION_WITH_STABLE_DEVICE',
        internalDescription: `${distinctCountries} distinct session countries observed (entropy ${(entropy * 100).toFixed(1)}%) from a single stable device — consistent with residential-proxy rotation rather than genuine travel; device-level consistency is used here specifically because IP-derived country becomes unreliable under rotation.`,
        customerDescription: 'Network origin has varied unusually often while the device used has stayed the same.',
        pointsContribution: rotationPoints,
      });
    }

    score = this.clamp(Math.round(score), 0, 100);

    const facts: Record<string, unknown> = {
      pricingCountryMismatch,
      paymentCountryMismatch,
      primaryCountryConfidence,
      observationDays,
      travelProbability,
      vpnLikelihood: vpnProbability,
      ipRotationSuspected,
      distinctCountryCount: distinctCountries,
      sessionCountryEntropy: entropy,
      sessionCount: sessions.length,
      riskScore: score,
    };

    return {
      score,
      confidence,
      likelyPrimaryCountry: this.roundShares(shares),
      pricingCountryMismatch,
      travelProbability,
      vpnProbability,
      facts,
      evidence,
    };
  }

  private noEvidenceResult(pricingCountry: string): ScoringResult {
    return {
      score: 0,
      confidence: 'LOW',
      likelyPrimaryCountry: { [pricingCountry]: 1 },
      pricingCountryMismatch: false,
      travelProbability: 0,
      vpnProbability: 0,
      facts: {
        pricingCountryMismatch: false,
        paymentCountryMismatch: false,
        primaryCountryConfidence: 0,
        observationDays: 0,
        travelProbability: 0,
        vpnLikelihood: 0,
        ipRotationSuspected: false,
        distinctCountryCount: 0,
        sessionCountryEntropy: 0,
        sessionCount: 0,
        riskScore: 0,
      },
      evidence: [
        {
          code: 'NO_SESSION_EVIDENCE',
          internalDescription: 'No sessions available yet to evaluate.',
          customerDescription: 'Not enough activity has been observed yet to make an assessment.',
          pointsContribution: 0,
        },
      ],
    };
  }

  private weightedCountryShares(sessions: ScoringSessionInput[], now: Date): Record<string, number> {
    const weights: Record<string, number> = {};
    let total = 0;
    for (const s of sessions) {
      const ageDays = Math.max(0, this.daysBetween(s.occurredAt, now));
      const w = Math.pow(0.5, ageDays / this.DECAY_HALF_LIFE_DAYS);
      weights[s.derivedCountry] = (weights[s.derivedCountry] ?? 0) + w;
      total += w;
    }
    const shares: Record<string, number> = {};
    for (const [country, w] of Object.entries(weights)) {
      shares[country] = total > 0 ? w / total : 0;
    }
    return shares;
  }

  private argmax(shares: Record<string, number>): [string, number] {
    let bestCountry = '';
    let bestShare = -1;
    for (const [country, share] of Object.entries(shares)) {
      if (share > bestShare) {
        bestCountry = country;
        bestShare = share;
      }
    }
    return [bestCountry, bestShare];
  }

  private trailingRun(sessions: ScoringSessionInput[], now: Date): { country: string; runDays: number } {
    const sorted = [...sessions].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const mostRecentCountry = sorted[0].derivedCountry;
    let runStart = sorted[0].occurredAt;
    for (const s of sorted) {
      if (s.derivedCountry === mostRecentCountry) {
        runStart = s.occurredAt;
      } else {
        break;
      }
    }
    const runDays = Math.max(0, this.daysBetween(runStart, now));
    return { country: mostRecentCountry, runDays };
  }

  private estimateTravelProbability(
    trailingRun: { country: string; runDays: number },
    dominantCountry: string,
  ): number {
    if (trailingRun.country === dominantCountry) {
      // Currently in the (recency-weighted) dominant country — no active divergence to
      // explain away as travel. This also correctly covers Scenario 3 (sustained
      // residence in the mismatched country) and Scenario 5 (currently back home after
      // a trip elsewhere).
      return 0.1;
    }
    if (trailingRun.runDays < this.TRAVEL_WINDOW_DAYS) {
      // Short divergent run — looks like an ongoing short trip (Scenario 2).
      return 0.8;
    }
    if (trailingRun.runDays < this.SUSTAINED_SHIFT_DAYS) {
      // Ambiguous zone: long enough to not be a quick trip, not yet long enough to have
      // flipped the recency-weighted dominant country — this is deliberately reported as
      // a MEDIUM travel probability (Scenario 6, gradual relocation in progress).
      return 0.4;
    }
    // A long divergent run that still hasn't overtaken the weighted-dominant country
    // (e.g. because the dominant country has an enormous historical base) — treat as low
    // travel probability; this is evidence a real shift may be underway.
    return 0.15;
  }

  private normalisedEntropy(shares: Record<string, number>): number {
    const values = Object.values(shares).filter((v) => v > 0);
    if (values.length <= 1) return 0;
    const raw = -values.reduce((sum, p) => sum + p * Math.log2(p), 0);
    const max = Math.log2(values.length);
    return max > 0 ? raw / max : 0;
  }

  private confidenceBand(primaryCountryConfidence: number, sessionCount: number): ConfidenceBand {
    if (sessionCount < 3) return 'LOW';
    if (primaryCountryConfidence >= 0.75) return 'HIGH';
    if (primaryCountryConfidence >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  private roundShares(shares: Record<string, number>): Record<string, number> {
    const rounded: Record<string, number> = {};
    for (const [country, share] of Object.entries(shares)) {
      rounded[country] = Math.round(share * 1000) / 1000;
    }
    return rounded;
  }

  private daysBetween(a: Date, b: Date): number {
    return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
