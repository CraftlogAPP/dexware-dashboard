import { createContext, useContext, type ReactNode } from 'react';
import type { OdData } from './data';
import type { OdRole } from './types';

export interface OdContextValue {
  data: OdData;
  orgName: string;
  /** owner = Inhaber · admin = Verwalter (Team-Code, Mitarbeiter entfernen) · worker = Mitarbeiter */
  role: OdRole;
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
