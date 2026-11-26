// Beispiel-Zugang (NUR Dev-Server, siehe docs/beispiel-zugang.md): Form der Beispieldaten je App und kleine Helfer für
// glaubwürdige Zeitpunkte. Alle Zeitpunkte hängen an „heute“ — die Übersicht sieht an jedem Tag gleich frisch aus.
// Importe mit Dateiendung: tests/beispiel-zugang.test.mjs lädt die Dateien direkt mit Node.

export type Zeile = Record<string, unknown>;
export type Tabellen = Record<string, Zeile[]>;

/** RPC-Antwort aus den Beispieldaten (args = Parameter des Aufrufs, t = aktuelle Tabellen im Speicher) */
export type RpcAntwort = (args: Record<string, unknown>, t: Tabellen) => unknown;

export interface BeispielDaten {
  /** App-Kennung wie in src/apps/registry.ts */
  app: string;
  /** Nutzer der Beispiel-Sitzung (Inhaber) */
  nutzer: { id: string; email: string };
  /** Tabellen mit Zeilen in DB-Schreibweise (snake_case), wie PostgREST sie liefern würde */
  tabellen: Tabellen;
  /** RPCs dieser App — ergänzen bzw. überschreiben die Standard-RPCs (org_pro_active, list_members …) in client.ts */
  rpc?: Record<string, RpcAntwort>;
  /** Bilder im Speicher: „<bucket>/<pfad>“ → Adresse (z. B. data:-URI). Ohne Eintrag liefert createSignedUrls nichts. */
  fotos?: Record<string, string>;
}

const TAG = 86_400_000;

/** Feste, gut erkennbare UUID je Art und Nummer: bsp(1, 7) → „b0000001-0000-4000-8000-000000000007“. */
export function bsp(art: number, n: number): string {
  return `b${String(art).padStart(7, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/**
 * Zeitpunkt vor `tage` Kalendertagen um hh:mm (lokale Zeit). Fällt er auf Samstag/Sonntag, wird er auf den Freitag davor
 * gelegt (Prüfungen laufen an Werktagen). Liegt er noch in der Zukunft (heute später am Tag), zählt der Werktag davor.
 */
export function vor(tage: number, hh: number, mm: number, werktag = true): string {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  d.setDate(d.getDate() - tage);
  const schieben = () => {
    if (werktag) while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  };
  schieben();
  if (d.getTime() > Date.now() - 5 * 60_000) {
    d.setDate(d.getDate() - 1);
    schieben();
  }
  return d.toISOString();
}

/**
 * Letzte Prüfung für eine Frist in vollen Jahren, die in `tageBisFaellig` Tagen abläuft (negativ = seit so vielen Tagen
 * überfällig): heute + tageBisFaellig − jahre (Kalender, wie src/pruefen/due.ts → dueDay). Kein Werktag-Verschieben —
 * sonst stimmt die angezeigte Restzeit nicht mehr.
 */
export function fristVor(jahre: number, tageBisFaellig: number, hh: number, mm: number): string {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  d.setFullYear(d.getFullYear() - jahre);
  d.setDate(d.getDate() + tageBisFaellig);
  return d.toISOString();
}

/** Zeitpunkt + Minuten (für „gespeichert kurz danach“) */
export function plus(iso: string, minuten: number): string {
  return new Date(Date.parse(iso) + minuten * 60_000).toISOString();
}

/** Ganze Tage zwischen zwei Zeitpunkten (für Plausibilitäts-Prüfungen im Test) */
export function tageZwischen(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / TAG);
}

/**
 * Betrieb + Mitgliedschaften im Mandanten-Modell der Dex-Apps (Tabellen org und membership, wie src/lib/orgApi.ts →
 * fetchOrgContext). Der erste Eintrag in `team` ist der Inhaber der Beispiel-Sitzung.
 */
export function betrieb(opt: {
  orgId: string;
  name: string;
  land: 'DE' | 'AT' | 'CH';
  address: string;
  /** Anlegedatum — älter als 30 Tage, sonst erscheint die Karte „Erste Schritte“ (src/lib/ersteSchritte.ts) */
  seit: string;
  team: { id: string; email: string; role: 'owner' | 'admin' | 'worker'; seit: string }[];
  /** weitere Spalten der Tabelle org (z. B. is_pro), sofern die App sie hat */
  extra?: Zeile;
}): { org: Zeile[]; membership: Zeile[]; mitglieder: Zeile[] } {
  return {
    org: [{ id: opt.orgId, name: opt.name, land: opt.land, address: opt.address, created_at: opt.seit, ...(opt.extra ?? {}) }],
    membership: opt.team.map((m, i) => ({
      id: bsp(9, 900 + i),
      org_id: opt.orgId,
      user_id: m.id,
      role: m.role,
      created_at: m.seit,
    })),
    // Antwort der RPC list_members (src/lib/orgApi.ts → Member)
    mitglieder: opt.team.map((m, i) => ({
      membership_id: bsp(9, 900 + i),
      user_id: m.id,
      email: m.email,
      role: m.role,
      joined_at: m.seit,
    })),
  };
}

/** Checkliste: alle Punkte „ok“, einzelne als Mangel bzw. „entfällt“ */
export function liste(ids: readonly string[], maengel: readonly string[] = [], entfaellt: readonly string[] = []): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, maengel.includes(id) ? 'defect' : entfaellt.includes(id) ? 'na' : 'ok']));
}
