// Kartenbild fürs Nachweis-PDF (seit 25.11.2026, Prüfbericht für die Gemeinde: „die genaue Linie auf einer echten
// Karte“). OpenStreetMap-Kacheln (gleiche wie die Fahrt-Karte im Dashboard) werden im Browser auf ein Canvas gelegt,
// darüber die GPS-Spur in voller Genauigkeit (Vereinfachung höchstens 1 m), Vorlage, nicht befahrene Abschnitte,
// Unterbrechungen, Start/Ende und Zeitmarken — als Bild (2-fache Auflösung) ins PDF.
// Lange Fahrten: Übersicht + bis zu 3 Ausschnitte in Straßen-Zoom (wo die Fahrt am dichtesten ist), in der Übersicht
// mit A/B/C markiert.
//
// OSM-Kachelregeln (https://operations.osmfoundation.org/policies/tiles/): Namensnennung im Bild und im Bericht,
// keine Massenabrufe — höchstens 48 Kacheln für die Übersicht und 12 je Ausschnitt (≤ 84 je Bericht, so viel wie
// ein paar Mal Verschieben in der Karte), Browser-Cache wird genutzt.
// Nie ein Hindernis für das PDF: ohne Netz, eine Kachel lädt nicht, Zeitlimit (8 s), Canvas gesperrt, irgendein Fehler
// → null bzw. ohne Ausschnitte, der Bericht nimmt dann die bisherige Skizze.
//
// kartenPlan (reine Rechnung: Zoom, Ausschnitte, Kacheln) ist ohne Browser getestet (tests/strassen-verlauf.test.mjs),
// das Zeichnen im Klick-Test (tests/browser/fahrt-pdf-karte.mjs).
import { ROUTE_COLORS, type LatLng } from './routes';
import { fmtUhr, spurStuecke, startEndeLabels, vereinfacheLinie, type FahrtDaten, type ZeitMarke } from './fahrtZeit';

// gleich wie FahrtKarte / aussendienst/Karte
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const KARTE_QUELLE = '© OpenStreetMap-Mitwirkende';
const TILE = 256;
/** Bild in doppelter Auflösung (Druck ≈ 190 dpi bei voller Seitenbreite) */
const SKALA = 2;
const UEBERSICHT_W = 700;
const UEBERSICHT_H_MIN = 300;
const UEBERSICHT_H_MAX = 560;
const AUSSCHNITT_W = 340;
const AUSSCHNITT_H = 250;
const RAND = 28;
export const MAX_KACHELN_UEBERSICHT = 48;
export const MAX_KACHELN_AUSSCHNITT = 12;
const MAX_ZOOM = 17; // Anzeige-Zoom (Kacheln eine Stufe feiner wegen 2-facher Auflösung)
const PAUSE = '#D97706';
const RAHMEN = '#1D4ED8';

export interface KartenBild {
  /** data:image/jpeg… */
  src: string;
  /** Anzeigegröße (CSS-Pixel) */
  w: number;
  h: number;
  /** Ausschnitt: „A“, „B“, „C“ */
  buchstabe?: string;
  /** Ausschnitt: Uhrzeiten, zu denen die Fahrt dort war („06:12–06:31, 07:40–07:52“) */
  zeiten?: string;
  /** so wurde beschriftet (Klick-Test: kein Schild über einem Rahmen-Buchstaben) — nicht im Bericht */
  beschriftung?: BeschriftungsPlan;
}
export interface KartenBilder {
  uebersicht: KartenBild;
  ausschnitte: KartenBild[];
}

export interface Fenster {
  /** Anzeige-Zoom; Kacheln mit z + log2(skala) */
  z: number;
  /** Mitte in Weltpixeln beim Anzeige-Zoom */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Bildpunkte je Anzeige-Pixel: 2 (Einzel-PDF, Druckqualität) oder 1 (Sammel-PDF mit vielen Fahrten) */
  skala?: 1 | 2;
  kacheln: { x: number; y: number; z: number; dx: number; dy: number }[];
  buchstabe?: string;
  /** Punkt-Indizes (F), die im Fenster liegen, als zusammenhängende Besuche [von, bis] */
  besuche?: [number, number][];
}

export interface KartenPlan {
  uebersicht: Fenster;
  ausschnitte: Fenster[];
}

