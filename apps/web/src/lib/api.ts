/**
 * Thin, typed client for the PriceGuard API. Every function here maps 1:1 to a real NestJS
 * endpoint in apps/api/src/**\/*.controller.ts (see docs/architecture/openapi.yaml for the
 * contract) — there is no mock data path. The JWT is kept in memory (AuthProvider) and
 * passed explicitly; nothing here reaches into localStorage/sessionStorage, both to avoid
 * XSS-exfiltration of the token and because Claude-authored artifacts must not use browser
 * storage APIs.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const message =
      body && typeof body === 'object' && 'message' in body ? String((body as { message: unknown }).message) : res.statusText;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type PolicyAction = 'NONE' | 'MONITOR' | 'WARN' | 'REQUEST_VERIFICATION' | 'RESTRICT' | 'MANUAL_REVIEW' | 'SUSPEND' | 'TERMINATE';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type InvestigationStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED';
export type AppealStatus = 'OPEN' | 'UPHELD' | 'OVERTURNED';
export type TenantRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; role: TenantRole; tenantId: string };
}

export interface RiskEventRow {
  id: string;
  eventType: string;
  occurredAt: string;
  endAccountId: string;
  endAccountExternalId: string;
  pricingCountry: string;
  score: number;
  confidence: Confidence;
  likelyPrimaryCountry: Record<string, number>;
  action: PolicyAction | null;
  requiresHumanReview: boolean | null;
}

export interface EndAccountRow {
  id: string;
  tenantId: string;
  externalId: string;
  pricingCountry: string;
  createdAt: string;
}

export interface EndAccountDetail {
  account: EndAccountRow;
  recentSessions: Array<{
    id: string;
    ipAddress: string;
    derivedCountry: string | null;
    asn: string | null;
    vpnLikelihood: number | null;
    occurredAt: string;
  }>;
  recentScores: Array<{
    riskEventId: string;
    eventType: string;
    occurredAt: string;
    score: number;
    confidence: Confidence;
    likelyPrimaryCountry: Record<string, number>;
    action: PolicyAction | null;
    requiresHumanReview: boolean | null;
  }>;
}

export interface InvestigationRow {
  id: string;
  status: InvestigationStatus;
  createdAt: string;
  resolvedAt: string | null;
  action: PolicyAction;
  score: number;
  endAccountId: string;
  endAccountExternalId: string;
}

export interface AppealRow {
  id: string;
  investigationId: string;
  submittedByExternalId: string;
  message: string;
  status: AppealStatus;
  decisionNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
  investigationStatus: InvestigationStatus;
  originalAction: PolicyAction;
  originalScore: number;
}

export interface RuleRow {
  id: string;
  name: string;
  condition: object;
  action: PolicyAction;
  requiresHumanReview: boolean;
  order: number;
}

export interface PolicyRow {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  active: boolean;
  createdAt: string;
  rules?: RuleRow[];
}

export interface RuleInput {
  name: string;
  condition: object;
  action: PolicyAction;
  requiresHumanReview: boolean;
  order: number;
}

export interface AuditLogEntryRow {
  id: string;
  actorId: string | null;
  actorType: 'USER' | 'SYSTEM' | 'API_KEY';
  action: string;
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
}

export interface RiskTrendPoint {
  date: string;
  eventCount: number;
  avgScore: number | null;
  highConfidenceCount: number;
}

export interface CountryBreakdownEntry {
  country: string;
  weightedFlags: number;
}

export interface PolicyActionBreakdownEntry {
  action: string;
  count: number;
}

export interface AnalyticsSummary {
  windowDays: number;
  totalEvents: number;
  totalAccountsSeen: number;
  avgScore: number | null;
  trend: RiskTrendPoint[];
  topCountries: CountryBreakdownEntry[];
  policyActionBreakdown: PolicyActionBreakdownEntry[];
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password }) }),

  listRiskEvents: (token: string) => request<RiskEventRow[]>('/risk-events', token),

  listAccounts: (token: string) => request<EndAccountRow[]>('/accounts', token),

  getAccount: (token: string, id: string) => request<EndAccountDetail>(`/accounts/${id}`, token),

  eraseAccount: (token: string, id: string) => request<{ pseudonym: string }>(`/dsr/end-accounts/${id}`, token, { method: 'DELETE' }),

  listInvestigations: (token: string) => request<InvestigationRow[]>('/investigations', token),

  listAppeals: (token: string) => request<AppealRow[]>('/appeals', token),

  decideAppeal: (token: string, appealId: string, outcome: 'UPHELD' | 'OVERTURNED', notes: string) =>
    request<AppealRow>(`/appeals/${appealId}/decision`, token, {
      method: 'POST',
      body: JSON.stringify({ outcome, notes }),
    }),

  listPolicies: (token: string) => request<PolicyRow[]>('/policies', token),

  createPolicy: (token: string, name: string, rules: RuleInput[]) =>
    request<PolicyRow>('/policies', token, { method: 'POST', body: JSON.stringify({ name, rules }) }),

  listAuditLog: (token: string) => request<AuditLogEntryRow[]>('/audit-log', token),

  getAnalyticsSummary: (token: string, windowDays = 30) =>
    request<AnalyticsSummary>(`/analytics/summary?windowDays=${windowDays}`, token),
};
