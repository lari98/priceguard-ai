import type { PolicyAction } from '@/lib/api';

const CLASS_BY_ACTION: Record<PolicyAction, string> = {
  NONE: 'gg-badge-none',
  MONITOR: 'gg-badge-none',
  WARN: 'gg-badge-request_verification',
  REQUEST_VERIFICATION: 'gg-badge-request_verification',
  RESTRICT: 'gg-badge-restrict',
  MANUAL_REVIEW: 'gg-badge-manual_review',
  SUSPEND: 'gg-badge-suspend',
  TERMINATE: 'gg-badge-terminate',
};

export function ActionBadge({ action }: { action: PolicyAction | null }) {
  if (!action) return <span style={{ color: 'var(--gg-muted)' }}>—</span>;
  return <span className={`font-medium ${CLASS_BY_ACTION[action]}`}>{action.replace(/_/g, ' ')}</span>;
}