/** Web-Mercator: Weltpixel (Kachelgröße 256) bei Zoom z */
export function weltPx(lat: number, lng: number, z: number): [number, number] {
  const n = TILE * 2 ** z;
  const s = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
/** Meter je Anzeige-Pixel bei Zoom z und Breite lat */
export function meterProPx(lat: number, z: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

function kachelnFuer(f: Omit<Fenster, 'kacheln'>): Fenster['kacheln'] {
  const s = f.skala ?? SKALA;
  const zt = f.z + Math.round(Math.log2(s));
  const cw = f.w * s;
  const ch = f.h * s;
  const ox = f.cx * s - cw / 2;
  const oy = f.cy * s - ch / 2;
  const anzahl = 2 ** zt;
  const out: Fenster['kacheln'] = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + ch - 1) / TILE); ty++) {
    if (ty < 0 || ty >= anzahl) continue;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + cw - 1) / TILE); tx++) {
      out.push({ x: ((tx % anzahl) + anzahl) % anzahl, y: ty, z: zt, dx: tx * TILE - ox, dy: ty * TILE - oy });
    }
  }
  return out;
}

/**
 * Bildplan: Übersicht (alle Punkte + Vorlage eingepasst, ganzzahliger Zoom ≤ 17) und — wenn die Übersicht gröber als
 * Zoom 15 ist (Fahrt über ~2 km) — bis zu 3 Ausschnitte im Straßen-Zoom dort, wo die Fahrt die meisten Meter hat.
 */
export function kartenPlan(F: FahrtDaten, plan: readonly LatLng[] = [], opts: { ausschnitte?: boolean } = {}): KartenPlan | null {
  const pts: LatLng[] = [];
  for (let i = 0; i < F.n; i++) pts.push([F.lat[i], F.lng[i]]);
  for (const p of plan) pts.push(p);
  const uebersicht = einpassen(pts, UEBERSICHT_W, UEBERSICHT_H_MIN, UEBERSICHT_H_MAX, SKALA);
  if (!uebersicht) return null;
  const z = uebersicht.z;
  const ausschnitte = opts.ausschnitte === false || z > 15 || F.n < 2 ? [] : waehleAusschnitte(F, Math.min(MAX_ZOOM, Math.max(16, z + 2)));
  return { uebersicht, ausschnitte };
}

/** Fenster der Breite w (Höhe hMin…hMax), in das alle Punkte passen — größter ganzzahliger Zoom ≤ 17. */
export function einpassen(pts: readonly LatLng[], w: number, hMin: number, hMax: number, skala: 1 | 2): Fenster | null {
  if (!pts.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [la, ln] of pts) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null;
  const rand = Math.min(RAND, w / 12);
  let z = MAX_ZOOM;
  let bh = 0;
  for (; z > 2; z--) {
    const [x1, y1] = weltPx(maxLat, minLng, z);
    const [x2, y2] = weltPx(minLat, maxLng, z);
    bh = y2 - y1;
    if (x2 - x1 <= w - 2 * rand && bh <= hMax - 2 * rand) break;
  }
  const [x1, y1] = weltPx(maxLat, minLng, z);
  const [x2, y2] = weltPx(minLat, maxLng, z);
  const h = Math.round(Math.min(hMax, Math.max(hMin, bh + 2 * rand)));
  const basis = { z, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w, h, skala };
  return { ...basis, kacheln: kachelnFuer(basis) };
}

/** Bis zu 3 Ausschnitte: Fenster mit den meisten gefahrenen Metern, kaum überlappend, je mindestens 7 % der Fahrt bzw. 400 m. */
function waehleAusschnitte(F: FahrtDaten, z: number): Fenster[] {
  const gesamt = F.d[F.n - 1];
  if (!(gesamt > 300)) return [];
  const wx = new Float64Array(F.n);
  const wy = new Float64Array(F.n);
  const seg = new Float64Array(F.n); // Meter vom vorigen Punkt (im selben Stück)
  for (let i = 0; i < F.n; i++) [wx[i], wy[i]] = weltPx(F.lat[i], F.lng[i], z);
  for (const [a, b] of F.stuecke) for (let i = a + 1; i <= b; i++) seg[i] = Math.max(0, F.d[i] - F.d[i - 1]);
  const halbW = AUSSCHNITT_W / 2 - 18;
  const halbH = AUSSCHNITT_H / 2 - 18;
  const schritt = Math.max(1, Math.floor(F.n / 300));
  const gewaehlt: { cx: number; cy: number; m: number }[] = [];
  for (let runde = 0; runde < 3; runde++) {
    let best = -1;
    let bestM = 0;
    for (let k = 0; k < F.n; k += schritt) {
      const cx = wx[k];
      const cy = wy[k];
      if (gewaehlt.some((g) => Math.abs(g.cx - cx) < AUSSCHNITT_W * 0.75 && Math.abs(g.cy - cy) < AUSSCHNITT_H * 0.75)) continue;
      let m = 0;
      for (let i = 0; i < F.n; i++) if (Math.abs(wx[i] - cx) <= halbW && Math.abs(wy[i] - cy) <= halbH) m += seg[i];
      if (m > bestM) {
        bestM = m;
        best = k;
      }
    }
    if (best < 0 || bestM < Math.max(150, Math.min(gesamt * 0.07, 400))) break;
    gewaehlt.push({ cx: wx[best], cy: wy[best], m: bestM });
  }
  return gewaehlt.map((g, j) => {
    const f = { z, cx: g.cx, cy: g.cy, w: AUSSCHNITT_W, h: AUSSCHNITT_H, buchstabe: 'ABC'[j] };
    const besuche: [number, number][] = [];
    let von = -1;
    let letzt = -1;
    for (let i = 0; i < F.n; i++) {
      const drin = Math.abs(wx[i] - g.cx) <= f.w / 2 && Math.abs(wy[i] - g.cy) <= f.h / 2;
      if (!drin) continue;
      // neuer Besuch, wenn seit dem letzten Punkt im Fenster > 2 Min. vergangen sind (bzw. ohne Zeiten: Index-Lücke)
      const neu = letzt < 0 || (F.mitZeit ? F.t[i] - F.t[letzt] > 120000 : i - letzt > 30);
      if (neu) {
        if (von >= 0) besuche.push([von, letzt]);
        von = i;
      }
      letzt = i;
    }
    if (von >= 0) besuche.push([von, letzt]);
    return { ...f, kacheln: kachelnFuer(f), besuche };
  });
}

