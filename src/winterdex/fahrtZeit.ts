// „Wann war er wo?“ — Zeit und Kilometer an jeder Stelle einer Fahrt (seit 25.11.2026, Rückfrage Gemeinde-Kunde:
// „Ich sehe nicht, wo er gefahren ist — und nicht, wann er wo war, nur Anfang und Ende“).
//
// Datenquelle: route_run.track = Teilstücke [[[lat, lng, sek, genauigkeit], …], …], sek = Sekunden seit started_at
// (WinterDex/supabase/strecken.sql; geschrieben von der App RouteRunScreen und vom Browser aussendienst/recorder.ts),
// gaps = [[von_iso, bis_iso], …] Unterbrechungen der Aufzeichnung (Pause, Seite verlassen, kein GPS).
//
// Reine Rechnung ohne DOM/Leaflet — Karte (FahrtKarte), Zeitleiste (FahrtAnsicht) und Nachweis-PDF (routeReport)
// nutzen dieselben Werte. Einmal je Fahrt vorbereiten (fahrtDaten), danach sind alle Abfragen billig:
// Position zu einer Uhrzeit = Binärsuche, nächster Punkt = Raster-Suche. Getestet: tests/fahrt-zeit.test.mjs.

import type { LatLng, Track } from './routes';

/** Meter je Grad Breite (gleiche Näherung wie die Kartenskizze). */
const M_PRO_GRAD = 111195;
/** Rasterzelle der Punktsuche in Metern */
const ZELLE_M = 50;
/** Zeitmarken-Abstände in Minuten — der kleinste, bei dem höchstens MAX_MARKEN Marken entstehen */
const SCHRITTE_MIN = [5, 10, 15, 30, 60, 120, 240];
const MAX_MARKEN = 12;
/** Unter so viel Bewegung zwischen zwei Zeilen der Zeitleiste gilt das Fahrzeug als „kaum bewegt“. */
const STEHT_M = 50;

export interface Unterbrechung {
  /** ms; NaN, wenn die Fahrt keine Punkt-Zeiten hat */
  von: number;
  bis: number;
  /** letzte Position davor / erste danach (null = keine) */
  ab: LatLng | null;
  an: LatLng | null;
  /** gefahrene Meter bis zur Unterbrechung */
  dM: number;
  /** aus einer vermerkten Unterbrechung (route_run.gaps) — nicht nur ein Wechsel des Teilstücks */
  vermerkt: boolean;
}

export interface Stillstand {
  von: number;
  bis: number;
  /** erster/letzter Punkt-Index */
  i: number;
  j: number;
  dM: number;
}

export interface FahrtDaten {
  n: number;
  lat: Float64Array;
  lng: Float64Array;
  /** lokale Meter (abstandstreu um den ersten Punkt) — für Vereinfachung und Suche */
  x: Float64Array;
  y: Float64Array;
  /** Zeitpunkt je Punkt in ms seit 1970 (NaN = unbekannt) */
  t: Float64Array;
  /** gefahrene Meter seit Start — Summe je Teilstück, Lücken zwischen Teilstücken zählen nicht (wie der Server) */
  d: Float64Array;
  /** zusammenhängend aufgezeichnete Stücke [erster, letzter] Punkt-Index (inklusive) — so wird gezeichnet */
  stuecke: [number, number][];
  /** Unterbrechungen der Aufzeichnung, nach Zeit sortiert */
  unterbrechungen: Unterbrechung[];
  /** Stillstand ≥ 5 Min. innerhalb von 30 m, nach Zeit sortiert (nur mit Punkt-Zeiten) */
  stillstaende: Stillstand[];
  /** alle Punkte haben eine Zeit → Zeitmarken, Regler und Zeitleiste möglich */
  mitZeit: boolean;
  /** Beginn/Ende der Fahrt (started_at/ended_at) in ms */
  startMs: number;
  endMs: number;
  /** Projektion */
  lat0: number;
  lng0: number;
  kx: number;
  raster: Map<number, number[]>;
}

export interface ZeitMarke {
  /** ms */
  t: number;
  /** bei zusammengefassten Marken am selben Ort: letzte Uhrzeit (ms) */
  bis?: number;
  lat: number;
  lng: number;
  dM: number;
  label: string;
}

export interface Position {
  lat: number;
  lng: number;
  dM: number;
  /** nächster Punkt-Index */
  i: number;
  /** fahrt = auf der Spur; luecke = in einer Unterbrechung (Position = letzte davor); vorher/nachher = außerhalb der Punkte */
  art: 'fahrt' | 'luecke' | 'vorher' | 'nachher';
  luecke?: Unterbrechung;
}

export interface ZeitZeile {
  t: number;
  bis?: number;
  dM: number;
  art: 'start' | 'erste' | 'fahrt' | 'steht' | 'letzte' | 'luecke' | 'ende';
  text: string;
}

// ---------------------------------------------------------------- Anzeige

const uhrFmt = new Map<string, Intl.DateTimeFormat>();
/**
 * „09:45“ — Nachweise (Fahrt-Detail, Karte, PDF) geben seit 26.11.2026 die Zeitzone des Betriebs mit
 * (nachweisZeit.ts, nie die des Geräts); ohne timeZone Ortszeit des Geräts (übriges Dashboard).
 */
