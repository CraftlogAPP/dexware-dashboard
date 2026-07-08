// PrüfDex-Badges: Prüfergebnis + Prüffristen-Ampel.

import type { DueStatus } from './labels';
import { RESULT_LABELS, type InspectionResult } from './types';

export function ResultBadge({ result }: { result: InspectionResult }) {
  return result === 'passed' ? (
    <span className="badge green">{RESULT_LABELS.passed}</span>
  ) : (
    <span className="badge red">{RESULT_LABELS.failed}</span>
  );
}

const DUE_BADGE: Record<DueStatus, { className: string; label: string }> = {
  ok: { className: 'badge green', label: 'ok' },
  soon: { className: 'badge amber', label: 'bald fällig' },
  overdue: { className: 'badge red', label: 'überfällig' },
  none: { className: 'badge', label: 'ungeprüft' },
};

export function DueBadge({ status }: { status: DueStatus }) {
  const b = DUE_BADGE[status];
  return <span className={b.className}>{b.label}</span>;
}