/** „06:12–06:31, 07:40–07:52 Uhr“ (höchstens 4 Besuche, sonst „…“) */
export function besuchsZeiten(F: FahrtDaten, besuche: readonly [number, number][] | undefined, timeZone?: string): string {
  if (!F.mitZeit || !besuche?.length) return '';
  const t = besuche.slice(0, 4).map(([a, b]) => {
    const x = fmtUhr(F.t[a], timeZone);
    const y = fmtUhr(F.t[b], timeZone);
    return x === y ? x : `${x}–${y}`;
  });
  return `${t.join(', ')}${besuche.length > 4 ? ' …' : ''} Uhr`;
}

// ---------------------------------------------------------------- Beschriftung (reine Rechnung, ohne Browser getestet)

/** Fläche [x0, y0, x1, y1] in Anzeige-Pixeln */
export type Box = [number, number, number, number];
const ueber = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const SCHILD_H = 16;
const SCHILD_FONT = '700 11px Arial, sans-serif';
/** Buchstabenfeld der Ausschnitt-Rahmen in der Übersicht */
const FELD = 18;
const START_FARBE = '#166534';
/** Start und Ende gelten als „am selben Ort“ unter so vielen Metern bzw. Bildpunkten (wie FahrtKarte: 60 m) */
const NAH_M = 60;
const NAH_PX = 14;

export interface Schild {
  text: string;
  farbe: string;
  box: Box;
  art: 'start' | 'ende' | 'marke';
  /** Punkt, zu dem das Schild gehört (weiter weg → Führungslinie) */
  p: [number, number];
}

/** Nächster Punkt der Schild-Fläche zum Punkt und sein Abstand — über 9 px bekommt das Schild eine Führungslinie. */
export function fuehrung(s: Pick<Schild, 'box' | 'p'>): { x: number; y: number; abstand: number } {
  const x = Math.min(Math.max(s.p[0], s.box[0]), s.box[2]);
  const y = Math.min(Math.max(s.p[1], s.box[1]), s.box[3]);
  return { x, y, abstand: Math.hypot(x - s.p[0], y - s.p[1]) };
}

export interface BeschriftungsPlan {
  /** Start/Ende in Anzeige-Pixeln (null = nicht im Bild) */
  start: [number, number] | null;
  ende: [number, number] | null;
  /** Start und Ende (fast) am selben Ort: Ende-Punkt zuerst, Start kleiner darüber, Start-Schild darunter */
  nah: boolean;
  /** Zeitmarken im Bild */
  marken: [number, number][];
  /** Ausschnitt-Rahmen in der Übersicht mit Buchstabenfeld (in einer freien Ecke des Rahmens) */
  rahmen: { buchstabe: string; x: number; y: number; w: number; h: number; feld: Box }[];
  /** Buchstabe eines Ausschnitts (oben links) */
  feld: Box | null;
  schilder: Schild[];
  /** Zeitmarken ohne freien Platz — nur der Punkt (Start/Ende stehen immer) */
  ohneSchild: string[];
}

/**
 * Wohin kommen Rahmen-Buchstaben und Beschriftungen? Reihenfolge: feste Flächen (Maßstab, Quellenangabe, Nordpfeil,
 * Ausschnitt-Buchstabe) → Buchstabenfelder der Rahmen (in die erste Ecke, die keinen Start/Ende/Marke-Punkt trifft)
 * → Start/Ende-Schild (Pflicht: weicht weiter aus, notfalls über einen Punkt, nie über ein Feld oder ein anderes
 * Schild) → Zeitmarken (ohne Platz nur der Punkt). Kein Schild überdeckt danach ein Buchstabenfeld — vorher wurden
 * Rahmen + Felder NACH den Schildern gezeichnet und deckten Uhrzeiten ab (echter Bericht: „Ende 11“ statt 11:34).
 */
