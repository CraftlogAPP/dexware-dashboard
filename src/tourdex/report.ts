// TourDex-Fahrtenbuch — HTML-Aufbau nach dem Muster der anderen Berichte,
// Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.

import { fmtDate, fmtDateTime, fmtNum, fmtTime } from '../lib/format';
import {
  CATEGORY_LABELS,
  VEHICLE_TYPE_LABELS,
  type TripCategory,
  type TripSummary,
  type Vehicle,
} from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tripRow(t: TripSummary, odo: { startKm: number; endKm: number; corrected: boolean } | undefined): string {
  const status = t.confirmed ? 'bestätigt' : 'unbestätigt';
  const source = t.manual ? 'manuell' : 'GPS';
  return `<tr class="${t.confirmed ? '' : 'unconfirmed'}">
    <td>${fmtDate(t.start_time)}<div class="note">${fmtTime(t.start_time)} – ${fmtTime(t.end_time)}</div></td>
    <td class="wrap">${esc(t.start_address ?? '—')}</td>
    <td class="wrap">${esc(t.end_address ?? '—')}</td>
    <td class="wrap">${esc(t.purpose ?? '—')}</td>
    <td>${t.category ? esc(CATEGORY_LABELS[t.category] ?? t.category) : '—'}</td>
    <td class="num">${odo ? Math.round(odo.startKm).toLocaleString('de-DE') : '—'}</td>
    <td class="num">${odo ? Math.round(odo.endKm).toLocaleString('de-DE') + (odo.corrected ? ' *' : '') : '—'}</td>
    <td class="num">${fmtNum(t.distance_km)}</td>
    <td>${status}<div class="note">${source}</div></td>
  </tr>`;
}

export function buildFahrtenbuchHtml(
  accountEmail: string,
  vehicle: Vehicle,
  allTrips: TripSummary[],
  periodLabel: string,
  /** Fahrten des Fahrzeugs vor dem Zeitraum — der Kilometerstand läuft fortlaufend weiter. */
  priorTrips: TripSummary[] = [],
): string {
  // Stornierte Fahrten zählen nicht, bleiben aber separat aufgeführt (geschlossene Form).
  const trips = allTrips.filter((t) => !t.canceled);
  const canceledTrips = allTrips.filter((t) => t.canceled);
  // Kilometerstand je Fahrt wie in der App (utils/odometer.ts): Anfangsstand + gefahrene km,
  // ein eingetragener Tachostand setzt den Stand neu.
  const odo = new Map<string, { startKm: number; endKm: number; corrected: boolean }>();
  if (vehicle.initialOdometerKm != null) {
    let cursor = vehicle.initialOdometerKm;
    for (const t of [...priorTrips.filter((p) => !p.canceled), ...trips]) {
      const corrected = t.odometer_end_km != null;
      const endKm = corrected ? (t.odometer_end_km as number) : cursor + (t.distance_km ?? 0);
      odo.set(t.id, { startKm: cursor, endKm, corrected });
      cursor = endKm;
    }
  }
  const rows = trips.map((t) => tripRow(t, odo.get(t.id))).join('');
  const canceledRows = canceledTrips
    .map(
      (t) =>
        `<li><b>${fmtDate(t.start_time)} ${fmtTime(t.start_time)}</b> — ${esc(t.start_address ?? '—')} → ${esc(
          t.end_address ?? '—',
        )}, ${fmtNum(t.distance_km)} km · storniert ${t.canceled_at ? fmtDate(t.canceled_at) : ''}: ${esc(t.cancel_reason ?? '—')}</li>`,
    )
    .join('');

  const kmByCategory: Record<TripCategory, number> = {
    business: 0,
    private: 0,
    commute: 0,
  };
  for (const t of trips) {
    if (t.category && t.category in kmByCategory) {
      kmByCategory[t.category] += t.distance_km ?? 0;
    }
  }
  const totalKm = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const businessShare = totalKm > 0 ? (kmByCategory.business / totalKm) * 100 : 0;
  const unconfirmed = trips.filter((t) => !t.confirmed).length;

  const vehicleLabel = [
    vehicle.name,
    [vehicle.make, vehicle.model].filter(Boolean).join(' '),
    vehicle.licensePlate,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Fahrtenbuch — ${esc(vehicle.name)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #16202b; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #1d4ed8; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  .meta { color: #51606f; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #eff6ff; border-left: 3px solid #2563eb; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c9d4e0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #e8eff8; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .wrap { overflow-wrap: anywhere; }
  tr.unconfirmed td { background: #fffbeb; }
  .note { font-size: 10.5px; color: #51606f; margin-top: 2px; }
  .summary { margin-top: 14px; display: flex; gap: 24px; flex-wrap: wrap; }
  .summary div { border: 1px solid #c9d4e0; border-radius: 6px; padding: 8px 14px; }
  .summary b { display: block; font-size: 14px; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #c9d4e0; color: #51606f; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Fahrtenbuch</h1>
  <div class="meta">Fahrzeug: <b>${esc(vehicleLabel)}</b> (${esc(
    VEHICLE_TYPE_LABELS[vehicle.type] ?? vehicle.type,
  )})</div>
  <div class="meta">Konto: ${esc(accountEmail)}</div>
  <div class="meta">Zeitraum: ${esc(periodLabel)} · Fahrten: ${trips.length}${
    unconfirmed > 0 ? ` (davon ${unconfirmed} unbestätigt, gelb markiert)` : ''
  }</div>
  <div class="legal">Elektronisch geführtes Fahrtenbuch. Die Fahrten wurden zeitnah
  erfasst (GPS-gestützt bzw. manuell, je Eintrag gekennzeichnet) und sind fortlaufend
  dokumentiert. Nachträgliche Änderungen werden mit Zeitstempel protokolliert; bestätigte
  Fahrten werden nicht gelöscht, sondern gekennzeichnet storniert.</div>

  <table>
    <thead>
      <tr>
        <th>Datum / Zeit</th>
        <th>Start</th>
        <th>Ziel</th>
        <th>Anlass / Zweck</th>
        <th>Kategorie</th>
        <th class="num">km-Stand Beginn</th>
        <th class="num">km-Stand Ende</th>
        <th class="num">km</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="9">Keine Fahrten im Zeitraum.</td></tr>'}</tbody>
  </table>
  <div class="note">${
    odo.size > 0
      ? 'km-Stand fortlaufend aus Anfangsstand und gefahrenen Kilometern; * = Tachostand eingetragen.'
      : 'Kein Anfangs-Kilometerstand beim Fahrzeug hinterlegt — km-Stände fehlen.'
  }</div>
  ${canceledRows ? `<h2>Stornierte Fahrten</h2><div class="note">Zählen nicht in den Summen, bleiben zur Nachvollziehbarkeit aufgeführt.</div><ul>${canceledRows}</ul>` : ''}

  <h2>Zusammenfassung</h2>
  <div class="summary">
    <div><b>${fmtNum(totalKm)} km</b>Gesamt im Zeitraum</div>
    <div><b>${fmtNum(kmByCategory.business)} km</b>Geschäftlich (${fmtNum(businessShare)} %)</div>
    <div><b>${fmtNum(kmByCategory.commute)} km</b>Arbeitsweg</div>
    <div><b>${fmtNum(kmByCategory.private)} km</b>Privat</div>
  </div>

  <div class="footer">
    <span>Erstellt mit TourDex — tourdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}
