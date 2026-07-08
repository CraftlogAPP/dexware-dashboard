import { useEffect, useState, type DependencyList, type ReactNode } from 'react';
import type { OperationAction } from '../winterdex/types';
import { ACTION_LABELS } from '../winterdex/types';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Kleiner Daten-Hook: lädt bei Mount/Dep-Änderung, mit Fehler + Reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
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

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
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