export function beschriftungsPlan(
  f: Pick<Fenster, 'z' | 'cx' | 'cy' | 'w' | 'h' | 'buchstabe'>,
  F: FahrtDaten,
  marken: readonly ZeitMarke[],
  labels: { startLabel: string | null; endeLabel: string | null },
  rahmen: readonly Pick<Fenster, 'z' | 'cx' | 'cy' | 'w' | 'h' | 'buchstabe'>[],
  breite: (text: string) => number,
  fest: readonly Box[] = [
    [0, f.h - 30, 176, f.h],
    [f.w - 150, f.h - 17, f.w, f.h],
    [f.w - 30, 0, f.w, 40],
  ],
): BeschriftungsPlan {
  const P = (la: number, ln: number): [number, number] => {
    const [x, y] = weltPx(la, ln, f.z);
    return [x - f.cx + f.w / 2, y - f.cy + f.h / 2];
  };
  const drin = ([x, y]: [number, number]) => x >= 0 && y >= 0 && x <= f.w && y <= f.h;
  const s0 = F.n ? P(F.lat[0], F.lng[0]) : null;
  const e0 = F.n > 1 ? P(F.lat[F.n - 1], F.lng[F.n - 1]) : null;
  const start = s0 && drin(s0) ? s0 : null;
  const ende = e0 && drin(e0) ? e0 : null;
  const nah =
    !!s0 && !!e0 && (Math.hypot(s0[0] - e0[0], s0[1] - e0[1]) < NAH_PX || Math.hypot(F.x[F.n - 1] - F.x[0], F.y[F.n - 1] - F.y[0]) < NAH_M);
  const mk = marken.map((m) => ({ m, p: P(m.lat, m.lng) })).filter((x) => drin(x.p));

  // „weich“ = Punkte (Start/Ende/Marken): Schilder meiden sie, Pflicht-Schilder dürfen notfalls darüber. Fremde Punkte
  // zuerst mit Abstand (weit): ein Schild direkt neben einem fremden Punkt läse man als dessen Uhrzeit (echte Fahrt:
  // „Ende 11:34“ 5 px neben der Marke 09:40). Der eigene Punkt zählt nie; Start und Ende am selben Ort = ein Punkt.
  type Punkt = { box: Box; weit: Box; wer: string };
  const pk = (p: [number, number], r: number, rw: number, wer: string): Punkt => ({
    box: [p[0] - r, p[1] - r, p[0] + r, p[1] + r],
    weit: [p[0] - rw, p[1] - rw, p[0] + rw, p[1] + rw],
    wer,
  });
  const punkte: Punkt[] = [];
  if (start) punkte.push(pk(start, 9, 14, nah ? 'se' : 'start'));
  if (ende) punkte.push(pk(ende, 9, 14, nah ? 'se' : 'ende'));
  mk.forEach(({ p }, i) => punkte.push(pk(p, 5, 11, `m${i}`)));
  const weich: Box[] = punkte.map((q) => q.box);
  // „hart“ = Flächen, die nie überdeckt werden dürfen
  const hart: Box[] = [...fest];
  const feld: Box | null = f.buchstabe ? [0, 0, 24, 24] : null;
  if (feld) hart.push(feld);

  const klemme = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const rahmenPlan = rahmen.map((r) => {
    const k = 2 ** (f.z - r.z);
    const w = r.w * k;
    const h = r.h * k;
    const x = r.cx * k - f.cx + f.w / 2 - w / 2;
    const y = r.cy * k - f.cy + f.h / 2 - h / 2;
    const ecken: [number, number][] = [
      [x, y],
      [x + w - FELD, y],
      [x, y + h - FELD],
      [x + w - FELD, y + h - FELD],
    ];
    const felder = ecken.map(([a, b]): Box => {
      const fx = klemme(a, 0, f.w - FELD);
      const fy = klemme(b, 0, f.h - FELD);
      return [fx, fy, fx + FELD, fy + FELD];
    });
    const rand = (b: Box): Box => [b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2];
    const gut = felder.find((b) => !hart.some((o) => ueber(b, o)) && !weich.some((o) => ueber(rand(b), o))) ?? felder.find((b) => !hart.some((o) => ueber(b, o))) ?? felder[0];
    hart.push(gut);
    return { buchstabe: r.buchstabe ?? '', x, y, w, h, feld: gut };
  });

  const schilder: Schild[] = [];
  const ohneSchild: string[] = [];
  /** punkte: 'weit' = fremde Punkte mit Abstand, 'knapp' = nur nicht darauf, 'egal' = Notfall (Pflicht-Schild) */
  const frei = (b: Box, punkteMeiden: 'weit' | 'knapp' | 'egal', eigen: string) =>
    b[0] >= 2 &&
    b[1] >= 2 &&
    b[2] <= f.w - 2 &&
    b[3] <= f.h - 2 &&
    !hart.some((o) => ueber(b, o)) &&
    (punkteMeiden === 'egal' || !punkte.some((q) => ueber(b, punkteMeiden === 'weit' && q.wer !== eigen ? q.weit : q.box)));
  type Lage = 'rechts' | 'links' | 'oben' | 'unten' | 'ro' | 'ru' | 'lo' | 'lu';
  const REIHEN: Record<'rechts' | 'oben' | 'unten', Lage[]> = {
    rechts: ['rechts', 'links', 'oben', 'unten', 'ro', 'ru', 'lo', 'lu'],
    oben: ['oben', 'ro', 'lo', 'rechts', 'links', 'unten', 'ru', 'lu'],
    unten: ['unten', 'ru', 'lu', 'rechts', 'links', 'oben', 'ro', 'lo'],
  };
  const kandidaten = (x: number, y: number, lw: number, a: number, zuerst: 'rechts' | 'oben' | 'unten'): Box[] => {
    const lh = SCHILD_H;
    const d = a * 0.75;
    const k: Record<Lage, Box> = {
      rechts: [x + a, y - lh / 2, x + a + lw, y + lh / 2],
      links: [x - a - lw, y - lh / 2, x - a, y + lh / 2],
      oben: [x - lw / 2, y - a - lh, x + lw / 2, y - a],
      unten: [x - lw / 2, y + a, x + lw / 2, y + a + lh],
      ro: [x + d, y - d - lh, x + d + lw, y - d],
      ru: [x + d, y + d, x + d + lw, y + d + lh],
      lo: [x - d - lw, y - d - lh, x - d, y - d],
      lu: [x - d - lw, y + d, x - d, y + d + lh],
    };
    return REIHEN[zuerst].map((l) => k[l]);
  };
  const setze = (p: [number, number], text: string, farbe: string, art: Schild['art'], a: number, zuerst: 'rechts' | 'oben' | 'unten', pflicht: boolean, eigen: string) => {
    const lw = breite(text) + 8;
    const alle = (pflicht ? [a, a + 12, a + 26, a + 44] : [a, a + 9, a + 19]).flatMap((x) => kandidaten(p[0], p[1], lw, x, zuerst));
    let b =
      alle.find((c) => frei(c, 'weit', eigen)) ??
      alle.find((c) => frei(c, 'knapp', eigen)) ??
      (pflicht ? alle.find((c) => frei(c, 'egal', eigen)) : undefined);
    if (!b && pflicht) {
      // Notfall (sehr enges Bild): ins Bild geschoben — die Start/Ende-Uhrzeit fehlt nie
      const c = alle[0];
      const dx = klemme(c[0], 2, f.w - 2 - lw) - c[0];
      const dy = klemme(c[1], 2, f.h - 2 - SCHILD_H) - c[1];
      b = [c[0] + dx, c[1] + dy, c[2] + dx, c[3] + dy];
    }
    if (!b) {
      ohneSchild.push(text);
      return;
    }
    hart.push(b);
    schilder.push({ text, farbe, box: b, art, p });
  };
  if (start && labels.startLabel) setze(start, labels.startLabel, START_FARBE, 'start', 10, nah ? 'unten' : 'rechts', true, nah ? 'se' : 'start');
  if (ende && labels.endeLabel) setze(ende, labels.endeLabel, ROUTE_COLORS.end, 'ende', 10, nah ? 'oben' : 'rechts', true, nah ? 'se' : 'ende');
  mk.forEach(({ m, p }, i) => setze(p, m.label, ROUTE_COLORS.end, 'marke', 7, 'rechts', false, `m${i}`));

  return { start, ende, nah, marken: mk.map((x) => x.p), rahmen: rahmenPlan, feld, schilder, ohneSchild };
}

