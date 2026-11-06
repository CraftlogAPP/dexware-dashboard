// Wartungsbestand: Anlagen + Objekt + Fälligkeit + Preis — EINE Rechnung für Start, Wartungsliste,
// Kunden/Objekte und CSV-Export, damit überall dieselben Zahlen stehen.

import {
  assetPrice,
  dueBucket,
  dueInfo,
  intervalOf,
  kindInfo,
  leakDue,
  type Asset,
  type LeakDueInfo,
  type LeakInfo,
  type DueBucket,
  type DueInfo,
  type InstOrg,
  type ItemKind,
  type Site,
} from './types';

export interface DueRow {
  asset: Asset;
  site: Site | undefined;
  /** Letzte gültige Wartung/Inbetriebnahme (ISO) */
  last: string | undefined;
  due: DueInfo;
  bucket: DueBucket;
  /** Preis je Wartung: Vertragspreis vor Typpreis (assetPrice) */
  price: number | undefined;
  /** Außer Betrieb genommen oder Objekt archiviert — zählt nirgends mit. */
  archived: boolean;
  /** Pflicht-Dichtheitskontrolle (F-Gas-VO Art. 5); null = keine Pflicht oder außer Betrieb */
  leak: LeakDueInfo | null;
  /**
   * Dringender von Wartung und Dichtheitskontrolle — für Kennzahlen, Filter und Sortierung (wie Radar und
   * Kacheln in der App). Eine noch nie dokumentierte Kontrolle ohne Datum zählt nicht. Das Wartungspotenzial
   * rechnet weiter nur mit der Wartung (bucket).
   */
  worst: DueBucket;
}

const BUCKET_ORDER: Record<DueBucket, number> = { overdue: 0, d30: 1, d90: 2, later: 3, never: 4 };

export function buildDueRows(
  org: InstOrg,
  sites: Site[],
  assets: Asset[],
  lastService: Map<string, string>,
  lastLeak: Map<string, LeakInfo>,
): DueRow[] {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  return assets.map((a) => {
    const site = siteById.get(a.site_id);
    const last = lastService.get(a.id);
    const due = dueInfo(last, a);
    const bucket = dueBucket(due);
    const leak = a.retired ? null : leakDue(a, lastLeak.get(a.id));
    const lb = leak && leak.state !== 'never' ? dueBucket(leak) : null;
    const leakCounts = lb === 'overdue' || lb === 'd30' || lb === 'd90';
    return {
      asset: a,
      site,
      last,
      due,
      bucket,
      price: assetPrice(org, a),
      archived: a.retired || !site || !site.active,
      leak,
      worst: leakCounts && BUCKET_ORDER[lb] < BUCKET_ORDER[bucket] ? lb : bucket,
    };
  });
}

/** Für Sortierung: frühestes relevantes Datum (Wartung bzw. eine anstehende Dichtheitskontrolle). */
function soonest(r: DueRow): number {
  const m = r.due.dueAt?.getTime() ?? Infinity;
  const l = r.leak && r.leak.state !== 'never' && r.leak.dueAt ? r.leak.dueAt.getTime() : Infinity;
  return Math.min(m, l);
}

/**
 * Zählt in Kennzahlen, Potenzial und Verträgen mit: aktiv, keine Beispieldaten aus der App.
 * includeDemo: wie die App — gibt es NUR Beispiel-Anlagen, rechnen Start-Zahlen mit diesen.
 */
export function counts(r: DueRow, includeDemo = false): boolean {
  return !r.archived && (includeDemo || !r.asset.is_demo);
}

/** true, wenn alle (nicht stillgelegten) Anlagen Beispieldaten sind — dann zeigt der Start diese. */
export function onlyDemo(rows: DueRow[]): boolean {
  const active = rows.filter((r) => !r.asset.retired);
  return active.length > 0 && active.every((r) => r.asset.is_demo);
}

export interface ContractStats {
  count: number;
  /** Fester Umsatz im Jahr: Preis je Wartung × Wartungen pro Jahr (12 / Intervall) */
  yearly: number;
  /** Verträge ohne Vertrags- und ohne Typpreis */
  withoutPrice: number;
}

/** Wartungsverträge — wie contractStats in mobile/src/lib/potential.ts (ohne Beispiel-/stillgelegte Anlagen). */
export function contractStatsOf(rows: DueRow[], includeDemo = false): ContractStats {
  const res: ContractStats = { count: 0, yearly: 0, withoutPrice: 0 };
  for (const r of rows) {
    if (!r.asset.contract || !counts(r, includeDemo)) continue;
    res.count += 1;
    if (r.price === undefined) {
      res.withoutPrice += 1;
      continue;
    }
    res.yearly += r.price * (12 / intervalOf(r.asset));
  }
  res.yearly = Math.round(res.yearly * 100) / 100;
  return res;
}

export interface Potential {
  /** Summe der Preise (überfällig + in 90 Tagen fällig) */
  sum: number;
  overdueSum: number;
  /** Anlagen mit Preis, die in die Summe eingehen */
  priced: number;
  /** Fällige Anlagen (überfällig + 90 Tage) ohne Preis für ihren Typ */
  unpriced: number;
  unpricedKinds: { kind: ItemKind; label: string; count: number }[];
  /** true = für keinen Anlagentyp ein Preis hinterlegt (Vertragspreise zählen hier nicht) */
  noPrices: boolean;
}

export function potentialOf(org: InstOrg, rows: DueRow[], includeDemo = false): Potential {
  const due = rows.filter((r) => counts(r, includeDemo) && (r.bucket === 'overdue' || r.bucket === 'd30' || r.bucket === 'd90'));
  let sum = 0;
  let overdueSum = 0;
  let priced = 0;
  const missing = new Map<ItemKind, number>();
  for (const r of due) {
    if (r.price === undefined) {
      missing.set(r.asset.kind, (missing.get(r.asset.kind) ?? 0) + 1);
      continue;
    }
    sum += r.price;
    priced += 1;
    if (r.bucket === 'overdue') overdueSum += r.price;
  }
  const prices = org.maintenance_prices ?? {};
  return {
    sum,
    overdueSum,
    priced,
    unpriced: [...missing.values()].reduce((a, b) => a + b, 0),
    unpricedKinds: [...missing.entries()]
      .map(([kind, count]) => ({ kind, label: kindInfo(kind).label, count }))
      .sort((a, b) => b.count - a.count),
    noPrices: !Object.values(prices).some((v) => typeof v === 'number' && v > 0),
  };
}

/** Nach Fälligkeit (Wartung oder Dichtheitskontrolle): überfällig zuerst, dann nach Datum; ohne Datum ans Ende. */
export function byDue(a: DueRow, b: DueRow): number {
  const o = BUCKET_ORDER[a.worst] - BUCKET_ORDER[b.worst];
  if (o) return o;
  return soonest(a) - soonest(b) || a.asset.name.localeCompare(b.asset.name, 'de', { numeric: true });
}

/** Montag 00:00 der laufenden Woche (lokal). */
export function startOfWeek(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const wd = (d.getDay() + 6) % 7; // Mo = 0
  d.setDate(d.getDate() - wd);
  return d;
}
