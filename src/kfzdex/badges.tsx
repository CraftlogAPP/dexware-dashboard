import type { DueInfo, DueStatus } from './due';
import { UVV_RESULT_LABEL, type UvvResult } from './types';
import { fmtDate } from '../lib/format';

const DUE_BADGE: Record<DueStatus, { className: string; label: string }> = {
  ok: { className: 'badge green', label: 'ok' },
  soon: { className: 'badge amber', label: 'bald fällig' },
  overdue: { className: 'badge red', label: 'überfällig' },
  missing: { className: 'badge', label: 'nie geprüft' },
};

export function DueBadge({ status }: { status: DueStatus }) {
  const b = DUE_BADGE[status];
  return <span className={b.className}>{b.label}</span>;
}

/** Fälligkeitsdatum mit Tages-Hinweis, z. B. "05.08.2026 (in 12 Tagen)". */
export function dueLabel(due: DueInfo): string {
  if (!due.dueDate) return '—';
  const date = fmtDate(due.dueDate.toISOString());
  if (due.days == null) return date;
  if (due.days < 0) return `${date} (seit ${-due.days} Tagen)`;
  if (due.days === 0) return `${date} (heute)`;
  return `${date} (in ${due.days} Tagen)`;
}

const RESULT_BADGE_CLASS: Record<UvvResult, string> = {
  bestanden: 'badge green',
  maengel: 'badge amber',
  nicht_bestanden: 'badge red',
};

export function ResultBadge({ result }: { result: UvvResult }) {
  return (
    <span className={RESULT_BADGE_CLASS[result]}>{UVV_RESULT_LABEL[result]}</span>
  );
}
