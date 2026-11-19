// Die Zeilen, die „Vor Ort“ für KfzDex in die Datenbank schreibt — EXAKT wie die App (KfzDex/src/lib/queries.ts →
// insertUvvInspection / insertLicenseCheck): gleiche Spalten, gleiche Bedeutung. Bewusst ohne Abhängigkeiten, damit der
// Schema-Test (tests/kfzdex-vor-ort.test.mjs) genau diese Funktionen gegen das echte Schema prüft.
// Server-Eingang und Prüfcode ergänzt der Server selbst. GPS und Unterschrift gibt es bei KfzDex nicht.
// Das Führerscheinfoto bleibt in der App auf dem Gerät — der Browser schreibt photo_uri immer leer (NULL).

/** Gratis-Grenzen wie in der App (src/lib/purchases.ts → FREE_LIMITS): 1 Fahrzeug, 2 Fahrer. */
export const FREE_LIMITS = { vehicles: 1, drivers: 2 } as const;

/** UVV-Prüffrist nach DGUV Vorschrift 70: mindestens jährlich (wie UVV_INTERVAL_MONTHS in der App). */
export const UVV_INTERVAL_MONTHS = 12;

export type UvvResult = 'bestanden' | 'maengel' | 'nicht_bestanden';

export interface UvvRow {
  id: string;
  org_id: string;
  vehicle_id: string;
  /** Tag der Prüfung, YYYY-MM-DD (lokaler Kalendertag) */
  date: string;
  inspector: string;
  result: UvvResult;
  defects: string | null;
  /** Punkt-ID → in Ordnung? */
  checklist: Record<string, boolean>;
}

export interface LicenseRow {
  id: string;
  org_id: string;
  driver_id: string;
  date: string;
  checked_by: string;
  /** immer NULL — das Foto hält nur die App lokal */
  photo_uri: null;
}

/** Sind alle Punkte der Checkliste in Ordnung? */
export function allOk(pointIds: readonly string[], checked: Record<string, boolean>): boolean {
  return pointIds.every((id) => checked[id] === true);
}

/**
 * Ergebnis wie in der App (UvvCheckScreen): alle Punkte in Ordnung → bestanden; sonst mit beschriebenen Mängeln
 * „Mängel festgestellt“, ohne Text „nicht bestanden“.
 */
export function uvvResult(pointIds: readonly string[], checked: Record<string, boolean>, defects: string): UvvResult {
  if (allOk(pointIds, checked)) return 'bestanden';
  return defects.trim() ? 'maengel' : 'nicht_bestanden';
}

export interface UvvInput {
  id: string;
  orgId: string;
  vehicleId: string;
  date: string;
  inspector: string;
  /** Punkt-IDs der Checkliste in ihrer Reihenfolge (CHECK_ITEMS) */
  pointIds: readonly string[];
  checked: Record<string, boolean>;
  defects: string;
}

export function buildUvvRow(i: UvvInput): UvvRow {
  const ok = allOk(i.pointIds, i.checked);
  return {
    id: i.id,
    org_id: i.orgId,
    vehicle_id: i.vehicleId,
    date: i.date,
    inspector: i.inspector.trim(),
    result: uvvResult(i.pointIds, i.checked, i.defects),
    // Mängeltext nur, wenn nicht alles in Ordnung ist (das Feld ist dann auch nicht zu sehen)
    defects: ok ? null : i.defects.trim() || null,
    // genau die Punkte der Checkliste, jeder mit true/false
    checklist: Object.fromEntries(i.pointIds.map((id) => [id, i.checked[id] === true])),
  };
}

export interface LicenseInput {
  id: string;
  orgId: string;
  driverId: string;
  date: string;
  checkedBy: string;
}

export function buildLicenseRow(i: LicenseInput): LicenseRow {
  return { id: i.id, org_id: i.orgId, driver_id: i.driverId, date: i.date, checked_by: i.checkedBy.trim(), photo_uri: null };
}

/** Heutiger Tag als YYYY-MM-DD in lokaler Zeit (nie über toISOString — Zeitzone). */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Monate addieren, Monatsende gekappt: 31.08. + 6 Monate = 28./29.02. — wie addMonths in der App (src/lib/due.ts). */
export function addMonths(iso: string, months: number): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(y, m - 1 + months, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return t;
}

/** Das neuere von zwei Tagen (YYYY-MM-DD) — eine Frist wird nie auf ein älteres Datum zurückgesetzt. */
export function newerDay(cur: string | null | undefined, d: string): string {
  return !cur || d > cur ? d : cur;
}

/**
 * Was nach dem Nachweis an der Frist nachzuziehen ist — wie in der App (FleetContext): eine BESTANDENE UVV setzt
 * vehicle.last_uvv, jede Führerscheinkontrolle driver.last_check. Sonst null.
 */
export function dueBump(kind: 'uvv' | 'license', row: UvvRow | LicenseRow): { table: 'vehicle' | 'driver'; col: 'last_uvv' | 'last_check'; id: string; date: string } | null {
  if (kind === 'uvv') {
    const r = row as UvvRow;
    return r.result === 'bestanden' ? { table: 'vehicle', col: 'last_uvv', id: r.vehicle_id, date: r.date } : null;
  }
  const r = row as LicenseRow;
  return { table: 'driver', col: 'last_check', id: r.driver_id, date: r.date };
}
