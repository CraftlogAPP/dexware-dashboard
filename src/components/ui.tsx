import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react';
import type { OperationAction } from '../winterdex/types';
import { ACTION_LABELS } from '../winterdex/types';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Still neu laden (ohne Ladekreis); bei Fehler bleiben die letzten Daten stehen. */
  refresh: () => void;
}

/** Kleiner Daten-Hook: lädt bei Mount/Dep-Änderung, mit Fehler + Reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  // Jede Neuladung (Deps/Reload) bekommt eine Nummer — ein spätes stilles Ergebnis überschreibt nie neuere Daten.
  const gen = useRef(0);

  useEffect(() => {
    let mounted = true;
    gen.current += 1;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (mounted) setData(d);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const refresh = useCallback(() => {
    const g = gen.current;
    fnRef.current().then(
      (d) => {
        if (gen.current === g) {
          setData(d);
          setError(null);
        }
      },
      () => {
        /* still: letzte Daten bleiben sichtbar, nächster Versuch beim nächsten Takt */
      },
    );
  }, []);
  return { data, loading, error, reload, refresh };
}

/**
 * Hält Seiten aktuell (Strecken, Einsätze): alle `ms` still neu laden, solange der Tab sichtbar ist,
 * und sofort beim Zurückwechseln in den Tab.
 */
export function useLiveRefresh(refreshers: Array<() => void>, ms = 30000) {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') refreshers.forEach((f) => f());
    };
    const t = setInterval(run, ms);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...refreshers]);
}

export function LoadGuard<T>({
  state,
  children,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (state.error) {
    return (
      <div>
        <div className="error-box">{state.error}</div>
        <button className="btn ghost small" onClick={state.reload}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (state.data == null) return null;
  return <>{children(state.data)}</>;
}

const ACTION_BADGE_CLASS: Record<OperationAction, string> = {
  cleared: 'badge external',
  gritted: 'badge amber',
  cleared_gritted: 'badge green',
  checked_no_action: 'badge',
};

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="badge green">aktiv</span>
  ) : (
    <span className="badge">pausiert</span>
  );
}

export function ActionBadge({
  action,
  canceled,
}: {
  action: OperationAction;
  canceled?: boolean;
}) {
  if (canceled) return <span className="badge red">Storniert</span>;
  return <span className={ACTION_BADGE_CLASS[action]}>{ACTION_LABELS[action]}</span>;
}
