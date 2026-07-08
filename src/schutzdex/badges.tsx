// SchutzDex-Badges: Zuweisungs-Status + Verständnis-Check.

import type { Assignment } from './types';
import { isOverdue } from './labels';

export function AssignmentBadge({ assignment }: { assignment: Assignment }) {
  if (assignment.status === 'erledigt') {
    return <span className="badge green">Erledigt</span>;
  }
  if (isOverdue(assignment)) {
    return <span className="badge red">Überfällig</span>;
  }
  return <span className="badge amber">Offen</span>;
}

export function CheckBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="badge green">bestanden</span>
  ) : (
    <span className="badge red">nicht bestanden</span>
  );
}
