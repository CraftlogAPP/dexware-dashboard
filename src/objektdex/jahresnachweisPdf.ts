// Ganzjahres-Nachweis je Objekt — EIN PDF für den Auftraggeber: Deckblatt mit Übersicht, Teil „Winterdienst“ (WinterDex),
// Teil „Objektbetreuung“ (ObjektDex). Die Tabellen kommen aus den Nachweis-PDFs beider Apps (winterdex/report.ts,
// objektdex/report.ts) — gleiche Spalten, gleiche Kennzeichnung (storniert, nachgetragen, Prüfcode, GPS).
// Pro-Regel je Teil wie in SEINER App: WinterDex ohne Pro → Wasserzeichen „Erstellt mit WinterDex Free“ nur über dem
// Winterdienst-Teil; ObjektDex ohne Pro → „Erstellt mit ObjektDex – Gratis-Version“ am Ende der Objektbetreuung.
// Wortwahl ehrlich („Nachweis“, keine Versprechen wie „rechtssicher“). Ausgabe: Browser-Druckdialog (lib/print.ts).
import { cmpKey } from '../lib/tableImport';
import type { Org } from '../lib/orgApi';
import { LEGAL_BASIS, type OperationWithPhotos } from '../winterdex/types';
import { WEATHER_SOURCE_HTML } from '../winterdex/labels';
import { einsatzTabelle as wdEinsatzTabelle, fotoAnhang as wdFotoAnhang, NACHTRAG_NOTE, PROOF_NOTE } from '../winterdex/report';
import {
  einsatzTabelle as odEinsatzTabelle,
  fotoBloecke as odFotoBloecke,
  GRATIS_HINWEIS,
  maengelTabelle as odMaengelTabelle,
  PRUEFCODE_HINWEIS,
  sollIstTabelle as odSollIstTabelle,
} from './report';
import { fmtDateTimeB } from './parts';
import { anzahl, kennzahlen, quoteText, type WdObjektKurz, type Zeitraum } from './jahresnachweis';
import type { OdDefect, OdOperation, OdProperty, OdService, OdSollIstRow } from './types';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface JahresnachweisInput {
  /** ObjektDex-Betrieb (erstellt den Nachweis) */
  betrieb: string;
  objekt: OdProperty;
  zeitraum: Zeitraum;
  /** Fotos angehängt (sonst nur gezählt) */
  fotos: boolean;
  od: {
    sollIst: OdSollIstRow[];
    services: OdService[];
    ops: OdOperation[];
    /** offen + im Zeitraum gemeldet (wie das ObjektDex-PDF) */
    defects: OdDefect[];
    opPhotos: Map<string, string[]>;
    defectPhotos: Map<string, string[]>;
    /** false = Gratis-Hinweis; null (unklar) wie Pro */
    pro: boolean | null;
  };
  /** null = Winterdienst nicht im Nachweis (kein WinterDex-Objekt gewählt/gefunden, nicht angemeldet) */
  wd: {
    betrieb: Org;
    objekt: WdObjektKurz;
    /** aufsteigend */
    ops: OperationWithPhotos[];
    pro: boolean;
  } | null;
}

/** Wasserzeichen wie im WinterDex-PDF ohne Pro — hier als Hintergrund NUR des Winterdienst-Teils (nicht über dem ganzen PDF). */
const WD_FREE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="560"><text x="380" y="300" text-anchor="middle" transform="rotate(-24 380 300)" ' +
  'font-family="Arial, sans-serif" font-size="44" font-weight="800" fill="#0284c7" fill-opacity="0.10">Erstellt mit WinterDex Free</text></svg>';
const WD_FREE_BG = `url("data:image/svg+xml,${encodeURIComponent(WD_FREE_SVG)}")`;

const kpi = (titel: string, wert: string, unter = '') =>
  `<div class="kpi"><span class="small">${esc(titel)}</span><b>${esc(wert)}</b>${unter ? `<span class="small">${esc(unter)}</span>` : ''}</div>`;

