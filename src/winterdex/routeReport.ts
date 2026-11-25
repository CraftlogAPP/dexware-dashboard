// Strecken-Nachweis zum Drucken/als PDF — gleicher Aufbau wie in der App (mobile/src/pdf/routeReport.ts),
// gleicher Druckstil wie das Kontrollbuch (report.ts). Ausgabe über openReportWindow.

import { fmtDate, fmtDateTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { isSafeImgSrc } from '../lib/imgSrc';
import { gritLabel, WEATHER_SOURCE_HTML, weatherLabel } from './labels';
import { ACTION_LABELS, LEGAL_BASIS } from './types';
import { buildSketch, cleanGaps, fmtDistance, fmtDuration, fmtPct, fmtTimeSpan, pathLengthM, ROUTE_COLORS, sketchSvg, type Route, type Run, type RunMeta } from './routes';
import { fahrtDaten, fmtKm, fmtUhr, waehleSchritt, zeitleiste, zeitMarken, type FahrtDaten, type ZeitMarke, type ZeitZeile } from './fahrtZeit';
import { fmtStrecke, ortText, STRASSEN_QUELLE, strassenAnzeige, strassenPdfNochOffen, strasseZu, strassenText, type StrassenAnzeige, type StrassenStand } from './strassen';
import { KARTE_QUELLE, kartenBilder, kartenBilderSammel, MAX_SAMMEL_BILDER, type KartenBild, type KartenBilder } from './kartenBild';

const LEER_F = fahrtDaten([], null);

/**
 * „Wann war er wo“ fürs PDF (seit 25.11.2026): Zeitmarken für die Skizze + kurze Zeit-Tabelle aus den Punkt-Zeiten.
 * Alte/kaputte Fahrten ohne Zeiten → nichts davon, der Bericht entsteht wie bisher. Fehler hier stoppen nie den Bericht.
 */
function zeitTeile(run: Run, timeZone?: string): { F: FahrtDaten; marken: ZeitMarke[]; zeilen: ZeitZeile[]; schritt: number } {
  let F = LEER_F;
  try {
    F = fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
    if (!F.mitZeit || F.n < 2) return { F, marken: [], zeilen: [], schritt: 0 };
    const schritt = waehleSchritt(F.t[0], F.t[F.n - 1]);
    return { F, marken: zeitMarken(F, { schrittMin: schritt, timeZone }), zeilen: zeitleiste(F, { schrittMin: schritt }), schritt };
  } catch (e) {
    console.error('Zeitleiste im Bericht ausgelassen:', e);
    return { F, marken: [], zeilen: [], schritt: 0 };
  }
}

/**
 * Zeit-Tabelle: ab 9 Zeilen zweispaltig nebeneinander, damit sie auf eine Seite passt. Mit Straßenverlauf zusätzlich die
 * Spalte „Straße“ (dann einspaltig — Straßennamen brauchen Platz).
 */
function zeitTabelle(zeilen: ZeitZeile[], schritt: number, timeZone?: string, str?: StrassenAnzeige | null): string {
  if (!zeilen.length) return '';
  const st = str?.art === 'tabelle' ? str : null;
  const strasse = (z: ZeitZeile) => {
    if (!st || z.art === 'luecke') return '';
    const s = strasseZu(st.zeilen, z.t);
    return `<td>${s ? esc(strassenText(s, st.mehrereOrte)) : '—'}</td>`;
  };
  const row = (z: ZeitZeile) =>
    `<tr class="${z.art === 'luecke' ? 'warn' : ''}"><td>${fmtUhr(z.t, timeZone)}${z.bis ? `–${fmtUhr(z.bis, timeZone)}` : ''}</td><td>${fmtKm(z.dM)}</td>${
      st && z.art === 'luecke' ? '<td>—</td>' : strasse(z)
    }<td>${esc(z.art === 'luecke' ? 'Unterbrechung (Pause/kein GPS), nicht gewertet' : z.text)}</td></tr>`;
  const table = (zs: ZeitZeile[]) =>
    `<table class="zt"><thead><tr><th>Uhrzeit</th><th>km seit Start</th>${st ? '<th>Straße</th>' : ''}<th>Abschnitt</th></tr></thead><tbody>${zs.map(row).join('')}</tbody></table>`;
  const half = Math.ceil(zeilen.length / 2);
  const body = zeilen.length >= 9 && !st ? `<div class="zt-2">${table(zeilen.slice(0, half))}${table(zeilen.slice(half))}</div>` : table(zeilen);
  return `<h2>Zeitleiste — wann war das Fahrzeug wo (alle ${schritt} Min.)</h2>${body}
  <div class="small muted" style="margin:4px 0 12px">Uhrzeiten aus den GPS-Punkten der Fahrt (Zeit je Punkt vom Gerät), km = gefahrene Strecke seit Start. Die Zeitmarken stehen auch in der Karte.${st ? ` Straßennamen: ${STRASSEN_QUELLE}.` : ''}</div>`;
}

/** Straßenverlauf: „06:12–06:19 · Hauptstraße · Musterstadt · 1,5 km“ — bzw. Hinweis „wird ermittelt“. */
const STRASSEN_FUSSNOTE = `Straßennamen: ${STRASSEN_QUELLE} (ODbL), nach der Fahrt aus den GPS-Punkten ermittelt (Abtastung etwa alle 200 m und an jeder Abbiegung; Wechsel auf gerader Strecke auf ±15 m eingegrenzt). Uhrzeiten aus den GPS-Punkten (Zeit je Punkt vom Gerät). Nicht Teil des Prüfcodes — der Nachweis selbst ist die GPS-Spur.`;

/**
 * Straßenverlauf als Tabelle „Uhrzeit · Straße · Ort · Strecke“ — EINE Darstellung für Einzel- und Sammel-Nachweis.
 * kompakt: ohne Überschrift und Fußnote (Sammel-Nachweis: Überschrift je Fahrt, Fußnote einmal am Ende).
 */
function strassenTabelle(str: StrassenAnzeige | null, timeZone?: string, kompakt = false): string {
  if (!str) return '';
  if (str.art === 'ermittelt')
    return `${kompakt ? '' : '<h2>Straßenverlauf</h2>'}<div class="hinweis">${esc(strassenPdfNochOffen(Date.now(), timeZone))}</div>`;
  const rows = str.zeilen
    .map((z) => {
      const von = fmtUhr(z.von, timeZone);
      const bis = fmtUhr(z.bis, timeZone);
      return `<tr><td>${von === bis ? von : `${von}–${bis}`}</td><td><b>${esc(z.strasse)}</b></td><td>${esc(ortText(z))}</td><td class="r">${fmtStrecke(z.m)}</td></tr>`;
    })
    .join('');
  return `${kompakt ? '' : '<h2>Straßenverlauf — wann auf welcher Straße</h2>'}
  <table class="sv"><thead><tr><th>Uhrzeit</th><th>Straße</th><th>Ort</th><th class="r">Strecke</th></tr></thead><tbody>${rows}</tbody></table>
  ${kompakt ? '' : `<div class="small muted" style="margin:4px 0 12px">${STRASSEN_FUSSNOTE}</div>`}`;
}

/** Karte: echtes Kartenbild (Übersicht + Ausschnitte) oder — Rückfall — die Skizze. */
function karteHtml(karte: KartenBilder | null | undefined, skizze: string): string {
  if (!karte) return skizze;
  const img = (b: KartenBilder['uebersicht'], alt: string) =>
    `<img src="${b.src}" width="${b.w}" height="${b.h}" alt="${esc(alt)}" style="width:100%;height:auto;display:block">`;
  return `<figure class="karte">${img(karte.uebersicht, 'Karte der Fahrt (OpenStreetMap)')}</figure>`;
}
function ausschnitteHtml(karte: KartenBilder | null | undefined): string {
  if (!karte?.ausschnitte.length) return '';
  return `<h2>Ausschnitte in Straßen-Zoom</h2><div class="ausschnitte">${karte.ausschnitte
    .map(
      (a) =>
        `<figure class="karte"><img src="${a.src}" width="${a.w}" height="${a.h}" alt="Ausschnitt ${esc(a.buchstabe ?? '')}" style="width:100%;height:auto;display:block"><figcaption><b>Ausschnitt ${esc(a.buchstabe ?? '')}</b>${a.zeiten ? ` · dort ${esc(a.zeiten)}` : ''}</figcaption></figure>`,
    )
    .join('')}</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PROOF_NOTE = `<div class="proof"><b>Prüffester Strecken-Nachweis.</b> Die Fahrt wird per GPS aufgezeichnet (ungenaue Punkte über ±35 m
  und GPS-Sprünge werden ausgelassen). Gefahrene Länge, Abdeckung der Strecken-Vorlage und den Server-Eingang berechnet der Server
  selbst — unabhängig von Handy-Uhr und App. Abdeckung: Die Vorlage wird alle 10 m geprüft; ein Abschnitt gilt als befahren, wenn die
  aufgezeichnete Fahrt höchstens 25 m entfernt verlief. Kurze Signal-Abrisse (höchstens 45 Sekunden und 400 m, z. B. Unterführung)
  werden geradlinig überbrückt und zählen als befahren. Unterbrechungen der Aufzeichnung (Pause, App bzw. Seite verlassen oder länger
  als 45 Sekunden keine brauchbare Position) werden mit Uhrzeit vermerkt und nicht als gefahren gewertet. Jede Fahrt erhält beim Eingang einen Prüfcode (SHA-256 über alle Nachweisfelder); eine spätere Änderung ist
  technisch gesperrt.</div>`;

function legend(plan: boolean, track: boolean, missed: boolean, marks = false, karte = false, ausschnitte = false): string {
  const c = ROUTE_COLORS;
  return `<div class="legend">${[
    plan ? `<span style="color:${karte ? c.planMap : c.plan}">■</span> Strecken-Vorlage` : '',
    track ? `<span style="color:${c.track}">■</span> gefahrene Strecke (GPS)` : '',
    missed ? `<span style="color:${c.missed}">■</span> nicht befahren` : '',
    '● Start (grün) / Ende (dunkel)',
    marks ? '● 09:45 = Uhrzeit an dieser Stelle' : '',
    ausschnitte ? '<span style="color:#1D4ED8">▭</span> A/B/C = Ausschnitt unten' : '',
    karte ? `Karte: ${KARTE_QUELLE} (openstreetmap.org/copyright)` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp; ')}</div>`;
}

/** weather: Bericht zeigt Wetterdaten → Namensnennung Open-Meteo (CC BY 4.0) in der Fußzeile. osm: Karte/Straßennamen aus OSM. */
function page(title: string, body: string, weather: boolean, osm = false): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
  html { color-scheme: light; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #16202b; background: #fff; margin: 32px; font-size: 12px; }
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
  .zt-2 { display: flex; gap: 10px; align-items: flex-start; }
  .zt-2 .zt { flex: 1; }
  table.zt { margin-bottom: 4px; }
  table.zt th, table.zt td { padding: 3px 6px; font-size: 10.5px; }
  table.zt tr.warn td { color: #B91C1C; }
  table.zt td:first-child { white-space: nowrap; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1.5px solid #9CA5AD; color: #51606f; font-size: 10.5px; display: flex; justify-content: space-between; gap: 12px; }
  figure.karte { margin: 0 0 4px; border: 1.5px solid #AFC1D2; border-radius: 8px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
  figure.karte figcaption { padding: 4px 8px; font-size: 10.5px; background: #f6f9fc; border-top: 1px solid #dbe4ec; }
  .ausschnitte { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  table.sv { margin-bottom: 4px; }
  table.sv th, table.sv td { padding: 3px 6px; font-size: 10.5px; }
  table.sv td:first-child { white-space: nowrap; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  .hinweis { margin: 0 0 12px; padding: 8px 12px; border: 1.5px dashed #AFC1D2; border-radius: 8px; color: #51606f; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .fahrt { margin: 0 0 12px; padding-top: 6px; border-top: 1px solid #dbe4ec; }
  .fahrt h3 { break-after: avoid; page-break-after: avoid; }
  .fahrt-inhalt { display: flex; gap: 10px; align-items: flex-start; }
  .fahrt-inhalt figure.karte.klein { flex: 0 0 48%; margin: 0; }
  .fahrt-str { flex: 1; min-width: 0; }
  .fahrt-str .hinweis { margin: 0; }
  h2 { break-after: avoid; page-break-after: avoid; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>${body}
  <div class="footer">
    <span>Erstellt mit WinterDex — winterdex.dexware.app${weather ? ` · ${WEATHER_SOURCE_HTML}` : ''}${osm ? ` · Karte und Straßennamen: <a href="https://www.openstreetmap.org/copyright">${KARTE_QUELLE}</a>` : ''}</span>
    <span>Erstellt am ${fmtDateTime(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}

/** Nicht alle gespeicherten Fotos im Bericht (nicht ladbar, unsichere Quelle): ehrlich zählen — wie die App. */
function photoNote(run: Run): string {
  const drin = run.photo_urls.filter(isSafeImgSrc).length;
  const gesamt = Math.max(drin, run.photo_total ?? 0);
  if (gesamt <= drin) return '';
  return `<div class="warn small">${gesamt} Foto${gesamt === 1 ? '' : 's'} zu dieser Fahrt gespeichert, davon ${drin} in diesem Bericht — die übrigen sind weiterhin bei der Fahrt gespeichert (App/Dashboard).</div>`;
}

export interface RunBerichtExtra {
  /** Straßenverlauf (route_run_strassen); null/undefiniert = keiner (Abschnitt entfällt) */
  strassen?: StrassenStand | null;
  /** echtes Kartenbild (kartenBild.ts); null = Skizze */
  karte?: KartenBilder | null;
}

/** Straßenverlauf-Anzeige für den Bericht (nie ein Fehler) */
function strassenFuer(run: Run, F: FahrtDaten, stand: StrassenStand | null | undefined): StrassenAnzeige | null {
  try {
    return strassenAnzeige(stand, run, F.mitZeit && F.n >= 2);
  } catch (e) {
    console.error('Straßenverlauf im Bericht ausgelassen:', e);
    return null;
  }
}

/**
 * Einzel-Nachweis einer Fahrt (A4 hoch): Kopf + Kennzahlen, Karte (echtes Kartenbild oder Skizze), Straßenverlauf,
 * Ausschnitte, Zeitleiste, Angaben, Fotos, Prüfcode. timeZone nur für Tests (sonst Ortszeit des Geräts).
 */
export function buildRunHtml(org: Org, run: Run, timeZone?: string, extra: RunBerichtExtra = {}): string {
  const plan = run.planned_path && run.planned_path.length >= 2 ? run.planned_path : null;
  const missed = run.missed ?? [];
  const dur = Date.parse(run.ended_at) - Date.parse(run.started_at);
  const name = run.route_name ?? 'Freie Fahrt';
  const zt = zeitTeile(run, timeZone);
  const str = strassenFuer(run, zt.F, extra.strassen);
  const karte = extra.karte ?? null;
  const hatSpur = (Array.isArray(run.track) ? run.track : []).some((s) => Array.isArray(s) && s.length >= 2);
  const body = `
  <h1>Strecken-Nachweis Winterdienst</h1>
  <div class="meta"><b>${esc(org.name)}</b>${org.address ? ` · ${esc(org.address)}` : ''}</div>
  <div class="meta">Strecke: <b>${esc(name)}</b> · ${fmtDate(run.started_at)}, ${fmtTimeSpan(run.started_at, run.ended_at)}</div>
  <div class="kpis">
    <div class="kpi"><b>${fmtDistance(run.track_length_m)}</b><span>gefahren (GPS)</span></div>
    <div class="kpi"><b>${fmtDuration(dur)}</b><span>${fmtTimeSpan(run.started_at, run.ended_at)}</span></div>
    ${plan ? `<div class="kpi"><b>${fmtPct(run.coverage_pct)}</b><span>der Strecke abgedeckt</span></div>` : ''}
  </div>
  ${karteHtml(karte, sketchSvg(buildSketch(plan, run.track, missed, 640, 360, zt.marken)))}
  ${legend(!!plan, hatSpur, missed.some((s) => Array.isArray(s) && s.length >= 2), zt.marken.length > 0, !!karte, !!karte?.ausschnitte.length)}
  ${strassenTabelle(str, timeZone)}
  ${ausschnitteHtml(karte)}
  ${zeitTabelle(zt.zeilen, zt.schritt, timeZone, str)}
  <div class="box">
    <div><b>Strecke:</b> ${esc(run.route_name ?? 'freie Fahrt (ohne Vorlage)')}${plan ? ` (Vorlage ${fmtDistance(pathLengthM(plan))})` : ''}</div>
    <div><b>Maßnahme:</b> ${esc(ACTION_LABELS[run.action])} · Streumittel: ${esc(gritLabel(run.grit_material, run.grit_amount))}</div>
    <div><b>Wetterlage (archiviert):</b> ${esc(weatherLabel(run.weather))}</div>
    <div><b>Dokumentiert von:</b> ${esc(run.performer_name ?? '—')}</div>
    ${run.notes ? `<div><b>Notiz:</b> ${esc(run.notes)}</div>` : ''}
    ${missed.length ? `<div class="warn">Nicht befahren: ${missed.length} ${missed.length === 1 ? 'Abschnitt' : 'Abschnitte'}, zusammen ${fmtDistance(run.missed_m ?? 0)} (rot in der Skizze)</div>` : ''}
    ${cleanGaps(run.gaps).length ? `<div class="warn">Unterbrechungen der Aufzeichnung (Pause oder kein GPS): ${cleanGaps(run.gaps).map(([a, b]) => fmtTimeSpan(a, b)).join(', ')}</div>` : ''}
    ${run.gps_mocked ? '<div class="warn">Achtung: Das Gerät hat Fake-GPS gemeldet (Android).</div>' : ''}
    ${run.nachgetragen ? '<div class="warn">Nachgemeldet: ohne Fahrtpunkte und erst mehr als 15 Minuten nach dem Ende beim Server eingegangen (Kennzeichen vom Server, nicht änderbar).</div>' : ''}
    ${run.canceled ? `<div class="storno">STORNIERT am ${fmtDateTime(run.canceled_at)}: ${esc(run.cancel_reason ?? '')}</div>` : ''}
  </div>
  <div class="legal">${esc(LEGAL_BASIS[org.land])}</div>
  ${run.photo_urls.some(isSafeImgSrc) ? `<h2>Beweisfotos</h2><div class="photos">${run.photo_urls.filter(isSafeImgSrc).map((src, i) => `<img src="${esc(src)}" alt="Beweisfoto ${i + 1}">`).join('')}</div>` : ''}
  ${photoNote(run)}
  ${PROOF_NOTE}
  ${run.entry_hash ? `<p class="small"><b>Prüfcode:</b> <span class="mono">${esc(run.entry_hash)}</span><br><b>Server-Eingang:</b> ${fmtDateTime(run.received_at ?? run.created_at)}</p>` : ''}`;
  return page(`Strecken-Nachweis — ${name}`, body, !!run.weather, !!karte || str?.art === 'tabelle');
}

/**
 * Bericht mit echtem Kartenbild (Browser): Kacheln laden + zeichnen (höchstens ~8 s), sonst Skizze. Wirft nie wegen
 * der Karte — das PDF entsteht immer.
 */
export async function buildRunHtmlMitKarte(org: Org, run: Run, strassen: StrassenStand | null | undefined, opts: { zeitlimitMs?: number } = {}): Promise<string> {
  let karte: KartenBilder | null = null;
  try {
    const zt = zeitTeile(run);
    const F = zt.F;
    if (F.n > 0 || (run.planned_path?.length ?? 0) >= 2) {
      const zeitAn = F.mitZeit && F.n >= 2;
      karte = await kartenBilder(
        F,
        {
          plan: run.planned_path,
          missed: run.missed,
          marken: zt.marken,
          startLabel: F.n ? (zeitAn ? `Start ${fmtUhr(F.t[0])}` : 'Start') : null,
          endeLabel: F.n > 1 ? (zeitAn ? `Ende ${fmtUhr(F.t[F.n - 1])}` : 'Ende') : null,
        },
        { zeitlimitMs: opts.zeitlimitMs },
      );
    }
  } catch (e) {
    console.warn('Kartenbild ausgelassen:', e);
    karte = null;
  }
  return buildRunHtml(org, run, undefined, { strassen, karte });
}

/** Fahrtenbuch einer Strecke für einen Zeitraum. */
/** Je Fahrt im Fahrtenbuch: Straßenverlauf + kompaktes Kartenbild (beides optional) */
export interface FahrtDetail {
  str: StrassenAnzeige | null;
  bild: KartenBild | null;
}

/** „Die Fahrten im Einzelnen“: je Fahrt Kopfzeile, kompaktes Kartenbild und Straßenverlauf (gleiche Tabelle wie Einzel-PDF). */
function fahrtenImEinzelnen(runs: RunMeta[], details: Map<string, FahrtDetail>, hinweis: string | null, timeZone?: string): string {
  const bloecke = runs
    .filter((r) => !r.canceled)
    .map((r) => {
      const d = details.get(r.id);
      if (!d || (!d.str && !d.bild)) return '';
      const dur = Date.parse(r.ended_at) - Date.parse(r.started_at);
      const kopf = `${fmtDate(r.started_at)} · ${fmtTimeSpan(r.started_at, r.ended_at)} (${fmtDuration(dur)}) · ${fmtDistance(r.track_length_m)}${
        r.coverage_pct != null ? ` · ${fmtPct(r.coverage_pct)} abgedeckt` : ''
      } · ${esc(r.performer_name ?? '—')}`;
      return `<div class="fahrt"><h3>${kopf}</h3><div class="fahrt-inhalt">${
        d.bild ? `<figure class="karte klein"><img src="${d.bild.src}" width="${d.bild.w}" height="${d.bild.h}" alt="Karte der Fahrt" style="width:100%;height:auto;display:block"></figure>` : ''
      }<div class="fahrt-str">${d.str ? strassenTabelle(d.str, timeZone, true) : '<div class="small muted">Straßenverlauf nicht verfügbar.</div>'}</div></div></div>`;
    })
    .filter(Boolean);
  if (!bloecke.length && !hinweis) return '';
  return `<h2>Die Fahrten im Einzelnen — Karte und Straßenverlauf</h2>
  ${hinweis ? `<div class="hinweis">${esc(hinweis)}</div>` : ''}
  ${bloecke.join('')}
  <div class="small muted" style="margin:4px 0 12px">${STRASSEN_FUSSNOTE} Kartenbilder: ${KARTE_QUELLE}; die genaue Karte mit Ausschnitten steht im Einzelnachweis jeder Fahrt.</div>`;
}

export function buildRouteLogHtml(
  org: Org,
  route: Route,
  runs: RunMeta[],
  periodLabel: string,
  extra: { details?: Map<string, FahrtDetail>; hinweis?: string | null; timeZone?: string } = {},
): string {
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
        <td>${esc(r.performer_name ?? '—')}${r.gaps?.length ? `<br><span class="small warn">${r.gaps.length}× Unterbrechung</span>` : ''}${r.gps_mocked ? '<br><span class="small warn">Fake-GPS gemeldet</span>' : ''}${r.nachgetragen ? '<br><span class="small warn">nachgemeldet ohne Fahrtpunkte</span>' : ''}</td>
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
  ${extra.details ? fahrtenImEinzelnen(runs, extra.details, extra.hinweis ?? null, extra.timeZone) : ''}
  ${PROOF_NOTE}`;
  const osm = !!extra.details && [...extra.details.values()].some((d) => d.bild || d.str?.art === 'tabelle');
  return page(`Fahrtenbuch — ${route.name}`, body, runs.some((r) => !!r.weather), osm);
}

/** Datenquelle für die Details im Fahrtenbuch (Dashboard: Supabase, Beispielseite: erfundene Fahrten). */
export interface FahrtenLader {
  /** Spuren (track/gaps/missed) — Map je Fahrt-ID */
  spuren(ids: string[]): Promise<Map<string, Pick<Run, 'track' | 'gaps' | 'missed'>>>;
  /** Straßenverlauf je Fahrt-ID; null = Tabelle fehlt/Fehler (dann ohne Straßenverlauf) */
  strassen(ids: string[]): Promise<Map<string, StrassenStand> | null>;
}

function mitFrist<T>(p: Promise<T>, ms: number, sonst: T): Promise<T> {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(sonst), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      () => {
        clearTimeout(t);
        ok(sonst);
      },
    );
  });
}

/**
 * Fahrtenbuch mit den Fahrten im Einzelnen: Straßenverlauf für jede Fahrt, kompaktes Kartenbild bis 100 Fahrten
 * (alle auf EINEM Kachelsatz; bis 30 Fahrten in 2-facher, sonst einfacher Auflösung). Laden mit Fristen — das PDF
 * entsteht immer, notfalls ohne Details (mit Hinweis).
 */
export async function buildRouteLogHtmlMitDetails(
  org: Org,
  route: Route,
  runs: RunMeta[],
  periodLabel: string,
  lader: FahrtenLader,
  opts: { timeZone?: string; zeitlimitMs?: number } = {},
): Promise<string> {
  const aktiv = runs.filter((r) => !r.canceled);
  const ids = aktiv.map((r) => r.id);
  const hinweise: string[] = [];
  const details = new Map<string, FahrtDetail>();
  try {
    const mitBildern = aktiv.length <= MAX_SAMMEL_BILDER;
    if (!mitBildern) hinweise.push(`Kartenbilder nur bis ${MAX_SAMMEL_BILDER} Fahrten je Bericht (Dateigröße) — den Zeitraum kürzer wählen oder den Einzelnachweis der Fahrt öffnen.`);
    const [strMap, spuren] = await Promise.all([
      mitFrist(lader.strassen(ids), 20000, null),
      mitBildern ? mitFrist(lader.spuren(ids), 30000, new Map<string, Pick<Run, 'track' | 'gaps' | 'missed'>>()) : Promise.resolve(new Map<string, Pick<Run, 'track' | 'gaps' | 'missed'>>()),
    ]);
    if (mitBildern && ids.length && spuren.size < ids.length) hinweise.push('Nicht alle Spuren ließen sich laden — diese Fahrten ohne Kartenbild.');
    const F = new Map<string, FahrtDaten>();
    for (const r of aktiv) {
      const s = spuren.get(r.id);
      if (s) F.set(r.id, fahrtDaten(s.track, r.started_at, r.ended_at, s.gaps));
    }
    const mitSpur = aktiv.filter((r) => (F.get(r.id)?.n ?? 0) > 0);
    const bilder = mitSpur.length
      ? await kartenBilderSammel(
          mitSpur.map((r) => ({ F: F.get(r.id)!, missed: spuren.get(r.id)?.missed })),
          { plan: route.path ?? null, zeitlimitMs: opts.zeitlimitMs, timeZone: opts.timeZone },
        )
      : [];
    if (mitSpur.length && bilder.every((b) => !b)) hinweise.push('Kartenbilder ließen sich gerade nicht laden (kein Internet?) — Straßenverlauf und Fahrtenliste sind vollständig.');
    const bildVon = new Map(mitSpur.map((r, i) => [r.id, bilder[i] ?? null]));
    for (const r of aktiv) {
      const f = F.get(r.id);
      // ohne geladene Spur: Punkt-Zeiten unbekannt → nach dem Straßenverlauf entscheiden
      const mitZeit = f ? f.mitZeit && f.n >= 2 : (r.track_length_m ?? 0) > 0;
      const stand = strMap ? (strMap.get(r.id) ?? { status: 'in_arbeit' as const, abschnitte: [], quelle: null }) : null;
      details.set(r.id, { str: strassenAnzeige(stand, r, mitZeit), bild: bildVon.get(r.id) ?? null });
    }
  } catch (e) {
    console.error('Fahrten im Einzelnen ausgelassen:', e);
    hinweise.push('Die Fahrten im Einzelnen ließen sich gerade nicht zusammenstellen — die Fahrtenliste oben ist vollständig.');
  }
  return buildRouteLogHtml(org, route, runs, periodLabel, { details, hinweis: hinweise.join(' ') || null, timeZone: opts.timeZone });
}

