// Streumittel ausblenden (Kundenwunsch Zimmerei Hoiß, 26.11.2026: „Der Chef sollte Optionen wie Splitt oder Sole, wenn man
// sie nicht benutzt, in den Einstellungen ausschalten können“). Gilt für den ganzen Betrieb: Inhaber und Verwalter schalten
// auf der Team-Seite (StreumittelKarte.tsx) um, App, Dashboard und Außendienst zeigen beim Erfassen nur die aktiven.
// Server (Vertrag v3, eigene Server-Runde): Spalte org.streumittel_aus text[] (Standard leer) und RPC
// set_streumittel_aus(p_org, p_aus) → {ok, aus} bzw. {fehler: 'keine_rechte' | 'unbekannt' | 'alle_aus'}. Gelesen wird über
// die vorhandene org-Abfrage (fetchOrgContext: select('*')).
// Schlüssel = die gespeicherten Werte von grit_material, GENAU wie in der App (mobile/src/types.ts GRIT_MATERIALS) und im
// Dashboard (einsatz/amount.ts GRIT_MATERIALS) — Test: tests/streumittel.test.mjs.
// „Sonstiges“ bleibt immer da (immer erlaubt), ausblendbar sind nur die vier echten Streumittel, mindestens eines davon bleibt an.
// Fehlt die Spalte (Server-Update noch nicht eingespielt) → alle Streumittel wie bisher, Einstellung nur mit Hinweis.
// Schon gespeicherte Einsätze zeigen ihr Streumittel unverändert — betroffen ist nur die Auswahl beim Erfassen.
//
// Bewusst ohne Laufzeit-Imports: Node-Tests laden die Datei direkt.

export const STREUMITTEL = ['Splitt', 'Salz', 'Sole', 'Granulat', 'Sonstiges'] as const;
export type Streumittel = (typeof STREUMITTEL)[number];

/** Bleibt immer in der Auswahl (für alles, was nicht in der Liste steht). */
export const IMMER_DA: Streumittel = 'Sonstiges';

/** Die vier echten Streumittel — nur die lassen sich ausblenden. */
export const AUSBLENDBAR: readonly Streumittel[] = STREUMITTEL.filter((m) => m !== IMMER_DA);

const ausblendbar = (m: unknown): m is Streumittel => typeof m === 'string' && (AUSBLENDBAR as readonly string[]).includes(m);

/**
 * org.streumittel_aus → ausgeblendete Streumittel (Reihenfolge wie die Auswahl, unbekannte Werte und „Sonstiges“ fallen weg).
 * null = die Spalte fehlt noch (Server-Update nicht eingespielt) bzw. kein Betrieb geladen → alles wie bisher.
 */
export function streumittelAusVon(org: unknown): Streumittel[] | null {
  if (!org || typeof org !== 'object' || !('streumittel_aus' in org)) return null;
  const v = (org as { streumittel_aus?: unknown }).streumittel_aus;
  if (!Array.isArray(v)) return [];
  return AUSBLENDBAR.filter((m) => v.includes(m));
}

/**
 * Streumittel-Auswahl beim Erfassen (Einsatz am Objekt, Abschluss einer Fahrt): nur die aktiven, Reihenfolge wie immer,
 * „Sonstiges“ immer. Der gerade gewählte Wert bleibt sichtbar (z. B. aus einem angefangenen Einsatz von vor der Änderung) —
 * nie eine Auswahl, die man nicht sieht. Alle vier ausgeblendet (lässt der Server nicht zu) → alle, wie bisher.
 */
export function streumittelZurAuswahl(aus: readonly string[] | null | undefined, gewaehlt?: string | null): Streumittel[] {
  const weg = new Set((aus ?? []).filter(ausblendbar));
  if (AUSBLENDBAR.every((m) => weg.has(m))) return [...STREUMITTEL];
  return STREUMITTEL.filter((m) => !weg.has(m) || m === gewaehlt);
}

/** Vorauswahl eines neuen Formulars: Splitt wie bisher — ist Splitt ausgeblendet, das erste aktive. */
export function startStreumittel(aus: readonly string[] | null | undefined): Streumittel {
  return streumittelZurAuswahl(aus)[0];
}

/**
 * Ein Streumittel an- bzw. ausschalten (Team-Seite): neue Liste der ausgeblendeten — oder null, wenn das nicht geht
 * („Sonstiges“ bleibt immer, das letzte aktive echte Streumittel bleibt an).
 */
