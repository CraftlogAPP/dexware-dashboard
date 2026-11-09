// Strecken-Nachweis zum Drucken/als PDF — gleicher Aufbau wie in der App (mobile/src/pdf/routeReport.ts),
// gleicher Druckstil wie das Kontrollbuch (report.ts). Ausgabe über openReportWindow.

import { fmtDate, fmtDateTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { gritLabel, weatherLabel } from './labels';
import { ACTION_LABELS, LEGAL_BASIS } from './types';
import { buildSketch, fmtDistance, fmtDuration, fmtPct, fmtTimeSpan, pathLengthM, ROUTE_COLORS, sketchSvg, type Route, type Run, type RunMeta } from './routes';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PROOF_NOTE = `<div class="proof"><b>Prüffester Strecken-Nachweis.</b> Die Fahrt wird per GPS aufgezeichnet (ungenaue Punkte über ±35 m
  und GPS-Sprünge werden ausgelassen). Gefahrene Länge, Abdeckung der Strecken-Vorlage und den Server-Eingang berechnet der Server
  selbst — unabhängig von Handy-Uhr und App. Abdeckung: Die Vorlage wird alle 10 m geprüft; ein Abschnitt gilt als befahren, wenn die
  aufgezeichnete Fahrt höchstens 25 m entfernt verlief. Pausen in der Aufzeichnung (unterbrochen, z. B. App beendet) werden vermerkt und nicht als
  gefahren gewertet. Jede Fahrt erhält beim Eingang einen Prüfcode (SHA-256 über alle Nachweisfelder); eine spätere Änderung ist
  technisch gesperrt.</div>`;

function legend(plan: boolean, track: boolean, missed: boolean): string {
  const c = ROUTE_COLORS;
  return `<div class="legend">${[
    plan ? `<span style="color:${c.plan}">■</span> Strecken-Vorlage` : '',
    track ? `<span style="color:${c.track}">■</span> gefahrene Strecke (GPS)` : '',
    missed ? `<span style="color:${c.missed}">■</span> nicht befahren` : '',
    '● Start (grün) / Ende (dunkel)',
  ]
    .filter(Boolean)
    .join(' &nbsp; ')}</div>`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #16202b; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #075985; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  .meta { color: #51606f; margin-bottom: 4px; }
  .legal { margin: 10px 0 14px; padding: 8px 12px; background: #f0f7fc; border-left: 3px solid #0284c7; font-size: 11px; }
  .kpis { display: flex; gap: 8px; margin: 12px 0; page-break-inside: avoid; }
  .kpi { flex: 1; border: 1.5px solid #AFC1D2; border-radius: 8px; padding: 8px; text-align: center; }
  .kpi b { display: block; font-size: 18px; } .kpi span { font-size: 10px; color: #4A5F73; }
  .legend { font-size: 10px; color: #4A5F73; margin: 4px 0 12px; }
  .box { border: 1.5px solid #AFC1D2; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; page-break-inside: avoid; }
  .box div { margin: 2px 0; }
  .warn { color: #B91C1C; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1.5px solid #9CA5AD; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eaf2f8; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.canceled td { color: #8a97a3; background: #fafbfc; }
  .storno { color: #DC2626; font-weight: 700; font-size: 10.5px; }
  .small { font-size: 10.5px; } .muted { color: #51606f; }
  .mono { font-family: Consolas, monospace; font-size: 10.5px; word-break: break-all; }
  .proof { margin-top: 14px; border: 1.5px solid #AFC1D2; border-radius: 8px; padding: 8px 12px; font-size: 10.5px; page-break-inside: avoid; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos img { width: 180px; border: 1.5px solid #9CA5AD; border-radius: 4px; }
  svg { page-break-inside: avoid; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1.5px solid #9CA5AD; color: #51606f; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>${body}
  <div class="footer">
    <span>Erstellt mit WinterDex — winterdex.dexware.app</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}

/** Einzel-Nachweis einer Fahrt. */
export function buildRunHtml(org: Org, run: Run): string {
  const plan = run.planned_path && run.planned_path.length >= 2 ? run.planned_path : null;
  const missed = run.missed ?? [];
  const dur = Date.parse(run.ended_at) - Date.parse(run.started_at);
  const name = run.route_name ?? 'Freie Fahrt';
  const body = `
  <h1>Strecken-Nachweis Winterdienst</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  <div class="meta">Strecke: <b>${esc(name)}</b> · ${fmtDate(run.started_at)}, ${fmtTimeSpan(run.started_at, run.ended_at)}</div>
  <div class="kpis">
    <div class="kpi"><b>${fmtDistance(run.track_length_m)}</b><span>gefahren (GPS)</span></div>
    <div class="kpi"><b>${fmtDuration(dur)}</b><span>${fmtTimeSpan(run.started_at, run.ended_at)}</span></div>
    ${plan ? `<div class="kpi"><b>${fmtPct(run.coverage_pct)}</b><span>der Strecke abgedeckt</span></div>` : ''}
  </div>
  ${sketchSvg(buildSketch(plan, run.track, missed))}
  ${legend(!!plan, run.track.some((s) => s.length >= 2), missed.some((s) => s.length >= 2))}
  <div class="box">
    <div><b>Strecke:</b> ${esc(run.route_name ?? 'freie Fahrt (ohne Vorlage)')}${plan ? ` (Vorlage ${fmtDistance(pathLengthM(plan))})` : ''}</div>
    <div><b>Maßnahme:</b> ${esc(ACTION_LABELS[run.action])} · Streumittel: ${esc(gritLabel(run.grit_material, run.grit_amount))}</div>
    <div><b>Wetterlage (archiviert):</b> ${esc(weatherLabel(run.weather))}</div>
    <div><b>Dokumentiert von:</b> ${esc(run.performer_name ?? '—')}</div>
    ${run.notes ? `<div><b>Notiz:</b> ${esc(run.notes)}</div>` : ''}
    ${missed.length ? `<div class="warn">Nicht befahren: ${missed.length} ${missed.length === 1 ? 'Abschnitt' : 'Abschnitte'}, zusammen ${fmtDistance(run.missed_m ?? 0)} (rot in der Skizze)</div>` : ''}
    ${run.gaps.length ? `<div class="warn">Pausen in der Aufzeichnung: ${run.gaps.map(([a, b]) => fmtTimeSpan(a, b)).join(', ')}</div>` : ''}
    ${run.gps_mocked ? '<div class="warn">Achtung: Das Gerät hat Fake-GPS gemeldet (Android).</div>' : ''}
    ${run.canceled ? `<div class="storno">STORNIERT am ${fmtDateTime(run.canceled_at)}: ${esc(run.cancel_reason ?? '')}</div>` : ''}
  </div>
  <div class="legal">${esc(LEGAL_BASIS[org.land])}</div>
  ${run.photo_urls.length ? `<h2>Beweisfotos</h2><div class="photos">${run.photo_urls.map((src, i) => `<img src="${esc(src)}" alt="Beweisfoto ${i + 1}">`).join('')}</div>` : ''}
  ${PROOF_NOTE}
  ${run.entry_hash ? `<p class="small"><b>Prüfcode:</b> <span class="mono">${esc(run.entry_hash)}</span><br><b>Server-Eingang:</b> ${fmtDateTime(run.received_at ?? run.created_at)}</p>` : ''}`;
  return page(`Strecken-Nachweis — ${name}`, body);
}

/** Fahrtenbuch einer Strecke für einen Zeitraum. */
export function buildRouteLogHtml(org: Org, route: Route, runs: RunMeta[], periodLabel: string): string {
  const active = runs.filter((r) => !r.canceled);
  const rows = runs
    .map((r) => {
      const dur = Date.parse(r.ended_at) - Date.parse(r.started_at);
      return `<tr class="${r.canceled ? 'canceled' : ''}">
        <td>${fmtDate(r.started_at)}<br>${fmtTimeSpan(r.started_at, r.ended_at)} · ${fmtDuration(dur)}</td>
        <td>${fmtDistance(r.track_length_m)}</td>
        <td>${fmtPct(r.coverage_pct)}${r.missed_m ? `<br><span class="small warn">${fmtDistance(r.missed_m)} nicht befahren</span>` : ''}</td>
        <td>${esc(ACTION_LABELS[r.action])}<br><span class="small">${esc(gritLabel(r.grit_material, r.grit_amount))}</span></td>
        <td class="small">${esc(weatherLabel(r.weather))}</td>
        <td>${esc(r.performer_name ?? '—')}${r.gaps?.length ? `<br><span class="small warn">${r.gaps.length}× Pause</span>` : ''}${r.gps_mocked ? '<br><span class="small warn">Fake-GPS gemeldet</span>' : ''}</td>
        <td class="mono">${r.entry_hash ? esc(r.entry_hash.slice(0, 12)) : '—'}${r.canceled ? `<br><span class="storno">Storno: ${esc(r.cancel_reason ?? '')}</span>` : ''}</td>
      </tr>`;
    })
    .join('');
  const plan = route.path && route.path.length >= 2 ? route.path : null;
  const body = `
  <h1>Fahrtenbuch Winterdienst — Strecke</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  <div class="meta">Strecke: <b>${esc(route.name)}</b> · ${fmtDistance(route.length_m)}</div>
  <div class="meta">Zeitraum: ${esc(periodLabel)} · Fahrten: ${active.length}${runs.length > active.length ? ` (zzgl. ${runs.length - active.length} stornierte, gekennzeichnet)` : ''}</div>
  ${plan ? sketchSvg(buildSketch(plan, null, null)) + legend(true, false, false) : ''}
  <div class="legal">${esc(LEGAL_BASIS[org.land])}</div>
  <table>
    <thead><tr><th>Datum / Zeit</th><th>Gefahren</th><th>Abdeckung</th><th>Maßnahme</th><th>Wetter</th><th>Dokumentiert von</th><th>Prüfcode</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">Keine Fahrten im Zeitraum.</td></tr>'}</tbody>
  </table>
  ${PROOF_NOTE}`;
  return page(`Fahrtenbuch — ${route.name}`, body);
}

