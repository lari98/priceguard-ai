'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, type InvestigationRow } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { ActionBadge } from '@/components/ActionBadge';

const columns: Column<InvestigationRow>[] = [
  { key: 'createdAt', header: 'Opened', cell: (r) => new Date(r.createdAt).toLocaleString() },
  {
    key: 'account',
    header: 'Account',
    cell: (r) => (
      <Link href={`/accounts/${r.endAccountId}`} className="underline">
        {r.endAccountExternalId}
      </Link>
    ),
  },
  { key: 'score', header: 'Score', cell: (r) => r.score },
  { key: 'action', header: 'Action', cell: (r) => <ActionBadge action={r.action} /> },
  { key: 'status', header: 'Status', cell: (r) => r.status },
];

export default function InvestigationsPage() {
  const { token } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['investigations'],
    queryFn: () => api.listInvestigations(token!),
    enabled: !!token,
  });

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Investigations</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--gg-muted)' }}>
        Opened automatically whenever a policy decision is flagged <code>requiresHumanReview</code> — this is the
        Article 22 GDPR safeguard enforced server-side (see policy-engine.service.ts), not merely a UI convention.
      </p>
      {isLoading ? <p style={{ color: 'var(--gg-muted)' }}>Loading…</p> : null}
      {error ? <p style={{ color: 'var(--gg-danger)' }}>Failed to load investigations.</p> : null}
      {data ? <DataTable columns={columns} rows={data} emptyLabel="No investigations opened yet." /> : null}
    </div>
  );
}
