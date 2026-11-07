// Gemeinsamer Kontext der Portal-Seiten: Datenquelle (echt oder Beispieldaten), Betrieb, Rolle.
// Echt: kommt aus AppArea/OrgProvider (gleiche Anmeldung wie alle Dashboards) — RealInstProvider.
// Beispieldaten: DemoArea.tsx (nur Dev-Server, eigener Chunk — landet nie im Produktions-Build).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppConfig } from '../apps/registry';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import type { Role } from '../lib/orgApi';
import { supabaseData, type InstData } from './data';
import type { ExtData } from './ext';
import { realExt } from './ext';
import type { InstOrg } from './types';

export interface InstContext {
  app: AppConfig;
  data: InstData;
  /** Zusatz-Bereiche (Planung, Geld, Auswertungen) — siehe ext.ts */
  ext: ExtData;
  org: InstOrg;
  role: Role;
  isOwner: boolean;
  demo: boolean;
  /** Wer angemeldet ist (für Merk-Schalter je Nutzer im Browser, z. B. „Einführung gesehen“). */
  userKey: string;
  /** Absoluter Pfad des Bereichs, z. B. /app/installateurdex */
  base: string;
  /** Betrieb neu laden (nach dem Speichern der Einstellungen). */
  refreshOrg: () => void;
  /** Zähler: steigt, wenn sich Anfragen geändert haben (Navigation zählt neu). */
  requestsVersion: number;
  bumpRequests: () => void;
}

const Ctx = createContext<InstContext | null>(null);

export const InstContextProvider = Ctx.Provider;

export function useInst(): InstContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInst außerhalb des InstallateurDex-Bereichs');
  return v;
}

export function useRequestsVersion() {
  const [requestsVersion, setV] = useState(0);
  const bumpRequests = useCallback(() => setV((n) => n + 1), []);
  return { requestsVersion, bumpRequests };
}

/** Echte Daten: innerhalb von AppArea + OrgProvider + OrgGate verwenden. */
export function RealInstProvider({ app, children }: { app: AppConfig; children: ReactNode }) {
  const { client, session } = useAppAuth();
  const userKey = session?.user.id ?? 'anon';
  const { data: orgCtx, refresh } = useOrg();
  const data = useMemo(() => supabaseData(client), [client]);
  const ext = useMemo(() => realExt(client), [client]);
  const { requestsVersion, bumpRequests } = useRequestsVersion();
  const value = useMemo<InstContext | null>(
    () =>
      orgCtx
        ? {
            app,
            data,
            ext,
            org: orgCtx.org as InstOrg,
            role: orgCtx.role,
            isOwner: orgCtx.role === 'owner',
            demo: false,
            userKey,
            base: `/app/${app.id}`,
            refreshOrg: refresh,
            requestsVersion,
            bumpRequests,
          }
        : null,
    [app, data, ext, orgCtx, refresh, requestsVersion, bumpRequests, userKey],
  );
  if (!value) return null; // OrgGate rendert davor Lade-/Fehlerzustand
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
