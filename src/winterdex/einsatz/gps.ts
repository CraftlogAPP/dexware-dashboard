// GPS-Stempel im Browser — gleiche Regeln wie die App (mobile/src/screens/OperationScreen.tsx):
// Die Ortung läuft, solange die Erfassung offen ist. Beginn = genaueste Position der ersten 20 s
// (früher fertig, sobald ±10 m erreicht), Ende = letzte Position beim Speichern. Ist der Beginn nach
// 20 s noch ungenauer als ±50 m, wird er weiter verbessert, bis er brauchbar ist.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsFix } from './store';

export const GPS_GOOD_M = 20; // ab hier gilt die Position als genau
export const GPS_WEAK_M = 50; // ungenauer = schwacher Nachweis (PDF warnt ab hier)
const GPS_REFINE_MS = 20000;

export type GpsState =
  | { status: 'loading' }
  | ({ status: 'ok'; refining: boolean; slow: boolean } & GpsFix)
  | { status: 'denied' }
  | { status: 'error' }
  | { status: 'unsupported' };

function toFix(pos: GeolocationPosition): GpsFix {
  // Manche Browser liefern eine unbrauchbare Ortungszeit (andere Zeitbasis) → dann die Uhr des Geräts.
  const t = Number(pos.timestamp);
  const at = Number.isFinite(t) && Math.abs(t - Date.now()) < 5 * 60 * 1000 ? t : Date.now();
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
    at: new Date(at).toISOString(),
  };
}

/**
 * @param active   Ortung läuft nur, solange true (Formular offen, noch nicht gespeichert)
 * @param restored Beginn-Stempel eines fortgesetzten Entwurfs — bleibt bestehen, wenn er brauchbar ist
 * @param onFirstFix einmal je Formular, sobald eine grobe Position da ist (für das Wetter)
 */
export function useGpsStamp(active: boolean, restored: GpsFix | null, onFirstFix: (fix: GpsFix) => void) {
  const [gps, setGps] = useState<GpsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [rewatch, setRewatch] = useState(0);
  const lastFixRef = useRef<GpsFix | null>(null);
  const bestRef = useRef<GpsFix | null>(null);
  const lockedRef = useRef(false);
  const firstAtRef = useRef(0);
  const askedRef = useRef(false);
  const onFirstFixRef = useRef(onFirstFix);
  onFirstFixRef.current = onFirstFix;
  const restoredRef = useRef(restored);
  restoredRef.current = restored;

  useEffect(() => {
    if (!active) return;
    if (!('geolocation' in navigator)) {
      setGps({ status: 'unsupported' });
      return;
    }
    let alive = true;
    const r = restoredRef.current;
    if (r && !bestRef.current) {
      bestRef.current = r;
      lockedRef.current = (r.accuracy ?? 9999) <= GPS_WEAK_M;
      setGps({ status: 'ok', refining: false, slow: false, ...r });
    }
    // Erneuter Versuch: ein ungenauer Beginn darf sich wieder verbessern.
    if (attempt > 0 && (bestRef.current?.accuracy ?? 9999) > GPS_WEAK_M) lockedRef.current = false;
    setGps((g) => (g.status === 'denied' || g.status === 'error' ? { status: 'loading' } : g));

    const onFix = (fix: GpsFix) => {
      if (!alive) return;
      lastFixRef.current = fix;
      if (!firstAtRef.current) firstAtRef.current = Date.now();
      const acc = fix.accuracy ?? 9999;
      if (!askedRef.current && acc <= 5000) {
        askedRef.current = true;
        onFirstFixRef.current(fix);
      }
      const best = bestRef.current;
      if (!lockedRef.current && (!best || acc < (best.accuracy ?? 9999))) bestRef.current = fix;
      const bAcc = bestRef.current?.accuracy ?? 9999;
      const slow = Date.now() - firstAtRef.current > GPS_REFINE_MS;
      if (!lockedRef.current && (bAcc <= 10 || (slow && bAcc <= GPS_WEAK_M))) lockedRef.current = true;
      const b = bestRef.current;
      if (b) setGps({ status: 'ok', refining: !lockedRef.current && bAcc > GPS_GOOD_M, slow, ...b });
    };

    const id = navigator.geolocation.watchPosition(
      (pos) => onFix(toFix(pos)),
      (err) => {
        if (!alive) return;
        // Nicht erlaubt: ohne Position bleibt nur „kein GPS-Stempel“. Ein schon erfasster Beginn bleibt stehen.
        if (err.code === err.PERMISSION_DENIED && !bestRef.current) setGps({ status: 'denied' });
        // Zeitüberschreitung / gerade nicht verfügbar: die Ortung läuft weiter, siehe Zeitgrenze unten.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    // Nach 30 s ohne jede Position: ehrlich melden (die Ortung läuft im Hintergrund weiter).
    const timer = setTimeout(() => {
      if (alive && !lastFixRef.current && !bestRef.current) {
        setGps((g) => (g.status === 'loading' ? { status: 'error' } : g));
      }
    }, 30000);
    return () => {
      alive = false;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(id);
    };
  }, [active, attempt, rewatch]);

  // Zurück auf der Seite (z. B. nach der Kamera): Ortung neu anmelden — am iPhone verstummt sie sonst manchmal,
  // und der End-Stempel beim Speichern wäre veraltet. Der schon erfasste Beginn bleibt unverändert.
  useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRewatch((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { gps, lastFixRef, retry };
}
