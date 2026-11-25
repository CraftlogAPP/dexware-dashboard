// App-neutrale Formatierungs-Helfer (keine Domain-Imports).

// Ohne timeZone: Ortszeit des Geräts (wie bisher überall im Dashboard). Nachweise (WinterDex-Fahrt, PDF) geben seit
// 26.11.2026 die Zeitzone des Betriebs fest mit (winterdex/nachweisZeit.ts) — sonst verschöbe ein Laptop im Urlaub
// oder ein PC auf UTC alle Uhrzeiten im Nachweis.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFuer(art: 'datum' | 'zeit', timeZone?: string): Intl.DateTimeFormat {
  const k = `${art}|${timeZone ?? ''}`;
  let f = fmtCache.get(k);
  if (!f) {
    const tz = timeZone ? { timeZone } : {};
    f =
      art === 'datum'
        ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', ...tz })
        : new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...tz });
    fmtCache.set(k, f);
  }
  return f;
}

export function fmtDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return fmtFuer('datum', timeZone).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${fmtFuer('datum', timeZone).format(d)}, ${fmtFuer('zeit', timeZone).format(d)} Uhr`;
}

export function fmtTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return `${fmtFuer('zeit', timeZone).format(new Date(iso))} Uhr`;
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

/** Heutiges LOKALES Datum als yyyy-mm-dd (toISOString wäre UTC → zwischen 0 und 1/2 Uhr „gestern“). */
export function todayLocalISO(): string {
  return toInputDate(new Date());
}

/** Monate auf ein yyyy-mm-dd addieren, Monatsende gekappt (31.08. + 6 = 28./29.02.). */
export function addMonthsLocalISO(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(y, m - 1 + months, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return toInputDate(t);
}
