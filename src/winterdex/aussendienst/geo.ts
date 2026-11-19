// Geo-Rechnungen für die Strecken-Aufzeichnung im Browser — gleiche Formeln und Konstanten wie die App
// (mobile/src/lib/geo.ts). Die Abdeckung hier ist nur die LIVE-VORSCHAU; maßgeblich ist der Wert, den der
// Server beim Eingang rechnet (wd_route_coverage).

import type { LatLng, Track } from '../routes';

/** Fahrtpunkt: [lat, lng, Sekunden seit Start, Genauigkeit in m] */
export type TrackPoint = [number, number, number, number];

export const CORRIDOR_M = 25;
const SAMPLE_M = 10;
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Abstand zweier Punkte in Metern (Haversine, wie geo_distance_m auf dem Server). */
export function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthM(path: readonly number[][]): number {
  let t = 0;
  for (let i = 1; i < path.length; i++) t += distM(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  return t;
}

/** Fahrtlänge: Summe der Teilstücke — Lücken zählen nicht. */
export function trackLengthM(track: Track): number {
  return track.reduce((s, seg) => s + pathLengthM(seg), 0);
}

/** Alle Fahrtpunkte als eine Linie (für Vorlage/Abdeckung). */
export function flatTrack(track: Track): LatLng[] {
  const out: LatLng[] = [];
  for (const seg of track) for (const p of seg) out.push([p[0], p[1]]);
  return out;
}

export function pointCount(track: Track): number {
  return track.reduce((n, seg) => n + seg.length, 0);
}

/** Vorlage gleichmäßig alle ~10 m abtasten (Endpunkt inklusive) — identisch zum Server. */
function samplePath(plan: readonly LatLng[]): LatLng[] {
  if (plan.length < 2) return [];
  const out: LatLng[] = [];
  for (let i = 1; i < plan.length; i++) {
    const [aLat, aLng] = plan[i - 1];
    const [bLat, bLng] = plan[i];
    const steps = Math.max(1, Math.ceil(distM(aLat, aLng, bLat, bLng) / SAMPLE_M));
    for (let k = 0; k < steps; k++) out.push([aLat + ((bLat - aLat) * k) / steps, aLng + ((bLng - aLng) * k) / steps]);
  }
  out.push(plan[plan.length - 1]);
  return out;
}

export interface Coverage {
  pct: number; // 0–100, eine Nachkommastelle
  missed: LatLng[][]; // nicht befahrene Teilstücke
  missedM: number;
}

/** Abdeckung einer Fahrt gegenüber der Vorlage (Raster ~25 m, damit es auch bei langen Fahrten flüssig bleibt). */
export function coverage(plan: readonly LatLng[], track: Track, corridor = CORRIDOR_M): Coverage | null {
  const samples = samplePath(plan);
  if (samples.length === 0) return null;
  const pts = flatTrack(track);
  const latStep = corridor / 111320;
  const lngStep = corridor / (111320 * Math.cos(rad(samples[0][0])));
  const grid = new Map<string, LatLng[]>();
  for (const p of pts) {
    const key = `${Math.floor(p[0] / latStep)}:${Math.floor(p[1] / lngStep)}`;
    const cell = grid.get(key);
    if (cell) cell.push(p);
    else grid.set(key, [p]);
  }
  const covered = samples.map(([lat, lng]) => {
    const gi = Math.floor(lat / latStep);
    const gj = Math.floor(lng / lngStep);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const cell = grid.get(`${gi + di}:${gj + dj}`);
        if (cell && cell.some((p) => distM(lat, lng, p[0], p[1]) <= corridor)) return true;
      }
    return false;
  });
  const missed: LatLng[][] = [];
  let run: LatLng[] = [];
  let missedM = 0;
  const close = () => {
    if (run.length >= 2) {
      missed.push(run);
      missedM += pathLengthM(run);
    }
    run = [];
  };
  covered.forEach((c, i) => (c ? close() : run.push(samples[i])));
  close();
  const n = covered.filter(Boolean).length;
  return { pct: Math.round((1000 * n) / samples.length) / 10, missed, missedM };
}

/** Douglas-Peucker: Vorlage auf das Wesentliche kürzen (Toleranz in m), Form bleibt erhalten. */
export function simplify(path: readonly LatLng[], toleranceM = 4): LatLng[] {
  if (path.length <= 2) return path.map(([lat, lng]) => [round6(lat), round6(lng)] as LatLng);
  const lat0 = rad(path[0][0]);
  const xy = path.map(([lat, lng]) => [rad(lng) * Math.cos(lat0) * R, rad(lat) * R]);
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0 && bestD > toleranceM) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return path.filter((_, i) => keep[i]).map(([lat, lng]) => [round6(lat), round6(lng)] as LatLng);
}

const MAX_POINTS = 45000; // der Server nimmt höchstens 50.000 Punkte

/** Sehr lange Fahrten ausdünnen: je Teilstück jeden 2. Punkt entfernen (erster/letzter bleiben). */
export function thinTrack(track: Track): Track {
  let t = track;
  while (pointCount(t) > MAX_POINTS) {
    t = t.map((seg) => seg.filter((_, i) => i === 0 || i === seg.length - 1 || i % 2 === 0));
  }
  return t;
}

/** „45 Sek.“ / „12 Min.“ / „1 Std. 5 Min.“ — wie die App. */
export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} Sek.`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} Min.`;
  return `${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}
