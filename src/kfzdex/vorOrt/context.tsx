// Kontext von „Vor Ort“ (KfzDex): Server-Zugriff, Betrieb, Rolle, Adressen — und die Warteschlange der Nachweise
// (automatisches Nachsenden). Den Kontext füllt Scope.tsx (angemeldet) bzw. demo.tsx (Beispieldaten).
import { createContext, useContext, useEffect, useState } from 'react';
import type { Driver, Vehicle } from '../types';
import type { Fleet, KfzBackend } from './backend';
import { flushProofs, listProofs, onProofsChanged, type Proof } from './queue';
import { dueBump, newerDay } from './rows';

export interface KfzCtxValue {
  be: KfzBackend;
  userId: string;
  orgId: string;
  orgName: string;
  email: string | null;
  /** Inhaber des Betriebs? */
  owner: boolean;
  /** Adresse der Handy-Ansicht, z. B. /app/kfzdex/vor-ort */
  base: string;
  /** Adresse des Dashboards, z. B. /app/kfzdex */
  dashboardUrl: string;
  signOut: () => void;
}

export const KfzCtx = createContext<KfzCtxValue | null>(null);

export function useKfz(): KfzCtxValue {
  const v = useContext(KfzCtx);
  if (!v) throw new Error('useKfz außerhalb von „Vor Ort“');
  return v;
}

/**
 * Wartende Nachweise (ohne Netz erfasst oder Frist noch offen): Liste für die Anzeige + automatisches Nachsenden —
 * beim Öffnen, sobald das Gerät wieder online meldet, beim Zurückkehren in den Tab und jede Minute.
 */
export function useProofSync(): { waiting: Proof[]; sending: boolean; sendNow: () => void } {
  const { be, userId } = useKfz();
  const [waiting, setWaiting] = useState<Proof[]>(() => listProofs(userId));
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const read = () => setWaiting(listProofs(userId));
    const flush = () => {
      if (document.visibilityState !== 'visible') return;
      void flushProofs(be, userId).then(read, read);
    };
    read();
    flush();
    const off = onProofsChanged(read);
    const t = setInterval(flush, 60000);
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      off();
      clearInterval(t);
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [be, userId]);

  const sendNow = () => {
    setSending(true);
    void flushProofs(be, userId).finally(() => {
      setWaiting(listProofs(userId));
      setSending(false);
    });
  };

  return { waiting, sending, sendNow };
}

/**
 * Wartende Nachweise zählen für die Fristen schon mit (wie in der App): eine bestandene UVV bzw. eine Kontrolle zieht
 * das Datum am Fahrzeug bzw. Fahrer vor, bis der Server so weit ist.
 */
export function withWaiting(fleet: Fleet, waiting: Proof[]): Fleet {
  if (waiting.length === 0) return fleet;
  const bumps = waiting.map((p) => dueBump(p.kind, p.row)).filter((b) => b !== null);
  const day = (table: 'vehicle' | 'driver', id: string, cur: string | null) =>
    bumps.filter((b) => b.table === table && b.id === id).reduce<string | null>((acc, b) => newerDay(acc, b.date), cur);
  return {
    vehicles: fleet.vehicles.map((v): Vehicle => ({ ...v, last_uvv: day('vehicle', v.id, v.last_uvv) })),
    drivers: fleet.drivers.map((d): Driver => ({ ...d, last_check: day('driver', d.id, d.last_check) })),
  };
}