// ---------------------------------------------------------------- Zeichnen (Browser)

interface Inhalt {
  F: FahrtDaten;
  stuecke: LatLng[][];
  plan: LatLng[];
  missed: LatLng[][];
  marken: ZeitMarke[];
  startLabel: string | null;
  endeLabel: string | null;
}

function ladeKachel(url: string, bis: number, laufend: Set<HTMLImageElement>): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // sonst ist das Canvas gesperrt und lässt sich nicht als Bild speichern
    img.decoding = 'async';
    laufend.add(img);
    const t = setTimeout(() => fehler(new Error('Zeitlimit')), Math.max(0, bis - Date.now()));
    img.onload = () => {
      clearTimeout(t);
      laufend.delete(img);
      ok(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      laufend.delete(img);
      fehler(new Error('Kachel lädt nicht'));
    };
    img.src = url;
  });
}

/** Alle Kacheln eines Fensters — eine fehlt oder Zeitlimit → Fehler (dann kein halbes Bild). */
async function ladeKacheln(f: Fenster, bis: number): Promise<HTMLImageElement[]> {
  const laufend = new Set<HTMLImageElement>();
  try {
    return await Promise.all(
      f.kacheln.map((k) => ladeKachel(TILE_URL.replace('{z}', String(k.z)).replace('{x}', String(k.x)).replace('{y}', String(k.y)), bis, laufend)),
    );
  } finally {
    for (const img of laufend) img.src = ''; // Rest abbrechen
  }
}

