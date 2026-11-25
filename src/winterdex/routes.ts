// Strecken-Nachweis (seit 04.11.2026) — Datenzugriff + Geometrie fürs Dashboard.
// Datenmodell: WinterDex/supabase/strecken.sql. Fahrten (route_run) sind append-only wie
// Einsätze: nie ändern, nur Storno mit Begründung (RPC cancel_route_run).
// Länge, Abdeckung, nicht befahrene Abschnitte und Prüfcode rechnet der SERVER beim Eingang.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtTime } from '../lib/format';
import { signPhotos } from '../lib/photos';
import { fetchAllOf, fetchLatestWindow } from '../lib/completeQueries';
import type { OperationAction, WeatherSnapshot } from './types';
import { columnExists } from './api';

export type LatLng = [number, number];
/** Teilstücke: [[[lat, lng, sekunde, genauigkeit], …], …] */
export type Track = number[][][];

export interface Route {
  id: string;
  org_id: string;
  name: string;
  notes: string | null;
  path?: LatLng[];
  length_m: number | null;
  source: 'recorded' | 'objects';
  property_ids: string[];
  active: boolean;
  created_at: string;
}

export interface RunMeta {
  id: string;
  route_id: string | null;
  route_name: string | null;
  started_at: string;
  ended_at: string;
  gaps: [string, string][];
  gps_mocked: boolean | null;
  action: OperationAction;
  grit_material: string | null;
  grit_amount: string | null;
  weather: WeatherSnapshot | null;
  notes: string | null;
  performer_name: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
  received_at: string | null;
  track_length_m: number | null;
  coverage_pct: number | null;
  missed_m: number | null;
  entry_hash: string | null;
  /** vom Server gesetzt (seit 21.11.2026): keine Fahrtpunkte und Eingang mehr als 15 Min. nach dem Ende */
  nachgetragen?: boolean | null;
}

export interface Run extends RunMeta {
  track: Track;
  planned_path: LatLng[] | null;
  missed: LatLng[][] | null;
  photo_urls: string[];
  /** Zahl der gespeicherten Fotos (vor dem Signieren) */
  photo_total?: number;
}

const ROUTE_LIST_COLS = 'id, org_id, name, notes, length_m, source, property_ids, active, created_at';
// Ohne track/planned_path/missed/photo_urls — die sind groß und nur im Detail nötig.
const RUN_META_COLS =
  'id, route_id, route_name, started_at, ended_at, gaps, gps_mocked, action, grit_material, grit_amount, weather, notes, performer_name, canceled, cancel_reason, canceled_at, created_at, received_at, track_length_m, coverage_pct, missed_m, entry_hash';

/** Datenbank hat die Strecken-Tabellen noch nicht (strecken.sql nicht eingespielt). */
export const ROUTES_MISSING = 'Der Strecken-Nachweis ist für diesen Betrieb noch nicht eingerichtet (Datenbank-Update fehlt).';
export class RoutesMissingError extends Error {
  constructor() {
    super(ROUTES_MISSING);
  }
}
function isMissing(e: { code?: string; message?: string }): boolean {
  return e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(e.message ?? '');
}
function fail(msg: string, error: { code?: string; message: string } | null): never {
  if (error && isMissing(error)) throw new RoutesMissingError();
  throw new Error(`${msg}${error ? `: ${error.message}` : ''}`);
}

export async function fetchRoutes(sb: SupabaseClient): Promise<Route[]> {
  const { data, error } = await fetchAllOf(() => sb.from('route').select(ROUTE_LIST_COLS), [['active', false], ['name']]);
  if (error) fail('Strecken konnten nicht geladen werden', error);
  return (data ?? []) as Route[];
}

export async function fetchRoute(sb: SupabaseClient, id: string): Promise<Route | null> {
  const { data, error } = await sb.from('route').select(`${ROUTE_LIST_COLS}, path`).eq('id', id).maybeSingle();
  if (error) fail('Strecke konnte nicht geladen werden', error);
  return data as Route | null;
}

