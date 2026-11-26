// Nachweis-PDF (Kontrollbuch) — HTML-Aufbau nach dem Muster von mobile/src/pdf/report.ts,
// Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.

import { fmtDate, fmtDateTime, fmtTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { isSafeImgSrc } from '../lib/imgSrc';
import { gritLabel, WEATHER_SOURCE_HTML, weatherLabel } from './labels';
import { nachweisZone, zonenHinweis } from './nachweisZeit';
import { WETTER_PDF_STYLE, wetterAnhangHtml, wetterZelleHtml, type WetterBeleg, type WetterInfo } from './wetterBeleg';
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
function stamp(label: string, lat?: number | null, lng?: number | null, acc?: number | null, at?: string | null, dist?: number | null, mocked?: boolean | null, timeZone?: string): string {
  if (lat == null || lng == null) return `<div><b>${label}:</b> kein GPS</div>`;
  const warn: string[] = [];
  if (acc != null && acc > GPS_WEAK_M) warn.push(`Ortung ungenau (±${Math.round(acc)} m)`);
  if (dist != null && dist > Math.max(100, (acc ?? 0) * 2)) warn.push(`${Math.round(dist)} m vom Objekt entfernt`);
  if (mocked) warn.push('Fake-GPS gemeldet (Android)');
  return `<div><b>${label}</b>${at ? ` ${fmtTime(at, timeZone)}` : ''} · ${lat.toFixed(5)}, ${lng.toFixed(5)}${acc != null ? ` · ±${Math.round(acc)} m` : ''}${
    dist != null ? ` · ${Math.round(dist)} m vom Objekt` : ''
  } · <a href="${mapLink(lat, lng)}">Karte</a></div>${warn.map((w) => `<div style="color:#B91C1C;font-weight:700">Achtung: ${w}</div>`).join('')}`;
}
function gpsProofCell(op: OperationWithPhotos, timeZone?: string): string {
  if (op.lat == null && op.end_lat == null) return '<span style="color:#B91C1C;font-weight:700">kein GPS-Stempel</span>';
  return stamp('Beginn', op.lat, op.lng, op.gps_accuracy_m, op.gps_at, op.distance_m, op.gps_mocked, timeZone) +
    (op.end_lat != null
      ? stamp('Ende', op.end_lat, op.end_lng, op.end_accuracy_m, op.end_gps_at, op.end_distance_m, op.end_mocked, timeZone)
      : // Seit 20.11.2026 nur aus einer höchstens 2 Minuten alten Position — sonst bewusst keiner (z. B. Handy gesperrt).
        // Ausdrücklich nennen, damit das Fehlen nicht wie ein Lesefehler wirkt (gps_at = Einsatz mit Prüfnachweis-Feldern). Wie die App.
        op.gps_at
        ? '<div><b>Ende:</b> kein GPS-Stempel (beim Speichern keine aktuelle Position)</div>'
        : '');
}
export const PROOF_NOTE = `<p class="small" style="border:1.5px solid #AFC1D2;border-radius:8px;padding:8px 12px;page-break-inside:avoid">
  <b>Prüffester GPS-Nachweis.</b> Jeder Einsatz trägt einen GPS-Stempel zu Beginn und — wenn beim Speichern eine höchstens 2 Minuten
  alte Position vorlag — einen zweiten beim Speichern, jeweils mit Uhrzeit der Ortung und Genauigkeit; fehlt ein Stempel, steht das beim Einsatz.
  Abstand zum hinterlegten Objekt-Standort und Server-Eingang berechnet der Server selbst — unabhängig von Handy-Uhr und App.
  Jeder Eintrag erhält beim Eingang einen Prüfcode (SHA-256 über alle Nachweisfelder); eine spätere Änderung ist technisch gesperrt.
  Hinweise in Rot: Ortung ungenauer als ±${GPS_WEAK_M} m, mehr als 100 m vom Objekt entfernt oder Fake-GPS gemeldet.
  Einträge ohne Prüfcode wurden vor Einführung des Prüfcodes erfasst.</p>`;

// Kennzeichen „nachgetragen“ setzt der Server beim Eingang (NACHTRAG-PRUEFUNG-2026-11-21.sql), nicht änderbar
export const NACHTRAG_NOTE = `<p class="small" style="page-break-inside:avoid"><b style="color:#B91C1C">* Nachgetragen:</b> Der Einsatz hat
  keinen GPS-Stempel und ist erst mehr als 15 Minuten nach seinem Ende beim Server eingegangen — im Dashboard nachgetragen
  oder ohne Ortung erfasst und später übertragen. Das Kennzeichen setzt der Server beim Eingang; es ist nicht änderbar.</p>`;

/** Foto-Spalte: nennt die WIRKLICHE Zahl. Fehlen im Bericht welche (nicht ladbar, unsichere Quelle), steht das da —
 *  sonst sähe es aus, als hätte der Einsatz keine Fotos. Gleicher Wortlaut wie die App (pdf/report.ts fotoZelle). */
function fotoZelle(op: OperationWithPhotos, ohneAnhang = false): string {
  const drin = op.photo_urls.filter(isSafeImgSrc).length;
  const gesamt = Math.max(drin, op.photo_total ?? 0);
  if (gesamt === 0) return '—';
  // Bericht bewusst ohne Foto-Anhang (z. B. Ganzjahres-Nachweis „ohne Fotos“): nur die Zahl, kein Warnhinweis
  if (drin === gesamt || ohneAnhang) return `${gesamt} Foto${gesamt === 1 ? '' : 's'}`;
  return `${gesamt} Foto${gesamt === 1 ? '' : 's'}<div style="font-size:10px;color:#B91C1C;font-weight:700">${drin === 0 ? 'in diesem Bericht nicht enthalten' : `davon ${drin} in diesem Bericht`} — weiterhin beim Einsatz gespeichert</div>`;
}

/**
 * Einsatz-Tabelle des Nachweises (Datum/Uhrzeit mit Server-Eingang + Prüfcode, Maßnahme, Streumittel, Wetterlage,
 * GPS-Stempel, Person, Fotos) — auch für den Ganzjahres-Nachweis im ObjektDex-Bereich. Klassen: canceled, small, mono.
 * `ohneFotoAnhang`: Fotos werden nur gezählt, nicht angehängt. `timeZone`: Ortszeit des Betriebs (nachweisZone) — ohne Angabe
 * die Zeitzone des Geräts (wie bisher, z. B. Ganzjahres-Nachweis). `wetter`: Wetterverlauf je Einsatz (wetter_beleg, Bauplan
 * P3) — mit Beleg Kurzsatz (G13) + Wetter-Prüfcode, ohne Beleg der bisherige Schnappschuss (Stand klein darunter); ohne
 * Wetter-Daten (null), „aus“ und „nur_pro“ (Free) genau wie bisher.
 */
export function einsatzTabelle(ops: OperationWithPhotos[], ohneFotoAnhang = false, timeZone?: string, wetter: Map<string, WetterInfo> | null = null): string {
  // Überschrift „Wetter“ nur, wenn mindestens ein Einsatz einen Wetterverlauf hat (sonst bleibt „Wetterlage (archiviert)“)
  const mitWetter = !!wetter && ops.some((o) => !!wetter.get(o.id)?.beleg);
  const rows = ops
    .map((op) => {
      const action = op.canceled
        ? `<s>${esc(ACTION_LABELS[op.action])}</s><br><b>STORNIERT</b> ${
            op.cancel_reason ? `— ${esc(op.cancel_reason)}` : ''
          }`
        : esc(ACTION_LABELS[op.action]);
      const grit = esc(gritLabel(op.grit_material, op.grit_amount));
      const time = `${fmtDate(op.started_at, timeZone)}<br>${fmtTime(op.started_at, timeZone)}${
        op.ended_at ? ` – ${fmtTime(op.ended_at, timeZone)}` : ''
      }`;
      const proof =
        (op.entry_hash
          ? `<br><span class="small">Server-Eingang ${fmtDateTime(op.received_at ?? op.created_at, timeZone)}</span><br><span class="small mono">Prüfcode ${esc(op.entry_hash.slice(0, 12))}</span>`
          : '') + (op.nachgetragen ? '<div style="color:#B91C1C;font-weight:700">Nachgetragen*</div>' : '');
      return `<tr class="${op.canceled ? 'canceled' : ''}">
        <td>${time}${proof}</td>
        <td>${action}${op.notes?.trim() ? `<div style="font-size:10px">Notiz: ${esc(op.notes.trim())}</div>` : ''}</td>
        <td>${grit}</td>
        <td>${wetterZelleHtml(wetter?.get(op.id), 'operation', op.weather, { canceled: op.canceled, tz: timeZone }) ?? esc(weatherLabel(op.weather))}</td>
        <td class="small">${gpsProofCell(op, timeZone)}</td>
        <td>${esc(op.performer_name ?? '—')}</td>
        <td>${fotoZelle(op, ohneFotoAnhang)}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead>
      <tr>
        <th>Datum / Uhrzeit</th>
        <th>Maßnahme</th>
        <th>Streumittel</th>
        <th>${mitWetter ? 'Wetter' : 'Wetterlage (archiviert)'}</th>
        <th>GPS-Stempel</th>
        <th>Dokumentiert von</th>
        <th>Fotos</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="7">Keine Einsätze im Zeitraum.</td></tr>'}</tbody>
  </table>`;
}

/** Foto-Anhang (leer, wenn kein Einsatz ein anzeigbares Foto hat). Klassen: photo-group, photos. */
export function fotoAnhang(ops: OperationWithPhotos[], timeZone?: string): string {
  return ops
    .filter((op) => op.photo_urls.some(isSafeImgSrc))
    .map(
      (op) => `<div class="photo-group">
        <h3>${fmtDateTime(op.started_at, timeZone)} — ${esc(ACTION_LABELS[op.action])}${
          op.canceled ? ' (STORNIERT)' : ''
        }</h3>
        <div class="photos">
          ${op.photo_urls.filter(isSafeImgSrc).map((src, i) => `<img src="${esc(src)}" alt="Beweisfoto ${i + 1}">`).join('')}
        </div>
      </div>`,
    )
    .join('');
}

export function buildReportHtml(
  org: Org,
  property: Property,
  ops: OperationWithPhotos[],
  periodLabel: string,
  /** Wetterverlauf je Einsatz (ladeWetter … wetterMap) — null: Nachtrag fehlt/Fehler → wie bisher */
  wetter: Map<string, WetterInfo> | null = null,
): string {
  const hasProof = ops.some((o) => !!o.entry_hash);
  // Uhrzeiten IMMER in der Ortszeit des Betriebs, nie in der des Geräts — wie der Fahrt-Nachweis (Regel 1 zu Fund 31)
  const tz = nachweisZone(org.land);
  const photoBlocks = fotoAnhang(ops, tz);
  const belege = ops.map((o) => wetter?.get(o.id)?.beleg).filter((b): b is WetterBeleg => !!b);

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
${WETTER_PDF_STYLE}
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
  <div class="meta">${esc(zonenHinweis(tz, org.land, ops.map((o) => Date.parse(o.started_at))))}</div>
  <div class="legal">${esc(LEGAL_BASIS[org.land])}</div>

  ${einsatzTabelle(ops, false, tz, wetter)}

  ${photoBlocks ? `<h2>Foto-Anhang</h2>${photoBlocks}` : ''}
  ${hasProof ? PROOF_NOTE : ''}
  ${ops.some((o) => o.nachgetragen) ? NACHTRAG_NOTE : ''}
  ${wetterAnhangHtml(belege)}

  <div class="footer">
    <span>Erstellt mit WinterDex — winterdex.dexware.app${ops.some((o) => o.weather) ? ` · ${WEATHER_SOURCE_HTML}` : ''}</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString(), tz)}</span>
  </div>
</body>
</html>`;
}
