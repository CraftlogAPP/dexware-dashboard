// Quelle: App InstallateurDex mobile/src/pdf/wartungsvertrag.ts, Stand 07.11.2026 (Commit 397482a) — HTML und Texte 1:1.
// Nur angepasst: Firmen-Look/Bildquellen wie die Portal-Drucke (nur data:/https, alles maskiert), Fenstertitel; das
// Teilen der App entfällt (Portal: Druckfenster → „Als PDF speichern“). Änderungen IMMER zuerst in der App.
//
// Wartungsvertrag als PDF im Firmen-Look (Farbe + Logo mit Pro, sonst Wasserzeichen wie die anderen Gratis-PDFs).
// Inhalt: Vertragspartner, Anlagen mit Preis je Jahr, Leistungsumfang je Anlagentyp, Preis/Zahlung, Laufzeit/Kündigung,
// Erklärung zum vorzeitigen Beginn (nur mit Widerrufsrecht), Unterschriften Kunde + Betrieb, danach Widerrufsbelehrung
// und Muster-Widerrufsformular (Texte: lib/wartungsvertrag.ts). Bilder (Logo, Unterschriften) nur über imgSrc().
import {
  deDatum,
  euroText,
  intervallText,
  kleinunternehmerHinweis,
  kuendigungText,
  vorzeitigerBeginnText,
  zahlweiseText,
  type Firma,
  type KundenArt,
  type Kuendigung,
  type Leistung,
  type Summen,
  type Widerruf,
  type Zahlweise,
} from './vertragLogik';
import type { Land } from '../geld/invoice';
import { isSafeImgSrc } from '../../lib/imgSrc';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Firmen-Look wie die anderen Portal-Drucke (report.ts): Farbe + Logo nur mit Pro. */
export interface Branding {
  brandColor?: string | null;
  logoUri?: string | null;
}
const DEFAULT_BRAND_COLOR = '#B5651D'; // Kupfer wie im App-PDF
const resolveBrandColor = (c?: string | null) => (c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : DEFAULT_BRAND_COLOR);
/** Druck läuft im selben Ursprung wie das Portal: als Bildquelle nur data:image/… und https://, Wert maskiert. */
function imgSrc(u: string | null | undefined): string {
  return isSafeImgSrc(u) ? esc(u) : '';
}


export interface VertragsAnlage {
  name: string;
  kindLabel: string;
  /** Hersteller, Modell, Seriennummer */
  geraet?: string;
  standort?: string;
  intervalMonths: number;
  /** Preis je Jahr netto vor Rabatt (Cent) */
  jahrCents: number;
}

export interface VertragsDoc {
  land: Land;
  datum: Date;
  ort?: string;
  firma: Firma & { uid?: string };
  kunde: { name: string; anschrift: string; email?: string; telefon?: string; uid?: string; art: KundenArt };
  objekt?: string;
  anlagen: VertragsAnlage[];
  leistungen: Leistung[];
  umfang: string[];
  summen: Summen;
  rabattPct: number;
  kleinunternehmer: boolean;
  zahlweise: Zahlweise;
  kuendigung: Kuendigung;
  beginn: Date;
  vereinbarungen?: string;
  widerruf: Widerruf | null;
  /** nur mit Widerrufsrecht: Kunde verlangt Beginn vor Ablauf der Frist */
  vorzeitig: boolean;
  sigKunde?: string;
  sigFirma?: string;
  firmaSigner?: string;
}