export interface RunFilter {
  routeId?: string;
  /** nur freie Fahrten (ohne Vorlage) */
  free?: boolean;
  from?: Date;
  /** inklusive, lokale Tagesgrenze */
  to?: Date;
  limit?: number;
  /** true = vollständig (seitenweise, ohne limit) — z. B. für das Strecken-Nachweis-PDF. */
  all?: boolean;
}

/** Standard-Obergrenze der Fahrtenliste (ohne `all`). */
export const RUNS_LIST_LIMIT = 500;

// Kennzeichen „nachgetragen“ (NACHTRAG-PRUEFUNG-2026-11-21.sql) nur mitladen, wenn die Datenbank die Spalte hat.
let runNachtragCol: boolean | null = null;

export async function fetchRuns(sb: SupabaseClient, f: RunFilter = {}): Promise<RunMeta[]> {
  if (runNachtragCol === null) runNachtragCol = await columnExists(sb, 'route_run', 'nachgetragen');
  const cols = runNachtragCol ? `${RUN_META_COLS}, nachgetragen` : RUN_META_COLS;
  const build = () => {
    let q = sb.from('route_run').select(cols);
    if (f.routeId) q = q.eq('route_id', f.routeId);
    // Frei = nie mit Vorlage gefahren. Fahrten einer später gelöschten Strecke haben route_id NULL,
    // behalten aber route_name (ON DELETE SET NULL) — die gehören nicht hierher.
    else if (f.free) q = q.is('route_id', null).is('route_name', null);
    if (f.from) q = q.gte('started_at', f.from.toISOString());
    if (f.to) {
      const end = new Date(f.to);
      end.setHours(23, 59, 59, 999);
      q = q.lte('started_at', end.toISOString());
    }
    return q;
  };
  const { data, error } = f.all
    ? await fetchAllOf(build, [['started_at', false], ['id', false]])
    : await build()
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(f.limit ?? RUNS_LIST_LIMIT);
  if (error) fail('Fahrten konnten nicht geladen werden', error);
  return (data ?? []) as unknown as RunMeta[];
}

/**
 * Fahrten der letzten 7 Tage vollständig + je Strecke ohne Fahrt darin die jüngste ältere
 * (Kennzahlen „heute gefahren“ / „Fahrten 7 Tage“ / „letzte Fahrt“) — wie mit kompletter Historie.
 */
export async function fetchRecentRuns(sb: SupabaseClient, routeIds: string[]): Promise<RunMeta[]> {
  const { data, error } = await fetchLatestWindow<RunMeta>({
    sb,
    table: 'route_run',
    cols: RUN_META_COLS,
    dateCol: 'started_at',
    unitCol: 'route_id',
    units: routeIds,
    windowDays: 8,
    canceled: true,
  });
  if (error) fail('Fahrten konnten nicht geladen werden', error);
  return data;
}

export async function fetchRun(sb: SupabaseClient, id: string): Promise<Run> {
  const { data, error } = await sb.from('route_run').select('*').eq('id', id).maybeSingle();
  if (error) fail('Fahrt konnte nicht geladen werden', error);
  if (!data) throw new Error('Diese Fahrt wurde nicht gefunden.');
  const photo_total = Array.isArray(data.photo_urls) ? data.photo_urls.length : 0;
  const run = (await signPhotos(sb, data)) as Run;
  // Spur/Unterbrechungen einmal säubern (alte/kaputte Zeilen): Karte, Skizze und PDF dürfen nie daran scheitern
  return { ...run, track: cleanTrack(run.track), gaps: cleanGaps(run.gaps), photo_urls: run.photo_urls ?? [], photo_total };
}

export async function cancelRun(sb: SupabaseClient, id: string, reason: string): Promise<void> {
  const { error } = await sb.rpc('cancel_route_run', { p_run: id, p_reason: reason });
  if (error) fail('Storno fehlgeschlagen', error);
}

