// GerüstDex-Badges — Prüfarten (TRBS 2121-1) und Mängel-Ampel.

import {
  INSPECTION_SHORT,
  SEVERITY_SHORT,
  type DamageSeverity,
  type DamageStatus,
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

const SEVERITY_BADGE_CLASS: Record<DamageSeverity, string> = {
  green: 'badge green',
  amber: 'badge amber',
  red: 'badge red',
};

export function SeverityBadge({ severity }: { severity: DamageSeverity }) {
  return (
    <span className={SEVERITY_BADGE_CLASS[severity]}>{SEVERITY_SHORT[severity]}</span>
  );
}

export function DamageStatusBadge({ status }: { status: DamageStatus }) {
  return status === 'open' ? (
    <span className="badge amber">offen</span>
  ) : (
    <span className="badge green">behoben</span>
  );
}