function zeichne(f: Fenster, bilder: HTMLImageElement[], inhalt: Inhalt, rahmen: Fenster[], timeZone?: string, qualitaet = 0.9): KartenBild {
  const canvas = document.createElement('canvas');
  const s = f.skala ?? SKALA;
  canvas.width = f.w * s;
  canvas.height = f.h * s;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.fillStyle = '#e8ecf1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  f.kacheln.forEach((k, i) => ctx.drawImage(bilder[i], Math.round(k.dx), Math.round(k.dy), TILE, TILE));

  // ab hier in Anzeige-Pixeln
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const P = (la: number, ln: number): [number, number] => {
    const [x, y] = weltPx(la, ln, f.z);
    return [x - f.cx + f.w / 2, y - f.cy + f.h / 2];
  };
  const linie = (p: readonly LatLng[]) => {
    ctx.beginPath();
    p.forEach(([la, ln], i) => {
      const [x, y] = P(la, ln);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const c = ROUTE_COLORS;
  // leichter Schleier: Spur und Beschriftungen heben sich besser ab, Straßennamen der Kacheln bleiben lesbar
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, f.w, f.h);
  if (inhalt.plan.length >= 2) {
    linie(inhalt.plan);
    ctx.strokeStyle = c.planMap;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const s of inhalt.stuecke) {
    if (s.length < 2) continue;
    linie(s);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6.5;
    ctx.stroke();
    ctx.strokeStyle = c.track;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }
  for (const s of inhalt.missed) {
    if (s.length < 2) continue;
    linie(s);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = c.missed;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const u of inhalt.F.unterbrechungen) {
    if (!u.ab || !u.an) continue;
    linie([u.ab, u.an]);
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = PAUSE;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Maßstab und Quellenangabe vorab messen: ihre Flächen hält die Beschriftung frei
  const mitte = f.cy;
  const latMitte = (Math.atan(Math.sinh(Math.PI * (1 - (2 * mitte) / (TILE * 2 ** f.z)))) * 180) / Math.PI;
  const mpp = meterProPx(latMitte, f.z);
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].find((n) => n / mpp >= 60) ?? 20000;
  const px = nice / mpp;
  ctx.font = '10px Arial, sans-serif';
  const q = KARTE_QUELLE;
  const qw = ctx.measureText(q).width + 8;
  const fest: Box[] = [
    [0, f.h - 30, px + 26, f.h], // Maßstab
    [f.w - qw - 2, f.h - 17, f.w, f.h], // Quellenangabe
    [f.w - 30, 0, f.w, 40], // Nordpfeil
  ];
  ctx.font = SCHILD_FONT;
  const F = inhalt.F;
  const plan = beschriftungsPlan(f, F, inhalt.marken, inhalt, rahmen, (t) => ctx.measureText(t).width, fest);

  // 1) Ausschnitte in der Übersicht: gestrichelter Rahmen + Buchstabenfeld (Ecke ohne Start/Ende/Marke) — VOR den
  //    Beschriftungen, die Felder sind dort schon als belegt eingetragen (Tagescheck 26.11.2026: „Ende 11“ statt 11:34)
  for (const r of plan.rahmen) {
    ctx.strokeStyle = RAHMEN;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
  }
  for (const r of plan.rahmen) {
    ctx.fillStyle = RAHMEN;
    ctx.fillRect(r.feld[0], r.feld[1], FELD, FELD);
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px Arial, sans-serif';
    ctx.fillText(r.buchstabe, r.feld[0] + 4.5, r.feld[1] + 14);
  }

  // 2) Maßstab, Norden, Quellenangabe, Buchstabe des Ausschnitts
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(6, f.h - 28, px + 16, 22);
  ctx.strokeStyle = '#233648';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, f.h - 10);
  ctx.lineTo(14 + px, f.h - 10);
  ctx.stroke();
  ctx.fillStyle = '#233648';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 14, f.h - 15);
  ctx.font = '700 12px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(f.w - 24, 6, 18, 30);
  ctx.fillStyle = '#233648';
  ctx.fillText('N', f.w - 19, 19);
  ctx.beginPath();
  ctx.moveTo(f.w - 15, 23);
  ctx.lineTo(f.w - 15, 33);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(f.w - qw, f.h - 15, qw, 15);
  ctx.fillStyle = '#233648';
  ctx.fillText(q, f.w - qw + 4, f.h - 4);
  if (plan.feld && f.buchstabe) {
    ctx.fillStyle = RAHMEN;
    ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '700 14px Arial, sans-serif';
    ctx.fillText(f.buchstabe, 6, 16);
  }

  // 3) Punkte: Zeitmarken, Ende, Start — Start zuletzt; liegen Start und Ende am selben Ort (Bauhof), Start kleiner
  //    obendrauf (grün im dunklen Ring), sonst verdeckte der Ende-Punkt den Start (wie FahrtKarte am Bildschirm)
  const punkt = (x: number, y: number, r: number, farbe: string, rand: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = farbe;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = rand;
    ctx.stroke();
  };
  for (const p of plan.marken) punkt(p[0], p[1], 4, c.end, 1.5);
  if (plan.ende) punkt(plan.ende[0], plan.ende[1], 7, c.end, 3);
  if (plan.start) punkt(plan.start[0], plan.start[1], plan.nah ? 4.5 : 7, c.track, plan.nah ? 2 : 3);

  // 4) Beschriftungen zuletzt — nichts liegt mehr darüber. Musste ein Schild weiter ausweichen, zeigt eine dünne
  //    Führungslinie, zu welchem Punkt die Uhrzeit gehört (Ort und Zeit bleiben eindeutig zugeordnet).
  for (const s of plan.schilder) {
    const l = fuehrung(s);
    if (l.abstand <= 9) continue;
    ctx.beginPath();
    ctx.moveTo(s.p[0], s.p[1]);
    ctx.lineTo(l.x, l.y);
    ctx.strokeStyle = 'rgba(12,27,42,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.font = SCHILD_FONT;
  for (const s of plan.schilder) {
    const [x0, y0, x1, y1] = s.box;
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.strokeStyle = 'rgba(12,27,42,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 3);
    else ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = s.farbe;
    ctx.fillText(s.text, x0 + 4, y0 + 12);
  }
  const src = canvas.toDataURL('image/jpeg', qualitaet); // wirft bei gesperrtem Canvas (Kacheln ohne CORS)
  if (!src.startsWith('data:image/')) throw new Error('kein Bild');
  return { src, w: f.w, h: f.h, buchstabe: f.buchstabe, zeiten: f.besuche ? besuchsZeiten(F, f.besuche, timeZone) : undefined, beschriftung: plan };
}

/**
 * Kartenbilder für den Bericht. null = Rückfall auf die Skizze (ohne Netz, Kachel-Fehler, Zeitlimit, Canvas gesperrt).
 * Ausschnitte, die bis zum Zeitlimit nicht fertig sind, fehlen einfach.
 */
export async function kartenBilder(
  F: FahrtDaten,
  inhalt: { plan?: LatLng[] | null; missed?: LatLng[][] | null; marken: ZeitMarke[]; startLabel: string | null; endeLabel: string | null },
  opts: { zeitlimitMs?: number; timeZone?: string } = {},
): Promise<KartenBilder | null> {
  try {
    if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    const bis = Date.now() + (opts.zeitlimitMs ?? 8000);
    const plan = vereinfacheLinie(inhalt.plan, 1);
    const kp = kartenPlan(F, plan);
    if (!kp || kp.uebersicht.kacheln.length > MAX_KACHELN_UEBERSICHT) return null;
    const ausschnitte = kp.ausschnitte.filter((a) => a.kacheln.length <= MAX_KACHELN_AUSSCHNITT);
    const voll: Inhalt = {
      F,
      stuecke: spurStuecke(F, 1), // „volle Genauigkeit“: höchstens 1 m vereinfacht
      plan,
      missed: (inhalt.missed ?? []).map((s) => vereinfacheLinie(s, 1)).filter((s) => s.length >= 2),
      marken: inhalt.marken,
      startLabel: inhalt.startLabel,
      endeLabel: inhalt.endeLabel,
    };
    // alles zugleich laden; die Übersicht ist Pflicht, Ausschnitte nur, wenn sie rechtzeitig vollständig da sind
    const ladeA = ausschnitte.map((a) =>
      ladeKacheln(a, bis).catch((e) => {
        console.warn('Kartenausschnitt ausgelassen:', e);
        return null;
      }),
    );
    const ueBilder = await ladeKacheln(kp.uebersicht, bis);
    const aBilder = await Promise.all(ladeA);
    const da = ausschnitte
      .map((a, i) => ({ a, b: aBilder[i] }))
      .filter((x): x is { a: Fenster; b: HTMLImageElement[] } => !!x.b)
      .map((x, j) => ({ a: { ...x.a, buchstabe: 'ABC'[j] }, b: x.b }));
    const uebersicht = zeichne(kp.uebersicht, ueBilder, voll, da.map((x) => x.a), opts.timeZone);
    const fertig: KartenBild[] = [];
    for (const x of da) {
      try {
        fertig.push(zeichne(x.a, x.b, voll, [], opts.timeZone));
      } catch (e) {
        console.warn('Kartenausschnitt ausgelassen:', e);
      }
    }
    return { uebersicht, ausschnitte: fertig };
  } catch (e) {
    console.warn('Kartenbild nicht möglich — Skizze im Bericht:', e);
    return null;
  }
}

// ---------------------------------------------------------------- Sammel-Nachweis (Fahrtenbuch)

/** Kompaktes Bild je Fahrt im Sammel-Nachweis */
export const SAMMEL_W = 340;
export const SAMMEL_H_MIN = 200;
export const SAMMEL_H_MAX = 240;
/** bis so viele Fahrten in 2-facher Auflösung, bis MAX_SAMMEL_BILDER in einfacher — darüber ohne Kartenbild (Dateigröße) */
export const SAMMEL_SCHARF_BIS = 30;
export const MAX_SAMMEL_BILDER = 100;

/** Gemeinsamer Bildausschnitt für alle Fahrten (Vorlage + alle Spuren): EIN Kachelsatz für den ganzen Bericht. */
export function sammelFenster(fahrten: readonly FahrtDaten[], plan: readonly LatLng[] = []): Fenster | null {
  if (!fahrten.length || fahrten.length > MAX_SAMMEL_BILDER) return null;
  const pts: LatLng[] = [...plan];
  for (const F of fahrten) {
    const schritt = Math.max(1, Math.floor(F.n / 2000));
    for (let i = 0; i < F.n; i += schritt) pts.push([F.lat[i], F.lng[i]]);
    if (F.n) pts.push([F.lat[F.n - 1], F.lng[F.n - 1]]);
  }
  return einpassen(pts, SAMMEL_W, SAMMEL_H_MIN, SAMMEL_H_MAX, fahrten.length <= SAMMEL_SCHARF_BIS ? 2 : 1);
}

/**
 * Kompakte Kartenbilder für den Sammel-Nachweis: alle Fahrten auf DERSELBEN Kachelgrundlage (einmal geladen, höchstens
 * 12 Kacheln für den ganzen Bericht), je Fahrt die eigene Spur mit Start/Ende. Liefert je Fahrt ein Bild oder null;
 * ohne Netz/Kacheln/Zeitlimit lauter null — der Bericht entsteht trotzdem (dann ohne Kartenbilder).
 */
export async function kartenBilderSammel(
  fahrten: readonly { F: FahrtDaten; missed?: LatLng[][] | null }[],
  opts: { plan?: LatLng[] | null; zeitlimitMs?: number; timeZone?: string } = {},
): Promise<(KartenBild | null)[]> {
  const leer = fahrten.map(() => null);
  try {
    if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return leer;
    const plan = vereinfacheLinie(opts.plan, 2);
    const f = sammelFenster(
      fahrten.map((x) => x.F),
      plan,
    );
    if (!f || f.kacheln.length > MAX_KACHELN_AUSSCHNITT) return leer;
    const bilder = await ladeKacheln(f, Date.now() + (opts.zeitlimitMs ?? 8000));
    const qualitaet = f.skala === 2 ? 0.82 : 0.78;
    return fahrten.map(({ F, missed }) => {
      try {
        return zeichne(
          f,
          bilder,
          {
            F,
            stuecke: spurStuecke(F, 1),
            plan,
            missed: (missed ?? []).map((s) => vereinfacheLinie(s, 2)).filter((s) => s.length >= 2),
            marken: [],
            // gleiche Regel wie Einzel-PDF und Fahrt-Detail: Uhrzeit des ersten/letzten GPS-Punkts
            ...startEndeLabels(F, opts.timeZone),
          },
          [],
          opts.timeZone,
          qualitaet,
        );
      } catch (e) {
        console.warn('Kartenbild einer Fahrt ausgelassen:', e);
        return null;
      }
    });
  } catch (e) {
    console.warn('Kartenbilder im Sammel-Nachweis ausgelassen:', e);
    return leer;
  }
}
