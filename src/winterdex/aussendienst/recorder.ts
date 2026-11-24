// Strecken-Aufzeichnung im Browser — gleiche Punkt-Regeln wie die App (mobile/src/screens/RouteRunScreen.tsx):
// nur Punkte bis ±35 m, neuer Punkt ab 3 m Bewegung oder alle 15 s (Stillstand), GPS-Sprünge (> 200 km/h
// oder > 150 m) werden erst übernommen, wenn der nächste Punkt sie bestätigt.
//
// WICHTIGER UNTERSCHIED ZUR APP: Ein Browser darf im Hintergrund nicht orten. Aufgezeichnet wird nur,
// solange diese Seite sichtbar ist. Darum hält die Seite den Bildschirm wach (Wake Lock); wird sie trotzdem
// verlassen oder das Handy gesperrt, wird das wie in der App ehrlich als Pause im Nachweis vermerkt.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../routes';
import { distM, round6, type TrackPoint } from './geo';

const MAX_ACC_M = 35; // ungenauere Punkte werden nicht aufgezeichnet
const MIN_STEP_M = 3; // neuer Punkt ab 3 m Bewegung …
const MAX_IDLE_S = 15; // … oder spätestens alle 15 s (Stillstand dokumentieren)
const MAX_SPEED_MS = 55; // > 200 km/h = GPS-Sprung
const MAX_JUMP_M = 150;
// Kurzer Signal-Abriss wird überbrückt — wie in der App (RouteRunScreen): höchstens 45 s und 400 m, mit Zwischenpunkten
const JOIN_MAX_S = 45;
const JOIN_MAX_M = 400;
const JOIN_STEP_M = 15;
const GAP_MIN_MS = 10000; // kürzere Unterbrechungen nicht als Pause vermerken
// So lange keine brauchbare Position (≤ ±35 m) WÄHREND der Aufzeichnung → im Nachweis als Unterbrechung vermerken
// (wie die App seit 20./21.11.2026, RouteRunScreen GPS_HOLE_MS)
export const GPS_HOLE_MS = 45000;
const STALE_FIX_MS = 15000;
const REWATCH_MS = 20000; // so lange ohne Position → Ortung neu anmelden

export type GpsLive =
  | { state: 'wait' }
  | { state: 'ok' | 'weak'; acc: number }
  | { state: 'lost'; since: number }
  | { state: 'denied' }
  | { state: 'unsupported' };

