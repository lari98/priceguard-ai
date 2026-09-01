import { PriceGuardClient, PriceGuardApiError, PriceGuardTimeoutError } from '../src';
import type { RiskEventInput } from '../src';

const SAMPLE_INPUT: RiskEventInput = {
  accountId: 'acct-1',
  sdkSessionId: 'sess-1',
  ipAddress: '203.0.113.5',
  deviceId: 'device-1',
  timestamp: new Date().toISOString(),
  pricingCountry: 'US',
  eventType: 'LOGIN',
};

describe('PriceGuardClient (unit, stubbed fetch)', () => {
  it('rejects construction without a well-formed API key', () => {
    expect(() => new PriceGuardClient({ baseUrl: 'http://x', apiKey: 'no-dot' })).toThrow(/apiKey/);
  });

  it('rejects construction without a baseUrl', () => {
    expect(() => new PriceGuardClient({ baseUrl: '', apiKey: 'p.s' })).toThrow(/baseUrl/);
  });

  it('sends the API key header and JSON body, and parses a 2xx JSON response', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ riskScore: 12, policyAction: 'ALLOW' }), { status: 201 });
    }) as unknown as typeof fetch;

    const client = new PriceGuardClient({ baseUrl: 'http://localhost:9999/', apiKey: 'gg_test.secret', fetchImpl });
    const result = await client.createRiskEvent(SAMPLE_INPUT);

    expect(capturedUrl).toBe('http://localhost:9999/v1/risk/events'); // trailing slash on baseUrl stripped
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['x-priceguard-api-key']).toBe('gg_test.secret');
    expect(JSON.parse(capturedInit?.body as string)).toMatchObject({ accountId: 'acct-1' });
    expect(result).toEqual({ riskScore: 12, policyAction: 'ALLOW' });
  });

  it('throws PriceGuardApiError with the parsed body on a non-2xx response', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 })) as unknown as typeof fetch;
    const client = new PriceGuardClient({ baseUrl: 'http://localhost:9999', apiKey: 'gg_test.secret', fetchImpl });

    await expect(client.createRiskEvent(SAMPLE_INPUT)).rejects.toThrow(PriceGuardApiError);
    await expect(client.createRiskEvent(SAMPLE_INPUT)).rejects.toMatchObject({ status: 401, message: 'Invalid API key' });
  });

  it('throws PriceGuardTimeoutError when the request exceeds timeoutMs', async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const client = new PriceGuardClient({ baseUrl: 'http://localhost:9999', apiKey: 'gg_test.secret', fetchImpl, timeoutMs: 20 });
    await expect(client.createRiskEvent(SAMPLE_INPUT)).rejects.toThrow(PriceGuardTimeoutError);
  });
});
