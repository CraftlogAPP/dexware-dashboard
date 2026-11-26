// WinterDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im winterdex-Ordner).

import { fmtNum } from '../lib/format';
import type { WeatherSnapshot } from './types';
import { wetterQuelle, wetterQuelleHtml } from './wetterQuelle';

/**
 * Namensnennung der Wetterdaten (Lizenz CC BY 4.0) — überall, wo Wetter steht: PDFs, Excel-Listen, Seiten. Wie die App.
 * Seit „Wetter staatlich“ (P8) gilt sie nur noch für alte bzw. Open-Meteo-Datensätze: Die Stellen unten nehmen
 * quelleFuer/quelleFuerHtml mit den gezeigten Momentwerten (nur alte Datensätze → genau dieser Text).
 */
export const WEATHER_SOURCE = 'Wetterdaten: Open-Meteo.com (CC BY 4.0)';
/** Dasselbe als HTML mit Links (für die Druck-/PDF-Ansichten). */
export const WEATHER_SOURCE_HTML =
  'Wetterdaten: <a href="https://open-meteo.com/">Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)';

/** Quellenzeile für die GEZEIGTEN Momentwerte (Herkunft je Datensatz aus weather.source, wetterQuelle.ts) */
export const quelleFuer = (ws: readonly unknown[] | unknown, zusatz = true): string => wetterQuelle(ws, WEATHER_SOURCE, zusatz);
/** Dasselbe als HTML mit Links (Druck-/PDF-Ansichten) */
export const quelleFuerHtml = (ws: readonly unknown[]): string => wetterQuelleHtml(ws, WEATHER_SOURCE_HTML);

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
