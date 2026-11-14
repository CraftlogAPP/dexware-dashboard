// Nachweis-PDF je Objekt und Zeitraum — Aufbau wie in der App (ObjektDex/mobile/src/pdf/report.ts):
// Kopf, Soll/Ist je Leistung, Einsätze mit Person/GPS/Prüfcode, Fotos, Mängel, Erklärung des Prüfcodes.
// Ausgabe über openReportWindow (Browser-Druckdialog → „Als PDF speichern“). Ehrlich: „Leistungsnachweis“.
import { isSafeImgSrc } from '../lib/imgSrc';
import { fmtDateTimeB, fmtTimeB } from './parts';
import { cadenceText, dayOf, formatDay, isoDow, WEEKDAY_SHORT } from './turnus';
import type { OdDefect, OdOperation, OdProperty, OdService, OdSollIstRow } from './types';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface ReportInput {
  orgName: string;
  property: OdProperty;
  periodLabel: string;
  sollIst: OdSollIstRow[];
  services: OdService[];
  ops: OdOperation[];
  defects: OdDefect[];
  opPhotos: Map<string, string[]>;
  defectPhotos: Map<string, string[]>;
}

function sollIstCell(r: OdSollIstRow): string {
  if (r.soll == null) return `${r.ist}× (nach Bedarf)`;
  if (r.soll === 0) return `noch nicht fällig${r.ist ? ` · ${r.ist}× erledigt` : ''}`;
  const color = r.ist >= r.soll ? '#047857' : r.ist === 0 ? '#B91C1C' : '#C2410C';
  return `<b style="color:${color}">${r.ist} von ${r.soll}</b>`;
}

