// Mitteilungs-Center: EIN Abruf je Betrieb für Glocke, Seite „Alle Mitteilungen“ und die Box (Provider in MitteilungsCenter.tsx).
// Alle 2 Minuten still neu und sofort beim Zurückkehren in den Tab — damit die Glocke dasselbe zeigt wie das Handy.
// Netzfehler: der letzte Stand bleibt stehen („gestoert“). RPC fehlt / kein Mitglied: keine Glocke (da = false).
// „Neu seit zuletzt geöffnet“ nur in diesem Browser (mitteilungenDaten.ts: gesehenLesen/gesehenMerken), andere Tabs
// ziehen über das storage-Ereignis mit.
// Box (Vertrag v2, A): Klick auf eine Mitteilung — in der Glocke oder auf der Seite — öffnet DIESELBE Box über der Seite
// (zeigen/schliessen); gemerkt wird die Mitteilung selbst, damit ein Neuladen der Liste die offene Box nicht leert.
// Pro-Stand nur für den Text der LEEREN Liste (Free: „Hier erscheinen …(WinterDex Pro)“) — gefragt erst, wenn sie leer ist.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLiveRefresh } from '../components/ui';
import { fetchOrgPro } from './pro';
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
  /** Pro des Betriebs (nur für den Text der leeren Liste; null = noch nicht gefragt / unklar → Text wie bei Pro) */
  pro: boolean | null;
  /** Ortszeit des Betriebs */
  tz: string;
  /** Start des WinterDex-Bereichs, z. B. /app/winterdex */
  basis: string;
  /** Pfad zur Seite „Alle Mitteilungen“ */
  seite: string;
  /** Glocke/Liste geöffnet: alles bis zur neuesten Mitteilung gilt als gesehen (nur dieser Browser) */
  alsGesehen: () => void;
  /** Mitteilung in der Box (null = keine Box) */
  offen: Mitteilung | null;
  /** Box mit dieser Mitteilung öffnen */
  zeigen: (m: Mitteilung) => void;
  /** Box schließen („OK“, Escape, Klick daneben, „Zur Karte“) */
  schliessen: () => void;
}

export const MtKontext = createContext<MtStand | null>(null);

/** null außerhalb des Providers (z. B. andere Apps) — dann zeigt nichts eine Glocke */
export function useMitteilungen(): MtStand | null {
  return useContext(MtKontext);
}

/** Box-Zustand (auch für die Beispieldaten-Vorschau). `schluessel` = Betrieb: nach einem Wechsel ist die Box zu. */
export function useMtBox(schluessel = ''): Pick<MtStand, 'offen' | 'zeigen' | 'schliessen'> {
  const [stand, setStand] = useState<{ k: string; m: Mitteilung } | null>(null);
  const zeigen = useCallback((m: Mitteilung) => setStand({ k: schluessel, m }), [schluessel]);
  const schliessen = useCallback(() => setStand(null), []);
  return { offen: stand && stand.k === schluessel ? stand.m : null, zeigen, schliessen };
}

type Ok = Extract<MtLadung, { art: 'ok' }>;

export function useMitteilungenLaden(client: SupabaseClient, orgId: string, tz: string, basis: string): MtStand {
  const seite = `${basis}/mitteilungen`;
  const [ladung, setLadung] = useState<Ok | { art: 'aus'; orgId: string } | null>(null);
  const [gestoert, setGestoert] = useState(false);
  const [fertig, setFertig] = useState<string | null>(null);
  const nr = useRef(0);
  const box = useMtBox(orgId);

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

  // Pro nur für den Text der leeren Liste — gefragt erst, wenn sie leer ist (Anzeige: unklar → wie Pro, 5 Min. gemerkt)
  const leer = !!ok && ok.liste.length === 0;
  const [proStand, setProStand] = useState<{ org: string; pro: boolean } | null>(null);
  useEffect(() => {
    if (!leer) return;
    let weg = false;
    fetchOrgPro(client)
      .then((pro) => {
        if (!weg) setProStand({ org: orgId, pro });
      })
      .catch(() => {
        /* unklar: Text wie bei Pro */
      });
    return () => {
      weg = true;
    };
  }, [leer, client, orgId]);
  const pro = proStand && proStand.org === orgId ? proStand.pro : null;

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
  const { offen, zeigen, schliessen } = box;
  return useMemo<MtStand>(
    () => ({
      da: !!ok,
      laedt: fertig !== orgId,
      liste,
      abgerufen,
      gestoert: !!ok && gestoert,
      gesehen,
      neu: neuZahl(liste, gesehen, abgerufen ?? 0),
      pro,
      tz,
      basis,
      seite,
      alsGesehen,
      // Box nur, solange die Glocke da ist (Betriebswechsel, Server weg → keine Box mit fremdem Inhalt)
      offen: ok ? offen : null,
      zeigen,
      schliessen,
    }),
    [ok, fertig, orgId, liste, abgerufen, gestoert, gesehen, pro, tz, basis, seite, alsGesehen, offen, zeigen, schliessen],
  );
}
