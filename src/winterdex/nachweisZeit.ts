// Uhrzeiten im Nachweis (seit 26.11.2026, Tagescheck Fund 31): Fahrt-Detail, Karte, Zeitleiste, Straßenverlauf und die
// PDFs zeigen IMMER die Ortszeit des Betriebs — nie die Zeitzone des Geräts, auf dem jemand den Bericht erstellt
// (Laptop im Urlaub, PC auf UTC). Alle drei Länder des Betriebs (AT/DE/CH) haben dieselben Regeln (MEZ/MESZ); die
// Zone folgt trotzdem dem Land, damit der Bericht sie richtig benennt. Excel-Export rechnet ebenso fest (Europe/Berlin).
// Reine Rechnung — getestet in tests/bericht-2611.test.mjs.

export type NachweisLand = 'AT' | 'DE' | 'CH';

export const NACHWEIS_TZ: Record<NachweisLand, string> = {
  AT: 'Europe/Vienna',
  DE: 'Europe/Berlin',
  CH: 'Europe/Zurich',
};
/** Ohne bekanntes Land (Betrieb noch nicht geladen, Beispieldaten): Wien — gleiche Regeln wie Berlin/Zürich. */
export const STANDARD_TZ = 'Europe/Vienna';

const LAND_NAME: Record<NachweisLand, string> = { AT: 'Österreich', DE: 'Deutschland', CH: 'Schweiz' };

/** Zeitzone für Nachweise eines Betriebs (Land AT/DE/CH), sonst Wien. */
export function nachweisZone(land?: string | null): string {
  return land && land in NACHWEIS_TZ ? NACHWEIS_TZ[land as NachweisLand] : STANDARD_TZ;
}

/** Versatz zu UTC in Minuten zu einem Zeitpunkt (z. B. 60 = MEZ, 120 = MESZ); NaN bei unbekannter Zone. */
export function utcVersatzMin(timeZone: string, ms: number): number {
  try {
    const t: Record<string, number> = {};
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') t[p.type] = Number(p.value);
    const alsUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour % 24, t.minute, t.second);
    return Math.round((alsUtc - Math.floor(ms / 1000) * 1000) / 60000);
  } catch {
    return NaN;
  }
}

function versatzText(min: number): string {
  if (min === 60) return 'MEZ = UTC+1';
  if (min === 120) return 'MESZ = UTC+2';
  if (!Number.isFinite(min)) return '';
  const h = Math.trunc(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return `UTC${min < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/**
 * Hinweis für den Bericht: „Alle Uhrzeiten in Ortszeit Österreich (Europe/Vienna, MEZ = UTC+1)“. Mehrere Zeitpunkte
 * (Beginn/Ende) über eine Zeitumstellung → „MESZ = UTC+2 bzw. MEZ = UTC+1“.
 */
export function zonenHinweis(timeZone: string, land: string | null | undefined, zeitpunkte: readonly number[]): string {
  const name = land && land in LAND_NAME ? LAND_NAME[land as NachweisLand] : null;
  const versatz = [...new Set(zeitpunkte.filter(Number.isFinite).map((ms) => versatzText(utcVersatzMin(timeZone, ms))))].filter(Boolean);
  return `Alle Uhrzeiten in Ortszeit${name ? ` ${name}` : ''} (${timeZone}${versatz.length ? `, ${versatz.join(' bzw. ')}` : ''})`;
}