// ---------------------------------------------------------------- Anzeige-Helfer

export function fmtDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}
export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} Min.`;
  return `${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}
export function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}
/** „16:43–17:19 Uhr“ (fmtTime hängt selbst „Uhr“ an). */
/** Ende an einem anderen Kalendertag (Berliner Zeit) bekommt das Datum dazu: „23:40–00:20 Uhr“ wäre sonst mehrdeutig (wie App). */
export function fmtTimeSpan(a: string, b: string): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' });
  const end = day(a) === day(b) ? fmtTime(b) : `${day(b)}, ${fmtTime(b)}`;
  return `${fmtTime(a).replace(/ Uhr$/, '')}–${end}`;
}
/** Lokales Datum (yyyy-mm-dd) — „heute gefahren" nach Ortszeit, nicht UTC. */
export function localDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function distM(a: number, b: number, c: number, d: number): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Länge eines Pfads [[lat,lng],…] in Metern. */
export function pathLengthM(p: readonly LatLng[]): number {
  let m = 0;
  for (let i = 1; i < p.length; i++) m += distM(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
  return m;
}

// ---------------------------------------------------------------- Kartenskizze
// Abstandstreue lokale Projektion, ohne Kartendienst (kein Fremd-Server, druckt sauber).

export interface SketchMark {
  x: number;
  y: number;
  label: string;
  /** Beschriftung (links oben) — null = kein Platz, nur der Punkt */
  lx: number | null;
  ly: number;
}

export interface Sketch {
  w: number;
  h: number;
  plan: string | null;
  track: string[];
  missed: string[];
  start: [number, number] | null;
  end: [number, number] | null;
  scale: { px: number; label: string; x: number; y: number };
  /** Zeitmarken „09:45“ (seit 25.11.2026) */
  marks: SketchMark[];
}

const okPt = (p: unknown): p is number[] =>
  Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]);
/** Kaputte Teilstücke/Punkte aus der Datenbank weglassen — die Skizze ist der Rückfall und darf nie abstürzen. */
export function cleanTrack(track: unknown): Track {
  if (!Array.isArray(track)) return [];
  return track.filter((s) => Array.isArray(s)).map((s: unknown[]) => s.filter(okPt));
}
/** Nur Unterbrechungen [von_iso, bis_iso] mit lesbaren Zeiten — eine ungültige Zeit ließe die Uhrzeit-Anzeige abstürzen. */
export function cleanGaps(g: unknown): [string, string][] {
  if (!Array.isArray(g)) return [];
  return g.filter(
    (x): x is [string, string] =>
      Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && Number.isFinite(Date.parse(x[0])) && Number.isFinite(Date.parse(x[1])),
  );
}
function cleanLine(p: unknown): LatLng[] {
  return Array.isArray(p) ? p.filter(okPt).map((q) => [q[0], q[1]] as LatLng) : [];
}

/** Breite einer Zeitmarken-Beschriftung (Arial 11 px fett, Ziffern ≈ 6,3 px) */
const markW = (label: string) => label.length * 6.3 + 6;

