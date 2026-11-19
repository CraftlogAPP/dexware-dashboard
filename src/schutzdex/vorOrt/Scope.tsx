// Verbindet „Vor Ort“ (SchutzDex) mit dem angemeldeten Konto: Server-Zugriff, Betrieb und die Adressen der App.
// Muss innerhalb von AppArea (Anmeldung) und OrgProvider/OrgGate (Betrieb) stehen.
// SchutzDex kennt nur den Inhaber (kein Team): Mitarbeiter sind Datensätze und unterschreiben auf seinem Gerät.
import { useMemo, useRef, type ReactNode } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { VOR_ORT_PATH } from '../../pruefen/Scope';
import { fetchSchutzPro } from '../pro';
import { supabaseSdBackend } from './backend';
import { SdCtx, type SdCtxValue } from './context';

export function SdVorOrtScope({ children }: { children: ReactNode }) {
  const { app, client, session, signOut } = useAppAuth();
  const { data } = useOrg();
  const org = data?.org;
  const userId = session?.user.id;
  const email = session?.user.email ?? null;
  // Die Sitzung wird regelmäßig erneuert (neues Objekt). Der Kontext darf sich dadurch NICHT ändern — sonst lüde die
  // Seite mitten in einer Unterweisung neu. Für die Pro-Frage wird immer die aktuelle Sitzung gelesen.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const value = useMemo<SdCtxValue | null>(() => {
    if (!userId || !org) return null;
    return {
      be: supabaseSdBackend(client, async () => (sessionRef.current ? fetchSchutzPro(app, sessionRef.current) : true)),
      userId,
      orgId: org.id,
      orgName: org.name,
      email,
      base: `/app/${app.id}/${VOR_ORT_PATH}`,
      dashboardUrl: `/app/${app.id}`,
      signOut: () => void signOut(),
    };
  }, [client, app, userId, email, org, signOut]);
  if (!value) return null;
  return <SdCtx.Provider value={value}>{children}</SdCtx.Provider>;
}
