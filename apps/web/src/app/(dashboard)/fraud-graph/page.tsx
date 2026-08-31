'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, FraudCluster } from '@/lib/api';

/**
 * Simple, real (not decorative) network visualization: each cluster's accounts are laid
 * out in a circle around a central "shared signal" node, with an edge drawn from every
 * account to that centre — accurately representing "these N accounts are connected because
 * they share this device/payment token", without pulling in a full graph-layout library
 * for what is, at MVP scale, always a star-shaped cluster (see fraud-graph.service.ts).
 */
function ClusterGraph({ cluster }: { cluster: FraudCluster }) {
  const size = 220;
  const center = size / 2;
  const radius = size / 2 - 30;
  const n = cluster.endAccountIds.length;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={10} fill="var(--gg-danger)" />
      {cluster.endAccountIds.map((id, i) => {
        const angle = (2 * Math.PI * i) / n;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return (
          <g key={id}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="var(--gg-border)" strokeWidth={1.5} />
            <circle cx={x} cy={y} r={8} fill="var(--gg-accent)" />
            <title>{id}</title>
          </g>
        );
      })}
    </svg>
  );
}

export default function FraudGraphPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const [minClusterSize, setMinClusterSize] = useState(3);

  const clusters = useQuery({
    queryKey: ['fraud-clusters', minClusterSize],
    queryFn: () => api.listFraudClusters(token!, minClusterSize),
    enabled: !!token,
  });

  const runMutation = useMutation({
    mutationFn: () => api.runFraudClusterDetection(token!, minClusterSize),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fraud-clusters'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fraud Graph (Phase 5)</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm" style={{ color: 'var(--gg-muted)' }}>
            Min cluster size
          </label>
          <select
            className="gg-panel rounded-md px-3 py-1.5 text-sm"
            value={minClusterSize}
            onChange={(e) => setMinClusterSize(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {isAdmin && (
            <button className="gg-panel rounded-md px-4 py-2 text-sm font-medium" onClick={() => runMutation.mutate()}>
              {runMutation.isPending ? 'Detecting…' : 'Detect & persist'}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
        Connected-components clustering over accounts sharing a device or payment method —
        Scenario 8 (docs/PHASE_0_DISCOVERY.md §E). Real Postgres-backed graph algorithm; a
        dedicated graph database remains deferred until real scale justifies it (ADR-0007).
      </p>

      {clusters.isLoading && <p style={{ color: 'var(--gg-muted)' }}>Loading…</p>}
      {clusters.data && clusters.data.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
          No clusters of size ≥ {minClusterSize} found.
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.data?.map((cluster, i) => (
          <div key={i} className="gg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{cluster.clusterSize} accounts</span>
            </div>
            <ClusterGraph cluster={cluster} />
            <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--gg-muted)' }}>
              {cluster.sharedDeviceHashes.length > 0 && <p>Shared device(s): {cluster.sharedDeviceHashes.join(', ')}</p>}
              {cluster.sharedPaymentTokens.length > 0 && <p>Shared payment token(s): {cluster.sharedPaymentTokens.join(', ')}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
