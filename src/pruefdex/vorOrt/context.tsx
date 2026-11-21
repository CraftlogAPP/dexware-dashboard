// Kontext von „Vor Ort“ (PrüfDex): Server-Zugriff, Betrieb, Adressen — und die Warteschlange der Prüfungen
// (automatisches Nachsenden). Den Kontext füllt Scope.tsx (angemeldet) bzw. demo.tsx (Beispieldaten).
import { createContext, useContext, useEffect, useState } from 'react';
import type { Device } from '../types';
import type { PdBackend } from './backend';
import { flushPending, listPending, onPendingChanged, type Pending } from './queue';

export interface PdCtxValue {
  be: PdBackend;
  userId: string;
  orgId: string;
  orgName: string;
  email: string | null;
  /** Prüfername aus den Betriebsdaten (Vorbelegung, solange auf diesem Gerät noch kein eigener Name gemerkt ist) */
  orgInspector: string;
  /** Inhaber des Betriebs? */
  owner: boolean;
  /** Adresse der Handy-Ansicht, z. B. /app/pruefdex/vor-ort */
  base: string;
  /** Adresse des Dashboards, z. B. /app/pruefdex */
  dashboardUrl: string;
  signOut: () => void;
}

export const PdCtx = createContext<PdCtxValue | null>(null);

export function usePd(): PdCtxValue {
  const v = useContext(PdCtx);
  if (!v) throw new Error('usePd außerhalb von „Vor Ort“');
  return v;
}

/**
 * Wartende Prüfungen (ohne Netz erfasst): Liste für die Anzeige + automatisches Nachsenden — beim Öffnen, sobald
 * das Gerät wieder online meldet, beim Zurückkehren in den Tab und jede Minute.
 */
export function usePendingSync(): { pending: Pending[]; loaded: boolean; sending: boolean; sendNow: () => void } {
  const { be, userId } = usePd();
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
    void flushPending(be, userId, { force: true })
      .then(() => listPending(userId))
      .then(setPending)
      .finally(() => setSending(false));
  };

  return { pending, loaded, sending, sendNow };
}

/**
 * Wartende Prüfungen zählen für die Fristen schon mit (wie in der App): Die Frist des Geräts steht auf dem Wert der
 * wartenden Prüfung, bis der Server so weit ist. Dazu die Mangel-Markierung.
 */
export function withPending(devices: Device[], failed: string[], pending: Pending[]): { devices: Device[]; failed: Set<string> } {
  const set = new Set(failed);
  if (pending.length === 0) return { devices, failed: set };
  // jüngste wartende Prüfung je Gerät (die Liste ist nach Speicherzeit sortiert)
  const last = new Map<string, Pending>();
  for (const p of pending) last.set(p.inspection.device_id, p);
  for (const [id, p] of last) {
    if (p.inspection.result === 'failed') set.add(id);
    else set.delete(id);
  }
  return {
    devices: devices.map((d) => {
      const p = last.get(d.id);
      return p ? { ...d, next_due_date: p.inspection.next_due_date } : d;
    }),
    failed: set,
  };
}
