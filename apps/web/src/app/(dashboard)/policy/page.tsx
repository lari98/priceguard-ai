'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, type PolicyAction, type RuleInput } from '@/lib/api';
import { ActionBadge } from '@/components/ActionBadge';

/**
 * The engine's full grammar (apps/api/src/risk/rule-engine/rule-engine.types.ts)
 * supports arbitrarily nested AND/OR/NOT trees. The dashboard's rule builder is a
 * deliberately narrower MVP surface — one flat "fact <op> value" comparison per rule,
 * which is a valid FactCondition on its own and covers every scenario in
 * docs/PHASE_0_DISCOVERY.md §34. A visual tree builder for compound conditions is a
 * documented Phase 3 follow-up, not a silently missing feature.
 */
const FACTS = [
  'riskScore',
  'pricingCountryMismatch',
  'paymentCountryMismatch',
  'primaryCountryConfidence',
  'observationDays',
  'travelProbability',
  'vpnLikelihood',
  'ipRotationSuspected',
  'distinctCountryCount',
  'sessionCountryEntropy',
  'sessionCount',
] as const;

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

const ACTIONS: PolicyAction[] = ['NONE', 'MONITOR', 'WARN', 'REQUEST_VERIFICATION', 'RESTRICT', 'MANUAL_REVIEW', 'SUSPEND', 'TERMINATE'];

const REQUIRES_REVIEW_ACTIONS = new Set<PolicyAction>(['REQUEST_VERIFICATION', 'RESTRICT', 'MANUAL_REVIEW', 'SUSPEND', 'TERMINATE']);

export default function PolicyPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['policies'],
    queryFn: () => api.listPolicies(token!),
    enabled: !!token,
  });

  const [name, setName] = useState('Default Policy');
  const [fact, setFact] = useState<string>(FACTS[0]);
  const [op, setOp] = useState<string>('gte');
  const [value, setValue] = useState('60');
  const [action, setAction] = useState<PolicyAction>('REQUEST_VERIFICATION');
  const [formError, setFormError] = useState<string | null>(null);

  const requiresHumanReview = REQUIRES_REVIEW_ACTIONS.has(action);

  const createMutation = useMutation({
    mutationFn: () => {
      const rule: RuleInput = {
        name: `${fact} ${op} ${value}`,
        condition: { fact, op, value: Number.isNaN(Number(value)) ? value : Number(value) },
        action,
        requiresHumanReview,
        order: 0,
      };
      return api.createPolicy(token!, name, [rule]);
    },
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed to create policy.'),
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Policy &amp; Rules</h1>

      {isLoading ? <p style={{ color: 'var(--gg-muted)' }}>Loading…</p> : null}
      {error ? <p style={{ color: 'var(--gg-danger)' }}>Failed to load policies.</p> : null}

      <div className="mb-8 space-y-4">
        {data?.map((policy) => (
          <div key={policy.id} className="gg-panel p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">
                {policy.name} (v{policy.version})
              </span>
              <span style={{ color: policy.active ? 'var(--gg-ok)' : 'var(--gg-muted)' }}>
                {policy.active ? 'ACTIVE' : 'inactive'}
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {(policy.rules ?? []).map((rule) => (
                <li key={rule.id} className="flex items-center justify-between">
                  <span>{rule.name}</span>
                  <span>
                    <ActionBadge action={rule.action} /> {rule.requiresHumanReview ? '· human review required' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {data && data.length === 0 ? (
          <p style={{ color: 'var(--gg-muted)' }}>No policy configured yet — every risk event will score with action NONE.</p>
        ) : null}
      </div>

      {user?.role === 'ADMIN' ? (
        <section className="gg-panel p-5">
          <h2 className="mb-4 font-medium">Create a new policy</h2>
          <p className="mb-4 text-sm" style={{ color: 'var(--gg-muted)' }}>
            Creating a policy here creates it as a new, separate policy version — it does not edit an existing one in
            place (see PolicyService.createPolicy). This preserves a full audit trail of what rules were in force
            when any historical decision was made.
          </p>

          <label className="mb-1 block text-sm">Policy name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 w-full rounded-md border px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
          />

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm">Fact</label>
              <select
                value={fact}
                onChange={(e) => setFact(e.target.value)}
                className="w-full rounded-md border px-2 py-2 text-sm"
                style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
              >
                {FACTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Operator</label>
              <select
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className="w-full rounded-md border px-2 py-2 text-sm"
                style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
              >
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Value</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-md border px-2 py-2 text-sm"
                style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as PolicyAction)}
                className="w-full rounded-md border px-2 py-2 text-sm"
                style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mb-4 text-sm" style={{ color: 'var(--gg-muted)' }}>
            {requiresHumanReview
              ? 'This action requires human review — enforced server-side regardless of this checkbox, per Article 22 GDPR (see PolicyEngineService.validateRuleInput).'
              : 'This action does not require human review and applies automatically.'}
          </p>

          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--gg-accent)', color: 'white' }}
          >
            {createMutation.isPending ? 'Creating…' : 'Create policy'}
          </button>

          {formError ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--gg-danger)' }}>
              {formError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
