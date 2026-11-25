// Beispiel-Fahrten (erfundene Daten, Musterstadt) — NUR Dev-Server (demo.tsx) und Tests. Bildet die Formen nach,
// die in der Datenbank vorkommen: lange freie Fahrt mit Stillstand, Pause (neues Teilstück) und GPS-Loch im selben
// Teilstück, Fahrt mit Vorlage + nicht befahrenem Abschnitt, alte Fahrt ohne Sekunden, nachgemeldet ohne Punkte,
// ein einzelner Punkt, sehr lange Fahrt (40.000 Punkte), kaputte Daten, stornierte Fahrt.
import type { LatLng, Run, Track } from '../routes';
import type { StrassenStand } from '../strassen';

const LAT0 = 47.0705;
const LNG0 = 15.4385;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111195;
const ll = (x: number, y: number): LatLng => [+(LAT0 + y / 111195).toFixed(6), +(LNG0 + x / KX).toFixed(6)];

/** deterministisches Rauschen (±1,5 m), damit die Spur wie echtes GPS aussieht */
function rausch(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648 - 0.5) * 3;
  };
}

type Schritt =
  | { zu: [number, number]; kmh: number }
  | { steh: number }
  | { pause: number; versatz?: [number, number] }
  | { gpsLoch: number; zu: [number, number] };

/**
 * Erfundene Straßennamen (Musterstadt) für die Beispiel-Fahrten — so, wie der Worker sie nach der Fahrt ablegen würde
 * (route_run_strassen.abschnitte). Waagrechte Wege nach ihrer y-, senkrechte nach ihrer x-Koordinate (Meter).
 */
function strasseFuer(x: number, y: number, zx: number, zy: number): { strasse: string; ortsteil: string | null } {
  const waag = Math.abs(zy - y) < Math.abs(zx - x);
  const k = Math.round(waag ? y : x);
  const W: Record<number, string> = { 0: 'Hauptstraße', 400: 'Mühlgasse', 800: 'Schulgasse', 1200: 'Gartenstraße', 1600: 'Lindenallee' };
  const S: Record<number, string> = { 0: 'Kirchweg', 1500: 'Bahnhofstraße', 2400: 'Am Sportplatz', [-900]: 'Am Bach' };
  if (waag) return { strasse: W[k] ?? (k % 120 === 0 && k < 900 ? 'Ringstraße' : k >= 900 ? 'Parkstraße' : 'Weg ohne Namen'), ortsteil: null };
  if (k === -900) return { strasse: 'Am Bach', ortsteil: 'Unterdorf' };
  return { strasse: S[k] ?? (k >= 1500 ? 'Bahnhofstraße' : 'Kirchweg'), ortsteil: null };
}

export interface DemoAbschnitt {
  sek_von: number;
  sek_bis: number;
  strasse: string;
  ort: string;
  ortsteil: string | null;
  m: number;
}

