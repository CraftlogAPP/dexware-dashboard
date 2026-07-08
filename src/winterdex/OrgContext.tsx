import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useAsync, type AsyncState } from '../components/ui';
import { fetchOrgContext, type OrgContext as OrgCtxData } from './api';

type OrgState = AsyncState<OrgCtxData | null>;

const Ctx = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { client, session } = useAppAuth();
  const { data, loading, error, reload } = useAsync(
    () => fetchOrgContext(client),
    [client, session?.user.id],
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
