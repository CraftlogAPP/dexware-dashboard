// Kontext von „Vor Ort“ (SchutzDex): Server-Zugriff, Betrieb, Adressen — und die Warteschlange der Nachweise
// (automatisches Nachsenden). Den Kontext füllt Scope.tsx (angemeldet) bzw. demo.tsx (Beispieldaten).
import { createContext, useContext, useEffect, useState } from 'react';
import type { SdBackend } from './backend';
import { flushPending, listPending, onPendingChanged, type Pending } from './queue';

export interface SdCtxValue {
  be: SdBackend;
  userId: string;
  orgId: string;
  orgName: string;
  email: string | null;
  /** Adresse der Handy-Ansicht, z. B. /app/schutzdex/vor-ort */
  base: string;
  /** Adresse des Dashboards, z. B. /app/schutzdex */
  dashboardUrl: string;
  signOut: () => void;
}

export const SdCtx = createContext<SdCtxValue | null>(null);

export function useSd(): SdCtxValue {
  const v = useContext(SdCtx);
  if (!v) throw new Error('useSd außerhalb von „Vor Ort“');
  return v;
}

/**
 * Wartende Nachweise (ohne Netz unterschrieben): Liste für die Anzeige + automatisches Nachsenden — beim Öffnen,
 * sobald das Gerät wieder online meldet, beim Zurückkehren in den Tab und jede Minute (wie in der App).
 */
export function usePendingSync(): { pending: Pending[]; loaded: boolean; sending: boolean; sendNow: () => void } {
  const { be, userId } = useSd();
  const [pending, setPending] = useState<Pending[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);

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

// --- „Unterwiesen durch“: je Konto auf diesem Gerät gemerkt (wie loadTrainerName/saveTrainerName in der App) -------
const trainerKey = (userId: string) => `dexware-schutzdex-unterweiser:${userId}`;

export function loadTrainer(userId: string): string {
  try {
    return localStorage.getItem(trainerKey(userId)) ?? '';
  } catch {
    return '';
  }
}

export function saveTrainer(userId: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  try {
    localStorage.setItem(trainerKey(userId), n);
  } catch {
    /* nur Komfort */
  }
}
