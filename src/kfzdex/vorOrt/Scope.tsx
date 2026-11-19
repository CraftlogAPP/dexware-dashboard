// Verbindet „Vor Ort“ (KfzDex) mit dem angemeldeten Konto: Server-Zugriff, Betrieb, Rolle und die Adressen der App.
// Muss innerhalb von AppArea (Anmeldung) und OrgProvider/OrgGate (Betrieb) stehen.
import { useMemo, type ReactNode } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { VOR_ORT_PATH } from '../../pruefen/Scope';
import { supabaseKfzBackend } from './backend';
import { KfzCtx, type KfzCtxValue } from './context';

export function KfzVorOrtScope({ children }: { children: ReactNode }) {
  const { app, client, session, signOut } = useAppAuth();
  const { data } = useOrg();
  const userId = session?.user.id;
  const email = session?.user.email ?? null;
  const org = data?.org;
  const role = data?.role;
  const value = useMemo<KfzCtxValue | null>(() => {
    if (!userId || !org) return null;
    return {
      be: supabaseKfzBackend(client),
      userId,
      orgId: org.id,
      orgName: org.name,
      email,
      owner: role === 'owner',
      base: `/app/${app.id}/${VOR_ORT_PATH}`,
      dashboardUrl: `/app/${app.id}`,
      signOut: () => void signOut(),
    };
  }, [client, app.id, userId, email, org, role, signOut]);
  if (!value) return null;
  return <KfzCtx.Provider value={value}>{children}</KfzCtx.Provider>;
}
