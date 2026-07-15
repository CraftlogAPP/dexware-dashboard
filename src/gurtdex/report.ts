// Prüfbericht PSA gegen Absturz — HTML-Aufbau nach dem Muster von mobile/src/pdf/report.ts,
// Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.

import { fmtDateTime, gpsLabel } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { checklistSummary, itemTypeLabel, itemMetaLabel } from './labels';
import {
  INSPECTION_LABELS,
  lifespanWarning,
  LEGAL_BASIS,
  SEVERITY_LABELS,
  type DefectWithPhotos,
  type PsaItem,
  type InspectionWithPhotos,
  type Site,
} from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemName(id: string | null, items: PsaItem[]): string {
  if (!id) return 'Standort allgemein';
  return items.find((e) => e.id === id)?.name ?? 'PSA-Artikel';
}

function inspectionRow(i: InspectionWithPhotos, items: PsaItem[]): string {
  const storno = i.canceled
    ? `<div class="storno">STORNIERT: ${esc(i.cancel_reason ?? '')}${
        i.canceled_at ? ` (${fmtDateTime(i.canceled_at)})` : ''
      }</div>`
    : '';
  return `<tr class="${i.canceled ? 'canceled' : ''}">
    <td>${fmtDateTime(i.started_at)}</td>
    <td>${esc(itemName(i.item_id, items))}</td>
    <td>${esc(INSPECTION_LABELS[i.type])}${storno}</td>
    <td>${esc(checklistSummary(i.checklist))}${
      i.notes ? `<div class="note">Notiz: ${esc(i.notes)}</div>` : ''
    }</td>
    <td class="mono">${esc(gpsLabel(i.lat, i.lng, i.gps_accuracy_m))}</td>
    <td>${esc(i.inspector_name ?? '—')}</td>
    <td>${i.photo_urls.length || '—'}</td>
  </tr>`;
}

function defectRow(d: DefectWithPhotos, items: PsaItem[]): string {
  const resolution =
    d.status === 'resolved'
      ? `<div class="resolved">✓ Behoben${d.resolved_at ? ` ${fmtDateTime(d.resolved_at)}` : ''}${
          d.resolver_name ? ` von ${esc(d.resolver_name)}` : ''
        }${d.resolution_note ? ` — ${esc(d.resolution_note)}` : ''}</div>`
      : '<div class="open">OFFEN</div>';
  return `<tr>
    <td>${fmtDateTime(d.created_at)}</td>
    <td>${esc(d.title)}${d.description ? `<div class="note">${esc(d.description)}</div>` : ''}${resolution}</td>
    <td>${esc(itemName(d.item_id, items))}${d.item_blocked ? '<div class="storno">Der Benutzung entzogen — gekennzeichnet/aussortiert</div>' : ''}</td>
    <td>${esc(SEVERITY_LABELS[d.severity])}</td>
    <td>${esc(d.reporter_name ?? '—')}</td>
  </tr>`;
}

function photoAppendix(
  inspections: InspectionWithPhotos[],
  defects: DefectWithPhotos[],
): string {
  const blocks: string[] = [];
  for (const i of inspections) {
    if (i.photo_urls.length === 0) continue;
    blocks.push(`<div class="photo-group">
      <h3>${fmtDateTime(i.started_at)} — ${esc(INSPECTION_LABELS[i.type])}${
        i.canceled ? ' (STORNIERT)' : ''
      }</h3>
      <div class="photos">
        ${i.photo_urls.map((src, n) => `<img src="${esc(src)}" alt="Beweisfoto ${n + 1}">`).join('')}
      </div>
    </div>`);
  }
  for (const d of defects) {
    const photos = [...d.photo_urls, ...d.resolution_photo_urls];
    if (photos.length === 0) continue;
    blocks.push(`<div class="photo-group">
      <h3>Mangel: ${esc(d.title)} (${fmtDateTime(d.created_at)})</h3>
      <div class="photos">
        ${photos.map((src, n) => `<img src="${esc(src)}" alt="Mangelfoto ${n + 1}">`).join('')}
      </div>
    </div>`);
  }
  return blocks.length ? `<h2>Anhang: Beweisfotos</h2>${blocks.join('')}` : '';
}