export function buildSketch(
  planIn: LatLng[] | null | undefined,
  trackIn: Track | null | undefined,
  missedIn: LatLng[][] | null | undefined,
  w = 640,
  h = 360,
  marksIn: readonly { lat: number; lng: number; label: string }[] = [],
): Sketch | null {
  const plan = planIn == null ? planIn : cleanLine(planIn);
  const track = cleanTrack(trackIn);
  const missed = Array.isArray(missedIn) ? missedIn.map(cleanLine) : [];
  const pts: LatLng[] = [...(plan ?? [])];
  for (const seg of track) for (const p of seg) pts.push([p[0], p[1]]);
  if (pts.length < 2) return null;
  let minLat = pts[0][0], maxLat = minLat, minLng = pts[0][1], maxLng = minLng;
  for (const [la, ln] of pts) {
    minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln);
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  // Ränder: unten Platz für den Maßstab, rechts für den Nordpfeil.
  const padL = 28, padR = 44, padT = 24, padB = 48;
  const areaW = w - padL - padR, areaH = h - padT - padB;
  const scale = Math.min(areaW / spanX, areaH / spanY);
  const ox = padL + (areaW - spanX * scale) / 2;
  const oy = padT + (areaH - spanY * scale) / 2;
  const X = (ln: number) => ox + (ln - minLng) * k * scale;
  const Y = (la: number) => oy + (maxLat - la) * scale;
  const thin = <T,>(p: readonly T[], max = 1500) =>
    p.length <= max ? p : p.filter((_, i) => i % Math.ceil(p.length / max) === 0 || i === p.length - 1);
  const line = (p: readonly (readonly number[])[]) => thin(p).map((q) => `${X(q[1]).toFixed(1)},${Y(q[0]).toFixed(1)}`).join(' ');

  const metersPerPx = 111195 / scale; // 1° Breite ≈ 111,2 km; Y-Achse nutzt `scale` direkt
  const target = (w / 4) * metersPerPx;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((n) => n >= target * 0.6) ?? 10000;

  const firstSeg = track.find((s) => s.length);
  const lastSeg = [...track].reverse().find((s) => s.length);
  const first = firstSeg?.[0] ?? plan?.[0];
  const last = lastSeg?.[lastSeg.length - 1] ?? (plan && plan.length >= 2 ? plan[plan.length - 1] : undefined);
  const start: [number, number] | null = first ? [X(first[1]), Y(first[0])] : null;
  const end: [number, number] | null = last ? [X(last[1]), Y(last[0])] : null;

  // Zeitmarken: Beschriftung rechts, sonst links, oben, unten neben den Punkt — wo sie nichts überdeckt
  // (andere Beschriftungen, Start/Ende, Maßstab, Nordpfeil). Kein Platz → nur der Punkt; die Zeit steht in der Tabelle.
  type Box = [number, number, number, number];
  const belegt: Box[] = [
    [s0(start, 0), s0(start, 1), 0, 0],
    [s0(end, 0), s0(end, 1), 0, 0],
  ].map(([x, y]) => [x - 9, y - 9, x + 9, y + 9] as Box);
  belegt.push([0, h - 34, w / 4 + 40, h], [w - 34, 0, w, 52]);
  const frei = (b: Box) =>
    b[0] >= 2 && b[1] >= 2 && b[2] <= w - 2 && b[3] <= h - 2 && !belegt.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const marks: SketchMark[] = [];
  for (const m of marksIn) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
    const x = X(m.lng);
    const y = Y(m.lat);
    const lw = markW(m.label);
    const lh = 15;
    const kandidaten: Box[] = [
      [x + 6, y - lh / 2, x + 6 + lw, y + lh / 2],
      [x - 6 - lw, y - lh / 2, x - 6, y + lh / 2],
      [x - lw / 2, y - 7 - lh, x + lw / 2, y - 7],
      [x - lw / 2, y + 7, x + lw / 2, y + 7 + lh],
    ];
    const b = kandidaten.find(frei);
    belegt.push([x - 4, y - 4, x + 4, y + 4]);
    if (b) belegt.push(b);
    marks.push({ x, y, label: m.label, lx: b ? b[0] : null, ly: b ? b[1] : 0 });
  }
  return {
    w,
    h,
    plan: plan && plan.length >= 2 ? line(plan) : null,
    track: track.filter((s) => s.length >= 2).map(line),
    missed: missed.filter((s) => s.length >= 2).map(line),
    start,
    end,
    scale: { px: nice / metersPerPx, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x: padL, y: h - 14 },
    marks,
  };
}
/** Koordinate eines Punkts oder weit außerhalb (belegt dann nichts) */
function s0(p: [number, number] | null, k: 0 | 1): number {
  return p ? p[k] : -1000;
}

