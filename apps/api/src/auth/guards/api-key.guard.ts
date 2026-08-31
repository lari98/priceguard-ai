import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { TenantService } from '../../tenant/tenant.service';

const API_KEY_HEADER = 'x-priceguard-api-key';

/**
 * Authenticates server-to-server callers via a tenant-scoped API key.
 * Key format: "<keyPrefix>.<secret>" — the prefix alone identifies which tenant's key to
 * check (and is safe to log/display), the secret is bcrypt-compared against the stored
 * hash and is never logged. See docs/architecture/SECURITY_ARCHITECTURE.md.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[API_KEY_HEADER];
    const rawKey = Array.isArray(header) ? header[0] : header;

    if (!rawKey || !rawKey.includes('.')) {
      throw new UnauthorizedException('Missing or malformed API key');
    }

    const [keyPrefix, secret] = rawKey.split('.', 2);
    const apiKey = await this.tenantService.findApiKeyByPrefix(keyPrefix);

    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    const matches = await bcrypt.compare(secret, apiKey.keyHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.authContext = {
      tenantId: apiKey.tenantId,
      actorType: 'API_KEY',
      actorId: apiKey.id,
    };
    return true;
  }
}