const css = (accent: string) => `
  @page{margin:16mm 14mm} body{font-family:-apple-system,Roboto,Arial,sans-serif;font-size:9.5pt;color:#1B1F24;line-height:1.45}
  .bar{height:6px;background:${accent};border-radius:3px;margin-bottom:12px}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
  h1{color:${accent};font-size:18pt;margin:0 0 2px} h2{color:${accent};font-size:11pt;margin:16px 0 6px} .sub{color:#646B74}
  .parties{display:flex;gap:10px;margin:8px 0} .box{flex:1;border:1.5px solid #D5DBE2;border-radius:8px;padding:8px 12px;page-break-inside:avoid}
  .box b.t{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.4px;color:${accent};margin-bottom:3px}
  table{width:100%;border-collapse:collapse;margin-top:4px} thead{display:table-header-group} tr{page-break-inside:avoid}
  th{text-align:left;border-bottom:2px solid ${accent};padding:4px;font-size:8pt;color:#646B74;text-transform:uppercase;letter-spacing:.3px}
  td{border-bottom:1px solid #E8E4DE;padding:5px 4px;vertical-align:top} .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .m{color:#646B74;font-size:8.5pt} .tot td{font-weight:800;border-bottom:0} .sumrow td{border-bottom:0;padding:2px 4px}
  .leist{margin:6px 0 8px;page-break-inside:avoid} .leist b{display:block} .leist ul{margin:3px 0 0 16px;padding:0;columns:2;column-gap:22px} .leist li{margin:1px 0}
  ul.plain{margin:4px 0 0 16px;padding:0} ul.plain li{margin:2px 0}
  .ask{border:1.5px solid ${accent};border-radius:8px;padding:8px 12px;margin-top:12px;page-break-inside:avoid}
  .opt{display:flex;gap:8px;margin-top:5px} .cb{flex:none;width:12px;height:12px;border:1.5px solid #1B1F24;border-radius:2px;text-align:center;line-height:11px;font-size:10px;font-weight:900}
  .sig{display:flex;gap:28px;margin-top:22px;page-break-inside:avoid} .sig>div{flex:1}
  .sig-img{display:block;height:48px;max-width:230px;object-fit:contain;margin-bottom:-34px} .line{border-bottom:1px solid #333;height:34px} .lab{font-size:8pt;color:#555;margin-top:3px}
  .page{page-break-before:always} .wr h3{font-size:10pt;margin:10px 0 3px} .wr p{margin:0 0 6px}
  .form{border:1.5px solid #D5DBE2;border-radius:8px;padding:10px 14px;margin-top:12px} .form p{margin:0 0 7px} .fill{border-bottom:1px solid #999;height:20px;margin:-2px 0 8px}
  footer{margin-top:16px;color:#8A9098;font-size:7.5pt}
  .watermark{position:fixed;top:45%;left:0;right:0;text-align:center;transform:rotate(-24deg);font-size:40px;font-weight:800;color:rgba(185,28,28,0.10)}`;

function sig(img: string | undefined, label: string): string {
  const src = imgSrc(img);
  return `<div>${src ? `<img class="sig-img" src="${imgSrc(img)}" alt="Unterschrift" />` : ''}<div class="line"></div><div class="lab">${src ? 'Elektronisch unterschrieben' : 'Datum, Unterschrift'} — ${esc(label)}</div></div>`;
}

