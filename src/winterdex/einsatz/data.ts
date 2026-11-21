// Objektliste + heutige Einsätze laden. Die Objektliste wird je Konto im Browser gemerkt: Ist die Seite
// schon offen und das Netz weg (Funkloch am Objekt), lässt sich trotzdem ein Einsatz erfassen.

import { isNetworkError, type EinsatzBackend, type TodayOp } from './backend';
import type { Property } from '../types';

// Je Konto UND Betrieb: Nach einem Betriebswechsel stünden ohne Netz sonst die Objekte des alten Betriebs da — ein dort
// erfasster Einsatz würde vom Server abgelehnt.
const key = (userId: string, orgId: string) => `dexware-winterdex-objekte:${userId}:${orgId}`;

export interface EinsatzData {
  properties: Property[];
  todayOps: TodayOp[];
  /** true = ohne Netz aus dem Gerätespeicher geladen (Stand vom letzten Laden) */
  offline: boolean;
}

export async function loadEinsatzData(be: EinsatzBackend, userId: string, orgId: string): Promise<EinsatzData> {
  try {
    const [all, todayOps] = await Promise.all([be.listProperties(), be.listTodayOps()]);
    // Nur Objekte des eigenen Betriebs (der Server liefert ohnehin nur diese — doppelt hält besser)
    const properties = all.filter((p) => !p.org_id || p.org_id === orgId);
    try {
      localStorage.setItem(key(userId, orgId), JSON.stringify(properties));
    } catch {
      /* nur Komfort */
    }
    return { properties, todayOps, offline: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    let cached: Property[] | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(key(userId, orgId)) ?? 'null') as Property[] | null;
    } catch {
      cached = null;
    }
    if (!cached) throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
    return { properties: cached, todayOps: [], offline: true };
  }
}

const performerKey = (userId: string) => `dexware-winterdex-performer:${userId}`;

/** „Dokumentiert von“ je Konto auf diesem Gerät merken (wie in der App). */
export function getPerformerName(userId: string): string {
  try {
    return localStorage.getItem(performerKey(userId)) ?? '';
  } catch {
    return '';
  }
}
export function setPerformerName(userId: string, name: string): void {
  try {
    localStorage.setItem(performerKey(userId), name);
  } catch {
    /* nur Komfort */
  }
}

export function newId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Ersatz für ältere Browser (UUID v4)
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
