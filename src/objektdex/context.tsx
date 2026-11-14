import { createContext, useContext, type ReactNode } from 'react';
import type { OdData } from './data';

export interface OdContextValue {
  data: OdData;
  orgName: string;
  role: 'owner' | 'worker';
  /** Beispieldaten (Dev-Vorschau) — nichts wird gespeichert */
  demo: boolean;
  /** Basis-Pfad des Bereichs, z. B. /app/objektdex */
  base: string;
}

const Ctx = createContext<OdContextValue | null>(null);

export function OdProvider({ value, children }: { value: OdContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOd(): OdContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOd außerhalb von OdProvider');
  return v;
}
