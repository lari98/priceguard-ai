export interface ScoringSessionInput {
  derivedCountry: string;
  occurredAt: Date;
  vpnLikelihood: number;
  deviceHash: string;
}

export interface ScoringInput {
  pricingCountry: string;
  paymentCountry?: string;
  accountCreatedAt: Date;
  now: Date;
  sessions: ScoringSessionInput[];
}

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EvidenceItem {
  code: string;
  /** Internal analyst-facing description — may reference exact thresholds/mechanisms. */
  internalDescription: string;
  /** Coarser, customer-facing description — never reveals exact detection thresholds (brief §18). */
  customerDescription: string;
  /** Points this evidence item contributed to the final 0-100 score. */
  pointsContribution: number;
}

export interface ScoringResult {
  score: number;
  confidence: ConfidenceBand;
  likelyPrimaryCountry: Record<string, number>;
  pricingCountryMismatch: boolean;
  travelProbability: number;
  vpnProbability: number;
  facts: Record<string, unknown>;
  evidence: EvidenceItem[];
}