/** Erster bekannter Punkt (für „Auf Karte zeigen"). */
export function firstPoint(plan: LatLng[] | null | undefined, track: Track | null | undefined): LatLng | null {
  const t = cleanTrack(track).find((s) => s.length)?.[0];
  if (t) return [t[0], t[1]];
  const p = cleanLine(plan);
  return p.length ? p[0] : null;
}

/** Breite des weißen Schilds hinter einer Zeitmarke (wie die Platzrechnung in buildSketch) */
export const sketchMarkW = markW;

/**
 * Zeitmarken der Skizze als SVG: Punkt + Beschriftung auf weißem Schild (lesbar über Linien). Bewusst kein
 * Text-Rand (stroke): der würde im PDF jede Ziffer doppelt in den Text legen (Kopieren/Suchen „0066::5500“).
 */
export function sketchMarksSvg(s: Sketch): string {
  return s.marks
    .map(
      (m) =>
        `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="4" fill="${ROUTE_COLORS.end}" stroke="#fff" stroke-width="1.5"/>` +
        (m.lx == null
          ? ''
          : `<rect x="${m.lx.toFixed(1)}" y="${m.ly.toFixed(1)}" width="${markW(m.label).toFixed(1)}" height="15" rx="3" fill="#fff" fill-opacity="0.92" stroke="${ROUTE_COLORS.end}" stroke-opacity="0.35" stroke-width="0.8"/>` +
            `<text x="${(m.lx + 3).toFixed(1)}" y="${(m.ly + 11.5).toFixed(1)}" font-family="Arial" font-size="11" font-weight="700" fill="${ROUTE_COLORS.end}">${m.label.replace(/[<>&"]/g, '')}</text>`),
    )
    .join('');
}

/** planMap: Vorlage auf der echten Karte (Grau ginge zwischen den Straßen unter) */
export const ROUTE_COLORS = { plan: '#94A3B8', planMap: '#475569', track: '#16A34A', missed: '#DC2626', end: '#0C1B2A' };

/** Skizze als SVG-Text (für den Druck/PDF). */
export function sketchSvg(s: Sketch | null): string {
  if (!s) return '<div class="muted">Keine Kartenskizze (keine Positionen aufgezeichnet).</div>';
  const c = ROUTE_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${s.w} ${s.h}" style="border:1.5px solid #AFC1D2;border-radius:8px;background:#F8FAFC">
    ${s.plan ? `<polyline points="${s.plan}" fill="none" stroke="${c.plan}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${s.track.map((p) => `<polyline points="${p}" fill="none" stroke="${c.track}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    ${s.missed.map((p) => `<polyline points="${p}" fill="none" stroke="${c.missed}" stroke-width="5" stroke-dasharray="8 6"/>`).join('')}
    ${s.start ? `<circle cx="${s.start[0].toFixed(1)}" cy="${s.start[1].toFixed(1)}" r="7" fill="${c.track}" stroke="#fff" stroke-width="3"/>` : ''}
    ${s.end ? `<circle cx="${s.end[0].toFixed(1)}" cy="${s.end[1].toFixed(1)}" r="7" fill="${c.end}" stroke="#fff" stroke-width="3"/>` : ''}
    ${sketchMarksSvg(s)}
    <g font-family="Arial" font-size="12" fill="#233648">
      <line x1="${s.scale.x}" y1="${s.scale.y}" x2="${(s.scale.x + s.scale.px).toFixed(1)}" y2="${s.scale.y}" stroke="#233648" stroke-width="3"/>
      <text x="${s.scale.x}" y="${s.scale.y - 6}">${s.scale.label}</text>
      <text x="${s.w - 22}" y="22" font-weight="700">N</text>
      <line x1="${s.w - 18}" y1="28" x2="${s.w - 18}" y2="46" stroke="#233648" stroke-width="2"/>
    </g>
  </svg>`;
}
