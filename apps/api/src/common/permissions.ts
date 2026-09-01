/**
 * Phase 6 fine-grained RBAC: named permissions layered on top of the fixed
 * ADMIN/ANALYST/VIEWER roles from Phase 2. `DEFAULT_ROLE_PERMISSIONS` is the out-of-the-box
 * grant for each role; a tenant ADMIN can override any single (role, permission) pair via
 * `role_permission_overrides` (see rbac.service.ts) without needing a full custom-roles
 * system — e.g. granting ANALYST the ability to decide appeals without making them ADMIN,
 * or revoking VIEWER's audit-log read access for a tenant with stricter internal policy.
 */
export type TenantRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

export const PERMISSIONS = [
  'appeals:decide',
  'appeals:read',
  'investigations:read',
  'accounts:read',
  'accounts:erase',
  'accounts:export',
  'policies:write',
  'policies:read',
  'audit:read',
  'analytics:read',
  'ml:train',
  'ml:read',
  'fraud-graph:read',
  'fraud-graph:run',
  'rbac:manage',
  'sso:manage',
  'api-keys:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  ANALYST: [
    'appeals:decide',
    'appeals:read',
    'investigations:read',
    'accounts:read',
    'accounts:export',
    'policies:read',
    'audit:read',
    'analytics:read',
    'ml:read',
    'fraud-graph:read',
  ],
  VIEWER: ['appeals:read', 'investigations:read', 'accounts:read', 'policies:read', 'audit:read', 'analytics:read', 'ml:read', 'fraud-graph:read'],
};
