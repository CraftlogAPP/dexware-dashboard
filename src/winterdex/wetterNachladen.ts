// Wetterverlauf eines Nachweises laden und bei „wird ermittelt“/„Quelle fehlt“ selbst nachfragen (Wetter-Lauf alle 15 Minuten)
// — wie strassenNachladen.ts. Eigene Datei, damit WetterZeitleiste.tsx nur Komponenten exportiert (Fast Refresh).
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeWetter, type Bezug, type WetterInfo } from './wetterBeleg';

const NACHFRAGEN_MS = 2 * 60_000;
const NACHFRAGEN_MAX_MS = 45 * 60_000;

/**
 * Wetterverlauf eines Nachweises laden; solange er „wird ermittelt“ bzw. die Quelle fehlt, alle 2 Minuten (höchstens
 * 45 Minuten) und beim Zurückkehren in den Tab selbst nachfragen. Fehler beim Nachfragen ändern nichts an der Anzeige.
 */
export function useWetterNachladen(sb: SupabaseClient, bezug: Bezug, id: string | null | undefined): { info: WetterInfo | null; fehler: boolean } {
  const [stand, setStand] = useState<{ id: string; info: WetterInfo | null; fehler: boolean } | null>(null);
  const sbRef = useRef(sb);
  useEffect(() => {
    sbRef.current = sb;
  });
  useEffect(() => {
    if (!id) return;
    let aus = false;
    let zuletzt = 0;
    const bis = Date.now() + NACHFRAGEN_MAX_MS;
    let offen = true;
    const frage = (erst = false) => {
      if (!erst && (!offen || Date.now() - zuletzt < 5000)) return;
      zuletzt = Date.now();
      ladeWetter(sbRef.current, bezug, [id]).then((l) => {
        if (aus) return;
        if (l.art === 'ok') {
          const info = l.je.get(id) ?? null;
          offen = !!info && (info.stand === 'wird_ermittelt' || info.stand === 'quelle_fehlt');
          setStand({ id, info, fehler: false });
        } else if (l.art === 'aus') {
          offen = false;
          setStand({ id, info: null, fehler: false });
        } else if (erst) {
          setStand({ id, info: null, fehler: true });
        }
      });
    };
    frage(true);
    const t = setInterval(() => {
      if (Date.now() > bis) return clearInterval(t);
      frage();
    }, NACHFRAGEN_MS);
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
  }, [bezug, id]);
  return stand && stand.id === id ? { info: stand.info, fehler: stand.fehler } : { info: null, fehler: false };
}
