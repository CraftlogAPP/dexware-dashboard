import { useEffect, useState } from 'react';
import { APPS } from '../apps/registry';
import { getClient } from '../lib/supabaseClients';
import { ADAPTERS } from './adapters';
import type { DueResult } from './types';

export interface DueChecksState {
  /** Nur Apps mit gefundenen Fälligkeiten (count > 0). */
  results: Record<string, DueResult>;
  totalCount: number;
  /** true bis alle App-Checks abgeschlossen sind (Badges erscheinen davor schon). */
  loading: boolean;
  /** Apps mit persistierter Anmeldung — null solange die Session-Prüfung läuft. */
  signedInCount: number | null;
  /** Anzahl der Apps mit Backend, deren Anmeldung geprüft wird. */
  appCount: number;
  /** Anmelde-Status je App-Id (nur Apps mit Backend enthalten). */
  sessions: Record<string, boolean>;
  /** true sobald der Anmelde-Status aller Apps feststeht. */
  sessionsChecked: boolean;
}

/** Apps mit eigenem Login (Supabase-Backend) — deren Anmeldung wird geprüft. */
const BACKEND_APPS = APPS.filter((a) => a.status === 'dashboard' && a.supabase);

/**
 * Prüft appübergreifend die Fälligkeiten aller Apps mit Supabase-Backend +
 * Adapter. Nutzt den gecachten Client je App (getClient) — kein paralleler
 * GoTrue-Client auf denselben storageKey. Ohne persistierte Session oder bei
 * Fehler wird die App still übersprungen (kein Fehler-UI auf dem Entry-Screen).
 * Ergebnisse landen einzeln im State, sobald sie da sind (nicht blockierend).
 */
export function useDueChecks(): DueChecksState {
  const [results, setResults] = useState<Record<string, DueResult>>({});
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Record<string, boolean>>({});
  const [sessionsChecked, setSessionsChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    const apps = BACKEND_APPS;
    if (apps.length === 0) {
      setLoading(false);
      setSessionsChecked(true);
      return;
    }
    let remaining = apps.length;
    let sessionsRemaining = apps.length;

    for (const app of apps) {
      // Zählt die Session-Prüfung dieser App genau einmal ab (auch im Fehlerfall).
      let sessionCounted = false;
      const markSession = (hasSession: boolean) => {
        if (sessionCounted || !mounted) return;
        sessionCounted = true;
        setSessions((prev) => ({ ...prev, [app.id]: hasSession }));
        sessionsRemaining -= 1;
        if (sessionsRemaining === 0) setSessionsChecked(true);
      };

      (async (): Promise<DueResult | null> => {
        const client = getClient(app);
        const { data } = await client.auth.getSession();
        markSession(Boolean(data.session));
        // keine Anmeldung oder kein Fälligkeits-Adapter → App überspringen
        if (!data.session || !ADAPTERS[app.id]) return null;
        return ADAPTERS[app.id](client);
      })()
        .then((res) => {
          if (mounted && res && res.count > 0) {
            setResults((prev) => ({ ...prev, [app.id]: res }));
          }
        })
        .catch(() => {
          // abgelaufene Session / RLS / Netzwerk → still überspringen
          markSession(false);
        })
        .finally(() => {
          if (!mounted) return;
          remaining -= 1;
          if (remaining === 0) setLoading(false);
        });
    }

    return () => {
      mounted = false;
    };
  }, []);

  const totalCount = Object.values(results).reduce((n, r) => n + r.count, 0);
  const signedIn = Object.values(sessions).filter(Boolean).length;
  return {
    results,
    totalCount,
    loading,
    signedInCount: sessionsChecked ? signedIn : null,
    appCount: BACKEND_APPS.length,
    sessions,
    sessionsChecked,
  };
}
