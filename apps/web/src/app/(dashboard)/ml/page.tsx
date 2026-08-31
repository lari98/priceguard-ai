'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

const ROLLOUT_OPTIONS = [0, 5, 25, 50, 100];

export default function MlPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [rolloutPercentage, setRolloutPercentage] = useState(5);

  const models = useQuery({
    queryKey: ['ml-models'],
    queryFn: () => api.listMlModels(token!),
    enabled: !!token,
  });
  const rollout = useQuery({
    queryKey: ['ml-rollout'],
    queryFn: () => api.getRolloutConfig(token!),
    enabled: !!token,
  });
  const latestVersion = selectedVersion ?? models.data?.[0]?.version ?? null;
  const drift = useQuery({
    queryKey: ['ml-drift', latestVersion],
    queryFn: () => api.getDrift(token!, latestVersion!),
    enabled: !!token && !!latestVersion,
  });

  const trainMutation = useMutation({
    mutationFn: () => api.trainMlModel(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ml-models'] }),
  });
  const shadowEvalMutation = useMutation({
    mutationFn: () => api.runShadowEval(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ml-drift'] }),
  });
  const approveMutation = useMutation({
    mutationFn: () => api.approveRollout(token!, latestVersion!, rolloutPercentage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ml-rollout'] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">ML — Shadow Model (Phase 4)</h1>
      <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
        Trains a small logistic-regression model on the synthetic abuse-scenario dataset and
        evaluates it in shadow mode against real risk scores — it never affects a live policy
        decision until an admin explicitly approves a staged rollout below. See
        docs/adr/0006-ml-shadow-rollout.md for the honest scope statement.
      </p>

      {isAdmin && (
        <div className="flex gap-3">
          <button
            className="gg-panel rounded-md px-4 py-2 text-sm font-medium"
            onClick={() => trainMutation.mutate()}
            disabled={trainMutation.isPending}
          >
            {trainMutation.isPending ? 'Training…' : 'Train new model'}
          </button>
          <button
            className="gg-panel rounded-md px-4 py-2 text-sm font-medium"
            onClick={() => shadowEvalMutation.mutate()}
            disabled={shadowEvalMutation.isPending || !models.data?.length}
          >
            {shadowEvalMutation.isPending ? 'Evaluating…' : 'Run shadow evaluation'}
          </button>
        </div>
      )}

      {shadowEvalMutation.data && (
        <div className="gg-panel p-4 text-sm">
          Evaluated {shadowEvalMutation.data.evaluated} recent risk score(s) against model{' '}
          {shadowEvalMutation.data.modelVersion}: {(shadowEvalMutation.data.agreementRate * 100).toFixed(0)}% agreement with
          production (mean production {shadowEvalMutation.data.meanProductionScore.toFixed(1)} vs. shadow{' '}
          {shadowEvalMutation.data.meanShadowScore.toFixed(1)}).
        </div>
      )}

      <div className="gg-panel overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--gg-muted)' }}>
          Model registry
        </h2>
        {!models.data?.length ? (
          <p className="text-sm" style={{ color: 'var(--gg-muted)' }}>
            No models trained yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'var(--gg-muted)' }}>
                <th className="pb-2">Version</th>
                <th className="pb-2">Training examples</th>
                <th className="pb-2">Holdout accuracy (leave-one-out)</th>
                <th className="pb-2">Trained at</th>
              </tr>
            </thead>
            <tbody>
              {models.data.map((m) => (
                <tr
                  key={m.version}
                  className="cursor-pointer border-t"
                  style={{ borderColor: 'var(--gg-border)' }}
                  onClick={() => setSelectedVersion(m.version)}
                >
                  <td className="py-2 font-mono text-xs">{m.version}</td>
                  <td className="py-2">{m.trainingExampleCount}</td>
                  <td className="py-2">{(m.holdoutAccuracy * 100).toFixed(0)}%</td>
                  <td className="py-2">{new Date(m.trainedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {latestVersion && drift.data && (
        <div className="gg-panel p-4 text-sm">
          <h2 className="mb-2 font-semibold" style={{ color: 'var(--gg-muted)' }}>
            Drift check — {latestVersion}
          </h2>
          {drift.data.sampleSize === 0 ? (
            <p>No shadow evaluations yet for this model — run one above.</p>
          ) : (
            <p>
              {drift.data.sampleSize} evaluated · mean production {drift.data.meanProductionScore.toFixed(1)} vs. shadow{' '}
              {drift.data.meanShadowScore.toFixed(1)} · mean |difference| {drift.data.meanAbsoluteDifference.toFixed(1)} ·{' '}
              <span style={{ color: drift.data.driftDetected ? 'var(--gg-danger)' : 'var(--gg-accent)' }}>
                {drift.data.driftDetected ? 'drift detected' : 'no drift detected'}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="gg-panel p-4 text-sm">
        <h2 className="mb-2 font-semibold" style={{ color: 'var(--gg-muted)' }}>
          Staged rollout (human-approval gate)
        </h2>
        <p className="mb-3">
          Current: {rollout.data?.shadowModelVersion ?? 'none'} at {rollout.data?.rolloutPercentage ?? 0}%
          {rollout.data?.approvedByUserId ? ` (approved by user ${rollout.data.approvedByUserId})` : ''}.
        </p>
        {isAdmin && latestVersion && (
          <div className="flex items-center gap-3">
            <select
              className="gg-panel rounded-md px-3 py-1.5 text-sm"
              value={rolloutPercentage}
              onChange={(e) => setRolloutPercentage(Number(e.target.value))}
            >
              {ROLLOUT_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
            <button
              className="gg-panel rounded-md px-4 py-2 text-sm font-medium"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              Approve {latestVersion} at {rolloutPercentage}%
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
