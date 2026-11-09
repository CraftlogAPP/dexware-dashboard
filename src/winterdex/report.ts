// Nachweis-PDF (Kontrollbuch) — HTML-Aufbau nach dem Muster von mobile/src/pdf/report.ts,
// Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.

import { fmtDate, fmtDateTime, fmtTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { gritLabel, weatherLabel } from './labels';
import {
  ACTION_LABELS,
  LEGAL_BASIS,
  type OperationWithPhotos,
  type Property,
} from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ---- Prüffester GPS-Nachweis (wie im PDF der App) ----
const GPS_WEAK_M = 50;
const mapLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&amp;query=${lat.toFixed(6)},${lng.toFixed(6)}`;
function stamp(label: string, lat?: number | null, lng?: number | null, acc?: number | null, at?: string | null, dist?: number | null, mocked?: boolean | null): string {
  if (lat == null || lng == null) return `<div><b>${label}:</b> kein GPS</div>`;
  const warn: string[] = [];
  if (acc != null && acc > GPS_WEAK_M) warn.push(`Ortung ungenau (±${Math.round(acc)} m)`);
  if (dist != null && dist > Math.max(100, (acc ?? 0) * 2)) warn.push(`${Math.round(dist)} m vom Objekt entfernt`);
  if (mocked) warn.push('Fake-GPS gemeldet (Android)');
  return `<div><b>${label}</b>${at ? ` ${fmtTime(at)}` : ''} · ${lat.toFixed(5)}, ${lng.toFixed(5)}${acc != null ? ` · ±${Math.round(acc)} m` : ''}${
    dist != null ? ` · ${Math.round(dist)} m vom Objekt` : ''
  } · <a href="${mapLink(lat, lng)}">Karte</a></div>${warn.map((w) => `<div style="color:#B91C1C;font-weight:700">Achtung: ${w}</div>`).join('')}`;
}
function gpsProofCell(op: OperationWithPhotos): string {
  if (op.lat == null && op.end_lat == null) return '<span style="color:#B91C1C;font-weight:700">kein GPS-Stempel</span>';
  return stamp('Beginn', op.lat, op.lng, op.gps_accuracy_m, op.gps_at, op.distance_m, op.gps_mocked) +
    (op.end_lat != null ? stamp('Ende', op.end_lat, op.end_lng, op.end_accuracy_m, op.end_gps_at, op.end_distance_m, op.end_mocked) : '');
}
const PROOF_NOTE = `<p class="small" style="border:1.5px solid #AFC1D2;border-radius:8px;padding:8px 12px;page-break-inside:avoid">
  <b>Prüffester GPS-Nachweis.</b> Jeder Einsatz trägt zwei GPS-Stempel (Beginn und Speichern) mit Uhrzeit der Ortung und Genauigkeit.
  Abstand zum hinterlegten Objekt-Standort und Server-Eingang berechnet der Server selbst — unabhängig von Handy-Uhr und App.
  Jeder Eintrag erhält beim Eingang einen Prüfcode (SHA-256 über alle Nachweisfelder); eine spätere Änderung ist technisch gesperrt.
  Hinweise in Rot: Ortung ungenauer als ±${GPS_WEAK_M} m, mehr als 100 m vom Objekt entfernt oder Fake-GPS gemeldet.
  Einträge ohne Prüfcode wurden vor Einführung des Prüfcodes erfasst.</p>`;

export function buildReportHtml(
  org: Org,
  property: Property,
  ops: OperationWithPhotos[],
  periodLabel: string,
): string {
  const hasProof = ops.some((o) => !!o.entry_hash);
  const rows = ops
    .map((op) => {
      const action = op.canceled
        ? `<s>${esc(ACTION_LABELS[op.action])}</s><br><b>STORNIERT</b> ${
            op.cancel_reason ? `— ${esc(op.cancel_reason)}` : ''
          }`
        : esc(ACTION_LABELS[op.action]);
      const grit = esc(gritLabel(op.grit_material, op.grit_amount));
      const time = `${fmtDate(op.started_at)}<br>${fmtTime(op.started_at)}${
        op.ended_at ? ` – ${fmtTime(op.ended_at)}` : ''
      }`;
      const proof = op.entry_hash
        ? `<br><span class="small">Server-Eingang ${fmtDateTime(op.received_at ?? op.created_at)}</span><br><span class="small mono">Prüfcode ${esc(op.entry_hash.slice(0, 12))}</span>`
        : '';
      return `<tr class="${op.canceled ? 'canceled' : ''}">
        <td>${time}${proof}</td>
        <td>${action}${op.notes?.trim() ? `<div style="font-size:10px">Notiz: ${esc(op.notes.trim())}</div>` : ''}</td>
        <td>${grit}</td>
        <td>${esc(weatherLabel(op.weather))}</td>
        <td class="small">${gpsProofCell(op)}</td>
        <td>${esc(op.performer_name ?? '—')}</td>
        <td>${op.photo_urls.length || '—'}</td>
      </tr>`;
    })
    .join('');

  const photoBlocks = ops
    .filter((op) => op.photo_urls.length > 0)
    .map(
      (op) => `<div class="photo-group">
        <h3>${fmtDateTime(op.started_at)} — ${esc(ACTION_LABELS[op.action])}${
          op.canceled ? ' (STORNIERT)' : ''
        }</h3>
        <div class="photos">
          ${op.photo_urls.map((src, i) => `<img src="${esc(src)}" alt="Beweisfoto ${i + 1}">`).join('')}
        </div>
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Winterdienst-Nachweis — ${esc(property.name)}</title>
<style>thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #16202b; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #075985; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .meta { color: #51606f; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #f0f7fc; border-left: 3px solid #0284c7; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1.5px solid #9CA5AD; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eaf2f8; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.canceled td { color: #8a97a3; background: #fafbfc; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos img { width: 180px; border: 1.5px solid #9CA5AD; border-radius: 4px; }
  .photo-group { break-inside: avoid; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1.5px solid #9CA5AD; color: #51606f; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Winterdienst-Nachweis</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  <div class="meta">Objekt: <b>${esc(property.name)}</b> · ${esc(property.address)}</div>
  ${property.customer_name ? `<div class="meta">Auftraggeber: ${esc(property.customer_name)}</div>` : ''}
  <div class="meta">Zeitraum: ${esc(periodLabel)} · Einsätze: ${
    ops.filter((o) => !o.canceled).length
  }${
    ops.some((o) => o.canceled)
      ? ` (zzgl. ${ops.filter((o) => o.canceled).length} stornierte Einträge, gekennzeichnet)`
      : ''
  }</div>
  <div class="legal">${esc(LEGAL_BASIS[org.land])}</div>

  <table>
    <thead>
      <tr>
        <th>Datum / Uhrzeit</th>
        <th>Maßnahme</th>
        <th>Streumittel</th>
        <th>Wetterlage (archiviert)</th>
        <th>GPS-Stempel</th>
        <th>Dokumentiert von</th>
        <th>Fotos</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="7">Keine Einsätze im Zeitraum.</td></tr>'}</tbody>
  </table>

  ${photoBlocks ? `<h2>Foto-Anhang</h2>${photoBlocks}` : ''}
  ${hasProof ? PROOF_NOTE : ''}

  <div class="footer">
    <span>Erstellt mit WinterDex — winterdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}
