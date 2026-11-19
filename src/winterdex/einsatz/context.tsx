import { createContext, useContext, useEffect, useState } from 'react';
import type { EinsatzBackend } from './backend';
import { flushPending } from './send';
import { listPending, onPendingChanged, type Pending } from './store';

export interface EinsatzCtxValue {
  be: EinsatzBackend;
  userId: string;
  orgId: string;
  /** Adresse der Objektliste, z. B. /app/winterdex/einsatz */
  base: string;
  /** Adresse des Objekte-Bereichs (zum Anlegen), z. B. /app/winterdex/objekte */
  propertiesUrl: string;
}

export const EinsatzCtx = createContext<EinsatzCtxValue | null>(null);

export function useEinsatz(): EinsatzCtxValue {
  const v = useContext(EinsatzCtx);
  if (!v) throw new Error('useEinsatz außerhalb des Einsatz-Bereichs');
  return v;
}

/**
 * Wartende Einsätze (ohne Netz erfasst): Liste für die Anzeige + automatisches Nachsenden —
 * beim Öffnen, sobald das Gerät wieder online meldet, beim Zurückkehren in den Tab und jede Minute.
 */
export function usePendingSync(): { pending: Pending[]; loaded: boolean; sending: boolean; sendNow: () => void } {
  const { be, userId } = useEinsatz();
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void listPending(userId).then((p) => {
        if (!alive) return;
        setPending(p);
        setLoaded(true);
      });
    };
    const flush = () => {
      if (document.visibilityState !== 'visible') return;
      void flushPending(be, userId).then(read, read);
    };
    read();
    flush();
    const off = onPendingChanged(read);
    const t = setInterval(flush, 60000);
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      alive = false;
      off();
      clearInterval(t);
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [be, userId]);

  const sendNow = () => {
    setSending(true);
    void flushPending(be, userId)
      .then(() => listPending(userId))
      .then(setPending)
      .finally(() => setSending(false));
  };

  return { pending, loaded, sending, sendNow };
}
