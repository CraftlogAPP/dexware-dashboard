// Prüfbericht Feuerlöscher — HTML-Aufbau nach dem Muster von mobile/src/pdf/report.ts,
// Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.

import { fmtDateTime, gpsLabel } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { checklistSummary, extinguisherTypeLabel, fillingLabel } from './labels';
import {
  INSPECTION_LABELS,
  LEGAL_BASIS,
  SEVERITY_LABELS,
  type DefectWithPhotos,
  type Extinguisher,
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

function extinguisherName(id: string | null, extinguishers: Extinguisher[]): string {
  if (!id) return 'Standort allgemein';
  return extinguishers.find((e) => e.id === id)?.name ?? 'Feuerlöscher';
}

function inspectionRow(i: InspectionWithPhotos, extinguishers: Extinguisher[]): string {
  const storno = i.canceled
    ? `<div class="storno">STORNIERT: ${esc(i.cancel_reason ?? '')}${
        i.canceled_at ? ` (${fmtDateTime(i.canceled_at)})` : ''
      }</div>`
    : '';
  return `<tr class="${i.canceled ? 'canceled' : ''}">
    <td>${fmtDateTime(i.started_at)}</td>
    <td>${esc(extinguisherName(i.extinguisher_id, extinguishers))}</td>
    <td>${esc(INSPECTION_LABELS[i.type])}${storno}</td>
    <td>${esc(checklistSummary(i.checklist))}${
      i.notes ? `<div class="note">Notiz: ${esc(i.notes)}</div>` : ''
    }</td>
    <td class="mono">${esc(gpsLabel(i.lat, i.lng, i.gps_accuracy_m))}</td>
    <td>${esc(i.inspector_name ?? '—')}</td>
    <td>${i.photo_urls.length || '—'}</td>
  </tr>`;
}

function defectRow(d: DefectWithPhotos, extinguishers: Extinguisher[]): string {
  const resolution =
    d.status === 'resolved'
      ? `<div class="resolved">✓ Behoben${d.resolved_at ? ` ${fmtDateTime(d.resolved_at)}` : ''}${
          d.resolver_name ? ` von ${esc(d.resolver_name)}` : ''
        }${d.resolution_note ? ` — ${esc(d.resolution_note)}` : ''}</div>`
      : '<div class="open">OFFEN</div>';
  return `<tr>
    <td>${fmtDateTime(d.created_at)}</td>
    <td>${esc(d.title)}${d.description ? `<div class="note">${esc(d.description)}</div>` : ''}${resolution}</td>
    <td>${esc(extinguisherName(d.extinguisher_id, extinguishers))}${d.extinguisher_blocked ? '<div class="storno">Außer Betrieb — Benutzung entzogen</div>' : ''}</td>
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
  extinguishers: Extinguisher[],
  periodLabel: string,
): string {
  const rows = inspections.map((i) => inspectionRow(i, extinguishers)).join('');
  const active = inspections.filter((i) => !i.canceled).length;
  const openCount = defects.filter((d) => d.status === 'open').length;

  const activeExtinguishers = extinguishers.filter((e) => !e.retired);
  const inventory =
    activeExtinguishers.length > 0
      ? `<div class="meta"><b>Feuerlöscher-Inventar:</b> ${activeExtinguishers
          .map(
            (e) =>
              `${esc(e.name)} (${esc(extinguisherTypeLabel(e.category, e.build_type))}${
                e.filling_kg || e.rating_le ? `, ${esc(fillingLabel(e.filling_kg, e.rating_le))}` : ''
              })`,
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
      <th>Gemeldet</th><th>Mangel / Instandsetzung</th><th>Feuerlöscher</th><th>Einstufung (Ampel)</th><th>Gemeldet von</th>
    </tr></thead>
    <tbody>${defects.map((d) => defectRow(d, extinguishers)).join('')}</tbody>
  </table>`
      : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Prüfbericht Feuerlöscher — ${esc(site.name)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #211a15; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #B91C1C; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .meta { color: #6b5e55; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #fdf0ef; border-left: 3px solid #EF4444; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e4d9d2; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f8f1ed; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.canceled td { color: #9a8d84; background: #fbfaf9; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .note { font-size: 10.5px; color: #6b5e55; margin-top: 2px; }
  .storno { color: #dc2626; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .open { color: #d97706; font-size: 10.5px; font-weight: 800; margin-top: 2px; }
  .resolved { color: #16a34a; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos img { width: 180px; border: 1px solid #e4d9d2; border-radius: 4px; }
  .photo-group { break-inside: avoid; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e4d9d2; color: #6b5e55; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Prüfbericht Feuerlöscher</h1>
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
        <th>Feuerlöscher</th>
        <th>Prüfart</th>
        <th>Ergebnis (Checkliste ASR A2.2 / DIN 14406-4)</th>
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
    <span>Einträge sind append-only dokumentiert; Korrekturen nur als gekennzeichnete Stornos. Erstellt mit FeuerDex — feuerdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}