/** Fahrt aus Schritten (Meter-Koordinaten) simulieren: alle 5 s ein Punkt beim Fahren, alle 15 s im Stand. */
function simuliere(startIso: string, start: [number, number], schritte: Schritt[], seed = 7, takt = 5) {
  const r = rausch(seed);
  const startMs = Date.parse(startIso);
  let sek = 0;
  let [x, y] = start;
  const track: Track = [[]];
  const gaps: [string, string][] = [];
  const abschnitte: DemoAbschnitt[] = [];
  const punkt = () => {
    const [la, ln] = ll(x + r(), y + r());
    track[track.length - 1].push([la, ln, sek, 6]);
  };
  punkt();
  for (const s of schritte) {
    if ('kmh' in s) {
      const [zx, zy] = s.zu;
      const len = Math.hypot(zx - x, zy - y);
      const v = s.kmh / 3.6;
      const n = Math.max(1, Math.round(len / (v * takt)));
      const dx = (zx - x) / n;
      const dy = (zy - y) / n;
      const name = strasseFuer(x, y, zx, zy);
      const von = sek;
      for (let i = 0; i < n; i++) {
        x += dx;
        y += dy;
        sek += takt;
        punkt();
      }
      const letzter = abschnitte[abschnitte.length - 1];
      if (letzter && letzter.strasse === name.strasse && letzter.sek_bis === von) {
        letzter.sek_bis = sek;
        letzter.m += Math.round(len);
      } else abschnitte.push({ sek_von: von, sek_bis: sek, ...name, ort: 'Musterstadt', m: Math.round(len) });
    } else if ('steh' in s) {
      for (let k = 0; k < s.steh; k += 15) {
        sek += 15;
        punkt();
      }
      const letzter = abschnitte[abschnitte.length - 1];
      if (letzter) letzter.sek_bis = sek;
    } else if ('pause' in s) {
      const von = new Date(startMs + (sek + 2) * 1000).toISOString();
      sek += s.pause;
      gaps.push([von, new Date(startMs + (sek - 2) * 1000).toISOString()]);
      if (s.versatz) {
        x += s.versatz[0];
        y += s.versatz[1];
      }
      track.push([]);
      punkt();
    } else {
      // GPS-Loch: im selben Teilstück weiter (so schreibt es der Recorder), aber als Unterbrechung vermerkt
      const von = new Date(startMs + (sek + 1) * 1000).toISOString();
      sek += s.gpsLoch;
      gaps.push([von, new Date(startMs + (sek - 1) * 1000).toISOString()]);
      [x, y] = s.zu;
      punkt();
      const letzter = abschnitte[abschnitte.length - 1];
      if (letzter) letzter.sek_bis = sek;
    }
  }
  return { track, gaps, abschnitte, endedAt: new Date(startMs + (sek + 20) * 1000).toISOString() };
}

const ORT_SCHRITTE: Schritt[] = [
  { zu: [1500, 0], kmh: 11 },
  { zu: [1500, 800], kmh: 11 },
  { zu: [0, 800], kmh: 11 },
  { steh: 7 * 60 },
  { zu: [0, 1600], kmh: 11 },
  { zu: [1500, 1600], kmh: 11 },
  { gpsLoch: 75, zu: [1620, 1600] },
  { zu: [2400, 1600], kmh: 11 },
  { pause: 9 * 60, versatz: [30, 0] },
  { zu: [2400, 400], kmh: 11 },
  { zu: [1500, 400], kmh: 12 },
  { zu: [1500, 800], kmh: 12 },
  // zweite Runde auf derselben Straße (hin und zurück) → „Hier auch: …“
  { zu: [0, 800], kmh: 12 },
  { zu: [0, 0], kmh: 12 },
  { steh: 15 * 60 },
  { zu: [-900, 0], kmh: 11 },
  { zu: [-900, 1200], kmh: 11 },
  { zu: [0, 1200], kmh: 11 },
  { zu: [0, 0], kmh: 11 },
];

const BASIS: Omit<Run, 'id' | 'started_at' | 'ended_at' | 'track' | 'gaps'> = {
  route_id: null,
  route_name: null,
  gps_mocked: false,
  action: 'cleared_gritted',
  grit_material: 'Salz',
  grit_amount: null,
  weather: { temp_c: -2.4, snowfall_cm: 1.2, precip_mm: 0.8, wind_kmh: 12, source: 'demo' },
  notes: null,
  performer_name: 'Max Mustermann',
  canceled: false,
  cancel_reason: null,
  canceled_at: null,
  created_at: '2026-11-24T08:30:00.000Z',
  received_at: '2026-11-24T08:30:00.000Z',
  track_length_m: null,
  coverage_pct: null,
  missed_m: null,
  entry_hash: null, // Prüfcode-Prüfung braucht den Server (VerifyProof) — gibt es im Beispiel nicht
  nachgetragen: false,
  planned_path: null,
  missed: null,
  photo_urls: [],
  photo_total: 0,
};

function laenge(track: Track): number {
  let m = 0;
  for (const s of track)
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      m += Math.hypot((b[1] - a[1]) * KX, (b[0] - a[0]) * 111195);
    }
  return Math.round(m);
}

