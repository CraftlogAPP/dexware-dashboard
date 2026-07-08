import type { WeatherSnapshot } from '../winterdex/types';

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateFmt.format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${dateFmt.format(d)}, ${timeFmt.format(d)} Uhr`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${timeFmt.format(new Date(iso))} Uhr`;
}

const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** Kompakte Wetterzeile, gleiche Logik wie mobile lib/weather.ts */
export function weatherLabel(w: WeatherSnapshot | null | undefined): string {
  if (!w) return '—';
  const parts: string[] = [];
  if (typeof w.temp_c === 'number') parts.push(`${num.format(w.temp_c)} °C`);
  if (typeof w.snowfall_cm === 'number' && w.snowfall_cm > 0) {
    parts.push(`Schneefall ${num.format(w.snowfall_cm)} cm`);
  } else if (typeof w.precip_mm === 'number' && w.precip_mm > 0) {
    parts.push(`Niederschlag ${num.format(w.precip_mm)} mm`);
  }
  if (typeof w.wind_kmh === 'number' && w.wind_kmh >= 20) {
    parts.push(`Wind ${num.format(w.wind_kmh)} km/h`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

export function gpsLabel(
  lat: number | null,
  lng: number | null,
  accuracy: number | null,
): string {
  if (lat == null || lng == null) return '—';
  const acc = accuracy != null ? ` (±${Math.round(accuracy)} m)` : '';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}${acc}`;
}

/** ISO-Datum (yyyy-mm-dd) für <input type="date"> */
export function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
