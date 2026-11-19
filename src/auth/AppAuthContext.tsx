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

interface AppAuthValue {
  app: AppConfig;
  client: SupabaseClient;
  session: Session | null;
  /** true solange die persistierte Session noch geladen wird */
  loading: boolean;
  signOut: () => Promise<void>;
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

  useEffect(() => {
    let mounted = true;
    client.auth.getSession().then(({ data }) => {
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
    // Liegt in der Handy-Ansicht noch etwas nur auf diesem Gerät (wartend/angefangen): vorher nachfragen.
    if (!(await confirmLogout())) return;
    await client.auth.signOut();
  }, [client]);

  const value = useMemo<AppAuthValue>(
    () => ({ app, client, session, loading, signOut }),
    [app, client, session, loading, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppAuth(): AppAuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppAuth außerhalb von AppAuthProvider');
  return v;
}