export function fmtUhr(ms: number, timeZone?: string): string {
  const k = timeZone ?? '';
  let f = uhrFmt.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) });
    uhrFmt.set(k, f);
  }
  return f.format(new Date(ms));
}

/**
 * Zeitspanne „05:10–05:14“ — EINE Formatierung für Zeitleiste, Karten-Tooltip, Regler und PDF. Beginn und Ende in
 * derselben Minute: „05:10 (46 s)“ statt „05:10–05:10“ (sah aus wie ein Rechenfehler; Tagescheck 26.11.2026).
 */
export function fmtSpanne(von: number, bis: number, timeZone?: string): string {
  const a = fmtUhr(von, timeZone);
  const b = fmtUhr(bis, timeZone);
  if (a !== b) return `${a}–${b}`;
  const sek = Math.round((bis - von) / 1000);
  return sek > 0 ? `${a} (${sek} s)` : a;
}

/**
 * Start/Ende-Beschriftung an den Kartenpunkten: die Uhrzeit DES PUNKTS (erster/letzter GPS-Punkt) — Ort und Zeit
 * gehören zusammen. Kopf/Kennzahl zeigen Beginn/Ende der Aufzeichnung; liegt dazwischen sichtbar Zeit, erklären das
 * die Zeilen „Erste/Letzte genaue GPS-Position“ der Zeitleiste. EINE Regel für Fahrt-Detail (Karte), Einzel-PDF und
 * Fahrtenbuch (Tagescheck 26.11.2026, Fund 9: vorher Detail = started_at/ended_at, PDF = Punktzeit).
 */
export function startEndeLabels(F: FahrtDaten, timeZone?: string, zeit = true): { startLabel: string | null; endeLabel: string | null } {
  const zeitAn = zeit && F.mitZeit && F.n >= 2;
  return {
    startLabel: F.n ? (zeitAn ? `Start ${fmtUhr(F.t[0], timeZone)}` : 'Start') : null,
    endeLabel: F.n > 1 ? (zeitAn ? `Ende ${fmtUhr(F.t[F.n - 1], timeZone)}` : 'Ende') : null,
  };
}

/** Zwei Zeitpunkte zeigen dieselbe Minute (gilt in jeder Zone mit ganzen Minuten Versatz, also in MEZ/MESZ). */
const gleicheMinute = (a: number, b: number) => Math.floor(a / 60000) === Math.floor(b / 60000);