export interface RecorderData {
  startedAt: string;
  track: Track;
  gaps: [string, string][];
  lengthM: number;
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * GPS-Loch von `from` bis `to` (ms) als Unterbrechung eintragen — wie die App: nur über 45 s und nur, wenn die Zeit
 * nicht schon als Pause (Seite verlassen/gesperrt) vermerkt ist. Gibt true zurück, wenn eingetragen wurde.
 */
export function addGpsHole(gaps: [string, string][], from: number, to: number): boolean {
  if (to - from <= GPS_HOLE_MS) return false;
  const von = new Date(from).toISOString();
  const bis = new Date(to).toISOString();
  if (gaps.some(([a, b]) => a < bis && b > von)) return false;
  gaps.push([von, bis]);
  return true;
}

export function useRecorder(onFirstGoodFix: (lat: number, lng: number) => void) {
  const [recording, setRecording] = useState(false);
  const [gps, setGps] = useState<GpsLive>({ state: 'wait' });
  const [awake, setAwake] = useState<boolean | null>(null);
  const [, setTick] = useState(0);
  const recordingRef = useRef(false);
  const dataRef = useRef<RecorderData>({ startedAt: '', track: [[]], gaps: [], lengthM: 0 });
  const lastRef = useRef<TrackPoint | null>(null);
  const jumpRef = useRef<TrackPoint | null>(null);
  const lastFixAtRef = useRef(0);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const pausedAtRef = useRef<string | null>(null);
  // Zeit (Messzeitpunkt) der letzten brauchbaren Position während der Aufzeichnung — für das GPS-Loch
  const lastHeardRef = useRef<number | null>(null);
  const weatherAskedRef = useRef(false);
  const wakeRef = useRef<WakeLockSentinelLike | null>(null);
  const onFirstRef = useRef(onFirstGoodFix);
  onFirstRef.current = onFirstGoodFix;

  const recordFix = useCallback((lat: number, lng: number, acc: number, ts: number) => {
    if (!recordingRef.current || pausedAtRef.current) return;
    if (acc > MAX_ACC_M) return;
    const d0 = dataRef.current;
    // GPS-Loch bei LAUFENDER Aufzeichnung (Halle, Tiefgarage, „Genauer Standort“ aus): sonst wirkte die Fahrt im
    // Nachweis lückenlos — ein Fahrer, der 3 Minuten in einer Halle steht und < 150 m weiter wieder auftaucht, wurde
    // einfach gerade verbunden. Jetzt wie in der App als Unterbrechung vermerkt, außer sie ist schon als Pause erfasst.
    const heard = lastHeardRef.current;
    if (heard != null && addGpsHole(d0.gaps, heard, ts)) setTick((n) => n + 1);
    if (heard == null || ts > heard) lastHeardRef.current = ts;
    const t = Math.round((ts - Date.parse(d0.startedAt)) / 1000);
    const p: TrackPoint = [round6(lat), round6(lng), t, Math.round(acc)];
    const last = lastRef.current;
    if (last && t <= last[2]) return; // nie rückwärts / gleiche Sekunde
    let seg = d0.track[d0.track.length - 1];
    if (!seg) {
      seg = [];
      d0.track.push(seg);
    }
    // Erster Punkt eines Teilstücks (Start oder nach einer Pause): ohne Verbindung zum vorherigen
    if (!last || seg.length === 0) {
      seg.push(p);
      lastRef.current = p;
      jumpRef.current = null;
      return;
    }
    const d = distM(last[0], last[1], p[0], p[1]);
    const dt = Math.max(1, t - last[2]);
    if (d / dt > MAX_SPEED_MS || d > MAX_JUMP_M) {
      // GPS-Sprung: merken; erst wenn der nächste Punkt dazu passt, gilt die neue Position
      const j = jumpRef.current;
      if (j) {
        const jd = distM(j[0], j[1], p[0], p[1]);
        const jdt = Math.max(1, t - j[2]);
        if (jd / jdt <= MAX_SPEED_MS && jd <= MAX_JUMP_M) {
          const jl = distM(last[0], last[1], j[0], j[1]);
          const ljdt = Math.max(1, j[2] - last[2]);
          if (seg.length >= 2 && jl / ljdt <= MAX_SPEED_MS && ljdt <= JOIN_MAX_S && jl <= JOIN_MAX_M) {
            // Zwischenpunkte einfügen (20.11.2026): die Abdeckung rechnet nur mit Punkten — ohne sie zählte das Stück zur
            // Länge, stand im Nachweis aber als „nicht befahren“. Höchstens ein Punkt je Sekunde.
            const n = Math.max(0, Math.min(Math.floor(jl / JOIN_STEP_M) - 1, ljdt - 1));
            for (let k = 1; k <= n; k++) {
              const q = k / (n + 1);
              seg.push([round6(last[0] + (j[0] - last[0]) * q), round6(last[1] + (j[1] - last[1]) * q), last[2] + Math.max(1, Math.round(ljdt * q)), MAX_ACC_M]);
            }
            seg.push(j, p); // plausibel verbunden (kurzer Empfangsausfall) → Strecke zählt
            d0.lengthM += jl + jd;
          } else {
            if (seg.length <= 1) d0.track.pop();
            d0.track.push([j, p]); // neues Teilstück, die Lücke zählt nicht als gefahren
            d0.lengthM += jd;
          }
          lastRef.current = p;
          jumpRef.current = null;
          return;
        }
      }
      jumpRef.current = p;
      return;
    }
    jumpRef.current = null;
    if (d < Math.max(MIN_STEP_M, acc / 2)) {
      if (t - last[2] < MAX_IDLE_S) return;
      const still: TrackPoint = [last[0], last[1], t, Math.round(acc)]; // Stillstand: gleiche Stelle, 0 m
      seg.push(still);
      lastRef.current = still;
      return;
    }
    seg.push(p);
    d0.lengthM += d;
    lastRef.current = p;
  }, []);

  // Ortung läuft, solange die Seite offen ist (auch vor „Start“ — dann ist beim Losfahren schon Empfang da).
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGps({ state: 'unsupported' });
      return;
    }
    let id = 0;
    let watchedAt = 0;
    const watch = () => {
      if (id) navigator.geolocation.clearWatch(id);
      watchedAt = Date.now();
      id = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 999;
        const raw = Number(pos.timestamp);
        const ts = Number.isFinite(raw) && Math.abs(raw - Date.now()) < 5 * 60 * 1000 ? raw : Date.now();
        lastFixAtRef.current = Date.now();
        lastPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps({ state: acc <= MAX_ACC_M ? 'ok' : 'weak', acc: Math.round(acc) });
        if (!weatherAskedRef.current && acc <= 100) {
          weatherAskedRef.current = true;
          onFirstRef.current(pos.coords.latitude, pos.coords.longitude);
        }
        recordFix(pos.coords.latitude, pos.coords.longitude, acc, ts);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGps({ state: 'denied' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
      );
    };
    watch();
    const timer = setInterval(() => {
      setTick((n) => n + 1); // Uhr/Strecke in der Anzeige weiterzählen
      const at = lastFixAtRef.current;
      if (at && Date.now() - at > STALE_FIX_MS) setGps({ state: 'lost', since: at });
      // Verstummt (z. B. nach dem Entsperren am iPhone): Ortung neu anmelden, solange die Seite sichtbar ist
      if (document.visibilityState === 'visible' && Date.now() - Math.max(at, watchedAt) > REWATCH_MS) watch();
    }, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') watch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [recordFix]);

  // Bildschirm wach halten, solange aufgezeichnet wird (sonst sperrt das Handy und die Aufzeichnung pausiert).
  const keepAwake = useCallback(async () => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl) return setAwake(false);
    try {
      wakeRef.current = await wl.request('screen');
      setAwake(true);
    } catch {
      setAwake(false);
    }
  }, []);
  const letSleep = useCallback(() => {
    void wakeRef.current?.release().catch(() => undefined);
    wakeRef.current = null;
  }, []);

