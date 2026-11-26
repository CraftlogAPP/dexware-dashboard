// Mitteilungs-Center: EIN Abruf je Betrieb für Glocke, Liste und Detailseite (Provider in MitteilungsCenter.tsx).
// Alle 2 Minuten still neu und sofort beim Zurückkehren in den Tab — damit die Glocke dasselbe zeigt wie das Handy.
// Netzfehler: der letzte Stand bleibt stehen („gestoert“). RPC fehlt / kein Mitglied: keine Glocke (da = false).
// „Neu seit zuletzt geöffnet“ nur in diesem Browser (mitteilungenDaten.ts: gesehenLesen/gesehenMerken), andere Tabs
// ziehen über das storage-Ereignis mit.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLiveRefresh } from '../components/ui';
import { GESEHEN_KEY, gesehenLesen, gesehenMerken, ladeMitteilungen, neuZahl, type Mitteilung, type MtLadung } from './mitteilungenDaten';

export interface MtStand {
  /** Glocke zeigen: RPC da, Mitglied, mindestens einmal geladen */
  da: boolean;
  /** erster Abruf läuft noch */
  laedt: boolean;
  /** neueste zuerst */
  liste: Mitteilung[];
  /** letzter erfolgreicher Abruf (ms) */
  abgerufen: number | null;
  /** letzter Abruf gescheitert — die Liste ist der letzte Stand */
  gestoert: boolean;
  /** zuletzt gesehen (ms der neuesten gesehenen Mitteilung) oder null */
  gesehen: number | null;
  /** Zähler an der Glocke */
  neu: number;
  /** Ortszeit des Betriebs */
  tz: string;
  /** Start des WinterDex-Bereichs, z. B. /app/winterdex */
  basis: string;
  /** Pfad zur Liste (ohne id) bzw. zu einer Mitteilung */
  pfad: (id?: string) => string;
  /** Glocke/Liste geöffnet: alles bis zur neuesten Mitteilung gilt als gesehen (nur dieser Browser) */
  alsGesehen: () => void;
}

export const MtKontext = createContext<MtStand | null>(null);

/** null außerhalb des Providers (z. B. andere Apps) — dann zeigt nichts eine Glocke */
export function useMitteilungen(): MtStand | null {
  return useContext(MtKontext);
}

type Ok = Extract<MtLadung, { art: 'ok' }>;

export function useMitteilungenLaden(client: SupabaseClient, orgId: string, tz: string, basis: string): MtStand {
  const pfad = useCallback((id?: string) => (id ? `${basis}/mitteilungen/${encodeURIComponent(id)}` : `${basis}/mitteilungen`), [basis]);
  const [ladung, setLadung] = useState<Ok | { art: 'aus'; orgId: string } | null>(null);
  const [gestoert, setGestoert] = useState(false);
  const [fertig, setFertig] = useState<string | null>(null);
  const nr = useRef(0);

  const laden = useCallback(async () => {
    const meins = ++nr.current;
    const l = await ladeMitteilungen(client, orgId);
    if (meins !== nr.current) return; // ein neuerer Abruf läuft schon
    setFertig(orgId);
    if (l.art === 'fehler') {
      setGestoert(true); // letzter Stand bleibt
      return;
    }
    setGestoert(false);
    setLadung(l.art === 'ok' ? l : { art: 'aus', orgId });
  }, [client, orgId]);

  useEffect(() => {
    void laden();
  }, [laden]);
  useLiveRefresh([laden], 2 * 60_000);

  // nur der Stand DIESES Betriebs zählt (Wechsel des Betriebs: bis zur Antwort nichts zeigen)
  const ok = ladung && ladung.art === 'ok' && ladung.orgId === orgId ? ladung : null;
  const liste = useMemo(() => ok?.liste ?? [], [ok]);

  const [gesehenStand, setGesehenStand] = useState<{ org: string; ms: number | null }>(() => ({ org: orgId, ms: gesehenLesen(orgId) }));
  const gesehen = gesehenStand.org === orgId ? gesehenStand.ms : gesehenLesen(orgId);

  // anderer Tab hat die Glocke geöffnet → Zähler hier ebenso
  useEffect(() => {
    const f = (e: StorageEvent) => {
      if (e.key === null || e.key === GESEHEN_KEY(orgId)) setGesehenStand({ org: orgId, ms: gesehenLesen(orgId) });
    };
    window.addEventListener('storage', f);
    return () => window.removeEventListener('storage', f);
  }, [orgId]);

  const alsGesehen = useCallback(() => {
    if (!liste.length) return;
    setGesehenStand({ org: orgId, ms: gesehenMerken(orgId, liste[0].ms) });
  }, [orgId, liste]);

  const abgerufen = ok?.abgerufen ?? null;
  return useMemo<MtStand>(
    () => ({
      da: !!ok,
      laedt: fertig !== orgId,
      liste,
      abgerufen,
      gestoert: !!ok && gestoert,
      gesehen,
      neu: neuZahl(liste, gesehen, abgerufen ?? 0),
      tz,
      basis,
      pfad,
      alsGesehen,
    }),
    [ok, fertig, orgId, liste, abgerufen, gestoert, gesehen, tz, basis, pfad, alsGesehen],
  );
}
