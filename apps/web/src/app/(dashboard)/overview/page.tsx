'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="gg-panel p-5">
      <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold" style={{ color: tone ?? 'var(--gg-text)' }}>
        {value}
      </p>
    </div>
  );
}

export default function OverviewPage() {
  const { token } = useAuth();

  const events = useQuery({
    queryKey: ['risk-events'],
    queryFn: () => api.listRiskEvents(token!),
    enabled: !!token,
  });
  const investigations = useQuery({
    queryKey: ['investigations'],
    queryFn: () => api.listInvestigations(token!),
    enabled: !!token,
  });
  const appeals = useQuery({
    queryKey: ['appeals'],
    queryFn: () => api.listAppeals(token!),
    enabled: !!token,
  });

  const pendingInvestigations = investigations.data?.filter((i) => i.status !== 'RESOLVED').length ?? 0;
  const openAppeals = appeals.data?.filter((a) => a.status === 'OPEN').length ?? 0;
  const highRiskEvents = events.data?.filter((e) => e.score >= 60).length ?? 0;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Overview</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Risk events (recent)" value={events.data?.length ?? '—'} />
        <StatCard label="High-risk events (score ≥ 60)" value={highRiskEvents} tone="var(--gg-warn)" />
        <StatCard label="Open investigations" value={pendingInvestigations} tone="var(--gg-warn)" />
        <StatCard label="Open appeals" value={openAppeals} tone="var(--gg-accent)" />
      </div>

      <p className="mt-8 text-sm" style={{ color: 'var(--gg-muted)' }}>
        GeoGuard AI reports a separate &quot;likely primary usage country&quot; alongside every risk score — it never
        collapses evidence into a single guilt/innocence flag. Scores above the REQUEST_VERIFICATION threshold always
        route to human review before any restrictive action is taken (see docs/adr/0004 and Article 22 GDPR
        safeguard in policy-engine.service.ts).
      </p>
    </div>
  );
}
