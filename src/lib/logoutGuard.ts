// Abmelden mit Einträgen, die erst auf diesem Gerät liegen (wartend oder angefangen): vorher nachfragen.
// Die Einträge sind ans Konto gebunden — sie bleiben auf dem Gerät und gehen erst raus, wenn sich DASSELBE Konto hier
// wieder anmeldet. Ohne Rückfrage erfährt das niemand (geteiltes Handy, Funkloch).
//
// Seit 21.11.2026 gilt die Rückfrage auf JEDER Seite des App-Bereichs (auch im Dashboard), nicht nur, solange die
// Handy-Ansicht offen ist: Die Handy-Ansichten („Vor Ort“, Außendienst) melden ihre Zählung beim Laden ihres Codes an
// (registerLogoutCount), gefragt wird beim Abmelden für das Konto, das sich abmeldet.

/** Zählt, was für dieses Konto in dieser App nur auf dem Gerät liegt. */
type Count = (appId: string, userId: string) => Promise<number> | number;

// Je Schlüssel genau eine Zählung — wird ein Modul erneut ausgewertet (Dev-Server nach Änderungen), ersetzt sie die alte.
const counters = new Map<string, Count>();

/**
 * Beim Laden des Moduls aufrufen. `name` = eindeutiger Name der Zählung (z. B. die App), `appId` = null: gilt für mehrere
 * Apps (die Zählung bekommt die App-ID mit).
 */
export function registerLogoutCount(
  name: string,
  appId: string | null,
  count: (userId: string, appId: string) => Promise<number> | number,
): void {
  counters.set(name, (a, u) => (appId === null || appId === a ? count(u, a) : 0));
}

/** Zahl der Einträge, die nur auf diesem Gerät liegen. Fehler beim Zählen halten das Abmelden nie auf. */
export async function countOnDevice(appId: string, userId: string): Promise<number> {
  let n = 0;
  for (const c of counters.values()) {
    try {
      n += await c(appId, userId);
    } catch {
      /* Zählen ist Komfort */
    }
  }
  return n;
}

/** true = abmelden. Fragt nur, wenn etwas auf dem Gerät liegt. */
export async function confirmLogout(appId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true;
  const n = await countOnDevice(appId, userId);
  if (n === 0) return true;
  return window.confirm(
    `Auf diesem Gerät ${n === 1 ? 'liegt noch 1 Eintrag, der' : `liegen noch ${n} Einträge, die`} nicht auf dem Server ${n === 1 ? 'ist' : 'sind'} (wartend oder angefangen).\n\n` +
      'Sie bleiben hier gespeichert, werden aber erst gesendet, wenn du dich auf diesem Gerät wieder mit diesem Konto anmeldest.\n\nTrotzdem abmelden?',
  );
}
