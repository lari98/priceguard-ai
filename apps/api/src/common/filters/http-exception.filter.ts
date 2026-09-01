import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Normalises every error response to a consistent shape and makes sure unexpected
 * (non-HttpException) errors never leak internal stack traces/messages to callers —
 * they get logged server-side and a generic 500 is returned instead.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json({
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
        ...(typeof body === 'string' ? { message: body } : body),
      });
      return;
    }

    // Phase 9 (Production Hardening) fix: some middleware below Nest's own exception
    // handling (notably body-parser's PayloadTooLargeError for a request over the JSON
    // body-size limit) throws a plain Error carrying a genuine, safe-to-return HTTP status
    // (`.status`/`.statusCode`, e.g. 413) rather than a NestJS HttpException. Previously
    // every such error fell through to a blanket 500 — a real gap found by
    // test/security-smoke.e2e-spec.ts's oversized-payload case, which expects a real 4xx
    // client error, not a crash-shaped 500, for a client-caused problem. Anything in the
    // 4xx range from such an error is passed through with its own status; anything else
    // (including no status at all) still safely falls back to a generic 500 with no
    // internal detail leaked.
    const candidateStatus = (exception as { status?: unknown; statusCode?: unknown } | null)?.status ?? (exception as { statusCode?: unknown } | null)?.statusCode;
    if (typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus < 500) {
      this.logger.warn(`Non-Nest client error passed through: ${candidateStatus} ${exception instanceof Error ? exception.message : String(exception)}`);
      response.status(candidateStatus).json({
        statusCode: candidateStatus,
        path: request.url,
        timestamp: new Date().toISOString(),
        message: exception instanceof Error ? exception.message : 'Bad request',
      });
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
      exception instanceof Error && exception.cause ? `cause: ${String((exception.cause as Error).message ?? exception.cause)}` : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      path: request.url,
      timestamp: new Date().toISOString(),
      message: 'Internal server error',
    });
  }
}
