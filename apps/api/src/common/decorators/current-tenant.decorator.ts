import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extracts the authenticated tenant id from the request's AuthContext (set by either
 * ApiKeyGuard or JwtAuthGuard). Controllers must never read a tenant id from client
 * input for authorization purposes — see docs/architecture/SECURITY_ARCHITECTURE.md
 * "Defense in depth for multi-tenant isolation", layer 2.
 */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.authContext) {
    throw new UnauthorizedException('No authentication context on request');
  }
  return request.authContext.tenantId;
});

export const CurrentAuthContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.authContext) {
    throw new UnauthorizedException('No authentication context on request');
  }
  return request.authContext;
});
