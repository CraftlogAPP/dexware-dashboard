import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppAuth } from '../auth/AppAuthContext';
import { useAsync, type AsyncState } from './ui';
import { fetchOrgContext, type OrgContextData } from '../lib/orgApi';

type OrgState = AsyncState<OrgContextData | null>;

const Ctx = createContext<OrgState | null>(null);

/**
 * Lädt Betrieb + Rolle des eingeloggten Users. Standard ist das
 * membership-Modell (fetchOrgContext); Apps mit anderem Mandanten-Modell
 * (z. B. SchutzDex mit owner_user_id) geben ihren eigenen Fetcher mit.
 */
export function OrgProvider({
  children,
  fetch = fetchOrgContext,
}: {
  children: ReactNode;
  fetch?: (sb: SupabaseClient) => Promise<OrgContextData | null>;
}) {
  const { client, session } = useAppAuth();
  const { data, loading, error, reload } = useAsync(
    () => fetch(client),
    [client, session?.user.id, fetch],
  );

  // Stabile Context-Identität, damit useOrg-Consumer nicht bei jedem
  // Provider-Render (z. B. Auth-Events) neu rendern.
  const value = useMemo<OrgState>(
    () => ({ data, loading, error, reload }),
    [data, loading, error, reload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOrg außerhalb von OrgProvider');
  return v;
}

/**
 * Lade-/Fehler-/„kein Betrieb"-Gate um die App-Routen.
 * children rendern erst, wenn der Org-Kontext steht.
 */
export function OrgGate({ children }: { children: ReactNode }) {
  const { app } = useAppAuth();
  const { data, loading, error, reload } = useOrg();

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <div className="error-box">{error}</div>
        <button className="btn ghost" onClick={reload}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <div className="info-box">
          Dieses Konto gehört noch zu keinem Betrieb. Lege den Betrieb zuerst in der{' '}
          {app.name}-App am Handy an (oder tritt per Einladungscode bei) — danach steht
          das Dashboard hier bereit.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
