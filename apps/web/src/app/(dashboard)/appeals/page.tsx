'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, type AppealRow } from '@/lib/api';
import { ActionBadge } from '@/components/ActionBadge';

function AppealCard({ appeal }: { appeal: AppealRow }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: (outcome: 'UPHELD' | 'OVERTURNED') => api.decideAppeal(token!, appeal.id, outcome, notes),
    onSuccess: () => {
      setDecisionError(null);
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['investigations'] });
    },
    onError: (err) => setDecisionError(err instanceof ApiError ? err.message : 'Failed to record decision.'),
  });

  const canDecide = (user?.role === 'ADMIN' || user?.role === 'ANALYST') && appeal.status === 'OPEN';

  return (
    <div className="gg-panel mb-4 p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{appeal.submittedByExternalId}</span>
        <span className="text-sm" style={{ color: 'var(--gg-muted)' }}>
          {new Date(appeal.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mb-3 text-sm">{appeal.message}</p>
      <p className="mb-3 text-sm" style={{ color: 'var(--gg-muted)' }}>
        Original decision: score {appeal.originalScore} · <ActionBadge action={appeal.originalAction} /> · appeal
        status <strong>{appeal.status}</strong>
      </p>

      {canDecide ? (
        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Decision notes (visible in the audit log)"
            className="mb-2 w-full rounded-md border p-2 text-sm"
            style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => decide.mutate('OVERTURNED')}
              disabled={decide.isPending}
              className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: 'var(--gg-ok)', color: 'white' }}
            >
              Overturn
            </button>
            <button
              onClick={() => decide.mutate('UPHELD')}
              disabled={decide.isPending}
              className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: 'var(--gg-border)', color: 'var(--gg-text)' }}
            >
              Uphold
            </button>
          </div>
          {decisionError ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--gg-danger)' }}>
              {decisionError}
            </p>
          ) : null}
        </div>
      ) : (
        appeal.decisionNotes && (
          <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
            Decision notes: {appeal.decisionNotes}
          </p>
        )
      )}
    </div>
  );
}

export default function AppealsPage() {
  const { token } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['appeals'],
    queryFn: () => api.listAppeals(token!),
    enabled: !!token,
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Appeals</h1>
      {isLoading ? <p style={{ color: 'var(--gg-muted)' }}>Loading…</p> : null}
      {error ? <p style={{ color: 'var(--gg-danger)' }}>Failed to load appeals.</p> : null}
      {data && data.length === 0 ? <p style={{ color: 'var(--gg-muted)' }}>No appeals submitted yet.</p> : null}
      {data?.map((appeal) => <AppealCard key={appeal.id} appeal={appeal} />)}
    </div>
  );
}
