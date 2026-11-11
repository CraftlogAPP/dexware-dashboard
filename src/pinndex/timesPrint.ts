// PinnDex — Arbeitszeit-Übersicht je Monteur zum Drucken / „Als PDF speichern“ (Muster: InstallateurDex zeitbuchDruck.ts,
// Ausgabe über lib/print.ts → Browser-Druckdialog). Das Druckfenster hat denselben Ursprung wie das Dashboard —
// deshalb wird JEDER Wert maskiert (esc), Bilder gibt es hier keine.

import { dayShort, decimalHours, fmtWork, hhmm, parseDay, workDay, type WorkerTimes } from './logic';
import { OUTCOME_LABEL, STATUS_LABEL, type Job } from './types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const css = `
  @page{margin:14mm 12mm} body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:9.5pt;color:#1B1F24;margin:0}
  .bar{height:6px;background:#1B1F24;border-radius:3px;margin-bottom:12px}
  h1{font-size:16pt;margin:0 0 2px} .sub{color:#646B74} .firm{font-size:9pt;color:#4A5560;margin-top:2px}
  .kpis{display:flex;gap:8px;margin:12px 0 8px} .kpi{flex:1;background:#F3F4F6;border-radius:8px;padding:7px 9px;font-size:8pt;color:#646B74}
  .kpi b{display:block;font-size:13pt;color:#1B1F24}
  table{width:100%;border-collapse:collapse;margin-top:6px} thead{display:table-header-group} tr{page-break-inside:avoid}
  th{text-align:left;border-bottom:2px solid #1B1F24;padding:4px;font-size:7.5pt;color:#646B74;text-transform:uppercase;letter-spacing:.3px}
  td{border-bottom:1px solid #E5E7EB;padding:4px;vertical-align:top} .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .tot td{font-weight:800;border-top:2px solid #1B1F24} .m{color:#8A9098;font-size:8pt} .star{color:#B45309;font-weight:700}
  .sig{display:flex;gap:28px;margin-top:26px;page-break-inside:avoid} .sig div{flex:1} .line{border-bottom:1px solid #333;height:34px} .lab{font-size:8pt;color:#555;margin-top:3px}
  footer{margin-top:14px;color:#8A9098;font-size:7.5pt;line-height:1.5} section{page-break-after:always} section:last-child{page-break-after:auto}`;

export function buildTimesHtml(o: {
  orgName: string;
  periodLabel: string;
  rows: WorkerTimes[];
  fixedIds: Set<string>;
  secondsOf: (j: Job) => number;
}): string {
  const now = new Date();
  const sections = o.rows
    .map((r) => {
      const lines = r.jobs
        .map((j) => {
          const day = workDay(j);
          const sec = o.secondsOf(j);
          const state = j.status === 'done' ? (j.outcome && j.outcome !== 'ok' ? OUTCOME_LABEL[j.outcome] : 'erledigt') : STATUS_LABEL[j.status];
          return `<tr><td>${day ? esc(dayShort(parseDay(day))) : '—'}</td><td>${esc(j.title)}${o.fixedIds.has(j.id) ? ' <span class="star">*</span>' : ''}<div class="m">${esc(j.customer_name ?? '')}${j.address ? ` · ${esc(j.address)}` : ''}</div></td><td class="n">${j.started_at ? esc(hhmm(j.started_at)) : '—'}</td><td class="n">${j.finished_at ? esc(hhmm(j.finished_at)) : '—'}</td><td>${esc(state)}</td><td class="n">${esc(fmtWork(sec))}</td><td class="n">${esc(decimalHours(sec))}</td></tr>`;
        })
        .join('');
      return `<section>
        <div class="bar"></div>
        <h1>Arbeitszeit ${esc(o.periodLabel)}</h1>
        <div class="sub"><b>${esc(r.name)}</b></div>
        <div class="firm">${esc(o.orgName)}</div>
        <div class="kpis"><div class="kpi">Arbeitszeit<b>${esc(fmtWork(r.seconds))}</b></div><div class="kpi">Stunden (dezimal)<b>${esc(decimalHours(r.seconds))}</b></div><div class="kpi">Aufträge erledigt<b>${r.done}</b></div></div>
        <table><thead><tr><th>Tag</th><th>Auftrag</th><th class="n">Start</th><th class="n">Fertig</th><th>Stand</th><th class="n">Zeit</th><th class="n">Std.</th></tr></thead>
        <tbody>${lines}</tbody>
        <tfoot><tr class="tot"><td colspan="5">Summe</td><td class="n">${esc(fmtWork(r.seconds))}</td><td class="n">${esc(decimalHours(r.seconds))}</td></tr></tfoot></table>
        <div class="sig"><div><div class="line"></div><div class="lab">Datum, Unterschrift Mitarbeiter/in</div></div><div><div class="line"></div><div class="lab">Datum, Unterschrift Arbeitgeber/in</div></div></div>
        <footer>Arbeitszeit = Summe der Strecken zwischen „Start“ und „Pause“/„Fertig“ in der PinnDex-App, gezählt beim zugewiesenen Monteur. Tag = Tag der Fertigmeldung (laufende Aufträge: Tag des Starts).${r.fixed ? ' <span class="star">*</span> = vom Chef nachträglich korrigiert (Vermerk im Verlauf der Karte).' : ''} Keine Arbeitszeitaufzeichnung im Sinne von § 16 Abs. 2 ArbZG bzw. § 26 AZG (Pausen, Fahrten außerhalb von Aufträgen fehlen). Erstellt am ${esc(dayShort(now))}${now.getFullYear()} ${esc(hhmm(now.toISOString()))} mit PinnDex.</footer>
      </section>`;
    })
    .join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(`Arbeitszeit ${o.periodLabel} – ${o.orgName}`)}</title><style>${css}</style></head><body>${sections || '<p>Keine Zeiten im Zeitraum.</p>'}</body></html>`;
}
