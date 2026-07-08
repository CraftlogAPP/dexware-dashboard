import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { getClient } from '../lib/supabaseClients';

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

  const value = useMemo<AppAuthValue>(
    () => ({
      app,
      client,
      session,
      loading,
      signOut: async () => {
        await client.auth.signOut();
      },
    }),
    [app, client, session, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppAuth(): AppAuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppAuth außerhalb von AppAuthProvider');
  return v;
}
