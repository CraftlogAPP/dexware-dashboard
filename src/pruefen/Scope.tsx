// Verbindet „Vor Ort“ mit dem angemeldeten Konto: Server-Zugriff, Betrieb, Rolle und die Adressen der App.
// Muss innerhalb von AppArea (Anmeldung) und OrgProvider/OrgGate (Betrieb) stehen.
import { useMemo, type ReactNode } from 'react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { supabasePruefBackend } from './backend';
import type { PruefConfig } from './config';
import { PruefCtx, type PruefCtxValue } from './context';
import { listDrafts, listPending } from './store';
import { useLogoutCount } from '../lib/logoutGuard';

/** Unterpfad der Handy-Ansicht in jeder App: /app/<app>/vor-ort */
export const VOR_ORT_PATH = 'vor-ort';

export function VorOrtScope({ cfg, children }: { cfg: PruefConfig; children: ReactNode }) {
  const { app, client, session, signOut } = useAppAuth();
  const { data } = useOrg();
  const userId = session?.user.id;
  const email = session?.user.email ?? null;
  const org = data?.org;
  const role = data?.role;
  const value = useMemo<PruefCtxValue | null>(() => {
    if (!userId || !org) return null;
    const orgRow = org as unknown as Record<string, unknown>;
    const intervalDays = cfg.dueIntervalDays(orgRow);
    const dueDate = cfg.dueDate;
    return {
      cfg,
      be: supabasePruefBackend(client, cfg, intervalDays),
      userId,
      orgId: org.id,
      orgName: org.name,
      email,
      owner: role === 'owner',
      intervalDays,
      ...(dueDate ? { dueDate: (last: Date) => dueDate(last, orgRow) } : {}),
      base: `/app/${app.id}/${VOR_ORT_PATH}`,
      dashboardUrl: `/app/${app.id}`,
      signOut: () => void signOut(),
    };
  }, [cfg, client, app.id, userId, email, org, role, signOut]);
  useLogoutCount(
    userId ? async () => (await listPending(app.id, userId)).length + (await listDrafts(app.id, userId)).length : null,
    [app.id, userId],
  );
  if (!value) return null;
  return <PruefCtx.Provider value={value}>{children}</PruefCtx.Provider>;
}
