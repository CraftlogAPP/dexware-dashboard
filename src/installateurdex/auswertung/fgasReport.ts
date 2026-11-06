// Kältemittel-Jahresbericht zum Drucken / als PDF — Aufbau, Spalten und Texte wie App mobile/src/pdf/fgasYear.ts.
// Firmen-Look (Logo, Farbe) wie in der App nur mit Pro; Ausgabe über openReportWindow (src/lib/print.ts).

import { isProOrg, type InstOrg } from '../types';
import type { FgasYear } from './logic';

const DEFAULT_COLOR = '#B5651D'; // DEFAULT_BRAND_COLOR in mobile/src/lib/branding.ts

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const fmtKg = (n: number) => (n ? `${n.toLocaleString('de-DE', { maximumFractionDigits: 3 })} kg` : '—');
export const fmtT = (n: number) => (n ? `${n.toLocaleString('de-DE', { maximumFractionDigits: 3 })} t` : '—');
const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/** Nur Bild-Daten-URIs und https-Links als Logo zulassen (wie report.ts). */
function imgSrc(u: string | null | undefined): string {
  if (!u) return '';
  return /^(data:image\/|https:\/\/)/.test(u) ? esc(u) : '';
}

export function buildFgasYearHtml(org: InstOrg, r: FgasYear): string {
  const pro = isProOrg(org);
  const accent = pro && org.brand_color && /^#[0-9A-Fa-f]{6}$/.test(org.brand_color) ? org.brand_color : DEFAULT_COLOR;
  const logo = pro && imgSrc(org.logo_url) ? `<img src="${imgSrc(org.logo_url)}" style="max-height:48px;max-width:180px" alt="Logo" />` : '';
  const sumRows = r.byRefrigerant
    .map(
      (x) =>
        `<tr><td><b>${esc(x.refrigerant)}</b>${x.gwp ? ` <span class="m">GWP ${x.gwp}</span>` : ''}</td><td class="n">${fmtKg(x.added)}</td><td class="n">${fmtT(x.co2eAdded)}</td><td class="n">${fmtKg(x.recovered)}</td><td class="n">${fmtT(x.co2eRecovered)}</td></tr>`,
    )
    .join('');
  const rows = r.entries
    .map(
      (e) =>
        `<tr><td>${day(e.date)}</td><td>${esc(e.siteName)}</td><td>${esc(e.assetName)}</td><td>${esc(e.refrigerant)}</td><td class="n">${fmtKg(e.added)}</td><td class="n">${fmtKg(e.recovered)}</td><td>${esc(e.leakResult ?? '—')}</td><td>${esc(e.inspector ?? '—')}</td><td class="m">${e.hash ? esc(e.hash.slice(0, 10)) : '—'}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><title>Kältemittel-Jahresbericht ${r.year} – ${esc(org.name)}</title><style>
    @page{margin:16mm 14mm} body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:9.5pt;color:#1B1F24;margin:24px}
    @media print{body{margin:0}}
    .bar{height:6px;background:${accent};border-radius:3px;margin-bottom:14px} header{display:flex;justify-content:space-between;align-items:flex-start}
    h1{color:${accent};font-size:17pt;margin:0 0 2px} .sub{color:#646B74} table{width:100%;border-collapse:collapse;margin-top:10px}
    thead{display:table-header-group} tr{page-break-inside:avoid;break-inside:avoid}
    th{text-align:left;border-bottom:2px solid ${accent};padding:5px;font-size:8.5pt;color:#646B74} td{border-bottom:1px solid #eee;padding:5px;vertical-align:top}
    .n{text-align:right;white-space:nowrap} .m{color:#8A9098;font-size:8pt} .kpis{display:flex;gap:12px;margin-top:12px}
    .kpi{flex:1;background:#F6F4F1;border-radius:8px;padding:8px 10px;-webkit-print-color-adjust:exact;print-color-adjust:exact} .kpi b{display:block;font-size:14pt}
    .bar{-webkit-print-color-adjust:exact;print-color-adjust:exact} footer{margin-top:18px;color:#8A9098;font-size:7.5pt;line-height:1.5}
    </style></head><body>
    <div class="bar"></div><header><div><h1>Kältemittel-Jahresbericht ${r.year}</h1><div class="sub">${esc(org.name)}</div></div>${logo}</header>
    <div class="kpis"><div class="kpi">Einträge<b>${r.entries.length}</b></div><div class="kpi">Dichtheitskontrollen<b>${r.leakChecks}</b></div><div class="kpi">davon undicht<b>${r.leaksFound}</b></div></div>
    <h3>Je Kältemittel</h3>
    <table><thead><tr><th>Kältemittel</th><th class="n">Eingefüllt</th><th class="n">CO₂e</th><th class="n">Zurückgewonnen</th><th class="n">CO₂e</th></tr></thead><tbody>${sumRows || '<tr><td colspan="5">Keine Einträge in diesem Jahr.</td></tr>'}</tbody></table>
    <h3>Alle Einträge</h3>
    <table><thead><tr><th>Datum</th><th>Kunde</th><th>Anlage</th><th>Kältemittel</th><th class="n">Eingefüllt</th><th class="n">Zurück</th><th>Dichtheit</th><th>Monteur</th><th>Prüfcode</th></tr></thead><tbody>${rows || '<tr><td colspan="9">—</td></tr>'}</tbody></table>
    <footer>Eigene Aufzeichnung des Fachbetriebs über Arbeiten an Anlagen mit Kältemitteln (Verordnung (EU) 2024/573) — aus den unveränderlich dokumentierten Einsätzen (Prüfcode je Eintrag), stornierte Einträge nicht enthalten. CO₂e aus Füllmenge × GWP (Richtwert). Erstellt am ${new Date().toLocaleDateString('de-DE')} mit InstallateurDex.</footer>
    </body></html>`;
}