  // Seite verlassen / Handy gesperrt = Pause (wird im Nachweis vermerkt, wenn sie länger als 10 s dauert).
  useEffect(() => {
    const onVis = () => {
      if (!recordingRef.current) return;
      if (document.visibilityState === 'hidden') {
        if (!pausedAtRef.current) pausedAtRef.current = new Date().toISOString();
      } else if (pausedAtRef.current) {
        const from = pausedAtRef.current;
        pausedAtRef.current = null;
        const d0 = dataRef.current;
        if (Date.now() - Date.parse(from) >= GAP_MIN_MS) d0.gaps.push([from, new Date().toISOString()]);
        if (d0.track[d0.track.length - 1]?.length) d0.track.push([]);
        jumpRef.current = null;
        void keepAwake(); // der Browser gibt die Wachhalte-Sperre beim Verlassen frei
        setTick((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [keepAwake]);
  useEffect(() => letSleep, [letSleep]);

  /** Neue Aufzeichnung beginnen. */
  const start = useCallback(() => {
    dataRef.current = { startedAt: new Date().toISOString(), track: [[]], gaps: [], lengthM: 0 };
    lastRef.current = null;
    jumpRef.current = null;
    pausedAtRef.current = null;
    lastHeardRef.current = null;
    recordingRef.current = true;
    setRecording(true);
    void keepAwake();
  }, [keepAwake]);

  /** Unterbrochene Aufzeichnung fortsetzen: neues Teilstück, die Unterbrechung wird als Pause vermerkt. */
  const resume = useCallback(
    (saved: RecorderData, savedAt: string) => {
      const track = saved.track.map((s) => s.slice());
      const gaps = saved.gaps.slice();
      if (Date.now() - Date.parse(savedAt) >= GAP_MIN_MS) gaps.push([savedAt, new Date().toISOString()]);
      if (track[track.length - 1]?.length) track.push([]);
      dataRef.current = { startedAt: saved.startedAt, track, gaps, lengthM: saved.lengthM };
      const flat = track.flat();
      lastRef.current = (flat[flat.length - 1] as TrackPoint | undefined) ?? null;
      jumpRef.current = null;
      pausedAtRef.current = null;
      lastHeardRef.current = null; // wie die App: die Unterbrechung bis jetzt ist oben schon vermerkt
      recordingRef.current = true;
      setRecording(true);
      void keepAwake();
    },
    [keepAwake],
  );

  /** Beendete Aufzeichnung nur laden (Abschlussformular nach Neuladen). */
  const load = useCallback((saved: RecorderData) => {
    dataRef.current = { ...saved };
    recordingRef.current = false;
    setRecording(false);
  }, []);

  /**
   * Aufzeichnung beenden. `gpsHoleUntil` (Stopp-Zeitpunkt, nur bei Fahrten — nicht beim Aufnehmen einer Strecke):
   * Kam bis zum Beenden länger als 45 s keine brauchbare Position (z. B. am Ende in der Halle), wird das wie mitten in
   * der Fahrt als Unterbrechung vermerkt — sonst hörte die Spur still vor der Endzeit auf (App seit 21.11.2026).
   */
  const stop = useCallback(
    (gpsHoleUntil?: number) => {
      const heard = lastHeardRef.current;
      if (gpsHoleUntil != null && recordingRef.current && heard != null && !pausedAtRef.current) {
        addGpsHole(dataRef.current.gaps, heard, gpsHoleUntil);
      }
      recordingRef.current = false;
      setRecording(false);
      letSleep();
    },
    [letSleep],
  );

  const points = dataRef.current.track.reduce((n, s) => n + s.length, 0);
  return { recording, gps, awake, data: dataRef.current, points, lastPos: lastPosRef.current, start, resume, load, stop };
}
