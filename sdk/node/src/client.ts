import { PriceGuardApiError, PriceGuardTimeoutError } from './errors';
import { PriceGuardClientOptions, RiskDecision, RiskEventInput } from './types';

const API_KEY_HEADER = 'x-priceguard-api-key';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Official Node.js/TypeScript client for the PriceGuard AI risk-scoring API.
 *
 * Uses the platform `fetch` (Node 18+) by default; pass `fetchImpl` in tests to substitute
 * a stub without reaching for a mocking library. Real behaviour (timeout handling, header
 * shape, error surfacing) is exercised in test/client.e2e.spec.ts against a real, locally
 * booted instance of apps/api — see that file's header comment.
 */
export class PriceGuardClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PriceGuardClientOptions) {
    if (!options.baseUrl) throw new Error('PriceGuardClient requires a baseUrl');
    if (!options.apiKey || !options.apiKey.includes('.')) {
      throw new Error('PriceGuardClient requires an apiKey in "<prefix>.<secret>" form');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Sends one risk event to `POST /v1/risk/events` and returns the resulting risk
   * decision. Throws {@link PriceGuardApiError} on a non-2xx response and
   * {@link PriceGuardTimeoutError} if the request exceeds `timeoutMs`.
   */
  async createRiskEvent(input: RiskEventInput): Promise<RiskDecision> {
    return this.request<RiskDecision>('POST', '/v1/risk/events', input);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          [API_KEY_HEADER]: this.apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new PriceGuardTimeoutError(this.timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    const parsed: unknown = text.length > 0 ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new PriceGuardApiError(response.status, parsed);
    }
    return parsed as T;
  }
}