export function buildVertragHtml(d: VertragsDoc, branding: Branding | null, pro: boolean): string {
  const accent = pro ? resolveBrandColor(branding?.brandColor) : DEFAULT_BRAND_COLOR;
  const logo = pro && imgSrc(branding?.logoUri) ? `<img src="${imgSrc(branding?.logoUri)}" style="max-height:56px;max-width:190px;object-fit:contain" alt="Logo" />` : '';
  const watermark = pro ? '' : '<div class="watermark">Erstellt mit InstallateurDex Free</div>';
  const f = d.firma;
  const firmAddr = [f.street, [f.zip, f.city].filter(Boolean).join(' ')].filter((x) => !!x && !!String(x).trim()).join(', ');
  const s = d.summen;
  const mitUst = !d.kleinunternehmer && s.vatRate > 0;
  const datum = deDatum(d.datum);

  const rows = d.anlagen
    .map(
      (a) =>
        `<tr><td><b>${esc(a.name)}</b><div class="m">${esc(a.kindLabel)}${a.geraet ? ` · ${esc(a.geraet)}` : ''}${a.standort ? ` · ${esc(a.standort)}` : ''}</div></td><td>${esc(intervallText(a.intervalMonths))}</td><td class="n">${euroText(a.jahrCents)}</td></tr>`
    )
    .join('');
  const sumRows = [
    s.rabatt ? `<tr class="sumrow"><td colspan="2">Summe netto</td><td class="n">${euroText(s.netto)}</td></tr><tr class="sumrow"><td colspan="2">Rabatt ${esc(String(d.rabattPct).replace('.', ','))} %</td><td class="n">− ${euroText(s.rabatt)}</td></tr>` : '',
    mitUst
      ? `<tr class="sumrow"><td colspan="2">Netto je Jahr</td><td class="n">${euroText(s.nettoNachRabatt)}</td></tr><tr class="sumrow"><td colspan="2">zzgl. ${esc(String(s.vatRate).replace('.', ','))} % USt</td><td class="n">${euroText(s.ust)}</td></tr>`
      : '',
    `<tr class="tot"><td colspan="2">Gesamtpreis je Jahr${mitUst ? ' inkl. USt' : ''}</td><td class="n">${euroText(s.brutto)}</td></tr>`,
  ].join('');

  const leistungen = d.leistungen
    .map((l) => `<div class="leist"><b>${esc(l.kindLabel)}: ${esc(l.titel)}</b>${l.punkte.length ? `<ul>${l.punkte.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>`)
    .join('');

  const vb = vorzeitigerBeginnText(d.vorzeitig);
  const ask = d.widerruf
    ? `<div class="ask"><b>${esc(vb.frage)}</b>
        <div class="opt"><span class="cb">${d.vorzeitig ? '✕' : ''}</span><span>${esc(vb.ja)}</span></div>
        <div class="opt"><span class="cb">${d.vorzeitig ? '' : '✕'}</span><span>${esc(vb.nein)}</span></div></div>`
    : '';

  const kunde = d.kunde;
  const wr = d.widerruf;
  const widerrufPage = wr
    ? `<section class="page wr">
        <div class="bar"></div>
        <h1>${esc(wr.titel)}</h1>
        ${wr.abschnitte.map((a) => `${a.h ? `<h3>${esc(a.h)}</h3>` : ''}<p>${esc(a.text)}</p>`).join('')}
        <p class="m">Ende der Widerrufsbelehrung</p>
        <div class="form"><h3 style="margin-top:0">${esc(wr.formularTitel)}</h3>${wr.formular.map((l) => `<p>${esc(l)}</p>${/^– (Bestellt|Name|Anschrift|Unterschrift|Datum|Hiermit)/.test(l) ? '<div class="fill"></div>' : ''}`).join('')}</div>
      </section>`
    : '';

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><title>Wartungsvertrag — ${esc(d.kunde.name)}</title><style>${css(accent)}</style></head><body>${watermark}
    <div class="bar"></div>
    <header><div><h1>Wartungsvertrag</h1><div class="sub">${d.objekt ? `${esc(d.objekt)} · ` : ''}vom ${datum}</div></div>${logo}</header>
    <div class="parties">
      <div class="box"><b class="t">Auftragnehmer</b><div><b>${esc(f.name)}</b></div>${firmAddr ? `<div>${esc(firmAddr)}</div>` : ''}${f.phone ? `<div>Tel. ${esc(f.phone)}</div>` : ''}${f.email ? `<div>${esc(f.email)}</div>` : ''}${f.uid ? `<div>UID ${esc(f.uid)}</div>` : ''}</div>
      <div class="box"><b class="t">Auftraggeber${kunde.art === 'unternehmer' ? ' (Unternehmen)' : ''}</b><div><b>${esc(kunde.name)}</b></div>${kunde.anschrift ? `<div>${esc(kunde.anschrift)}</div>` : ''}${kunde.telefon ? `<div>Tel. ${esc(kunde.telefon)}</div>` : ''}${kunde.email ? `<div>${esc(kunde.email)}</div>` : ''}${kunde.uid ? `<div>UID ${esc(kunde.uid)}</div>` : ''}</div>
    </div>

    <h2>1. Vertragsgegenstand</h2>
    <p>Der Auftragnehmer übernimmt die regelmäßige Wartung der folgenden Anlagen des Auftraggebers:</p>
    <table><thead><tr><th>Anlage</th><th>Intervall</th><th class="n">Preis je Jahr netto</th></tr></thead><tbody>${rows}</tbody><tfoot>${sumRows}</tfoot></table>
    ${d.kleinunternehmer ? `<p class="m">${esc(kleinunternehmerHinweis(d.land))}</p>` : ''}

    <h2>2. Leistungsumfang</h2>
    ${leistungen}
    <ul class="plain">${d.umfang.map((u) => `<li>${esc(u)}</li>`).join('')}<li>Der Auftragnehmer meldet sich rechtzeitig vor der Fälligkeit zur Terminvereinbarung. Der Auftraggeber sorgt für den Zugang zu den Anlagen.</li><li>Jede Wartung wird mit einem Protokoll dokumentiert.</li></ul>

    <h2>3. Preis und Zahlung</h2>
    <p>${esc(zahlweiseText(d.zahlweise, s.brutto, mitUst))}</p>

    <h2>4. Laufzeit und Kündigung</h2>
    ${kuendigungText(d.kuendigung, { beginn: deDatum(d.beginn), land: d.land, kunde: kunde.art }).map((t) => `<p>${esc(t)}</p>`).join('')}

    ${d.vereinbarungen?.trim() ? `<h2>5. Weitere Vereinbarungen</h2><p style="white-space:pre-wrap">${esc(d.vereinbarungen.trim())}</p>` : ''}
    ${wr ? `<p class="m">Als Verbraucher haben Sie ein gesetzliches Widerrufsrecht. Die Widerrufsbelehrung und das Muster-Widerrufsformular sind diesem Vertrag beigefügt.</p>` : ''}
    ${ask}

    <div class="sig">${sig(d.sigKunde, `Auftraggeber: ${kunde.name}`)}${sig(d.sigFirma, `Auftragnehmer: ${d.firmaSigner?.trim() ? `${d.firmaSigner.trim()}, ` : ''}${f.name}`)}</div>
    <p class="m" style="margin-top:6px">${d.ort?.trim() ? `${esc(d.ort.trim())}, ` : ''}am ${datum}</p>
    <footer>Erstellt am ${datum} mit InstallateurDex.</footer>
    ${widerrufPage}
  </body></html>`;
}
