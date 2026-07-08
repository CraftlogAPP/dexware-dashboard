// Prüfliste (Geräteliste mit Prüfstatus) je Kunde — Ausgabe über
// openReportWindow (src/lib/print.ts) im Browser-Druckdialog.
// Einzelprotokolle je Prüfung erzeugt die App; die Prüfliste ist der
// Dashboard-Mehrwert: alle Geräte eines Kunden mit Fristen auf einen Blick.

import { fmtDate, fmtDateTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { dueStatus, skLabel, type DueStatus } from './labels';
import {
  LEGAL_BASIS,
  RESULT_LABELS,
  type Customer,
  type Device,
  type InspectionResult,
} from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DUE_TEXT: Record<DueStatus, string> = {
  ok: 'ok',
  soon: 'bald fällig',
  overdue: 'ÜBERFÄLLIG',
  none: 'ungeprüft',
};

export interface DeviceRow {
  device: Device;
  lastInspectedAt: string | null;
  lastResult: InspectionResult | null;
}

export function buildReportHtml(
  org: Org,
  customer: Customer | null,
  rows: DeviceRow[],
): string {
  const overdue = rows.filter((r) => dueStatus(r.device.next_due_date) === 'overdue');

  const tableRows = rows
    .map(({ device: d, lastInspectedAt, lastResult }) => {
      const st = dueStatus(d.next_due_date);
      return `<tr class="${st === 'overdue' ? 'overdue' : ''}">
        <td>${esc(d.name)}${d.device_type ? `<div class="note">${esc(d.device_type)}</div>` : ''}</td>
        <td class="mono">${esc(d.qr_code ?? '—')}</td>
        <td>${esc(skLabel(d.protection_class))}</td>
        <td>${esc(d.location_note ?? '—')}</td>
        <td>${lastInspectedAt ? fmtDate(lastInspectedAt) : '—'}${
          lastResult ? `<div class="note">${esc(RESULT_LABELS[lastResult])}</div>` : ''
        }</td>
        <td>${d.next_due_date ? fmtDate(d.next_due_date) : '—'} · ${DUE_TEXT[st]}</td>
        <td>alle ${d.interval_months} Monate</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>DGUV-V3-Prüfliste — ${esc(customer?.name ?? 'Alle Geräte')}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #16202b; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #1d4ed8; }
  .meta { color: #51606f; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #eff4fd; border-left: 3px solid #1d4ed8; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c8d0de; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #e8eefa; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.overdue td { background: #fdf1f0; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .note { font-size: 10.5px; color: #51606f; margin-top: 2px; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #c8d0de; color: #51606f; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>DGUV-V3-Prüfliste</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  ${
    customer
      ? `<div class="meta">Kunde/Standort: <b>${esc(customer.name)}</b>${
          customer.address ? ` · ${esc(customer.address)}` : ''
        }</div>`
      : '<div class="meta">Alle Geräte des Betriebs</div>'
  }
  <div class="meta">Geräte: ${rows.length}${
    overdue.length > 0 ? ` · davon ${overdue.length} ÜBERFÄLLIG` : ' · keine überfällig'
  }</div>
  <div class="legal">${esc(LEGAL_BASIS)}</div>

  <table>
    <thead>
      <tr>
        <th>Gerät</th>
        <th>QR/Etikett</th>
        <th>Schutzklasse</th>
        <th>Standort</th>
        <th>Letzte Prüfung</th>
        <th>Nächste Prüfung</th>
        <th>Intervall</th>
      </tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="7">Keine Geräte erfasst.</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <span>Erstellt mit PrüfDex — pruefdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}
