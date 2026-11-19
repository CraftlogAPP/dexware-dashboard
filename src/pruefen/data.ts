// Standorte, Einheiten, Fälligkeit und offene Mängel laden. Der letzte Stand wird je Konto im Browser gemerkt:
// Ist das Netz weg (Keller, Halle), lässt sich trotzdem eine Prüfung erfassen — mit dem Stand vom letzten Laden.

import { isNetworkError, type OpenDefect, type PruefBackend, type Site, type Unit } from './backend';
import type { InspMeta } from './due';
import type { Pending } from './store';

export interface PruefData {
  sites: Site[];
  units: Unit[];
  meta: InspMeta[];
  openDefects: OpenDefect[];
  /** true = ohne Netz aus dem Gerätespeicher geladen (Stand vom letzten Laden) */
  offline: boolean;
}

const cacheKey = (app: string, userId: string) => `dexware-${app}-vorort:${userId}`;

export async function loadPruefData(be: PruefBackend, app: string, userId: string): Promise<PruefData> {
  try {
    const [sites, units, meta, openDefects] = await Promise.all([
      be.listSites(),
      be.listUnits(),
      be.listInspectionMeta(),
      be.listOpenDefects(),
    ]);
    try {
      localStorage.setItem(cacheKey(app, userId), JSON.stringify({ sites, units, meta, openDefects }));
    } catch {
      /* nur Komfort */
    }
    return { sites, units, meta, openDefects, offline: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    let cached: Omit<PruefData, 'offline'> | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey(app, userId)) ?? 'null') as Omit<PruefData, 'offline'> | null;
    } catch {
      cached = null;
    }
    if (!cached?.sites || !cached.units) throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
    return { sites: cached.sites, units: cached.units, meta: cached.meta ?? [], openDefects: cached.openDefects ?? [], offline: true };
  }
}

// --- „Geprüft von“, Qualifikation und Unterschrift: je Konto auf diesem Gerät gemerkt (wie in der App) ---------

export interface InspectorPrefs {
  name: string;
  qualification: string;
  /** PNG-Daten-URI oder '' */
  signature: string;
}

const prefsKey = (app: string, userId: string) => `dexware-${app}-pruefer:${userId}`;

export function getPrefs(app: string, userId: string): InspectorPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(prefsKey(app, userId)) ?? 'null') as Partial<InspectorPrefs> | null;
    return {
      name: typeof v?.name === 'string' ? v.name : '',
      qualification: typeof v?.qualification === 'string' ? v.qualification : '',
      signature: typeof v?.signature === 'string' ? v.signature : '',
    };
  } catch {
    return { name: '', qualification: '', signature: '' };
  }
}

export function setPrefs(app: string, userId: string, patch: Partial<InspectorPrefs>): void {
  try {
    localStorage.setItem(prefsKey(app, userId), JSON.stringify({ ...getPrefs(app, userId), ...patch }));
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

/**
 * Wartende (noch nicht übertragene) Prüfungen zählen für die Fälligkeit schon mit.
 * @param unitFk Spalte, an der die Fälligkeit hängt — dueFkOf(cfg): die Einheit, im Orts-Modus der Ort.
 */
export function withPendingMeta(meta: InspMeta[], pending: Pending[], unitFk: string): InspMeta[] {
  return [
    ...meta,
    ...pending.map((p) => ({
      unitId: String(p.inspection[unitFk]),
      type: p.inspection.type,
      startedAt: p.inspection.started_at,
      canceled: false,
    })),
  ];
}
