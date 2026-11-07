// Kleine Merk-Schalter im Browser (Einführung gesehen, Menügruppe auf/zu, Startseiten-Block auf/zu).
// Nur Bequemlichkeit: Ohne Speicher (privates Fenster, gesperrt) läuft alles mit dem Standardwert weiter.

export function readMerk(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Kann der Browser sich überhaupt etwas merken? (gesperrter Speicher → false) */
export function merkVerfuegbar(): boolean {
  try {
    const k = '__idx-merk-test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function writeMerk(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Speicher gesperrt oder voll — dann merkt sich das Portal den Zustand eben nicht.
  }
}
