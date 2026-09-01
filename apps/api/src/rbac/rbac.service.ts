import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { DEFAULT_ROLE_PERMISSIONS, Permission, TenantRole } from '../common/permissions';

@Injectable()
export class RbacService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async hasPermission(tenantId: string, role: TenantRole, permission: Permission): Promise<boolean> {
    const [override] = await this.db
      .select()
      .from(schema.rolePermissionOverrides)
      .where(
        and(
          eq(schema.rolePermissionOverrides.tenantId, tenantId),
          eq(schema.rolePermissionOverrides.role, role),
          eq(schema.rolePermissionOverrides.permission, permission),
        ),
      )
      .limit(1);

    if (override) return override.granted;
    return DEFAULT_ROLE_PERMISSIONS[role].includes(permission);
  }

  async listOverrides(tenantId: string) {
    return this.db.select().from(schema.rolePermissionOverrides).where(eq(schema.rolePermissionOverrides.tenantId, tenantId));
  }

  async setOverride(tenantId: string, role: TenantRole, permission: Permission, granted: boolean) {
    const [row] = await this.db
      .insert(schema.rolePermissionOverrides)
      .values({ tenantId, role, permission, granted })
      .onConflictDoUpdate({
        target: [schema.rolePermissionOverrides.tenantId, schema.rolePermissionOverrides.role, schema.rolePermissionOverrides.permission],
        set: { granted },
      })
      .returning();
    return row;
  }

  getEffectivePermissions(tenantId: string) {
    return this.listOverrides(tenantId).then((overrides) => {
      const effective: Record<TenantRole, Permission[]> = {
        ADMIN: [...DEFAULT_ROLE_PERMISSIONS.ADMIN],
        ANALYST: [...DEFAULT_ROLE_PERMISSIONS.ANALYST],
        VIEWER: [...DEFAULT_ROLE_PERMISSIONS.VIEWER],
      };
      for (const o of overrides) {
        const role = o.role as TenantRole;
        const permission = o.permission as Permission;
        const has = effective[role].includes(permission);
        if (o.granted && !has) effective[role].push(permission);
        if (!o.granted && has) effective[role] = effective[role].filter((p) => p !== permission);
      }
      return effective;
    });
  }
}
