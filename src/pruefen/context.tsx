import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PruefBackend } from './backend';
import type { PruefConfig } from './config';
import type { DueDateFn } from './due';
import { flushPending } from './send';
import { listPending, onPendingChanged, type Pending } from './store';

/** Vorhandene Dashboard-Seiten der App, die im Handy-Rahmen eingebunden werden (eine Quelle, nichts doppelt). */
export interface VorOrtPages {
  /** Liste der Prüfungen (Reiter „Prüfungen“) und eine einzelne Prüfung */
  inspections: ReactNode;
  inspectionDetail: ReactNode;
  /** Reiter „Mängel“ */
  defects: ReactNode;
  /** Standorte verwalten und ein einzelner Standort (Einheiten anlegen) */
  sites: ReactNode;
  siteDetail: ReactNode;
  /** Prüfbericht-PDF */
  report: ReactNode;
  team: ReactNode;
  abo: ReactNode;
}

export interface PruefCtxValue {
  cfg: PruefConfig;
  be: PruefBackend;
  userId: string;
  orgId: string;
  orgName: string;
  email: string | null;
  /** Inhaber des Betriebs? Nur er darf Standorte und Einheiten anlegen (wie in der App). */
  owner: boolean;
  /** Frist der Fälligkeits-Prüfart dieses Betriebs in Tagen */
  intervalDays: number;
  /** Nur Apps mit eigener Frist-Regel (cfg.dueDate, HebeDex): Fälligkeitstag für diesen Betrieb. Sonst undefined. */
  dueDate?: DueDateFn;
  /** Adresse der Handy-Ansicht, z. B. /app/leiterdex/vor-ort */
  base: string;
  /** Adresse des Dashboards, z. B. /app/leiterdex */
  dashboardUrl: string;
  signOut: () => void;
}

export const PruefCtx = createContext<PruefCtxValue | null>(null);

export function usePruef(): PruefCtxValue {
  const v = useContext(PruefCtx);
  if (!v) throw new Error('usePruef außerhalb von „Vor Ort“');
  return v;
}

/**
 * Wartende Prüfungen (ohne Netz erfasst oder nur teilweise übertragen): Liste für die Anzeige + automatisches
 * Nachsenden — beim Öffnen, sobald das Gerät wieder online meldet, beim Zurückkehren in den Tab und jede Minute.
 */
export function usePendingSync(): { pending: Pending[]; loaded: boolean; sending: boolean; sendNow: () => void } {
  const { be, cfg, userId } = usePruef();
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void listPending(cfg.appId, userId).then((p) => {
        if (!alive) return;
        setPending(p);
        setLoaded(true);
      });
    };
    const flush = () => {
      if (document.visibilityState !== 'visible') return;
      void flushPending(be, cfg, userId).then(read, read);
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
  }, [be, cfg, userId]);

  const sendNow = () => {
    setSending(true);
    void flushPending(be, cfg, userId)
      .then(() => listPending(cfg.appId, userId))
      .then(setPending)
      .finally(() => setSending(false));
  };

  return { pending, loaded, sending, sendNow };
}
