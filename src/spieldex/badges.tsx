// SpielDex-Badges — Pendant zum ActionBadge in components/ui.tsx.

import {
  INSPECTION_SHORT,
  SEVERITY_LABELS,
  type DefectSeverity,
  type DefectStatus,
  type InspectionType,
} from './types';

const TYPE_BADGE_CLASS: Record<InspectionType, string> = {
  visual: 'badge external',
  operational: 'badge amber',
  main: 'badge green',
};

export function InspectionBadge({
  type,
  canceled,
}: {
  type: InspectionType;
  canceled?: boolean;
}) {
  if (canceled) return <span className="badge red">Storniert</span>;
  return <span className={TYPE_BADGE_CLASS[type]}>{INSPECTION_SHORT[type]}</span>;
}

const SEVERITY_BADGE_CLASS: Record<DefectSeverity, string> = {
  low: 'badge',
  medium: 'badge amber',
  danger: 'badge red',
};

export function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  return (
    <span className={SEVERITY_BADGE_CLASS[severity]}>{SEVERITY_LABELS[severity]}</span>
  );
}

export function DefectStatusBadge({ status }: { status: DefectStatus }) {
  return status === 'open' ? (
    <span className="badge amber">offen</span>
  ) : (
    <span className="badge green">behoben</span>
  );
}