/** „3,2 km“ — immer eine Nachkommastelle (Zeitleiste, Tooltips). */
export function fmtKm(m: number): string {
  return `${(Math.max(0, m) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

// ---------------------------------------------------------------- Vorbereitung

function haversine(a: number, b: number, c: number, d: number): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const rasterKey = (gx: number, gy: number) => (gx + 65536) * 131072 + (gy + 65536);

/** Punkt [lat, lng, …] mit Zahlen im gültigen Bereich */
function gueltig(p: unknown): p is number[] {
  return (
    Array.isArray(p) &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 90 &&
    Math.abs(p[1]) <= 180
  );
}

function parseMs(iso: unknown): number {
  if (typeof iso !== 'string' || !iso) return NaN;
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : NaN;
}

/**
 * Fahrt einmal vorbereiten (in React per useMemo): Punkte flach in typisierten Feldern, Zeit und gefahrene Meter
 * je Punkt, Zeichen-Stücke (Teilstücke, zusätzlich an vermerkten Unterbrechungen geteilt), Raster für die Suche.
 */
export function fahrtDaten(
  track: Track | null | undefined,
  startedAt: string | null | undefined,
  endedAt?: string | null,
  gaps?: readonly (readonly [string, string])[] | null,
): FahrtDaten {
  // Daten aus der Datenbank nie blind trauen: kaputte Teilstücke/Punkte überspringen statt abzustürzen
  const segs = (Array.isArray(track) ? track : []).filter((s) => Array.isArray(s));
  let n = 0;
  for (const s of segs) for (const p of s) if (gueltig(p)) n++;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const t = new Float64Array(n);
  const d = new Float64Array(n);
  const startMs = parseMs(startedAt);
  const endMs = parseMs(endedAt);
  const segAnfang: boolean[] = new Array(n).fill(false);

  let i = 0;
  let mitZeit = Number.isFinite(startMs) && n > 0;
  for (const s of segs) {
    let erster = true;
    for (const p of s) {
      if (!gueltig(p)) continue;
      lat[i] = p[0];
      lng[i] = p[1];
      const sek = p[2];
      if (Number.isFinite(startMs) && typeof sek === 'number' && Number.isFinite(sek)) t[i] = startMs + sek * 1000;
      else {
        t[i] = NaN;
        mitZeit = false;
      }
      // nie rückwärts (Binärsuche braucht eine steigende Zeit)
      if (i > 0 && t[i] < t[i - 1]) t[i] = t[i - 1];
      segAnfang[i] = erster;
      d[i] = erster || i === 0 ? (i > 0 ? d[i - 1] : 0) : d[i - 1] + haversine(lat[i - 1], lng[i - 1], lat[i], lng[i]);
      erster = false;
      i++;
    }
  }

  const lat0 = n ? lat[0] : 0;
  const lng0 = n ? lng[0] : 0;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const raster = new Map<number, number[]>();
  for (let k = 0; k < n; k++) {
    x[k] = (lng[k] - lng0) * kx * M_PRO_GRAD;
    y[k] = (lat[k] - lat0) * M_PRO_GRAD;
    const key = rasterKey(Math.floor(x[k] / ZELLE_M), Math.floor(y[k] / ZELLE_M));
    const z = raster.get(key);
    if (z) z.push(k);
    else raster.set(key, [k]);
  }

  // vermerkte Unterbrechungen (ms), sortiert; ungültige/verdrehte weglassen
  const luecken = (Array.isArray(gaps) ? gaps : [])
    .filter((g) => Array.isArray(g))
    .map((g) => [parseMs(g[0]), parseMs(g[1])] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((p, q) => p[0] - q[0]);

  // Stücke: neues Teilstück der Aufzeichnung ODER zwei Punkte, zwischen denen eine vermerkte Unterbrechung liegt
  // (z. B. GPS-Loch, nach dem das Gerät im selben Teilstück weiterschrieb) — die wird nicht als gefahren gezeichnet.
  const stuecke: [number, number][] = [];
  let von = 0;
  for (let k = 1; k <= n; k++) {
    let neu = k === n || segAnfang[k];
    if (!neu && mitZeit) {
      const a = t[k - 1];
      const b = t[k];
      for (const [ga, gb] of luecken) {
        if (ga >= b) break;
        const ueber = Math.min(b, gb) - Math.max(a, ga);
        if (ueber > 0 && ueber >= 0.5 * (gb - ga)) {
          neu = true;
          break;
        }
      }
    }
    if (neu) {
      if (k > von) stuecke.push([von, k - 1]);
      von = k;
    }
  }

  // Unterbrechungen: zwischen den Stücken (Zeiten aus der vermerkten Unterbrechung, sonst aus den Punkten)
  // + vermerkte, die zu keinem Stück-Wechsel passen (vor dem ersten / nach dem letzten Punkt)
  const unterbrechungen: Unterbrechung[] = [];
  const benutzt = new Set<number>();
  for (let s = 0; s + 1 < stuecke.length; s++) {
    const e = stuecke[s][1];
    const a = stuecke[s + 1][0];
    let uv = t[e];
    let ub = t[a];
    let vermerkt = false;
    if (mitZeit) {
      // Zeiten der passenden vermerkten Unterbrechung(en): frühester Beginn, spätestes Ende
      let pv = Infinity;
      let pb = -Infinity;
      luecken.forEach(([ga, gb], gi) => {
        if (ga < t[a] && gb > t[e]) {
          benutzt.add(gi);
          pv = Math.min(pv, ga);
          pb = Math.max(pb, gb);
        }
      });
      if (pv < pb) {
        // Auf die Punkte begrenzen: Die App setzt das Ende einer Pause auf den Moment des Fortsetzens, der erste Punkt
        // danach kann aber früher liegen (zwischengespeicherte Position) — sonst stand „Unterbrechung bis 11:53“ und direkt
        // darunter „Stillstand ab 11:52“ (Tagescheck 25.11., echte Fahrt mit 28 s Überlappung). Dieselben Grenzen gelten in
        // Zeitleiste, Regler/Antippen und in der Zeile „Unterbrechungen der Aufzeichnung“ (unterbrechungsSpannen).
        uv = Math.max(pv, t[e]);
        ub = Math.min(pb, t[a]);
        if (!(ub > uv)) {
          uv = t[e];
          ub = t[a];
        }
        vermerkt = true;
      }
    }
    unterbrechungen.push({ von: uv, bis: ub, vermerkt, ab: [lat[e], lng[e]], an: [lat[a], lng[a]], dM: d[e] });
  }
  if (mitZeit) {
    luecken.forEach(([ga, gb], gi) => {
      if (benutzt.has(gi)) return;
      // Position davor (letzter Punkt bis ga) und danach (erster ab gb)
      const vor = letzterBis(t, n, ga);
      const nach = ersterAb(t, n, gb);
      unterbrechungen.push({
        von: ga,
        bis: gb,
        ab: vor >= 0 ? [lat[vor], lng[vor]] : null,
        an: nach >= 0 ? [lat[nach], lng[nach]] : null,
        dM: vor >= 0 ? d[vor] : 0,
        vermerkt: true,
      });
    });
  }
  unterbrechungen.sort((p, q) => (Number.isFinite(p.von) && Number.isFinite(q.von) ? p.von - q.von : 0));

  // Stillstand: mindestens 5 Min. innerhalb von 30 m (Streugut laden, warten) — innerhalb eines Stücks
  const stillstaende: Stillstand[] = [];
  if (mitZeit) {
    for (const [a, b] of stuecke) {
      let i = a;
      while (i < b) {
        let j = i;
        while (j < b) {
          const dx = x[j + 1] - x[i];
          const dy = y[j + 1] - y[i];
          if (dx * dx + dy * dy > STILL_M * STILL_M) break;
          j++;
        }
        if (t[j] - t[i] >= STILL_MS) {
          stillstaende.push({ von: t[i], bis: t[j], i, j, dM: d[i] });
          i = j + 1;
        } else i++;
      }
    }
  }

  return { n, lat, lng, x, y, t, d, stuecke, unterbrechungen, stillstaende, mitZeit, startMs, endMs, lat0, lng0, kx, raster };
}

const STILL_M = 30;
const STILL_MS = 5 * 60000;

/** größter Index mit t[i] ≤ ms (−1 = keiner) */
function letzterBis(t: Float64Array, n: number, ms: number): number {
  let lo = 0;
  let hi = n - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (t[m] <= ms) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r;
}
/** kleinster Index mit t[i] ≥ ms (−1 = keiner) */
function ersterAb(t: Float64Array, n: number, ms: number): number {
  let lo = 0;
  let hi = n - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (t[m] >= ms) {
      r = m;
      hi = m - 1;
    } else lo = m + 1;
  }
  return r;
}

function stueckVon(F: FahrtDaten, i: number): number {
  let lo = 0;
  let hi = F.stuecke.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const [a, b] = F.stuecke[m];
    if (i < a) hi = m - 1;
    else if (i > b) lo = m + 1;
    else return m;
  }
  return -1;
}

// ---------------------------------------------------------------- Uhrzeit → Ort

/** Wo war das Fahrzeug um `ms`? Zwischen zwei Punkten linear eingepasst; in einer Unterbrechung die letzte Position davor. */
export function positionZu(F: FahrtDaten, ms: number): Position | null {
  if (!F.mitZeit || F.n === 0 || !Number.isFinite(ms)) return null;
  const { t, lat, lng, d } = F;
  const u = F.unterbrechungen.find((g) => ms >= g.von && ms <= g.bis);
  if (u) {
    const i = Math.max(0, letzterBis(t, F.n, u.von));
    const p = u.ab ?? u.an ?? [lat[i], lng[i]];
    return { lat: p[0], lng: p[1], dM: u.dM, i, art: 'luecke', luecke: u };
  }
  if (ms < t[0]) return { lat: lat[0], lng: lng[0], dM: 0, i: 0, art: 'vorher' };
  const last = F.n - 1;
  if (ms > t[last]) return { lat: lat[last], lng: lng[last], dM: d[last], i: last, art: 'nachher' };
  const i = letzterBis(t, F.n, ms);
  if (i === last || t[i] === ms) return { lat: lat[i], lng: lng[i], dM: d[i], i, art: 'fahrt' };
  const s = stueckVon(F, i);
  if (s >= 0 && F.stuecke[s][1] === i) {
    // zwischen zwei Stücken ohne vermerkte Unterbrechung (sollte es nicht geben) — wie eine Lücke behandeln
    return { lat: lat[i], lng: lng[i], dM: d[i], i, art: 'luecke' };
  }
  const f = (ms - t[i]) / Math.max(1, t[i + 1] - t[i]);
  return {
    lat: lat[i] + (lat[i + 1] - lat[i]) * f,
    lng: lng[i] + (lng[i + 1] - lng[i]) * f,
    dM: d[i] + (d[i + 1] - d[i]) * f,
    i: f < 0.5 ? i : i + 1,
    art: 'fahrt',
  };
}

// ---------------------------------------------------------------- Ort → Uhrzeit

function projiziere(F: FahrtDaten, la: number, ln: number): [number, number] {
  return [(ln - F.lng0) * F.kx * M_PRO_GRAD, (la - F.lat0) * M_PRO_GRAD];
}

/** Nächster aufgezeichneter Punkt zu einer Stelle, höchstens `maxM` entfernt (−1 = keiner). Raster-Suche in Ringen. */
export function naechsterPunkt(F: FahrtDaten, la: number, ln: number, maxM: number): number {
  if (F.n === 0) return -1;
  const [px, py] = projiziere(F, la, ln);
  const gx = Math.floor(px / ZELLE_M);
  const gy = Math.floor(py / ZELLE_M);
  const ringe = Math.ceil(maxM / ZELLE_M) + 1;
  let best = -1;
  let bestD = maxM * maxM;
  for (let r = 0; r <= ringe; r++) {
    // Alles in diesem Ring ist mindestens (r − 1) Zellen weg — weiter suchen lohnt nicht mehr
    const min = Math.max(0, r - 1) * ZELLE_M;
    if (best >= 0 && min * min > bestD) break;
    for (let ix = gx - r; ix <= gx + r; ix++) {
      for (let iy = gy - r; iy <= gy + r; iy++) {
        if (Math.max(Math.abs(ix - gx), Math.abs(iy - gy)) !== r) continue; // nur der Rand des Rings
        const z = F.raster.get(rasterKey(ix, iy));
        if (!z) continue;
        for (const k of z) {
          const dx = F.x[k] - px;
          const dy = F.y[k] - py;
          const dd = dx * dx + dy * dy;
          if (dd <= bestD) {
            bestD = dd;
            best = k;
          }
        }
      }
    }
  }
  return best;
}

/**
 * Alle Vorbeifahrten an einer Stelle (Winterdienst fährt Straßen oft zweimal: hin und zurück, zweite Runde):
 * Punkte im Umkreis `radiusM`, zusammenhängende Folgen = eine Vorbeifahrt, je Folge der nächste Punkt. Nach Zeit sortiert.
 */
export function vorbeifahrten(F: FahrtDaten, la: number, ln: number, radiusM: number): { i: number; abstandM: number }[] {
  if (F.n === 0) return [];
  const [px, py] = projiziere(F, la, ln);
  const r2 = radiusM * radiusM;
  const x0 = Math.floor((px - radiusM) / ZELLE_M);
  const x1 = Math.floor((px + radiusM) / ZELLE_M);
  const y0 = Math.floor((py - radiusM) / ZELLE_M);
  const y1 = Math.floor((py + radiusM) / ZELLE_M);
  const treffer: [number, number][] = [];
  for (let ix = x0; ix <= x1; ix++)
    for (let iy = y0; iy <= y1; iy++) {
      const z = F.raster.get(rasterKey(ix, iy));
      if (!z) continue;
      for (const k of z) {
        const dx = F.x[k] - px;
        const dy = F.y[k] - py;
        const dd = dx * dx + dy * dy;
        if (dd <= r2) treffer.push([k, dd]);
      }
    }
  treffer.sort((a, b) => a[0] - b[0]);
  const out: { i: number; abstandM: number }[] = [];
  let prev = -2;
  for (const [k, dd] of treffer) {
    // neue Vorbeifahrt: Lücke in der Punktfolge, die mehr als 2 Minuten (bzw. ohne Zeiten: 20 Punkte) dauerte
    const neu = prev < 0 || (F.mitZeit ? F.t[k] - F.t[prev] > 120000 && k - prev > 1 : k - prev > 20);
    if (neu) out.push({ i: k, abstandM: Math.sqrt(dd) });
    else {
      const cur = out[out.length - 1];
      if (Math.sqrt(dd) < cur.abstandM) {
        cur.i = k;
        cur.abstandM = Math.sqrt(dd);
      }
    }
    prev = k;
  }
  return out;
}

// ---------------------------------------------------------------- Zeitmarken + Zeitleiste

/** Abstand der Zeitmarken in Minuten: der kleinste aus 5/10/15/30/60/… mit höchstens 12 Marken. */
export function waehleSchritt(vonMs: number, bisMs: number): number {
  for (const s of SCHRITTE_MIN) {
    const ms = s * 60000;
    const anzahl = Math.floor(bisMs / ms) - Math.ceil(vonMs / ms) + 1;
    if (anzahl <= MAX_MARKEN) return s;
  }
  return SCHRITTE_MIN[SCHRITTE_MIN.length - 1];
}

/** Volle Uhrzeiten (Vielfache des Schritts) zwischen erstem und letztem Punkt — nicht direkt neben Start/Ende. */
function rasterZeiten(F: FahrtDaten, schrittMin: number): number[] {
  const von = F.t[0];
  const bis = F.t[F.n - 1];
  const ms = schrittMin * 60000;
  const out: number[] = [];
  // Vielfache in UTC = volle 5/10/15/30/60 Minuten auch in Mitteleuropa (ganze Stunden Versatz)
  for (let T = Math.ceil(von / ms) * ms; T <= bis; T += ms) {
    if (T - von < 0.25 * ms || bis - T < 0.25 * ms) continue;
    out.push(T);
  }
  return out;
}

/** Stillstand, in den die Uhrzeit fällt */
export function stillstandZu(F: FahrtDaten, ms: number): Stillstand | undefined {
  return F.stillstaende.find((s) => ms >= s.von && ms <= s.bis);
}

/** Höchstens so viele Stillstände bekommen eine eigene Marke (die längsten) — sonst wird die Karte unruhig. */
const MAX_STILL_MARKEN = 6;

/** Stillstände näher beieinander als so viele Meter teilen sich EINE Marke (Bauhof: Beginn, Streugut laden, Ende). */
const STILL_GLEICH_M = 30;
/** Folgt ein Stillstand innerhalb so kurzer Zeit auf den vorigen (GPS-Drift teilte ihn), wird eine Spanne daraus. */
const STILL_ANSCHLUSS_MS = 2 * 60000;
/** Höchstens so viele Spannen auf einem Schild, danach „…“ (alle stehen in der Zeitleiste). */
const MAX_SPANNEN_JE_MARKE = 3;

/**
 * Stillstände am selben Ort (< 30 m zu einem anderen der Gruppe, auch über Zwischenglieder) zu Gruppen zusammenfassen,
 * je Gruppe nach Zeit. Vorher lagen zwei Schilder am Bauhof („09:42–10:30“ und „10:41–11:04“, 5 m auseinander)
 * deckungsgleich übereinander — eine Stillstands-Zeit war in der Karte nicht zu sehen (Tagescheck 25.11.).
 */
function stillGruppen(F: FahrtDaten, still: readonly Stillstand[]): Stillstand[][] {
  const gruppen: Stillstand[][] = [...still].sort((a, b) => a.von - b.von).map((s) => [s]);
  // Lage = Schwerpunkt der Punkte (der erste Punkt liegt oft noch auf der Anfahrt); direkt aneinander anschließende
  // Stillstände (GPS-Drift teilte einen langen Halt) dürfen bis 60 m auseinander liegen
  const mitte = new Map<Stillstand, [number, number]>();
  for (const s of still) {
    let sx = 0, sy = 0;
    for (let k = s.i; k <= s.j; k++) {
      sx += F.x[k];
      sy += F.y[k];
    }
    const n = Math.max(1, s.j - s.i + 1);
    mitte.set(s, [sx / n, sy / n]);
  }
  const nah = (a: Stillstand, b: Stillstand) => {
    const [ax, ay] = mitte.get(a)!;
    const [bx, by] = mitte.get(b)!;
    const d = Math.hypot(ax - bx, ay - by);
    const anschluss = Math.abs(b.von - a.bis) <= STILL_ANSCHLUSS_MS || Math.abs(a.von - b.bis) <= STILL_ANSCHLUSS_MS;
    return d < STILL_GLEICH_M || (anschluss && d < 2 * STILL_GLEICH_M);
  };
  for (let geaendert = true; geaendert; ) {
    geaendert = false;
    for (let p = 0; p < gruppen.length && !geaendert; p++)
      for (let q = p + 1; q < gruppen.length; q++)
        if (gruppen[p].some((a) => gruppen[q].some((b) => nah(a, b)))) {
          gruppen[p] = [...gruppen[p], ...gruppen[q]].sort((a, b) => a.von - b.von);
          gruppen.splice(q, 1);
          geaendert = true;
          break;
        }
  }
  return gruppen.sort((a, b) => a[0].von - b[0].von);
}

/** „09:42–10:30, 10:41–11:04“ — direkt aneinander anschließende Stillstände als eine Spanne („11:52–13:45“). */
function stillLabel(g: readonly Stillstand[], tz?: string): string {
  const spannen: [number, number][] = [];
  for (const s of g) {
    const last = spannen[spannen.length - 1];
    if (last && s.von - last[1] <= STILL_ANSCHLUSS_MS) last[1] = Math.max(last[1], s.bis);
    else spannen.push([s.von, s.bis]);
  }
  const txt = spannen.slice(0, MAX_SPANNEN_JE_MARKE).map(([a, b]) => fmtSpanne(a, b, tz));
  return `${txt.join(', ')}${spannen.length > MAX_SPANNEN_JE_MARKE ? ' …' : ''}`;
}

/**
 * Zeitmarken entlang der Spur („09:45“) — adaptiv alle 5/10/15/30 Min., ~6–12 Stück. Marken in einer Unterbrechung
 * entfallen. Stillstände (≥ 5 Min., die 6 längsten) bekommen immer eine Marke mit ihrer Dauer („07:33–07:48“),
 * Rastermarken darin bzw. direkt daneben entfallen; mehrere Rastermarken am selben Ort (< 30 m) werden zusammengefasst.
 */
export function zeitMarken(F: FahrtDaten, opts: { schrittMin?: number; timeZone?: string } = {}): ZeitMarke[] {
  if (!F.mitZeit || F.n < 2) return [];
  const schritt = opts.schrittMin ?? waehleSchritt(F.t[0], F.t[F.n - 1]);
  const tz = opts.timeZone;
  const still = [...F.stillstaende].sort((a, b) => b.bis - b.von - (a.bis - a.von)).slice(0, MAX_STILL_MARKEN);
  const stillMarken = stillGruppen(F, still).map((g): ZeitMarke => ({
    t: g[0].von,
    bis: g[g.length - 1].bis,
    lat: F.lat[g[0].i],
    lng: F.lng[g[0].i],
    dM: g[0].dM,
    label: stillLabel(g, tz),
  }));
  const out: ZeitMarke[] = [];
  for (const T of rasterZeiten(F, schritt)) {
    const p = positionZu(F, T);
    if (!p || p.art !== 'fahrt') continue;
    const st = stillstandZu(F, T);
    if (st && still.includes(st)) continue; // steht schon als „von–bis“ da
    // direkt neben einer Stillstand-Marke (gleicher Ort, kurz davor/danach) → nicht doppelt beschriften
    if (stillMarken.some((s) => haversine(s.lat, s.lng, p.lat, p.lng) < 80 && T >= s.t - schritt * 60000 && T <= (s.bis ?? s.t) + schritt * 60000))
      continue;
    const prev = out[out.length - 1];
    if (prev && haversine(prev.lat, prev.lng, p.lat, p.lng) < 30) {
      prev.bis = Math.max(prev.bis ?? prev.t, T);
      prev.label = fmtSpanne(prev.t, prev.bis, tz);
      continue;
    }
    out.push({ t: T, lat: p.lat, lng: p.lng, dM: p.dM, label: fmtUhr(T, tz) });
  }
  return [...out, ...stillMarken].sort((a, b) => a.t - b.t);
}

/**
 * Zeitleiste als Tabelle: Start, je Schritt eine Zeile (km seit Start, „+1,2 km gefahren“ bzw. „kaum bewegt“),
 * Unterbrechungen mit Von–Bis, Ende. Uhrzeiten wie die Marken.
 * Start/Ende = Beginn/Ende der Aufzeichnung (wie Kopf und Kennzahl). An der Karte stehen dagegen die Uhrzeiten des
 * ersten/letzten GPS-Punkts (Ort und Zeit gehören zusammen) — weichen sie sichtbar ab (andere Minute oder > 60 s),
 * erklären die Zeilen „Erste/Letzte genaue GPS-Position“ den Unterschied (Tagescheck 26.11.2026, Fund 9).
 */
export function zeitleiste(F: FahrtDaten, opts: { schrittMin?: number } = {}): ZeitZeile[] {
  if (!F.mitZeit || F.n === 0) return [];
  const schritt = opts.schrittMin ?? waehleSchritt(F.t[0], F.t[F.n - 1]);
  const gesamt = F.d[F.n - 1];
  const t0 = F.t[0];
  const tN = F.t[F.n - 1];
  const start = Number.isFinite(F.startMs) ? Math.min(F.startMs, t0) : t0;
  const ende = Number.isFinite(F.endMs) ? Math.max(F.endMs, tN) : tN;
  const zeilen: ZeitZeile[] = [{ t: start, dM: 0, art: 'start', text: 'Start' }];
  if (t0 - start > 60000 || (t0 > start && !gleicheMinute(t0, start)))
    zeilen.push({ t: t0, dM: 0, art: 'erste', text: 'Erste genaue GPS-Position' });
  // Ende der Aufzeichnung nach dem letzten Punkt — außer eine vermerkte Unterbrechung erklärt den Rest schon ganz
  const restErklaert = F.unterbrechungen.some((u) => u.von >= tN - 1000 && u.bis >= ende - 60000);
  if (!restErklaert && (ende - tN > 60000 || (ende > tN && !gleicheMinute(ende, tN))))
    zeilen.push({ t: tN, dM: gesamt, art: 'letzte', text: 'Letzte genaue GPS-Position' });
  for (const T of rasterZeiten(F, schritt)) {
    const p = positionZu(F, T);
    if (!p || p.art !== 'fahrt') continue; // in einer Unterbrechung: steht in deren Zeile
    if (stillstandZu(F, T)) continue; // im Stillstand: steht in dessen Zeile
    zeilen.push({ t: T, dM: p.dM, art: 'fahrt', text: '' });
  }
  for (const s of F.stillstaende) {
    zeilen.push({ t: s.von, bis: s.bis, dM: s.dM, art: 'steht', text: 'Stillstand (unter 30 m bewegt)' });
  }
  for (const u of F.unterbrechungen) {
    if (!Number.isFinite(u.von) || !Number.isFinite(u.bis)) continue;
    zeilen.push({
      t: u.von,
      bis: u.bis,
      dM: u.dM,
      art: 'luecke',
      text: 'Unterbrechung (Pause oder kein GPS) – nicht als gefahren gewertet',
    });
  }
  zeilen.push({ t: ende, dM: gesamt, art: 'ende', text: 'Ende' });
  zeilen.sort((a, b) => a.t - b.t || rang(a.art) - rang(b.art));
  let vorher = 0;
  for (const z of zeilen) {
    if (z.art === 'fahrt') {
      const plus = z.dM - vorher;
      if (plus < STEHT_M) {
        z.art = 'steht';
        z.text = 'kaum bewegt (unter 50 m)';
      } else z.text = `+${fmtKm(plus)} gefahren`;
    }
    vorher = z.dM;
  }
  return zeilen;
}
const rang = (a: ZeitZeile['art']) => ['start', 'erste', 'fahrt', 'steht', 'letzte', 'luecke', 'ende'].indexOf(a);

/**
 * Vermerkte Unterbrechungen mit denselben (auf die Punkte begrenzten) Grenzen wie die Zeitleiste — für die Zeile
 * „Unterbrechungen der Aufzeichnung“ (App und PDF). null = ohne Punkt-Zeiten (dann die rohen gaps nehmen).
 */
export function unterbrechungsSpannen(F: FahrtDaten | null | undefined): [string, string][] | null {
  if (!F || !F.mitZeit) return null;
  return F.unterbrechungen
    .filter((u) => u.vermerkt && Number.isFinite(u.von) && Number.isFinite(u.bis) && u.bis > u.von)
    .map((u) => [new Date(u.von).toISOString(), new Date(u.bis).toISOString()] as [string, string]);
}

// ---------------------------------------------------------------- Vereinfachen fürs Zeichnen

/** Douglas-Peucker (ohne Rekursion) auf Metern: behaltene Indizes [a..b] einer Punktfolge. */
function dp(x: ArrayLike<number>, y: ArrayLike<number>, a: number, b: number, tolM: number): number[] {
  if (b - a < 2) return b > a ? [a, b] : [a];
  const keep = new Uint8Array(b - a + 1);
  keep[0] = 1;
  keep[b - a] = 1;
  const stapel: [number, number][] = [[a, b]];
  const tol2 = tolM * tolM;
  while (stapel.length) {
    const [s, e] = stapel.pop()!;
    const dx = x[e] - x[s];
    const dy = y[e] - y[s];
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let maxI = -1;
    for (let k = s + 1; k < e; k++) {
      let dd: number;
      if (len2 === 0) {
        const ex = x[k] - x[s];
        const ey = y[k] - y[s];
        dd = ex * ex + ey * ey;
      } else {
        const u = Math.max(0, Math.min(1, ((x[k] - x[s]) * dx + (y[k] - y[s]) * dy) / len2));
        const ex = x[s] + u * dx - x[k];
        const ey = y[s] + u * dy - y[k];
        dd = ex * ex + ey * ey;
      }
      if (dd > maxD) {
        maxD = dd;
        maxI = k;
      }
    }
    if (maxD > tol2 && maxI > 0) {
      keep[maxI - a] = 1;
      stapel.push([s, maxI], [maxI, e]);
    }
  }
  const out: number[] = [];
  for (let k = 0; k < keep.length; k++) if (keep[k]) out.push(a + k);
  return out;
}

/** Zeichen-Stücke der Spur, vereinfacht (Standard 2 m — auf der Karte nicht zu sehen, spart bei langen Fahrten >90 %). */
export function spurStuecke(F: FahrtDaten, tolM = 2): LatLng[][] {
  return F.stuecke.map(([a, b]) => dp(F.x, F.y, a, b, tolM).map((k) => [F.lat[k], F.lng[k]] as LatLng));
}

/** Beliebige Linie [[lat,lng],…] vereinfachen (Strecken-Vorlage, nicht befahrene Abschnitte). */
export function vereinfacheLinie(roh: readonly LatLng[] | null | undefined, tolM = 2): LatLng[] {
  const p = (Array.isArray(roh) ? roh : []).filter(gueltig) as LatLng[];
  if (p.length < 3) return p.map((q) => [q[0], q[1]] as LatLng);
  const kx = Math.cos((p[0][0] * Math.PI) / 180);
  const x = p.map((q) => (q[1] - p[0][1]) * kx * M_PRO_GRAD);
  const y = p.map((q) => (q[0] - p[0][0]) * M_PRO_GRAD);
  return dp(x, y, 0, p.length - 1, tolM).map((k) => [p[k][0], p[k][1]] as LatLng);
}

// ---------------------------------------------------------------- Texte für Karte und Regler

export interface Info {
  titel: string;
  zusatz?: string;
}

/** Uhrzeiten weiterer Vorbeifahrten an einer Stelle (Umkreis 25 m), ohne die Vorbeifahrt um `ausserMs`. */
export function auchHier(F: FahrtDaten, la: number, ln: number, ausserMs: number, radiusM = 25): number[] {
  if (!F.mitZeit) return [];
  return vorbeifahrten(F, la, ln, radiusM)
    .map((v) => F.t[v.i])
    .filter((t) => Math.abs(t - ausserMs) > 120000);
}

function auchText(andere: number[], timeZone?: string): string | undefined {
  if (!andere.length) return undefined;
  return `Hier auch: ${andere
    .slice(0, 4)
    .map((t) => fmtUhr(t, timeZone))
    .join(', ')} Uhr${andere.length > 4 ? ' …' : ''}`;
}

/** Text für einen Punkt der Spur (Maus/Antippen): „09:47 Uhr · 3,2 km seit Start“ + weitere Vorbeifahrten. */
export function infoZuPunkt(F: FahrtDaten, i: number, mitZeit = F.mitZeit, timeZone?: string): Info {
  const km = `${fmtKm(F.d[i])} seit Start`;
  if (!mitZeit || !F.mitZeit) return { titel: km };
  const st = F.stillstaende.find((x) => i >= x.i && i <= x.j);
  if (st)
    return {
      titel: `${fmtSpanne(st.von, st.bis, timeZone)} Uhr · Stillstand · ${km}`,
      zusatz: auchText(auchHier(F, F.lat[i], F.lng[i], F.t[i]).filter((t) => t < st.von - 120000 || t > st.bis + 120000), timeZone),
    };
  return { titel: `${fmtUhr(F.t[i], timeZone)} Uhr · ${km}`, zusatz: auchText(auchHier(F, F.lat[i], F.lng[i], F.t[i]), timeZone) };
}

/** Text + Ort zu einer Uhrzeit (Zeit-Regler, Zeile der Zeitleiste). */
export function infoZuZeit(F: FahrtDaten, ms: number, timeZone?: string): (Info & { lat: number; lng: number }) | null {
  const p = positionZu(F, ms);
  if (!p) return null;
  const uhr = `${fmtUhr(ms, timeZone)} Uhr`;
  const ort = { lat: p.lat, lng: p.lng };
  if (p.art === 'fahrt') {
    const st = stillstandZu(F, ms);
    const auch = auchText(
      auchHier(F, p.lat, p.lng, ms).filter((t) => !st || t < st.von - 120000 || t > st.bis + 120000),
      timeZone,
    );
    const still = st ? `Stillstand ${fmtSpanne(st.von, st.bis, timeZone)} Uhr` : '';
    return { ...ort, titel: `${uhr} · ${fmtKm(p.dM)} seit Start`, zusatz: [still, auch].filter(Boolean).join(' · ') || undefined };
  }
  if (p.art === 'luecke') {
    const u = p.luecke;
    const span = u && Number.isFinite(u.von) && Number.isFinite(u.bis) ? `${fmtSpanne(u.von, u.bis, timeZone)} Uhr: ` : '';
    return { ...ort, titel: `${uhr} · Unterbrechung`, zusatz: `${span}Pause oder kein GPS — nicht als gefahren gewertet` };
  }
  if (p.art === 'vorher') return { ...ort, titel: `${uhr} · noch keine genaue GPS-Position` };
  return { ...ort, titel: `${uhr} · Aufzeichnung beendet`, zusatz: `${fmtKm(p.dM)} gefahren` };
}
