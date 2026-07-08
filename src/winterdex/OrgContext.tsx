import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAppAuth } from '../auth/AppAuthContext';
import { fetchOrgContext, type OrgContext as OrgCtxData } from './api';

interface OrgState {
  data: OrgCtxData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { client, session } = useAppAuth();
  const [data, setData] = useState<OrgCtxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchOrgContext(client)
      .then((ctx) => {
        if (mounted) setData(ctx);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [client, session?.user.id, tick]);

  return (
    <Ctx.Provider value={{ data, loading, error, reload }}>{children}</Ctx.Provider>
  );
}

export function useOrg(): OrgState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOrg außerhalb von OrgProvider');
  return v;
}
