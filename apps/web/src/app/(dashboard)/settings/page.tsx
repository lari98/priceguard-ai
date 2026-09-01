'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, TenantRole } from '@/lib/api';

const ROLES: TenantRole[] = ['ADMIN', 'ANALYST', 'VIEWER'];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gg-panel p-5">
      <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--gg-muted)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SsoSettings() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['sso-config'], queryFn: () => api.getSsoConfig(token!), enabled: !!token });
  const [form, setForm] = useState({ issuerUrl: '', clientId: '', clientSecret: '', redirectUri: '', enabled: true });

  const saveMutation = useMutation({
    mutationFn: () => api.setSsoConfig(token!, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sso-config'] }),
  });

  return (
    <Panel title="Single Sign-On (OIDC) — Phase 6">
      {config.data && (
        <p className="mb-3 text-sm">
          Configured: {config.data.issuerUrl} (client {config.data.clientId}) — {config.data.enabled ? 'enabled' : 'disabled'}.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="gg-panel rounded-md px-3 py-1.5 text-sm"
          placeholder="Issuer URL"
          value={form.issuerUrl}
          onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
        />
        <input
          className="gg-panel rounded-md px-3 py-1.5 text-sm"
          placeholder="Client ID"
          value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}
        />
        <input
          className="gg-panel rounded-md px-3 py-1.5 text-sm"
          placeholder="Client secret"
          type="password"
          value={form.clientSecret}
          onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
        />
        <input
          className="gg-panel rounded-md px-3 py-1.5 text-sm"
          placeholder="Redirect URI"
          value={form.redirectUri}
          onChange={(e) => setForm({ ...form, redirectUri: e.target.value })}
        />
      </div>
      <button className="gg-panel mt-3 rounded-md px-4 py-2 text-sm font-medium" onClick={() => saveMutation.mutate()}>
        {saveMutation.isPending ? 'Saving…' : 'Save SSO config'}
      </button>
      <p className="mt-2 text-xs" style={{ color: 'var(--gg-muted)' }}>
        Real OIDC authorization-code + PKCE flow (src/sso/). See docs/adr/0008 for what&apos;s tested vs. what still needs a live enterprise IdP.
      </p>
    </Panel>
  );
}

function RbacSettings() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const permissions = useQuery({ queryKey: ['all-permissions'], queryFn: () => api.listAllPermissions(token!), enabled: !!token });
  const effective = useQuery({ queryKey: ['effective-permissions'], queryFn: () => api.getEffectivePermissions(token!), enabled: !!token });

  const toggleMutation = useMutation({
    mutationFn: ({ role, permission, granted }: { role: TenantRole; permission: string; granted: boolean }) =>
      api.setRoleOverride(token!, role, permission, granted),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['effective-permissions'] }),
  });

  return (
    <Panel title="Fine-grained RBAC — Phase 6">
      <p className="mb-3 text-sm" style={{ color: 'var(--gg-muted)' }}>
        Override any role&apos;s default grant for a permission — e.g. let ANALYST decide appeals, or revoke it.
      </p>
      {permissions.data && effective.data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'var(--gg-muted)' }}>
                <th className="pb-2">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="pb-2 text-center">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.data.map((perm) => (
                <tr key={perm} className="border-t" style={{ borderColor: 'var(--gg-border)' }}>
                  <td className="py-1.5 font-mono text-xs">{perm}</td>
                  {ROLES.map((role) => {
                    const granted = effective.data[role]?.includes(perm) ?? false;
                    return (
                      <td key={role} className="py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={granted}
                          onChange={(e) => toggleMutation.mutate({ role, permission: perm, granted: e.target.checked })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SessionSettings() {
  const { token } = useAuth();
  const logoutAllMutation = useMutation({ mutationFn: () => api.logoutAll(token!) });

  return (
    <Panel title="Session revocation — Phase 6">
      <p className="mb-3 text-sm" style={{ color: 'var(--gg-muted)' }}>
        Log out of every device/session (yours) immediately — bumps this account&apos;s token version, invalidating every
        previously issued token, not just this browser tab.
      </p>
      <button className="gg-panel rounded-md px-4 py-2 text-sm font-medium" onClick={() => logoutAllMutation.mutate()}>
        {logoutAllMutation.isPending ? 'Revoking…' : 'Log out everywhere'}
      </button>
      {logoutAllMutation.isSuccess && (
        <p className="mt-2 text-xs" style={{ color: 'var(--gg-danger)' }}>
          Done — this tab&apos;s own token is now invalid too; refresh to be sent back to login.
        </p>
      )}
    </Panel>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') {
    return <p style={{ color: 'var(--gg-muted)' }}>Only tenant admins can view enterprise compliance settings.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings — Enterprise Compliance (Phase 6)</h1>
      <SsoSettings />
      <RbacSettings />
      <SessionSettings />
    </div>
  );
}
