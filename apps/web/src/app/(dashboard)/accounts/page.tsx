'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, type EndAccountRow } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';

const columns: Column<EndAccountRow>[] = [
  {
    key: 'externalId',
    header: 'Account',
    cell: (r) => (
      <Link href={`/accounts/${r.id}`} className="underline">
        {r.externalId}
      </Link>
    ),
  },
  { key: 'pricingCountry', header: 'Pricing country', cell: (r) => r.pricingCountry },
  { key: 'createdAt', header: 'First seen', cell: (r) => new Date(r.createdAt).toLocaleDateString() },
];

export default function AccountsPage() {
  const { token } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(token!),
    enabled: !!token,
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Accounts</h1>
      {isLoading ? <p style={{ color: 'var(--gg-muted)' }}>Loading…</p> : null}
      {error ? <p style={{ color: 'var(--gg-danger)' }}>Failed to load accounts.</p> : null}
      {data ? <DataTable columns={columns} rows={data} emptyLabel="No end accounts recorded yet." /> : null}
    </div>
  );
}
