'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, type RiskEventRow } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { ActionBadge } from '@/components/ActionBadge';

const columns: Column<RiskEventRow>[] = [
  { key: 'occurredAt', header: 'Occurred', cell: (r) => new Date(r.occurredAt).toLocaleString() },
  {
    key: 'account',
    header: 'Account',
    cell: (r) => (
      <Link href={`/accounts/${r.endAccountId}`} className="underline">
        {r.endAccountExternalId}
      </Link>
    ),
  },
  { key: 'eventType', header: 'Event', cell: (r) => r.eventType },
  { key: 'pricingCountry', header: 'Pricing country', cell: (r) => r.pricingCountry },
  {
    key: 'likelyCountry',
    header: 'Likely primary country',
    cell: (r) => {
      const entries = Object.entries(r.likelyPrimaryCountry ?? {}).sort((a, b) => b[1] - a[1]);
      const top = entries[0];
      return top ? `${top[0]} (${Math.round(top[1] * 100)}%)` : '—';
    },
  },
  { key: 'score', header: 'Score', cell: (r) => r.score },
  { key: 'confidence', header: 'Confidence', cell: (r) => r.confidence },
  { key: 'action', header: 'Policy action', cell: (r) => <ActionBadge action={r.action} /> },
];

export default function RiskEventsPage() {
  const { token } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['risk-events'],
    queryFn: () => api.listRiskEvents(token!),
    enabled: !!token,
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Risk Events</h1>
      {isLoading ? <p style={{ color: 'var(--gg-muted)' }}>Loading…</p> : null}
      {error ? <p style={{ color: 'var(--gg-danger)' }}>Failed to load risk events.</p> : null}
      {data ? <DataTable columns={columns} rows={data} emptyLabel="No risk events recorded yet." /> : null}
    </div>
  );
}
