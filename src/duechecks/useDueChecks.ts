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
}

/** Apps mit Supabase-Backend + Adapter — nur die können Fälligkeiten melden. */
const BACKEND_APPS = APPS.filter(
  (a) => a.status === 'dashboard' && a.supabase && ADAPTERS[a.id],
);

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
  const [signedIn, setSignedIn] = useState(0);
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
        if (hasSession) setSignedIn((n) => n + 1);
        sessionsRemaining -= 1;
        if (sessionsRemaining === 0) setSessionsChecked(true);
      };

      (async (): Promise<DueResult | null> => {
        const client = getClient(app);
        const { data } = await client.auth.getSession();
        markSession(Boolean(data.session));
        if (!data.session) return null; // keine Anmeldung → App überspringen
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
  return {
    results,
    totalCount,
    loading,
    signedInCount: sessionsChecked ? signedIn : null,
    appCount: BACKEND_APPS.length,
  };
}
