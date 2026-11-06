// Kleine Anzeige-Bausteine des Betriebsportals (Badges, Fälligkeits-Ampel).

import {
  DUE_BUCKET_LABELS,
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  SEVERITY_SHORT,
  dueBucket,
  dueText,
  fmtDay,
  jobInfo,
  leakDueLabel,
  warrantyInfo,
  type Asset,
  type DefectSeverity,
  type DueBucket,
  type DueInfo,
  type LeakDueInfo,
  type InspectionType,
  type RequestKind,
  type RequestStatus,
} from './types';
import type { ReminderState } from './types';

const BUCKET_CLASS: Record<DueBucket, string> = {
  overdue: 'badge red',
  d30: 'badge amber',
  d90: 'badge external',
  later: 'badge green',
  never: 'badge',
};

/** Ampel: überfällig (rot) · in 30 Tagen (gelb) · in 90 Tagen (blau) · später (grün) · ohne Datum. */
export function DueBadge({ info }: { info: DueInfo }) {
  const b = dueBucket(info);
  return <span className={BUCKET_CLASS[b]}>{b === 'later' ? 'ok' : DUE_BUCKET_LABELS[b]}</span>;
}

/** „12.03.2027" + Badge + „in 20 Tagen" — für Tabellen. */
export function DueCell({ info, retired }: { info: DueInfo; retired?: boolean }) {
  if (retired) return <span className="muted">außer Betrieb</span>;
  return (
    <>
      {info.dueAt ? fmtDay(info.dueAt) : '—'} <DueBadge info={info} />
      <span className="idx-sub">{dueText(info)}</span>
    </>
  );
}

const JOB_CLASS: Partial<Record<InspectionType, string>> = {
  service: 'badge green',
  commissioning: 'badge external',
  repair: 'badge red',
  refrigerant: 'badge external',
  pressureTest: 'badge amber',
};

export function JobBadge({ type, canceled }: { type: InspectionType; canceled?: boolean }) {
  if (canceled) return <span className="badge red">Storniert</span>;
  const j = jobInfo(type);
  return (
    <span className={JOB_CLASS[type] ?? 'badge'}>
      {j.emoji} {j.short}
    </span>
  );
}

const SEVERITY_CLASS: Record<DefectSeverity, string> = {
  green: 'badge green',
  amber: 'badge amber',
  red: 'badge red',
};

export function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  return <span className={SEVERITY_CLASS[severity]}>{SEVERITY_SHORT[severity]}</span>;
}

export function RequestKindBadge({ kind }: { kind: RequestKind }) {
  if (kind === 'fault') return <span className="badge red">🚨 {REQUEST_KIND_LABELS.fault}</span>;
  if (kind === 'quote') return <span className="badge green">💶 Angebot</span>;
  return <span className="badge external">🔧 {REQUEST_KIND_LABELS.maintenance}</span>;
}

/** „Garantie gefährdet": Garantie läuft noch, Wartung überfällig (warrantyInfo). */
export function WarrantyRiskBadge({ asset, due }: { asset: Pick<Asset, 'warranty_until'>; due: DueInfo }) {
  const w = warrantyInfo(asset, due);
  if (!w.atRisk || !w.until) return null;
  return (
    <span className="badge red" title={`Garantie bis ${fmtDay(w.until)} — die Wartung ist überfällig`}>
      ⚠️ Garantie gefährdet
    </span>
  );
}

const STATUS_CLASS: Record<RequestStatus, string> = {
  new: 'badge amber',
  scheduled: 'badge external',
  done: 'badge green',
  dismissed: 'badge',
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <span className={STATUS_CLASS[status]}>{REQUEST_STATUS_LABELS[status]}</span>;
}

/**
 * „❄️ Dichtheitskontrolle (F-Gas) fällig am … · alle 12 Monate" — wie die Zeile in Radar/Objekt der App.
 * Rot = überfällig, orange = in 30 Tagen oder noch nie dokumentiert, sonst grau. Bei der Nachkontrolle
 * nach „undicht" ohne „· alle N Monate".
 */
export function LeakLine({ leak, compact }: { leak: LeakDueInfo | null; compact?: boolean }) {
  if (!leak) return null;
  return (
    <span className={`idx-leak ${leak.state}`} title={leak.duty.reason}>
      ❄️ {leakDueLabel(leak)}
      {!compact && !leak.followUp && ` · alle ${leak.duty.months} Monate`}
    </span>
  );
}

const REMINDER: Record<ReminderState, { cls: string; label: string; title: string }> = {
  confirmed: { cls: 'badge green', label: 'bestätigt', title: 'Der Kunde hat die Erinnerungsmail per Link (oder in „Mein Zuhause“) bestätigt.' },
  pending: { cls: 'badge amber', label: 'wartet auf Bestätigung', title: 'Die Bestätigungs-Mail ist raus — Erinnerungen erst nach dem Klick des Kunden. Erneut senden geht in der App.' },
  queued: { cls: 'badge amber', label: 'Bestätigung folgt', title: 'Der Kunde bekommt mit dem nächsten täglichen Lauf eine Mail zum Bestätigen.' },
  unsubscribed: { cls: 'badge', label: 'abbestellt', title: 'Der Kunde hat abbestellt — einschalten kann er die Erinnerungen nur selbst.' },
  none: { cls: 'badge', label: 'keine Zustimmung', title: '' },
};

/** Stand der Erinnerungsmail (Double-Opt-in), gleiche Stufen wie in der App. */
export function ReminderBadge({ state }: { state: ReminderState }) {
  const r = REMINDER[state];
  return <span className={r.cls} title={r.title || undefined}>{r.label}</span>;
}
