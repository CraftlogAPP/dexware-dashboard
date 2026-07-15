// GurtDex-Badges — Prüfarten (DGUV R 112-198 / DGUV G 312-906) und Mängel-Ampel.

import {
  INSPECTION_SHORT,
  SEVERITY_SHORT,
  type DefectSeverity,
  type DefectStatus,
  type InspectionType,
} from './types';

const TYPE_BADGE_CLASS: Record<InspectionType, string> = {
  visual: 'badge external',
  expert: 'badge green',
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
  green: 'badge green',
  amber: 'badge amber',
  red: 'badge red',
};

export function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  return (
    <span className={SEVERITY_BADGE_CLASS[severity]}>{SEVERITY_SHORT[severity]}</span>
  );
}

export function DefectStatusBadge({ status }: { status: DefectStatus }) {
  return status === 'open' ? (
    <span className="badge amber">offen</span>
  ) : (
    <span className="badge green">behoben</span>
  );
}