export function buildJahresnachweisHtml(x: JahresnachweisInput): string {
  const p = x.objekt;
  const wd = x.wd;
  const k = kennzahlen({ wdOps: wd?.ops ?? null, odOps: x.od.ops, sollIst: x.od.sollIst, maengel: x.od.defects });
  const auftraggeber = p.customer_name?.trim() || wd?.objekt.customer_name?.trim() || '';
  const wdBetriebAnders = wd && cmpKey(wd.betrieb.name) !== cmpKey(x.betrieb) ? wd.betrieb.name : null;
  const jetzt = fmtDateTimeB(new Date().toISOString());

  // ---------------------------------------------------------------- Deckblatt + Übersicht
  const winterUnter = k.winter
    ? [k.winter.storniert ? `zzgl. ${k.winter.storniert} storniert` : '', k.winter.nachgetragen ? `${k.winter.nachgetragen} nachgetragen` : '']
        .filter(Boolean)
        .join(' · ')
    : '';
  const o = k.objekt;
  const deck = `<section class="deck">
  <div class="eyebrow">Ganzjahres-Nachweis</div>
  <h1>${esc(p.name)}</h1>
  ${p.address ? `<div class="adresse">${esc(p.address)}</div>` : ''}
  <table class="meta-tab">
    <tr><th>Auftraggeber</th><td>${esc(auftraggeber || '—')}</td></tr>
    <tr><th>Zeitraum</th><td>${esc(x.zeitraum.label)}</td></tr>
    <tr><th>Erstellt von</th><td>${esc(x.betrieb)}${wdBetriebAnders ? `<div class="small">Winterdienst: ${esc(wdBetriebAnders)}</div>` : ''}</td></tr>
    <tr><th>Erstellt am</th><td>${esc(jetzt)}</td></tr>
  </table>
  <h2>Übersicht</h2>
  <div class="kpis">
    ${k.winter ? kpi('Winterdienst-Einsätze', String(k.winter.einsaetze), winterUnter) : ''}
    ${kpi('Einsätze Objektbetreuung', String(o.einsaetze), o.storniert ? `zzgl. ${o.storniert} storniert` : '')}
    ${kpi('erledigte Leistungen', String(o.leistungen))}
    ${kpi('Soll/Ist', quoteText(o), o.termine ? `${o.erledigt} von ${o.termine} fälligen Terminen` : 'keine festen Termine')}
    ${kpi('offene Mängel', String(o.offeneMaengel), o.maengel ? `${anzahl(o.maengel, 'Mangel', 'Mängel')} im Nachweis` : '')}
  </div>
  <p class="small">Soll/Ist: Anteil der fälligen Termine fester Leistungen (Turnus), an denen die Leistung erledigt wurde — ein Tag zählt
  einmal. Leistungen nach Bedarf haben kein Soll${o.nachBedarf ? ` (${o.nachBedarf}× nach Bedarf erledigt)` : ''}. Stornierte Einsätze zählen nicht mit.</p>
  <h2>Inhalt</h2>
  <ol class="inhalt">
    ${
      wd
        ? `<li><b>Winterdienst</b> — aus WinterDex: Einsätze mit Maßnahme, Wetterlage, GPS-Stempel und Prüfcode${x.fotos ? ', Foto-Anhang' : ''}${wd.pro ? '' : ' <span class="small">(WinterDex Free)</span>'}</li>`
        : ''
    }
    <li><b>Objektbetreuung</b> — aus ObjektDex: Soll/Ist je Leistung, Einsätze, Mängel${x.fotos ? ', Fotos' : ''}${x.od.pro === false ? ' <span class="small">(ObjektDex Gratis-Version)</span>' : ''}</li>
  </ol>
  ${wd ? '' : '<p class="small dezent">Winterdienst ist in diesem Nachweis nicht enthalten.</p>'}
</section>`;

  // ---------------------------------------------------------------- Teil Winterdienst (WinterDex)
  let winter = '';
  if (wd) {
    const ops = wd.ops;
    const gueltig = ops.filter((op) => !op.canceled).length;
    const anhang = x.fotos ? wdFotoAnhang(ops) : '';
    winter = `<section class="teil wd${wd.pro ? '' : ' wd-free'}">
  <div class="teil-kopf"><h2>Winterdienst</h2><span class="quelle">aus WinterDex${wd.pro ? '' : ' · <b>Erstellt mit WinterDex Free</b>'}</span></div>
  <div class="meta">Objekt in WinterDex: <b>${esc(wd.objekt.name)}</b>${wd.objekt.address ? ` · ${esc(wd.objekt.address)}` : ''}</div>
  <div class="meta">Zeitraum: ${esc(x.zeitraum.label)} · Einsätze: ${gueltig}${
      ops.length > gueltig ? ` (zzgl. ${anzahl(ops.length - gueltig, 'stornierter Eintrag', 'stornierte Einträge')}, gekennzeichnet)` : ''
    }</div>
  <div class="legal">${esc(LEGAL_BASIS[wd.betrieb.land] ?? LEGAL_BASIS.DE)}</div>
  ${wdEinsatzTabelle(ops, !x.fotos)}
  ${anhang ? `<h3 class="unter">Foto-Anhang Winterdienst</h3>${anhang}` : ''}
  ${ops.some((op) => !!op.entry_hash) ? PROOF_NOTE : ''}
  ${ops.some((op) => op.nachgetragen) ? NACHTRAG_NOTE : ''}
  <p class="small fuss">Erstellt mit WinterDex — winterdex.dexware.app${ops.some((op) => op.weather) ? ` · ${WEATHER_SOURCE_HTML}` : ''}</p>
</section>`;
  }

  // ---------------------------------------------------------------- Teil Objektbetreuung (ObjektDex)
  const fotoTeil = x.fotos ? odFotoBloecke(x.od.ops, x.od.opPhotos) : '';
  const objekt = `<section class="teil od">
  <div class="teil-kopf"><h2>Objektbetreuung</h2><span class="quelle">aus ObjektDex</span></div>
  <div class="meta">Zeitraum: ${esc(x.zeitraum.label)} · Einsätze: ${o.einsaetze}${o.storniert ? ` (+ ${o.storniert} storniert, sichtbar vermerkt)` : ''} · Mängel: ${o.maengel}${
    o.offeneMaengel ? ` (${o.offeneMaengel} offen)` : ''
  }</div>
  <h3 class="unter">Soll/Ist je Leistung</h3>
  ${odSollIstTabelle(x.od.sollIst, x.od.services)}
  <h3 class="unter">Einsätze</h3>
  ${odEinsatzTabelle(x.od.ops)}
  ${fotoTeil ? `<h3 class="unter">Fotos</h3>${fotoTeil}` : ''}
  <h3 class="unter">Mängel</h3>
  ${odMaengelTabelle(x.od.defects, x.od.defectPhotos)}
  <div class="note small">${PRUEFCODE_HINWEIS} Erstellt mit ObjektDex.${x.od.pro === false ? `<div class="free">${esc(GRATIS_HINWEIS)}</div>` : ''}</div>
</section>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Ganzjahres-Nachweis ${esc(p.name)} ${esc(x.zeitraum.label)}</title>
<style>
  thead{display:table-header-group} tr{page-break-inside:avoid;break-inside:avoid}
  body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#16202b;margin:28px;font-size:12px}
  h1{font-size:26px;margin:4px 0 2px} h2{font-size:16px;margin:22px 0 8px} h3{font-size:12px;margin:14px 0 6px}
  .small{font-size:11px;color:#51606f} .muted{color:#55706A} .mono{font-family:Consolas,monospace;font-size:10.5px}
  table{width:100%;border-collapse:collapse}
  .eyebrow{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#0B8A68}
  .adresse{font-size:14px;color:#51606f;margin-bottom:16px}
  .meta-tab{width:auto;min-width:60%;margin:8px 0 6px} .meta-tab th,.meta-tab td{text-align:left;vertical-align:top;padding:5px 14px 5px 0;border-bottom:1px solid #DCE3E8}
  .meta-tab th{font-weight:600;color:#51606f;white-space:nowrap}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px;margin:10px 0}
  .kpi{border:1.5px solid #C9D6DC;border-radius:10px;padding:10px 12px;min-width:0;break-inside:avoid}
  .kpi b{font-size:22px;display:block;margin:2px 0}
  .inhalt{margin:6px 0;padding-left:20px} .inhalt li{margin:4px 0} .dezent{color:#6b7785;font-style:italic}
  .teil{page-break-before:always;break-before:page}
  .teil-kopf{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:3px solid #0284c7;padding-bottom:4px;margin-bottom:10px}
  .teil-kopf h2{margin:0;font-size:20px} .quelle{font-size:11px;color:#51606f}
  .meta{color:#51606f;margin-bottom:4px}
  .unter{font-size:14px;margin:20px 0 8px}
  /* Winterdienst — wie das WinterDex-PDF */
  .wd .teil-kopf h2{color:#075985}
  .wd th,.wd td{border:1.5px solid #9CA5AD;padding:6px 8px;text-align:left;vertical-align:top}
  .wd th{background:#eaf2f8;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px}
  .wd tr.canceled td{color:#8a97a3;background:#fafbfc}
  .wd .legal{margin:10px 0 14px;padding:8px 12px;background:#f0f7fc;border-left:3px solid #0284c7;font-size:11px}
  .wd .photos{display:flex;flex-wrap:wrap;gap:8px} .wd .photos img{width:180px;border:1.5px solid #9CA5AD;border-radius:4px}
  .wd .photo-group{break-inside:avoid} .wd .fuss{margin-top:16px;padding-top:8px;border-top:1.5px solid #9CA5AD}
  .wd-free{background-image:${WD_FREE_BG};background-repeat:repeat-y;background-size:100% auto;background-position:center 60px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  /* Objektbetreuung — wie das ObjektDex-PDF */
  .od .teil-kopf{border-bottom-color:#0B8A68} .od .teil-kopf h2{color:#0B3B36}
  .od .unter{color:#0B3B36;border-bottom:2px solid #0B8A68;padding-bottom:4px}
  .od th,.od td{border-bottom:1px solid #D6E4DF;padding:6px;text-align:left;vertical-align:top}
  .od th{background:#F1F6F4;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#55706A}
  .od tr.cx td{color:#8a9a96}
  .od .pg{page-break-inside:avoid;margin:8px 0} .od .pg img{height:150px;margin:4px 6px 0 0;border-radius:6px}
  .od .dimg{height:90px;margin:4px 6px 0 0;border-radius:6px}
  .note{border:1.5px solid #AFC9C1;border-radius:8px;padding:8px 12px;margin-top:20px;page-break-inside:avoid}
  .free{margin-top:6px;font-size:10px;color:#55706A}
  @page{margin:14mm} @media print{body{margin:0}}
</style></head><body>
${deck}
${winter}
${objekt}
</body></html>`;
}
