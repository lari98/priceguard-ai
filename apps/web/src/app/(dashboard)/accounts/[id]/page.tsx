'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { ActionBadge } from '@/components/ActionBadge';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [erasedPseudonym, setErasedPseudonym] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['account', id],
    queryFn: () => api.getAccount(token!, id),
    enabled: !!token,
  });

  const eraseMutation = useMutation({
    mutationFn: () => api.eraseAccount(token!, id),
    onSuccess: (res) => {
      setErasedPseudonym(res.pseudonym);
      setEraseError(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err) => setEraseError(err instanceof ApiError ? err.message : 'Erasure failed.'),
  });

  if (isLoading) return <p style={{ color: 'var(--gg-muted)' }}>Loading…</p>;
  if (error || !data) return <p style={{ color: 'var(--gg-danger)' }}>Failed to load account.</p>;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{data.account.externalId}</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--gg-muted)' }}>
        Pricing country: {data.account.pricingCountry} · First seen {new Date(data.account.createdAt).toLocaleDateString()}
      </p>

      <section className="gg-panel mb-6 p-5">
        <h2 className="mb-3 font-medium">Recent risk scores</h2>
        {data.recentScores.length === 0 ? (
          <p style={{ color: 'var(--gg-muted)' }}>No risk events scored yet for this account.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.recentScores.map((s) => (
              <li key={s.riskEventId} className="flex items-center justify-between">
                <span>{new Date(s.occurredAt).toLocaleString()} · {s.eventType}</span>
                <span>
                  score {s.score} ({s.confidence}) · <ActionBadge action={s.action} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="gg-panel mb-6 p-5">
        <h2 className="mb-3 font-medium">Recent sessions</h2>
        {data.recentSessions.length === 0 ? (
          <p style={{ color: 'var(--gg-muted)' }}>No sessions recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.recentSessions.map((s) => (
              <li key={s.id}>
                {new Date(s.occurredAt).toLocaleString()} · {s.ipAddress} · {s.derivedCountry ?? 'unknown country'} ·{' '}
                VPN likelihood {Math.round((s.vpnLikelihood ?? 0) * 100)}%
              </li>
            ))}
          </ul>
        )}
      </section>

      {user?.role === 'ADMIN' ? (
        <section className="gg-panel p-5">
          <h2 className="mb-2 font-medium" style={{ color: 'var(--gg-danger)' }}>
            Data subject erasure
          </h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--gg-muted)' }}>
            Permanently pseudonymises this end account and its sessions/devices, per ADR-0004. Audit history
            referencing this account is redacted, not deleted — the fact that an erasure happened remains visible in
            the audit log.
          </p>
          {erasedPseudonym ? (
            <p style={{ color: 'var(--gg-ok)' }}>Erased. Pseudonym: {erasedPseudonym}</p>
          ) : (
            <button
              onClick={() => eraseMutation.mutate()}
              disabled={eraseMutation.isPending}
              className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: 'var(--gg-danger)', color: 'white' }}
            >
              {eraseMutation.isPending ? 'Erasing…' : 'Erase this account'}
            </button>
          )}
          {eraseError ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--gg-danger)' }}>
              {eraseError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