export function streumittelUmschalten(aus: readonly string[], m: string): Streumittel[] | null {
  if (!ausblendbar(m)) return null;
  const jetzt = new Set(aus.filter(ausblendbar));
  if (jetzt.has(m)) jetzt.delete(m);
  else jetzt.add(m);
  if (AUSBLENDBAR.every((x) => jetzt.has(x))) return null;
  return AUSBLENDBAR.filter((x) => jetzt.has(x));
}

// ---------------------------------------------------------------------------------------------- Speichern

export type StreumittelErgebnis =
  | { art: 'ok'; aus: Streumittel[] }
  /** Spalte/RPC fehlt noch → Hinweis „kommt mit dem nächsten Server-Update“ statt Fehler */
  | { art: 'fehlt' }
  | { art: 'fehler'; text: string };

export const TEXT_SERVER_UPDATE =
  'Streumittel ausblenden kommt mit dem nächsten Server-Update. Bis dahin stehen beim Erfassen alle Streumittel zur Auswahl.';
export const TEXT_KEINE_RECHTE = 'Nur Inhaber oder Verwalter können die Streumittel ändern.';
export const TEXT_ALLE_AUS = 'Mindestens ein Streumittel außer „Sonstiges“ muss an bleiben.';
export const TEXT_UNBEKANNT = 'Unbekanntes Streumittel – bitte die Seite neu laden und noch einmal versuchen.';
export const TEXT_NETZ = 'Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.';
export const TEXT_ERKLAERUNG =
  'Was ihr nicht verwendet, blendest du hier aus: Beim Erfassen stehen dann nur noch die übrigen zur Auswahl – für alle im Team, in der App und im Browser. Schon gespeicherte Einsätze bleiben, wie sie sind.';
export const TEXT_SONSTIGES = '„Sonstiges“ bleibt immer in der Auswahl.';

/** RPC oder Spalte fehlt am Server (Nachtrag noch nicht eingespielt). */
export function serverFehlt(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === 'PGRST202' || e.code === '42883' || e.code === '42703' || /could not find the function|does not exist|schema cache/i.test(e.message ?? '');
}

/** Antwort von set_streumittel_aus auswerten (Fehler des Aufrufs oder {ok, aus} / {fehler}). */
export function streumittelAntwort(data: unknown, error: { code?: string; message?: string } | null | undefined, gesendet: readonly string[]): StreumittelErgebnis {
  if (error) {
    if (serverFehlt(error)) return { art: 'fehlt' };
    if (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')) return { art: 'fehler', text: TEXT_KEINE_RECHTE };
    if (/failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout/i.test(error.message ?? '')) return { art: 'fehler', text: TEXT_NETZ };
    return { art: 'fehler', text: `Nicht gespeichert: ${error.message ?? 'unbekannter Fehler'}` };
  }
  const r = (Array.isArray(data) ? data[0] : data) as { ok?: unknown; aus?: unknown; fehler?: unknown } | null | undefined;
  if (r && typeof r === 'object' && typeof r.fehler === 'string') {
    if (r.fehler === 'keine_rechte') return { art: 'fehler', text: TEXT_KEINE_RECHTE };
    if (r.fehler === 'alle_aus') return { art: 'fehler', text: TEXT_ALLE_AUS };
    if (r.fehler === 'unbekannt') return { art: 'fehler', text: TEXT_UNBEKANNT };
    return { art: 'fehler', text: `Nicht gespeichert (${r.fehler}).` };
  }
  if (r && typeof r === 'object' && r.ok === true) {
    const aus = streumittelAusVon({ streumittel_aus: Array.isArray(r.aus) ? r.aus : gesendet }) ?? [];
    return { art: 'ok', aus };
  }
  return { art: 'fehler', text: 'Nicht gespeichert: unerwartete Antwort vom Server.' };
}

/** „Gespeichert – beim Erfassen stehen jetzt: Salz, Sole und Sonstiges.“ */
export function gespeichertText(aus: readonly string[]): string {
  const an = streumittelZurAuswahl(aus);
  const liste = an.length > 1 ? `${an.slice(0, -1).join(', ')} und ${an[an.length - 1]}` : an.join('');
  return `Gespeichert – beim Erfassen stehen jetzt: ${liste}.`;
}

/** Platzhalter fürs freie Feld „Streumittel“ beim Nachtragen: nennt nur aktive. */
export function nachtragBeispiel(aus: readonly string[] | null | undefined): string {
  const echt = streumittelZurAuswahl(aus).filter((m) => m !== IMMER_DA);
  return `z. B. ${echt.slice(0, 2).join(', ')}`;
}
