// WinterDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im winterdex-Ordner).

import { fmtNum } from '../lib/format';
import type { WeatherSnapshot } from './types';

/** Kompakte Wetterzeile, gleiche Logik wie mobile lib/weather.ts */
export function weatherLabel(w: WeatherSnapshot | null | undefined): string {
  if (!w) return '—';
  const parts: string[] = [];
  if (typeof w.temp_c === 'number') parts.push(`${fmtNum(w.temp_c)} °C`);
  if (typeof w.snowfall_cm === 'number' && w.snowfall_cm > 0) {
    parts.push(`Schneefall ${fmtNum(w.snowfall_cm)} cm`);
  } else if (typeof w.precip_mm === 'number' && w.precip_mm > 0) {
    parts.push(`Niederschlag ${fmtNum(w.precip_mm)} mm`);
  }
  if (typeof w.wind_kmh === 'number' && w.wind_kmh >= 20) {
    parts.push(`Wind ${fmtNum(w.wind_kmh)} km/h`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

/** Streumittel-Label, einheitlich in Listen, Detail und PDF. */
export function gritLabel(material: string | null, amount: string | null): string {
  if (!material) return '—';
  return amount ? `${material} (${amount})` : material;
}

/**
 * Jüngster nicht-stornierter Einsatz je Objekt.
 * Erwartet ops absteigend nach started_at sortiert (so liefern die Queries).
 */
export function lastOpByProperty<T extends { property_id: string; canceled: boolean }>(
  ops: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const op of ops) {
    if (op.canceled) continue;
    if (!map.has(op.property_id)) map.set(op.property_id, op);
  }
  return map;
}

/** Schnelle Namens-Auflösung property_id → Name für Tabellen. */
export function propertyNameMap(props: { id: string; name: string }[]): Map<string, string> {
  return new Map(props.map((p) => [p.id, p.name]));
}
