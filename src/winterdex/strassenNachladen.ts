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
    const t = setInterval(() => {
      if (Date.now() > bis) {
        clearInterval(t);
        return;
      }
      const f = ladenRef.current;
      if (!f) return;
      f(runId)
        .then((s) => {
          // „fehlt“ = Lesefehler (Netz) → Anzeige lassen, weiter fragen
          if (!aus && s && s.status !== 'fehlt') setNeu({ id: runId, stand: s });
        })
        .catch(() => undefined);
    }, STRASSEN_NACHLADEN_MS);
    return () => {
      aus = true;
      clearInterval(t);
    };
  }, [offen, runId]);

  return stand;
}
