export class PriceGuardApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const message = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: unknown }).message) : `PriceGuard API request failed with status ${status}`;
    super(message);
    this.name = 'PriceGuardApiError';
    this.status = status;
    this.body = body;
  }
}

export class PriceGuardTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`PriceGuard API request timed out after ${timeoutMs}ms`);
    this.name = 'PriceGuardTimeoutError';
  }
}
