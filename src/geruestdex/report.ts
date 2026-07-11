// Prüfbericht Gerüst — HTML-Aufbau nach dem Muster von mobile/src/pdf/report.ts,
// Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.

import { fmtDateTime, gpsLabel } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { checklistSummary, classLabel, erectedLabel } from './labels';
import {
  INSPECTION_LABELS,
  LEGAL_BASIS,
  SEVERITY_LABELS,
  type DamageWithPhotos,
  type InspectionWithPhotos,
  type Scaffold,
  type Site,
} from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scaffoldName(id: string | null, scaffolds: Scaffold[]): string {
  if (!id) return 'Baustelle allgemein';
  return scaffolds.find((sc) => sc.id === id)?.name ?? 'Gerüst';
}

function inspectionRow(i: InspectionWithPhotos): string {
  const storno = i.canceled
    ? `<div class="storno">STORNIERT: ${esc(i.cancel_reason ?? '')}${
        i.canceled_at ? ` (${fmtDateTime(i.canceled_at)})` : ''
      }</div>`
    : '';
  return `<tr class="${i.canceled ? 'canceled' : ''}">
    <td>${fmtDateTime(i.started_at)}</td>
    <td>${esc(INSPECTION_LABELS[i.type])}${storno}</td>
    <td>${esc(checklistSummary(i.checklist))}${
      i.notes ? `<div class="note">Notiz: ${esc(i.notes)}</div>` : ''
    }</td>
    <td class="mono">${esc(gpsLabel(i.lat, i.lng, i.gps_accuracy_m))}</td>
    <td>${esc(i.inspector_name ?? '—')}</td>
    <td>${i.photo_urls.length || '—'}</td>
  </tr>`;
}

function damageRow(d: DamageWithPhotos, scaffolds: Scaffold[]): string {
  const resolution =
    d.status === 'resolved'
      ? `<div class="resolved">✓ Behoben${d.resolved_at ? ` ${fmtDateTime(d.resolved_at)}` : ''}${
          d.resolver_name ? ` von ${esc(d.resolver_name)}` : ''
        }${d.resolution_note ? ` — ${esc(d.resolution_note)}` : ''}</div>`
      : '<div class="open">OFFEN</div>';
  return `<tr>
    <td>${fmtDateTime(d.created_at)}</td>
    <td>${esc(d.title)}${d.description ? `<div class="note">${esc(d.description)}</div>` : ''}${resolution}</td>
    <td>${esc(scaffoldName(d.scaffold_id, scaffolds))}${d.scaffold_blocked ? '<div class="storno">Gesperrt — Benutzung untersagt</div>' : ''}</td>
    <td>${esc(SEVERITY_LABELS[d.severity])}</td>
    <td>${esc(d.reporter_name ?? '—')}</td>
  </tr>`;
}

function photoAppendix(
  inspections: InspectionWithPhotos[],
  damages: DamageWithPhotos[],
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
  for (const d of damages) {
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
  damages: DamageWithPhotos[],
  scaffolds: Scaffold[],
  periodLabel: string,
): string {
  const rows = inspections.map((i) => inspectionRow(i)).join('');
  const active = inspections.filter((i) => !i.canceled).length;
  const openCount = damages.filter((d) => d.status === 'open').length;

  const activeScaffolds = scaffolds.filter((sc) => !sc.retired);
  const inventory =
    activeScaffolds.length > 0
      ? `<div class="meta"><b>Gerüst-Inventar:</b> ${activeScaffolds
          .map(
            (sc) =>
              `${esc(sc.name)} (${esc(sc.category)}${
                sc.load_class || sc.width_class
                  ? `, ${esc(classLabel(sc.load_class, sc.width_class))}`
                  : ''
              }${
                sc.erected_at || sc.erected_by
                  ? `, aufgebaut ${esc(erectedLabel(sc.erected_at, sc.erected_by))}`
                  : ''
              })`,
          )
          .join(' · ')}</div>`
      : '';

  const damageTable =
    damages.length > 0
      ? `<h2>Mängel im Zeitraum (${damages.length}${
          openCount > 0 ? `, davon ${openCount} offen` : ', alle behoben'
        })</h2>
  <table>
    <thead><tr>
      <th>Gemeldet</th><th>Mangel / Behebung</th><th>Gerüst</th><th>Einstufung (Ampel)</th><th>Gemeldet von</th>
    </tr></thead>
    <tbody>${damages.map((d) => damageRow(d, scaffolds)).join('')}</tbody>
  </table>`
      : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Prüfbericht Gerüst — ${esc(site.name)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #14201d; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #0F766E; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .meta { color: #5b6b66; margin-bottom: 4px; }
  .legal { margin: 10px 0 18px; padding: 8px 12px; background: #ecfdf8; border-left: 3px solid #14B8A6; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d5e4df; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eef8f5; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.canceled td { color: #8b9a94; background: #f9fbfa; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; }
  .note { font-size: 10.5px; color: #5b6b66; margin-top: 2px; }
  .storno { color: #dc2626; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .open { color: #d97706; font-size: 10.5px; font-weight: 800; margin-top: 2px; }
  .resolved { color: #16a34a; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos img { width: 180px; border: 1px solid #d5e4df; border-radius: 4px; }
  .photo-group { break-inside: avoid; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #d5e4df; color: #5b6b66; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Prüfbericht Gerüst</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  <div class="meta">Baustelle: <b>${esc(site.name)}</b> · ${esc(site.address)}</div>
  ${
    site.operator_name
      ? `<div class="meta">Auftraggeber/Bauherr: ${esc(site.operator_name)}</div>`
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
        <th>Prüfart</th>
        <th>Ergebnis (Checkliste TRBS 2121-1)</th>
        <th>GPS-Stempel</th>
        <th>Geprüft von</th>
        <th>Fotos</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">Keine Prüfungen im Zeitraum.</td></tr>'}</tbody>
  </table>

  ${damageTable}

  ${photoAppendix(inspections, damages)}

  <div class="footer">
    <span>Einträge sind append-only dokumentiert; Korrekturen nur als gekennzeichnete Stornos. Erstellt mit GerüstDex — geruestdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}
