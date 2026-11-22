import { DUE_STATUS_LABEL, type DueInfo, type DueStatus } from './due';
import { UVV_RESULT_LABEL, type UvvResult } from './types';
import { fmtDate } from '../lib/format';

const DUE_BADGE_CLASS: Record<DueStatus, string> = {
  ok: 'badge green',
  soon: 'badge amber',
  overdue: 'badge red',
  missing: 'badge',
};

export function DueBadge({ status }: { status: DueStatus }) {
  return <span className={DUE_BADGE_CLASS[status]}>{DUE_STATUS_LABEL[status]}</span>;
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