export function buildReportHtml(x: ReportInput): string {
  const p = x.property;
  const valid = x.ops.filter((o) => !o.canceled);
  const siRows = x.sollIst
    .map((r) => {
      const sv = x.services.find((s) => s.id === r.service_id);
      return `<tr><td>${esc(r.name)}</td><td>${esc(sv ? cadenceText({ cadence: sv.cadence, weekdays: sv.weekdays, monthDay: sv.month_day }) : '')}</td><td style="text-align:right">${sollIstCell(r)}</td></tr>`;
    })
    .join('');
  const opRows = [...x.ops]
    .sort((a, b) => (a.started_at < b.started_at ? -1 : 1))
    .map((o) => {
      const d = dayOf(o.started_at);
      const what = o.canceled
        ? `<s>${esc(o.services.map((s) => s.name).join(', '))}</s><br><b style="color:#B91C1C">STORNIERT</b> — ${esc(o.cancel_reason)}`
        : esc(o.services.map((s) => s.name).join(', ') || 'Kontrolle vor Ort') + (o.notes ? `<div class="small">${esc(o.notes)}</div>` : '');
      const gps =
        o.lat == null
          ? '<span style="color:#B45309">kein GPS-Stempel</span>'
          : `vor Ort (±${Math.round(o.gps_accuracy_m ?? 0)} m${o.distance_m != null ? `, ${Math.round(o.distance_m)} m vom Objekt` : ''})${o.gps_mocked ? '<br><b style="color:#B91C1C">Fake-GPS gemeldet</b>' : ''}`;
      return `<tr${o.canceled ? ' class="cx"' : ''}><td>${WEEKDAY_SHORT[isoDow(d)]} ${formatDay(d)}<br><span class="small">${fmtTimeB(o.started_at)}${o.ended_at ? `–${fmtTimeB(o.ended_at)}` : ''}</span></td><td>${what}</td><td>${esc(o.performer_name ?? '—')}</td><td class="small">${gps}</td><td class="mono small">${esc((o.entry_hash ?? '').slice(0, 12))}</td></tr>`;
    })
    .join('');
  const photoBlocks = [...x.ops]
    .filter((o) => (x.opPhotos.get(o.id) ?? []).some(isSafeImgSrc))
    .map(
      (o) =>
        `<div class="pg"><div class="small"><b>${formatDay(dayOf(o.started_at))} ${fmtTimeB(o.started_at)}</b> · ${esc(o.services.map((s) => s.name).join(', '))}</div>${(x.opPhotos.get(o.id) ?? [])
          .filter(isSafeImgSrc)
          .map((u) => `<img src="${esc(u)}" alt="">`)
          .join('')}</div>`,
    )
    .join('');
  const defectRows = x.defects
    .map((d) => {
      const imgs = (x.defectPhotos.get(d.id) ?? []).filter(isSafeImgSrc).map((u) => `<img class="dimg" src="${esc(u)}" alt="">`).join('');
      return `<tr><td>${fmtDateTimeB(d.created_at)}</td><td>${esc(d.text)}${imgs ? `<div>${imgs}</div>` : ''}</td><td>${
        d.status === 'done' ? `<b style="color:#047857">erledigt</b> ${fmtDateTimeB(d.resolved_at)}${d.resolved_note ? `<div class="small">${esc(d.resolved_note)}</div>` : ''}` : '<b style="color:#C2410C">offen</b>'
      }</td></tr>`;
    })
    .join('');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Leistungsnachweis ${esc(p.name)} ${esc(x.periodLabel)}</title>
<style>
  body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#0E2421;margin:28px;font-size:12.5px}
  h1{font-size:22px;margin:0 0 2px} h2{font-size:15px;margin:22px 0 8px;color:#0B3B36;border-bottom:2px solid #0B8A68;padding-bottom:4px}
  .muted{color:#55706A} .small{font-size:11px;color:#55706A} .mono{font-family:Consolas,monospace}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #D6E4DF;padding:6px 6px;text-align:left;vertical-align:top}
  th{background:#F1F6F4;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#55706A}
  tr.cx td{color:#8a9a96} .head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
  .kpis{display:flex;gap:10px;margin:12px 0} .kpi{border:1px solid #D6E4DF;border-radius:10px;padding:8px 12px;min-width:110px}
  .kpi b{font-size:18px;display:block} .pg{page-break-inside:avoid;margin:8px 0} .pg img{height:150px;margin:4px 6px 0 0;border-radius:6px}
  .dimg{height:90px;margin:4px 6px 0 0;border-radius:6px} .note{border:1.5px solid #AFC9C1;border-radius:8px;padding:8px 12px;margin-top:20px;page-break-inside:avoid}
  @page{margin:14mm}
</style></head><body>
<div class="head"><div><h1>Leistungsnachweis</h1><div class="muted">${esc(x.orgName)}</div></div>
<div style="text-align:right"><b>${esc(p.name)}</b><div class="muted">${esc(p.address)}</div>${p.customer_name ? `<div class="muted">für ${esc(p.customer_name)}</div>` : ''}<div><b>Zeitraum:</b> ${esc(x.periodLabel)}</div></div></div>
<div class="kpis"><div class="kpi"><span class="small">Einsätze</span><b>${valid.length}</b></div><div class="kpi"><span class="small">storniert</span><b>${x.ops.length - valid.length}</b></div><div class="kpi"><span class="small">Mängel (offen + im Zeitraum)</span><b>${x.defects.length}</b></div></div>
<h2>Soll/Ist je Leistung</h2>
${siRows ? `<table><thead><tr><th>Leistung</th><th>Turnus</th><th style="text-align:right">erledigt</th></tr></thead><tbody>${siRows}</tbody></table>` : '<p class="muted">Keine Leistungen im Zeitraum.</p>'}
<h2>Einsätze</h2>
${opRows ? `<table><thead><tr><th>Datum</th><th>Leistungen</th><th>Person</th><th>Standort</th><th>Prüfcode</th></tr></thead><tbody>${opRows}</tbody></table>` : '<p class="muted">Keine Einsätze im Zeitraum.</p>'}
${photoBlocks ? `<h2>Fotos</h2>${photoBlocks}` : ''}
<h2>Mängel</h2>
${defectRows ? `<table><thead><tr><th>Gemeldet</th><th>Mangel</th><th>Stand</th></tr></thead><tbody>${defectRows}</tbody></table>` : '<p class="muted">Keine Mängel im Zeitraum.</p>'}
<div class="note small"><b>Zum Prüfcode:</b> Jeder Einsatz wird beim Eingang auf dem Server versiegelt — mit Serverzeit, Abstand zum Objekt und einem
Prüfcode (SHA-256 über die Nachweisfelder). Einsätze lassen sich danach nicht mehr ändern; Korrekturen sind nur als Storno mit Begründung möglich
und bleiben sichtbar. Ein Tag zählt im Soll/Ist einmal, auch bei mehreren Einsätzen. Erstellt mit ObjektDex · ${esc(fmtDateTimeB(new Date().toISOString()))}</div>
</body></html>`;
}
