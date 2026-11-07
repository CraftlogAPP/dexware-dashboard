// Angebote nachfassen — Daten fürs Portal (Seite „Nachfassen“ und Kachel auf Start). Logik: ./nachfassLogik.ts (Kopie
// der App). Merker kommen aus quote_follow_up (gemeinsam mit App/Team); fehlt die Tabelle, ist marks = null → nur ansehen.

import type { GeldData, StoredInvoice } from './api';
import { addDaysYmd } from './invoice';
import { DEFAULT_FOLLOW_UP_DAYS, FOLLOW_UP_DAY_CHOICES, type FollowUpMarks } from './nachfassLogik';
import { localDay } from './util';

/** So weit zurück werden Angebote/Rechnungen geladen (Gewinnquote 90 Tage, offene Angebote sind selten älter) */
const LOOKBACK_DAYS = 400;

export interface NachfassDaten {
  /** Angebote + Rechnungen (für „angenommen“ über data.fromQuote / „Laut Angebot …“) */
  all: StoredInvoice[];
  /** null = Tabelle quote_follow_up fehlt (NACHTRAG-ANGEBOTE-2026-11-07.sql) → keine Merker */
  marks: FollowUpMarks | null;
}

/**
 * Belege vollständig: alle mit Belegdatum in den letzten 400 Tagen (seitenweise) + die neuesten 500 (dort stecken die
 * Entwürfe — ein Rechnungsentwurf „aus Angebot“ zählt wie in der App schon als angenommen). Doppelte zusammengeführt.
 */
export async function loadNachfassDaten(geld: GeldData, softMarks = false): Promise<NachfassDaten> {
  const today = localDay();
  const [ranged, latest, marks] = await Promise.all([
    geld.invoices({ from: addDaysYmd(today, -LOOKBACK_DAYS), to: addDaysYmd(today, 1) }),
    geld.invoices(),
    softMarks ? geld.followUpMarks().catch(() => null) : geld.followUpMarks(),
  ]);
  const byId = new Map<string, StoredInvoice>();
  for (const x of [...ranged, ...latest]) byId.set(x.id, x);
  return { all: [...byId.values()], marks };
}

// Frist „Nachfassen nach … Tagen“: in der App eine Geräte-Einstellung — im Portal je Browser
const K_DAYS = 'idx-nachfassen-tage';
export function readFollowUpDays(): number {
  try {
    const n = Number(localStorage.getItem(K_DAYS));
    return (FOLLOW_UP_DAY_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_FOLLOW_UP_DAYS;
  } catch {
    return DEFAULT_FOLLOW_UP_DAYS;
  }
}
export function writeFollowUpDays(n: number): void {
  try {
    localStorage.setItem(K_DAYS, String(n));
  } catch {
    /* privates Fenster o. Ä. — dann gilt beim nächsten Mal wieder der Standard */
  }
}
