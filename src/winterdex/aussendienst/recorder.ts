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
const GAP_MIN_MS = 10000; // kürzere Unterbrechungen nicht als Pause vermerken
const STALE_FIX_MS = 15000;

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
  const weatherAskedRef = useRef(false);
  const wakeRef = useRef<WakeLockSentinelLike | null>(null);
  const onFirstRef = useRef(onFirstGoodFix);
  onFirstRef.current = onFirstGoodFix;

  const recordFix = useCallback((lat: number, lng: number, acc: number, ts: number) => {
    if (!recordingRef.current || pausedAtRef.current) return;
    if (acc > MAX_ACC_M) return;
    const d0 = dataRef.current;
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
          if (seg.length >= 2 && jl / ljdt <= MAX_SPEED_MS && ljdt <= 120) {
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
    const id = navigator.geolocation.watchPosition(
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
    const timer = setInterval(() => {
      setTick((n) => n + 1); // Uhr/Strecke in der Anzeige weiterzählen
      const at = lastFixAtRef.current;
      if (at && Date.now() - at > STALE_FIX_MS) setGps({ state: 'lost', since: at });
    }, 1000);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(timer);
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

  const stop = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    letSleep();
  }, [letSleep]);

  const points = dataRef.current.track.reduce((n, s) => n + s.length, 0);
  return { recording, gps, awake, data: dataRef.current, points, lastPos: lastPosRef.current, start, resume, load, stop };
}