export function buildReportHtml(
  org: Org,
  site: Site,
  inspections: InspectionWithPhotos[],
  defects: DefectWithPhotos[],
  items: PsaItem[],
  periodLabel: string,
): string {
  const rows = inspections.map((i) => inspectionRow(i, items)).join('');
  const active = inspections.filter((i) => !i.canceled).length;
  const openCount = defects.filter((d) => d.status === 'open').length;

  const activeItems = items.filter((e) => !e.retired);
  const inventory =
    activeItems.length > 0
      ? `<div class="meta"><b>PSA-Inventar:</b> ${activeItems
          .map(
            (e) =>
              `${esc(e.name)} (${esc(itemTypeLabel(e.category, e.manufacturer, e.model))}${
                e.manufacture_date || e.max_life_years || e.wearer_name ? `, ${esc(itemMetaLabel(e.manufacture_date, e.max_life_years, e.wearer_name))}` : ''
              }${e.serial_no ? `, Nr. ${esc(e.serial_no)}` : ''}${lifespanWarning(e) ? `, ⚠ ${esc(lifespanWarning(e)!)}` : ''})`,
          )
          .join(' · ')}</div>`
      : '';

  const defectTable =
    defects.length > 0
      ? `<h2>Mängel im Zeitraum (${defects.length}${
          openCount > 0 ? `, davon ${openCount} offen` : ', alle behoben'
        })</h2>
  <table>
    <thead><tr>
      <th>Gemeldet</th><th>Mangel / Erledigung</th><th>Artikel</th><th>Einstufung (Ampel)</th><th>Gemeldet von</th>
    </tr></thead>
    <tbody>${defects.map((d) => defectRow(d, items)).join('')}</tbody>
  </table>`
      : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Prüfbericht PSA gegen Absturz — ${esc(site.name)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1b1526; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #BE185D; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .meta { color: #6b6478; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #fdf2f8; border-left: 3px solid #DB2777; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e0d9ee; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f0fb; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.canceled td { color: #948da4; background: #fbfafd; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .note { font-size: 10.5px; color: #6b6478; margin-top: 2px; }
  .storno { color: #dc2626; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .open { color: #d97706; font-size: 10.5px; font-weight: 800; margin-top: 2px; }
  .resolved { color: #16a34a; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos img { width: 180px; border: 1px solid #e0d9ee; border-radius: 4px; }
  .photo-group { break-inside: avoid; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e0d9ee; color: #6b6478; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Prüfbericht PSA gegen Absturz (PSAgA)</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  <div class="meta">Standort: <b>${esc(site.name)}</b> · ${esc(site.address)}</div>
  ${
    site.operator_name
      ? `<div class="meta">Betreiber/Auftraggeber: ${esc(site.operator_name)}</div>`
      : ''
  }
  <div class="meta">Zeitraum: ${esc(periodLabel)} · Prüfungen: ${active}${
    inspections.length !== active
      ? ` (zzgl. ${inspections.length - active} stornierte Einträge, gekennzeichnet)`
      : ''
  }</div>
  ${inventory}
  <div class="legal">${esc(LEGAL_BASIS[org.land])}</div>

  <table>
    <thead>
      <tr>
        <th>Datum / Uhrzeit</th>
        <th>Artikel</th>
        <th>Prüfart</th>
        <th>Ergebnis (Checkliste DGUV G 312-906 / EN 365)</th>
        <th>GPS-Stempel</th>
        <th>Geprüft von</th>
        <th>Fotos</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="7">Keine Prüfungen im Zeitraum.</td></tr>'}</tbody>
  </table>

  ${defectTable}

  ${photoAppendix(inspections, defects)}

  <div class="footer">
    <span>Einträge sind append-only dokumentiert; Korrekturen nur als gekennzeichnete Stornos. Erstellt mit GurtDex — gurtdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}
