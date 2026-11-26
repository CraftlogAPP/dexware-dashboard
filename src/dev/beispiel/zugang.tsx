// Beispiel-Zugang (NUR Dev-Server, siehe docs/beispiel-zugang.md): ersetzt Supabase-Client und Sitzung eines
// App-Bereichs durch den Speicher-Client mit Beispieldaten. Die echten Seiten (Übersicht, Standorte, Prüfungen, Bericht …)
// laufen unverändert — sie bekommen nur andere Daten. Geladen per lazy import aus src/auth/AppAuthContext.tsx.
import { use, useMemo, type Context, type ReactNode } from 'react';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { AppConfig } from '../../apps/registry';
import type { AppAuthValue } from '../../auth/AppAuthContext';
import { beispielClient, beispielSitzung, MERKWORT } from './client';
import { netzUmleiten } from './netz';
import { BEISPIEL_APPS, beispielAus } from './schalter';
import type { BeispielDaten } from './typen';

const geladen = new Map<string, Promise<BeispielDaten>>();
// Ein Client je App und Tab: Was man im Beispiel anlegt, bleibt bis zum Neuladen (auch beim Wechsel der Unterseite).
const zugaenge = new Map<string, { client: SupabaseClient; session: Session }>();

function ladeDaten(appId: string): Promise<BeispielDaten> {
  let p = geladen.get(appId);
  if (!p) {
    const laden = BEISPIEL_APPS[appId];
    p = laden ? laden().then((m) => m.daten) : Promise.reject(new Error(`Keine Beispieldaten für ${appId}`));
    geladen.set(appId, p);
  }
  return p;
}

function zugangFuer(app: AppConfig, daten: BeispielDaten) {
  let z = zugaenge.get(app.id);
  if (!z) {
    netzUmleiten(app.id);
    const session = beispielSitzung(daten);
    z = { client: beispielClient(daten, session), session };
    zugaenge.set(app.id, z);
    console.info(
      `[Beispiel] ${app.name}: Beispieldaten statt Server (${MERKWORT}). Daten in der Konsole: window.__beispiel — beenden mit ?beispiel=aus oder „Abmelden“.`,
    );
    (window as unknown as { __beispiel?: unknown }).__beispiel = (z.client as unknown as { __beispiel: unknown }).__beispiel;
  }
  return z;
}

export function BeispielZugang({
  app,
  ctx,
  children,
}: {
  app: AppConfig;
  ctx: Context<AppAuthValue | null>;
  children: ReactNode;
}) {
  const daten = use(ladeDaten(app.id));
  const value = useMemo<AppAuthValue>(() => {
    const { client, session } = zugangFuer(app, daten);
    return {
      app,
      client,
      session,
      loading: false,
      signOut: async () => beispielAus(),
      confirmReturn: null,
      dismissConfirm: () => undefined,
    };
  }, [app, daten]);
  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}
