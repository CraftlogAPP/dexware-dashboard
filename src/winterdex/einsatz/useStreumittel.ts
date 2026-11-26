// Ausgeblendete Streumittel des Betriebs für die Erfassung (streumittel.ts). Grundlage ist die org-Abfrage des
// Betriebs-Kontexts (select('*') liest streumittel_aus mit, sobald die Spalte da ist); ohne Betrieb (Beispieldaten) oder
// ohne Server-Update: null → alle Streumittel wie bisher.
// Neuer als der Betriebs-Kontext ist der Stand hier im Speicher: nach dem Speichern auf der Team-Seite (merkeStreumittel) und
// nach dem stillen Nachladen beim Zurückkehren in den Außendienst-Tab (useStreumittelNachladen — das Handy-Fenster bleibt oft
// tagelang offen). Bewusst NICHT über refresh() des Betriebs-Kontexts: fetchOrgContext liefert ohne Netz null, und dann
// stünde mitten im Funkloch die Seite „Betrieb anlegen“ da.
import { useEffect, useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useOrgOptional } from '../../components/OrgContext';
import { streumittelAusVon, type Streumittel } from '../streumittel';

const stand = new Map<string, Streumittel[]>();
const hoerer = new Set<() => void>();
let version = 0;

function abonnieren(f: () => void): () => void {
  hoerer.add(f);
  return () => {
    hoerer.delete(f);
  };
}
const lesen = () => version;

/** Neuer Stand eines Betriebs (Antwort von set_streumittel_aus bzw. stilles Nachladen) — alle Formulare ziehen mit. */
export function merkeStreumittel(orgId: string, aus: Streumittel[]): void {
  stand.set(orgId, aus);
  version += 1;
  hoerer.forEach((f) => f());
}

/** Ausgeblendete Streumittel des eigenen Betriebs; null = Server-Update fehlt bzw. kein Betrieb (dann alle zeigen). */
export function useStreumittelAus(): Streumittel[] | null {
  const org = useOrgOptional()?.data?.org;
  useSyncExternalStore(abonnieren, lesen, lesen);
  const gemerkt = org?.id ? stand.get(org.id) : undefined;
  return gemerkt ?? streumittelAusVon(org);
}

/**
 * Außendienst: beim Zurückkehren in den Tab still nachladen (nur diese eine Spalte). Spalte fehlt, Netz weg oder Fehler →
 * der bisherige Stand bleibt, nie eine Fehlermeldung.
 */
export function useStreumittelNachladen(client: SupabaseClient | null, orgId: string): void {
  useEffect(() => {
    if (!client) return;
    const laden = () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      void Promise.resolve(client.from('org').select('streumittel_aus').eq('id', orgId).maybeSingle()).then(
        ({ data, error }) => {
          if (error || !data) return;
          const aus = streumittelAusVon(data);
          if (aus) merkeStreumittel(orgId, aus);
        },
        () => undefined,
      );
    };
    document.addEventListener('visibilitychange', laden);
    return () => document.removeEventListener('visibilitychange', laden);
  }, [client, orgId]);
}
