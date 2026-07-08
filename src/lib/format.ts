// App-neutrale Formatierungs-Helfer (keine Domain-Imports).

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

/** Zahl im de-DE-Format, max. 1 Nachkommastelle — überall dieselbe Rundung. */
export function fmtNum(n: number | null | undefined): string {
  return typeof n === 'number' ? num.format(n) : '—';
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

/**
 * 'yyyy-mm-dd' aus <input type="date"> als LOKALE Mitternacht parsen.
 * new Date('yyyy-mm-dd') wäre UTC-Mitternacht — in DE 01:00/02:00 lokal,
 * wodurch Einsätze zwischen 00:00 und 02:00 aus Filtern fallen würden.
 */
export function parseLocalDate(input: string): Date {
  const [y, m, d] = input.split('-').map(Number);
  return new Date(y, m - 1, d);
}
