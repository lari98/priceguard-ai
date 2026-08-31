'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

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

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [windowDays, setWindowDays] = useState(30);

  const summary = useQuery({
    queryKey: ['analytics-summary', windowDays],
    queryFn: () => api.getAnalyticsSummary(token!, windowDays),
    enabled: !!token,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <select
          className="gg-panel rounded-md px-3 py-1.5 text-sm"
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {summary.isLoading && <p style={{ color: 'var(--gg-muted)' }}>Loading…</p>}
      {summary.isError && <p style={{ color: 'var(--gg-danger)' }}>Unable to load analytics.</p>}

      {summary.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Panel title="Events in window">
              <p className="text-3xl font-semibold">{summary.data.totalEvents}</p>
            </Panel>
            <Panel title="Accounts seen">
              <p className="text-3xl font-semibold">{summary.data.totalAccountsSeen}</p>
            </Panel>
            <Panel title="Average risk score">
              <p className="text-3xl font-semibold">{summary.data.avgScore?.toFixed(1) ?? '—'}</p>
            </Panel>
          </div>

          <Panel title="Risk events per day">
            {summary.data.trend.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
                No events in this window yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={summary.data.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="eventCount" name="Events" stroke="#4f46e5" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="highConfidenceCount"
                    name="High-confidence flags"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Top likely-primary countries (weighted flags)">
              {summary.data.topCountries.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
                  No scored events in this window yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary.data.topCountries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="weightedFlags" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Policy action breakdown">
              {summary.data.policyActionBreakdown.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
                  No policy decisions in this window yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary.data.policyActionBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="action" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0891b2" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <p className="text-xs" style={{ color: 'var(--gg-muted)' }}>
            Batch-aggregated from real risk events and policy decisions (Phase 3 Advanced
            Analytics) — see docs/architecture/C4_DIAGRAMS.md for why a streaming platform
            and dedicated analytics store are deferred until real ingestion volume justifies
            them.
          </p>
        </div>
      )}
    </div>
  );
}
