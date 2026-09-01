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

export interface MlModelRecord {
  version: string;
  trainingExampleCount: number;
  holdoutAccuracy: number;
  trainedAt: string;
}

export interface ShadowEvalSummary {
  modelVersion: string;
  evaluated: number;
  agreementRate: number;
  meanProductionScore: number;
  meanShadowScore: number;
}

export interface DriftReport {
  modelVersion: string;
  sampleSize: number;
  meanProductionScore: number;
  meanShadowScore: number;
  meanAbsoluteDifference: number;
  driftDetected: boolean;
}

export interface RolloutConfig {
  tenantId: string;
  shadowModelVersion: string | null;
  rolloutPercentage: number;
  approvedByUserId: string | null;
  approvedAt: string | null;
}

export interface FraudCluster {
  endAccountIds: string[];
  clusterSize: number;
  sharedDeviceHashes: string[];
  sharedPaymentTokens: string[];
}

export interface SsoConfigView {
  tenantId: string;
  issuerUrl: string;
  clientId: string;
  redirectUri: string;
  enabled: boolean;
}

export interface RoleOverride {
  id: string;
  role: TenantRole;
  permission: string;
  granted: boolean;
}

export type EffectivePermissions = Record<TenantRole, string[]>;

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

  listMlModels: (token: string) => request<MlModelRecord[]>('/ml/models', token),

  trainMlModel: (token: string) => request<MlModelRecord>('/ml/train', token, { method: 'POST' }),

  runShadowEval: (token: string) => request<ShadowEvalSummary>('/ml/shadow-eval/run', token, { method: 'POST' }),

  getDrift: (token: string, modelVersion: string) => request<DriftReport>(`/ml/drift?modelVersion=${modelVersion}`, token),

  getRolloutConfig: (token: string) => request<RolloutConfig>('/ml/rollout', token),

  approveRollout: (token: string, modelVersion: string, rolloutPercentage: number) =>
    request<RolloutConfig>('/ml/rollout/approve', token, {
      method: 'POST',
      body: JSON.stringify({ modelVersion, rolloutPercentage }),
    }),

  listFraudClusters: (token: string, minClusterSize = 3) =>
    request<FraudCluster[]>(`/fraud-graph/clusters?minClusterSize=${minClusterSize}`, token),

  runFraudClusterDetection: (token: string, minClusterSize = 3) =>
    request<FraudCluster[]>(`/fraud-graph/clusters/run?minClusterSize=${minClusterSize}`, token, { method: 'POST' }),

  getSsoConfig: (token: string) => request<SsoConfigView | null>('/sso/config', token),

  setSsoConfig: (token: string, input: { issuerUrl: string; clientId: string; clientSecret: string; redirectUri: string; enabled: boolean }) =>
    request<SsoConfigView>('/sso/config', token, { method: 'POST', body: JSON.stringify(input) }),

  listAllPermissions: (token: string) => request<string[]>('/rbac/permissions', token),

  getEffectivePermissions: (token: string) => request<EffectivePermissions>('/rbac/effective', token),

  listRoleOverrides: (token: string) => request<RoleOverride[]>('/rbac/overrides', token),

  setRoleOverride: (token: string, role: TenantRole, permission: string, granted: boolean) =>
    request<RoleOverride>('/rbac/overrides', token, { method: 'POST', body: JSON.stringify({ role, permission, granted }) }),

  logoutAll: (token: string) => request<{ loggedOut: boolean }>('/auth/logout-all', token, { method: 'POST' }),
};
