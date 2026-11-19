// Abmelden mit Einträgen, die erst auf diesem Gerät liegen (wartend oder angefangen): vorher nachfragen.
// Die Einträge sind ans Konto gebunden — sie bleiben auf dem Gerät und gehen erst raus, wenn sich DASSELBE Konto hier
// wieder anmeldet. Ohne Rückfrage erfährt das niemand (geteiltes Handy, Funkloch).
// Die Handy-Ansichten („Vor Ort“, Außendienst) melden hier an, wie viel bei ihnen liegt; gefragt wird beim Abmelden.
import { useEffect } from 'react';

type Count = () => Promise<number> | number;

const counters = new Set<Count>();

/** Zahl der Einträge, die nur auf diesem Gerät liegen. Fehler beim Zählen halten das Abmelden nie auf. */
export async function countOnDevice(): Promise<number> {
  let n = 0;
  for (const c of counters) {
    try {
      n += await c();
    } catch {
      /* Zählen ist Komfort */
    }
  }
  return n;
}

/** true = abmelden. Fragt nur, wenn etwas auf dem Gerät liegt. */
export async function confirmLogout(): Promise<boolean> {
  const n = await countOnDevice();
  if (n === 0) return true;
  return window.confirm(
    `Auf diesem Gerät ${n === 1 ? 'liegt noch 1 Eintrag, der' : `liegen noch ${n} Einträge, die`} nicht auf dem Server ${n === 1 ? 'ist' : 'sind'} (wartend oder angefangen).\n\n` +
      'Sie bleiben hier gespeichert, werden aber erst gesendet, wenn du dich auf diesem Gerät wieder mit diesem Konto anmeldest.\n\nTrotzdem abmelden?',
  );
}

/** Solange die Ansicht offen ist: ihre Zählung beim Abmelden berücksichtigen. `count` = null → nichts anmelden. */
export function useLogoutCount(count: Count | null, deps: unknown[]): void {
  useEffect(() => {
    if (!count) return;
    counters.add(count);
    return () => {
      counters.delete(count);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
