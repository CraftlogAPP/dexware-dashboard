// Arbeitszeitbuch (Monat je Person) und Stundenzettel (je Kunde) zum Drucken / als PDF — gleicher Aufbau wie die App
// (InstallateurDex/mobile/src/pdf/zeitbuch.ts), Ausgabe über PrintButton → Browser-Druckdialog. Pro: Logo + Firmenfarbe.

import { isProOrg, type InstOrg } from '../types';
import { dayKey, dayOf, hhmm, hm, MONTHS, parseDay, WD, type TimeEntry } from './logic';
import { activityOf, holidays, lawHintsByDay, lawName, netMinutes, pauseOf, whereLabel, zTotals, type LawLand } from './zeitbuch';

const DEFAULT_COLOR = '#B5651D';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Nur eingebettete Bilder oder der eigene Supabase-Speicher (wie App pdf/report.ts imgSrc) */
const imgSrc = (u: string | null | undefined) => {
  const s = String(u ?? '').trim();
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return s;
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(sign|public)\/[^\s"'<>`]+$/i.test(s)) return esc(s);
  return '';
};
const deDay = (k: string) => k.split('-').reverse().join('.');

function look(org: InstOrg) {
  const pro = isProOrg(org);
  const accent = pro && org.brand_color && /^#[0-9A-Fa-f]{6}$/.test(org.brand_color) ? org.brand_color : DEFAULT_COLOR;
  const logo = pro && imgSrc(org.logo_url) ? `<img src="${imgSrc(org.logo_url)}" style="max-height:52px;max-width:180px" alt="Logo" />` : '';
  return { accent, logo };
}

const css = (accent: string) => `
  @page{margin:14mm 12mm} body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:9pt;color:#1B1F24;margin:0}
  .bar{height:6px;background:${accent};border-radius:3px;margin-bottom:12px} header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  h1{color:${accent};font-size:16pt;margin:0 0 2px} .sub{color:#646B74} .firm{font-size:8.5pt;color:#4A5560;margin-top:2px}
  .kpis{display:flex;gap:8px;margin:12px 0 8px} .kpi{flex:1;background:#F6F4F1;border-radius:8px;padding:7px 9px;font-size:8pt;color:#646B74}
  .kpi b{display:block;font-size:13pt;color:#1B1F24} .kpi.acc{background:${accent}1A}
  table{width:100%;border-collapse:collapse;margin-top:6px} thead{display:table-header-group} tr{page-break-inside:avoid}
  th{text-align:left;border-bottom:2px solid ${accent};padding:4px;font-size:7.5pt;color:#646B74;text-transform:uppercase;letter-spacing:.3px}
  td{border-bottom:1px solid #E8E4DE;padding:4px;vertical-align:top} .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .day{white-space:nowrap;font-weight:700} .free td{color:#9AA0A6;background:#FAFAF8} .tot{font-weight:800} .m{color:#8A9098;font-size:7.5pt} .star{color:#B45309;font-weight:700}
  .box{border:1.5px solid #D5DBE2;border-radius:8px;padding:8px 12px;margin-top:10px;page-break-inside:avoid} .box b.t{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.4px;color:${accent};margin-bottom:3px}
  .sig{display:flex;gap:28px;margin-top:26px;page-break-inside:avoid} .sig div{flex:1} .line{border-bottom:1px solid #333;height:34px} .lab{font-size:8pt;color:#555;margin-top:3px}
  footer{margin-top:16px;color:#8A9098;font-size:7pt;line-height:1.5} section{page-break-after:always} section:last-child{page-break-after:auto}`;

/** Arbeitszeitbuch eines Monats: eine Seite je Person, jeder Kalendertag, Unterschriften Mitarbeiter/in + Arbeitgeber/in. */
export function buildArbeitszeitbuchHtml(o: { org: InstOrg; month: Date; people: { name: string; entries: TimeEntry[] }[]; land: LawLand; siteName: (id: string) => string | undefined }): string {
  const { accent, logo } = look(o.org);
  const now = new Date();
  const m0 = new Date(o.month.getFullYear(), o.month.getMonth(), 1);
  const title = `${o.land === 'AT' && m0.getMonth() === 0 ? 'Jänner' : MONTHS[m0.getMonth()]} ${m0.getFullYear()}`;
  const hol = holidays(m0.getFullYear(), o.land, o.org.region);
  const sections = o.people.map((p) => {
    const hints = lawHintsByDay(p.entries, o.land, now);
    const t = zTotals(p.entries, now);
    const days: string[] = [];
    for (let d = new Date(m0); d.getMonth() === m0.getMonth(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(dayKey(d));
    let workedDays = 0; // Tage mit Arbeitszeit > 0 (wie App)
    const rows = days
      .map((k) => {
        const dt = parseDay(k);
        const list = p.entries.filter((e) => dayOf(e.started_at) === k).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
        const label = `<td class="day"${list.length > 1 ? ` rowspan="${list.length}"` : ''}>${WD[dt.getDay()]} ${deDay(k).slice(0, 6)}</td>`;
        const h = hol.get(k);
        if (!list.length) return `<tr class="free">${label}<td colspan="7">${h ? `<b>${esc(h)}</b>` : dt.getDay() === 0 || dt.getDay() === 6 ? 'frei' : '—'}</td></tr>`;
        const dayTotal = zTotals(list, now).paid;
        if (dayTotal > 0) workedDays++;
        return list
          .map((e, i) => {
            const w = whereLabel(e, o.siteName);
            return `<tr>${i === 0 ? label : ''}<td class="n">${hhmm(e.started_at)}</td><td class="n">${e.ended_at ? hhmm(e.ended_at) + (dayOf(e.ended_at) !== k ? ' <span class="m">+1</span>' : '') : 'läuft'}</td><td class="n">${e.kind === 'break' ? 'Pause' : pauseOf(e, now) ? `${pauseOf(e, now)} min` : ''}</td><td class="n">${e.kind === 'break' ? '' : hm(netMinutes(e, now))}</td><td>${esc(w.label)}</td><td>${esc(activityOf(e))}${e.edited_at ? ' <span class="star">*</span>' : ''}</td>${i === 0 ? `<td class="n tot"${list.length > 1 ? ` rowspan="${list.length}"` : ''}>${hm(dayTotal)}${hints.has(k) ? ' <span class="star">⚠</span>' : ''}</td>` : ''}</tr>`;
          })
          .join('');
      })
      .join('');
    const hintList = [...hints.entries()].map(([k, l]) => `<li><b>${deDay(k)}</b>: ${l.map(esc).join(' ')}</li>`).join('');
    return `<section>
      <div class="bar"></div>
      <header><div><h1>Arbeitszeitbuch ${esc(title)}</h1><div class="sub"><b>${esc(p.name)}</b></div><div class="firm">${esc(o.org.name)}</div></div>${logo}</header>
      <div class="kpis"><div class="kpi acc">Arbeitszeit<b>${hm(t.paid)}</b></div><div class="kpi">Arbeitstage<b>${workedDays}</b></div><div class="kpi">Pausen<b>${hm(t.break)}</b></div></div>
      <table><thead><tr><th>Tag</th><th class="n">Beginn</th><th class="n">Ende</th><th class="n">Pause</th><th class="n">Zeit</th><th>Kunde / Ort</th><th>Tätigkeit</th><th class="n">Tag gesamt</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="7" class="tot">Summe ${esc(title)}</td><td class="n tot">${hm(t.paid)}</td></tr></tfoot></table>
      ${hintList ? `<div class="box"><b class="t">Hinweise Arbeitszeit (${lawName(o.land)})</b><ul>${hintList}</ul></div>` : ''}
      <div class="sig"><div><div class="line"></div><div class="lab">Datum, Unterschrift Mitarbeiter/in</div></div><div><div class="line"></div><div class="lab">Datum, Unterschrift Arbeitgeber/in</div></div></div>
      <footer>${o.land === 'DE' ? 'Arbeitszeitaufzeichnung nach § 16 Abs. 2 ArbZG' : o.land === 'AT' ? 'Arbeitszeitaufzeichnung nach § 26 AZG' : 'Arbeitszeiterfassung'} — Beginn, Ende, Pausen und Dauer der Arbeitszeit je Tag. Arbeitszeit = Zeit ohne Pausen; Fahrten zum Kunden zählen zur Arbeitszeit.${p.entries.some((e) => e.edited_at) ? ' <span class="star">*</span> = vom Arbeitgeber korrigiert (mit Zeitpunkt gespeichert).' : ''} Hinweise ohne Gewähr, keine Rechtsberatung. Erstellt am ${deDay(dayKey(now))} im Betriebsportal von InstallateurDex.</footer>
    </section>`;
  });
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><title>Arbeitszeitbuch ${esc(title)}</title><style>${css(accent)}</style></head><body>${sections.join('') || '<p>Keine Zeiten.</p>'}</body></html>`;
}

/** Stundenzettel je Kunde/Ort zum Gegenzeichnen. */
export function buildStundenzettelHtml(o: { org: InstOrg; label: string; address?: string | null; entries: TimeEntry[]; nameOf: (e: TimeEntry) => string }): string {
  const { accent, logo } = look(o.org);
  const now = new Date();
  const list = o.entries.filter((e) => e.kind !== 'break').sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const total = list.reduce((s, e) => s + netMinutes(e, now), 0);
  const from = list[0] ? dayOf(list[0].started_at) : '';
  const to = list.length ? dayOf(list[list.length - 1].started_at) : '';
  const period = from ? (from === to ? deDay(from) : `${deDay(from)} – ${deDay(to)}`) : '';
  const rows = list
    .map((e) => `<tr><td class="day">${WD[new Date(e.started_at).getDay()]} ${deDay(dayOf(e.started_at))}</td><td>${esc(o.nameOf(e))}</td><td class="n">${hhmm(e.started_at)}–${e.ended_at ? hhmm(e.ended_at) : 'läuft'}</td><td class="n">${pauseOf(e, now) ? `${pauseOf(e, now)} min` : ''}</td><td class="n tot">${hm(netMinutes(e, now))}</td><td>${esc(activityOf(e))}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><title>Stundenzettel ${esc(o.label)}</title><style>${css(accent)}</style></head><body>
    <div class="bar"></div>
    <header><div><h1>Stundenzettel</h1><div class="sub">${esc(period)}</div><div class="firm">${esc(o.org.name)}</div></div>${logo}</header>
    <div style="display:flex;gap:10px;margin-top:12px"><div class="box" style="flex:1;margin-top:0"><b class="t">Kunde / Ort</b><div><b>${esc(o.label)}</b></div>${o.address ? `<div>${esc(o.address)}</div>` : ''}</div>
    <div class="box" style="flex:0 0 34%;margin-top:0"><b class="t">Arbeitsstunden</b><div style="font-size:15pt;font-weight:800">${hm(total)}</div><div class="m">${list.length} ${list.length === 1 ? 'Einsatz' : 'Einsätze'} · ohne Pausen</div></div></div>
    <table><thead><tr><th>Datum</th><th>Monteur</th><th class="n">von–bis</th><th class="n">Pause</th><th class="n">Stunden</th><th>Tätigkeit</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Keine Zeiten.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4" class="tot">Summe</td><td class="n tot">${hm(total)}</td><td></td></tr></tfoot></table>
    <div class="sig"><div><div class="line"></div><div class="lab">Datum, Unterschrift Kunde — Arbeitsstunden bestätigt</div></div><div><div class="line"></div><div class="lab">Datum, Unterschrift ${esc(o.org.name || 'Betrieb')}</div></div></div>
    <footer>Aufstellung der Arbeitszeiten aus dem Zeitbuch des Betriebs. Erstellt am ${deDay(dayKey(now))} im Betriebsportal von InstallateurDex.</footer>
    </body></html>`;
}
