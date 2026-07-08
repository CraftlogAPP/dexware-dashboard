// Nachweis-PDF (Kontrollbuch) — HTML-Aufbau nach dem Muster von mobile/src/pdf/report.ts,
// Ausgabe über das Druck-Dialogfeld des Browsers (dort „Als PDF speichern").

import { fmtDate, fmtDateTime, fmtTime, gpsLabel } from '../lib/format';
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

export function buildReportHtml(
  org: Org,
  property: Property,
  ops: OperationWithPhotos[],
  periodLabel: string,
): string {
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
      return `<tr class="${op.canceled ? 'canceled' : ''}">
        <td>${time}</td>
        <td>${action}</td>
        <td>${grit}</td>
        <td>${esc(weatherLabel(op.weather))}</td>
        <td class="mono">${esc(gpsLabel(op.lat, op.lng, op.gps_accuracy_m))}</td>
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
          ${op.photo_urls.map((src, i) => `<img src="${src}" alt="Beweisfoto ${i + 1}">`).join('')}
        </div>
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Winterdienst-Nachweis — ${esc(property.name)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #16202b; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #075985; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .meta { color: #51606f; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #f0f7fc; border-left: 3px solid #0284c7; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c8d4de; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eaf2f8; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.canceled td { color: #8a97a3; background: #fafbfc; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos img { width: 180px; border: 1px solid #c8d4de; border-radius: 4px; }
  .photo-group { break-inside: avoid; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #c8d4de; color: #51606f; font-size: 10.5px; display: flex; justify-content: space-between; }
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

  <div class="footer">
    <span>Erstellt mit WinterDex — winterdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}

/** Öffnet den Bericht in einem neuen Fenster und startet den Druckdialog. */
export function openReportWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Nicht nur aufs load-Event verlassen — je nach Browser hat es nach
  // document.close() bereits gefeuert und der Listener käme zu spät.
  const printOnce = (() => {
    let done = false;
    return () => {
      if (done || win.closed) return;
      done = true;
      // kurze Pause, damit eingebettete Base64-Fotos gerendert sind
      setTimeout(() => win.print(), 300);
    };
  })();
  if (win.document.readyState === 'complete') {
    printOnce();
  } else {
    win.addEventListener('load', printOnce);
    setTimeout(printOnce, 1500); // Fallback, falls load nie feuert
  }
  return true;
}
