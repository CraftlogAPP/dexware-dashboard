import { createContext, useContext, type ReactNode } from 'react';
import type { OdData } from './data';
import type { OdRole } from './types';
import type { WdQuelle } from './uebernahme';
import type { WdNachweisQuelle } from './jahresnachweis';

export interface OdContextValue {
  data: OdData;
  orgName: string;
  /** owner = Inhaber · admin = Verwalter (Team-Code, Mitarbeiter entfernen) · worker = Mitarbeiter */
  role: OdRole;
  /** Beispieldaten (Dev-Vorschau) — nichts wird gespeichert */
  demo: boolean;
  /** Basis-Pfad des Bereichs, z. B. /app/objektdex */
  base: string;
  /** Nur Beispieldaten: WinterDex-Betrieb für „Aus WinterDex übernehmen“ (echt: Anmeldung bei WinterDex) */
  winterdexDemo?: WdQuelle;
  /** Nur Beispieldaten: WinterDex-Betrieb mit Einsätzen für den Ganzjahres-Nachweis (echt: Anmeldung bei WinterDex) */
  winterdexNachweisDemo?: WdNachweisQuelle;
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
