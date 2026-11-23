// Werte aus Import-Listen, die mehrere Apps brauchen (PrüfDex-Geräte, KfzDex-Fuhrpark): Kalendertag als ISO-Datum,
// Intervall in Monaten, Text-oder-leer. Ergänzt lib/tableImport.ts (Lesen, Zuordnen, Plan) — reine Logik ohne React.

import { cap, headerKey, oneLine, parseDay } from './tableImport';
import { norm } from '../installateurdex/importer';

/** Text einer Zelle in einer Zeile, höchstens n Zeichen — leer = null (wie orNull im Formular). */
export function textOrNull(raw: string, n: number): string | null {
  const v = cap(oneLine(raw), n);
  return v ? v : null;
}

/** Kalendertag aus einer Zelle als „JJJJ-MM-TT“ (wie das Datumsfeld im Formular) — null = kein Datum. */
export function dayIso(raw: string): string | null {
  const d = parseDay(raw);
  return d ? `${d.slice(6)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : null;
}

/** „JJJJ-MM-TT“ → „TT.MM.JJJJ“ für Hinweise */
export const dayText = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Wörter für Intervalle (Vergleichsform headerKey) */
const INTERVAL_WORDS: Record<string, number> = {
  monatlich: 1,
  vierteljaehrlich: 3,
  quartalsweise: 3,
  quartal: 3,
  vierteljahr: 3,
  halbjaehrlich: 6,
  halbjahr: 6,
  halbesjahr: 6,
  jaehrlich: 12,
  jahr: 12,
  einjahr: 12,
  einmaljaehrlich: 12,
  zweijaehrlich: 24,
  allezweijahre: 24,
  zweijahre: 24,
  dreijaehrlich: 36,
  alledreijahre: 36,
  vierjaehrlich: 48,
  allevierjahre: 48,
};

/**
 * Intervall in Monaten aus einer Zelle: „6“, „6 Monate“, „12 M“, „1 Jahr“, „2 Jahre“, „1,5 Jahre“, „jährlich“,
 * „halbjährlich“, „24 Monate (Büro)“. Ganze Monate von 1 bis `max`; sonst null (nicht erkannt).
 */
export function monthsFromCell(raw: string, max = 120): number | null {
  const t = norm(oneLine(raw));
  if (!t) return null;
  const word = INTERVAL_WORDS[headerKey(t)];
  if (word) return word;
  if (/woche|tag/.test(t)) return null;
  const m = /^(?:alle\s*)?(\d+(?:[.,]\d+)?)\s*(monat(?:e|en|lich)?|mon|mo|m|jahr(?:e|en)?|j|a)?\.?(?![a-z0-9])/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.')) * (m[2] && /^(j|a)/.test(m[2]) ? 12 : 1);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}
