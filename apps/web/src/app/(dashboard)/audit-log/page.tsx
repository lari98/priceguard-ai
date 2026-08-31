'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, type AuditLogEntryRow } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';

const columns: Column<AuditLogEntryRow>[] = [
  { key: 'createdAt', header: 'When', cell: (r) => new Date(r.createdAt).toLocaleString() },
  { key: 'actorType', header: 'Actor', cell: (r) => `${r.actorType}${r.actorId ? ` (${r.actorId})` : ''}` },
  { key: 'action', header: 'Action', cell: (r) => r.action },
  {
    key: 'detail',
    header: 'Detail',
    cell: (r) => <DetailToggle entry={r} />,
  },
];

function DetailToggle({ entry }: { entry: AuditLogEntryRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="text-xs underline" style={{ color: 'var(--gg-accent)' }}>
        {open ? 'hide' : 'view'}
      </button>
      {open ? (
        <pre className="mt-2 max-w-md overflow-x-auto rounded-md p-2 text-xs" style={{ backgroundColor: 'var(--gg-bg)' }}>
          {JSON.stringify({ before: entry.beforeState, after: entry.afterState }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export default function AuditLogPage() {
  const { token } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => api.listAuditLog(token!),
    enabled: !!token,
  });

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Audit Log</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--gg-muted)' }}>
        Append-only (see AuditService — there is no update/delete method). The one exception is DSR erasure, which
        redacts personal data from historical entries rather than deleting the entries themselves (ADR-0004).
      </p>
      {isLoading ? <p style={{ color: 'var(--gg-muted)' }}>Loading…</p> : null}
      {error ? <p style={{ color: 'var(--gg-danger)' }}>Failed to load audit log.</p> : null}
      {data ? <DataTable columns={columns} rows={data} emptyLabel="No audit log entries yet." /> : null}
    </div>
  );
}
