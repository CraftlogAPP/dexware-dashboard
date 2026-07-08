// CraftDex-Badges: Auftrags-Status.

import { STATUS_LABELS, type ProjectStatus } from './types';

const STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  quote: 'badge',
  in_progress: 'badge amber',
  completed: 'badge green',
  invoiced: 'badge external',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus | null }) {
  if (!status || !STATUS_LABELS[status]) {
    return <span className="badge">Projekt</span>;
  }
  return <span className={STATUS_BADGE_CLASS[status]}>{STATUS_LABELS[status]}</span>;
}
