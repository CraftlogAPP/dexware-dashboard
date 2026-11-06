// Brücke für die Kopie von lib/recht.ts aus der App: dieselben Namen, Werte aus den Portal-Typen.
// Die App arbeitet mit camelCase-Objekten — Portal-Zeilen (snake_case) über toRechtAsset/toRechtSite umsetzen.
import type { Asset as PortalAsset, Site as PortalSite } from '../types';

export { addMonths, calendarDaysUntil, DUE_SOON_DAYS, fmtDay as fmtDate } from '../types';
export type { DueInfo } from '../types';

export type Land = 'DE' | 'AT' | 'CH';

export interface Asset {
  kind: string;
  powerKw?: string;
  installDate?: string;
}

export interface Site {
  units?: number;
}

export interface Inspection {
  itemId: string;
  startedAt: string;
  canceled: boolean;
  measurements?: Record<string, string>;
}

export function toRechtAsset(a: Pick<PortalAsset, 'kind' | 'power_kw' | 'install_date'>): Asset {
  return { kind: a.kind, powerKw: a.power_kw ?? undefined, installDate: a.install_date ?? undefined };
}

export function toRechtSite(s: (Pick<PortalSite, 'id'> & { units?: number | null }) | undefined): Site | undefined {
  return s ? { units: s.units ?? undefined } : undefined;
}
