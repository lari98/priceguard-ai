import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { Permission, TenantRole } from '../permissions';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Runs after JwtAuthGuard/RolesGuard (which set `request.authContext`) and checks a named
 * permission against the tenant's effective grants (defaults + any override) rather than a
 * fixed role list — see common/permissions.ts and rbac.service.ts.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.authContext;
    if (!auth?.role) {
      throw new ForbiddenException(`Requires permission: ${required}`);
    }

    const allowed = await this.rbacService.hasPermission(auth.tenantId, auth.role as TenantRole, required);
    if (!allowed) {
      throw new ForbiddenException(`Requires permission: ${required}`);
    }
    return true;
  }
}
