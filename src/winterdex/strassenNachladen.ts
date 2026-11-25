// Straßenverlauf nachladen, solange er „wird ermittelt“ (25.11.2026): Der Worker ermittelt die Straßen seit heute jede
// Minute → meist 1–3 Minuten nach dem Hochladen fertig. Fahrt-Detail, Strecke (Dashboard) und Außendienst fragen deshalb
// selbst nach — alle 20 s, höchstens 10 Minuten lang — und zeigen die Tabelle, sobald sie da ist. Kein Neuladen nötig.
// Fehler beim Nachfragen (Netz weg) ändern nichts an der Anzeige; der nächste Versuch kommt 20 s später.
import { useEffect, useRef, useState } from 'react';
import { STRASSEN_NACHLADEN_MAX_MS, STRASSEN_NACHLADEN_MS, strassenOffen, type StrassenStand } from './strassen';

export function useStrassenNachladen(
  runId: string | null | undefined,
  start: StrassenStand | null | undefined,
  laden: ((id: string) => Promise<StrassenStand | null>) | null | undefined,
  run?: { canceled?: boolean | null } | null,
): StrassenStand | null {
  const [neu, setNeu] = useState<{ id: string; stand: StrassenStand } | null>(null);
  const stand = runId && neu?.id === runId ? neu.stand : (start ?? null);
  const offen = !!runId && !!laden && strassenOffen(stand, run);
  const ladenRef = useRef(laden);
  useEffect(() => {
    ladenRef.current = laden;
  });

  useEffect(() => {
    if (!offen || !runId) return;
    const bis = Date.now() + STRASSEN_NACHLADEN_MAX_MS;
    let aus = false;
    let zuletzt = 0;
    const frage = () => {
      const f = ladenRef.current;
      if (!f || Date.now() - zuletzt < 3000) return;
      zuletzt = Date.now();
      f(runId)
        .then((s) => {
          // „fehlt“ = Lesefehler (Netz) → Anzeige lassen, weiter fragen
          if (!aus && s && s.status !== 'fehlt') setNeu({ id: runId, stand: s });
        })
        .catch(() => undefined);
    };
    const t = setInterval(() => {
      if (Date.now() > bis) {
        clearInterval(t);
        return;
      }
      frage();
    }, STRASSEN_NACHLADEN_MS);
    // Nach den 10 Minuten (Anbieter gestört → Worker versucht es 15 min bis 12 Std. später) noch einmal beim
    // Zurückwechseln in den Tab nachfragen — sonst stünde „wird ermittelt“ bis zum Neuladen da (Tagescheck 26.11.2026)
    const sichtbar = () => {
      if (document.visibilityState === 'visible') frage();
    };
    document.addEventListener('visibilitychange', sichtbar);
    window.addEventListener('focus', sichtbar);
    return () => {
      aus = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', sichtbar);
      window.removeEventListener('focus', sichtbar);
    };
  }, [offen, runId]);

  return stand;
}
