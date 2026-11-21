import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { getClient } from '../lib/supabaseClients';
import { confirmLogout } from '../lib/logoutGuard';
import { cleanConfirmUrl, readConfirmReturn, type ConfirmReturn } from './confirmReturn';

interface AppAuthValue {
  app: AppConfig;
  client: SupabaseClient;
  session: Session | null;
  /** true solange die persistierte Session noch geladen wird */
  loading: boolean;
  signOut: () => Promise<void>;
  /** Rückkehr vom Bestätigungslink der Registrierung: 'ok' / 'error' (abgelaufen, schon benutzt), sonst null */
  confirmReturn: ConfirmReturn | null;
  dismissConfirm: () => void;
}

const Ctx = createContext<AppAuthValue | null>(null);

export function AppAuthProvider({
  app,
  children,
}: {
  app: AppConfig;
  children: ReactNode;
}) {
  const client = useMemo(() => getClient(app), [app]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Einmal beim Laden lesen (die Adresse wird danach aufgeräumt).
  const [confirmReturn, setConfirmReturn] = useState<ConfirmReturn | null>(readConfirmReturn);
  const dismissConfirm = useCallback(() => setConfirmReturn(null), []);

  useEffect(() => {
    let mounted = true;
    client.auth.getSession().then(({ data }) => {
      // getSession() wartet, bis supabase-js die Adresse gelesen (PKCE-Code getauscht) hat — erst jetzt Merker,
      // Fehler-Hash und Code-Reste entfernen (Link in einem anderen Browser geöffnet: Code bleibt sonst stehen).
      if (readConfirmReturn()) cleanConfirmUrl();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [client]);

  // Stabil halten: Das Sitzungsobjekt wechselt bei jeder Rückkehr in den Tab und bei jeder Token-Erneuerung. Hinge
  // signOut daran, bauten die Vor-Ort-Bereiche ihren Server-Zugriff jedes Mal neu und lüden mitten im Formular neu.
  const signOut = useCallback(async () => {
    // Liegt in einer Handy-Ansicht dieser App noch etwas nur auf diesem Gerät (wartend/angefangen): vorher nachfragen —
    // auch wenn gerade das Dashboard offen ist.
    const { data } = await client.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!(await confirmLogout(app.id, data.session?.user.id))) return;
    // Nur dieses Gerät/diesen Browser abmelden. Ohne scope meldet Supabase ÜBERALL ab — dann flöge auch die
    // Handy-App des Nutzers raus (spätestens bei der nächsten Token-Erneuerung).
    await client.auth.signOut({ scope: 'local' });
  }, [client, app.id]);

  const value = useMemo<AppAuthValue>(
    () => ({ app, client, session, loading, signOut, confirmReturn, dismissConfirm }),
    [app, client, session, loading, signOut, confirmReturn, dismissConfirm],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppAuth(): AppAuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppAuth außerhalb von AppAuthProvider');
  return v;
}
