// Verbindet „Vor Ort“ (PrüfDex) mit dem angemeldeten Konto: Server-Zugriff, Betrieb, Rolle und die Adressen der App.
// Muss innerhalb von AppArea (Anmeldung) und OrgProvider/OrgGate (Betrieb) stehen.
import { useMemo, type ReactNode } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { VOR_ORT_PATH } from '../../pruefen/Scope';
import { supabasePdBackend } from './backend';
import { PdCtx, type PdCtxValue } from './context';
import { listDrafts, listPending } from './queue';
import { useLogoutCount } from '../../lib/logoutGuard';

export function PdVorOrtScope({ children }: { children: ReactNode }) {
  const { app, client, session, signOut } = useAppAuth();
  const { data } = useOrg();
  const userId = session?.user.id;
  const email = session?.user.email ?? null;
  const org = data?.org;
  const role = data?.role;
  const value = useMemo<PdCtxValue | null>(() => {
    if (!userId || !org) return null;
    return {
      be: supabasePdBackend(client),
      userId,
      orgId: org.id,
      orgName: org.name,
      email,
      orgInspector: String((org as unknown as { inspector_name?: string | null }).inspector_name ?? ''),
      owner: role === 'owner',
      base: `/app/${app.id}/${VOR_ORT_PATH}`,
      dashboardUrl: `/app/${app.id}`,
      signOut: () => void signOut(),
    };
  }, [client, app.id, userId, email, org, role, signOut]);
  useLogoutCount(userId ? async () => (await listPending(userId)).length + (await listDrafts(userId)).length : null, [userId]);
  if (!value) return null;
  return <PdCtx.Provider value={value}>{children}</PdCtx.Provider>;
}