export const DEMO_FAHRTEN: { id: string; titel: string }[] = [
  { id: 'demo-frei', titel: 'Freie Fahrt, ~2 Std., Stillstand, Pause, GPS-Loch, zweimal dieselbe Straße' },
  { id: 'demo-vorlage', titel: 'Fahrt mit Strecken-Vorlage + nicht befahrenem Abschnitt' },
  { id: 'demo-alt', titel: 'Alte Fahrt ohne Sekunden je Punkt' },
  { id: 'demo-leer', titel: 'Nachgemeldet ohne Fahrtpunkte' },
  { id: 'demo-ein-punkt', titel: 'Nur ein Punkt' },
  { id: 'demo-lang', titel: 'Sehr lange Fahrt (8 Std., ~40.000 Punkte)' },
  { id: 'demo-kaputt', titel: 'Kaputte Daten (leere/ungültige Teilstücke, falsche Lücken)' },
  { id: 'demo-storno', titel: 'Stornierte Fahrt' },
  { id: 'demo-sommerzeit', titel: 'Fahrt über die Zeitumstellung (25.10.2026)' },
];

/** Straßenabschnitte je Beispiel-Fahrt (von demoRun befüllt) */
const ABSCHNITTE = new Map<string, DemoAbschnitt[]>();

export function demoRun(id: string): Run | null {
  if (id === 'demo-frei' || id === 'demo-storno') {
    const start = '2026-11-24T05:12:00.000Z'; // 06:12 Uhr in Wien
    const f = simuliere(start, [0, 0], ORT_SCHRITTE);
    ABSCHNITTE.set(id, f.abschnitte);
    const run: Run = { ...BASIS, id, started_at: start, ended_at: f.endedAt, track: f.track, gaps: f.gaps, track_length_m: laenge(f.track) };
    if (id === 'demo-storno') return { ...run, canceled: true, cancel_reason: 'Doppelt erfasst (Beispiel)', canceled_at: '2026-11-24T09:00:00.000Z' };
    return run;
  }
  if (id === 'demo-vorlage') {
    const start = '2026-11-24T05:40:00.000Z';
    const f = simuliere(start, [0, 0], ORT_SCHRITTE.slice(0, 6), 11);
    ABSCHNITTE.set(id, f.abschnitte);
    const plan: LatLng[] = [[0, 0], [1500, 0], [1500, 800], [0, 800], [0, 1600], [1500, 1600], [1500, 2300], [600, 2300]].map(([x, y]) => ll(x, y));
    const missed: LatLng[][] = [[[1500, 1600], [1500, 2300], [600, 2300]].map(([x, y]) => ll(x, y))];
    return {
      ...BASIS,
      id,
      route_id: '00000000-0000-4000-8000-0000000000c1',
      route_name: 'Ortskern Runde',
      started_at: start,
      ended_at: f.endedAt,
      track: f.track,
      gaps: f.gaps,
      planned_path: plan,
      missed,
      coverage_pct: 76.8,
      missed_m: 1600,
      track_length_m: laenge(f.track),
    };
  }
  if (id === 'demo-alt') {
    const f = simuliere('2026-11-20T06:00:00.000Z', [0, 0], ORT_SCHRITTE.slice(0, 5), 3);
    const ohneSek = f.track.map((s) => s.map((p) => [p[0], p[1]]));
    return { ...BASIS, id, started_at: '2026-11-20T06:00:00.000Z', ended_at: f.endedAt, track: ohneSek, gaps: [], track_length_m: laenge(ohneSek) };
  }
  if (id === 'demo-leer')
    return { ...BASIS, id, started_at: '2026-11-23T05:00:00.000Z', ended_at: '2026-11-23T06:10:00.000Z', track: [], gaps: [], nachgetragen: true, track_length_m: 0 };
  if (id === 'demo-ein-punkt') {
    const [la, ln] = ll(200, 300);
    return { ...BASIS, id, started_at: '2026-11-23T07:00:00.000Z', ended_at: '2026-11-23T07:00:40.000Z', track: [[[la, ln, 3, 8]]], gaps: [], track_length_m: 0 };
  }
  if (id === 'demo-lang') {
    // 8 Std. Kreise mit 1 Punkt je Sekunde ≈ 28.800 Punkte + Stillstand → Leistung der Karte/Suche/Vereinfachung
    const schritte: Schritt[] = [];
    for (let k = 0; k < 40; k++) {
      const o = (k % 5) * 120;
      schritte.push({ zu: [1500 + o, o], kmh: 12 }, { zu: [1500 + o, 900 + o], kmh: 12 }, { zu: [o, 900 + o], kmh: 12 }, { zu: [o, o], kmh: 12 });
    }
    const start = '2026-11-22T04:00:00.000Z';
    const f = simuliere(start, [0, 0], schritte, 5, 1);
    ABSCHNITTE.set(id, f.abschnitte.filter((a) => a.sek_von < 8 * 3600).map((a) => ({ ...a, sek_bis: Math.min(a.sek_bis, 8 * 3600) })));
    // auf 8 Std. begrenzen, Server-Grenze 50.000 Punkte
    const t = f.track.map((s) => s.filter((p) => p[2] <= 8 * 3600));
    const n = t.reduce((a, s) => a + s.length, 0);
    return { ...BASIS, id, started_at: start, ended_at: new Date(Date.parse(start) + 8 * 3600 * 1000).toISOString(), track: t, gaps: f.gaps, track_length_m: laenge(t), notes: `${n} Punkte` };
  }
  if (id === 'demo-kaputt') {
    const f = simuliere('2026-11-21T06:00:00.000Z', [0, 0], ORT_SCHRITTE.slice(0, 3), 9);
    ABSCHNITTE.set(id, f.abschnitte);
    const seg = f.track[0];
    const kaputt = [
      [],
      seg.slice(0, 40),
      null,
      [[47.07, 'x', 5], 'quatsch', [NaN, 15.44, 10], [47.0712, 15.4401, null, 5]],
      seg.slice(40),
      [],
    ] as unknown as Track;
    return {
      ...BASIS,
      id,
      started_at: '2026-11-21T06:00:00.000Z',
      ended_at: f.endedAt,
      track: kaputt,
      gaps: [['2026-11-21T06:05:00.000Z', 'kein Datum'], null, ['2026-11-21T06:09:00.000Z', '2026-11-21T06:07:00.000Z']] as unknown as [string, string][],
      track_length_m: laenge(f.track),
    };
  }
  if (id === 'demo-sommerzeit') {
    // 25.10.2026: 03:00 Sommerzeit → 02:00 Normalzeit (Wien). Start 00:20 UTC = 02:20 MESZ, Ende ~01:30 UTC = 02:30 MEZ
    const start = '2026-10-25T00:20:00.000Z';
    const f = simuliere(start, [0, 0], ORT_SCHRITTE.slice(0, 6), 13);
    ABSCHNITTE.set(id, f.abschnitte);
    return { ...BASIS, id, started_at: start, ended_at: f.endedAt, track: f.track, gaps: f.gaps, track_length_m: laenge(f.track) };
  }
  return null;
}

/**
 * Straßenverlauf der Beispiel-Fahrten (route_run_strassen, wie ihn der Worker ablegt): fertig mit Abschnitten,
 * „wird ermittelt“ (Vorlage), ohne GPS (leer), kaputte Einträge (werden gesäubert).
 */
export function demoStrassen(id: string): StrassenStand | null {
  if (!demoRun(id)) return null;
  if (id === 'demo-alt') return { status: 'in_arbeit', abschnitte: [], quelle: null };
  if (id === 'demo-leer' || id === 'demo-ein-punkt') return { status: 'leer', abschnitte: [], quelle: 'osm-nominatim' };
  const ab = ABSCHNITTE.get(id) ?? [];
  if (id === 'demo-kaputt')
    return {
      status: 'fertig',
      quelle: 'osm-nominatim',
      abschnitte: [...ab, { sek_von: 'x', sek_bis: 3 }, null, { sek_von: 50, sek_bis: 10, strasse: 'rückwärts' }, { sek_von: 1, sek_bis: 2, strasse: '' }] as never,
    };
  return { status: 'fertig', abschnitte: ab, quelle: 'osm-nominatim' };
}
