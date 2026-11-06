// Beispieldaten „Eigene Prüfpunkte & Messwerte“ — NUR über ext-demo.ts / DemoArea (Dev-Server).
// Alles im Speicher, bis zum Neuladen — nichts geht an einen Server. Ein unbekanntes Feld („_neu“) zeigt,
// dass beim Speichern nichts aus neueren App-Versionen verloren geht.

import type { PruefpunkteData } from './data';

const wait = <T,>(v: T, ms = 150): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));

export function demoPruefpunkte(): PruefpunkteData {
  let stored: Record<string, unknown> = {
    service: {
      gas: {
        add: ['CO-Melder im Aufstellraum geprüft'],
        hide: ['siphon'],
        fields: [{ label: 'Kesselwasser pH' }, { label: 'Leitfähigkeit', unit: 'µS/cm' }],
      },
      hp_air: { add: ['Schallschutzhaube kontrolliert'] },
      '*': { add: ['Arbeitsplatz sauber hinterlassen'] },
    },
    commissioning: {
      '*': { add: ['Übergabe-Foto mit Kunde'] },
    },
    _neu: { hinweis: 'Feld aus einer neueren App-Version — bleibt beim Speichern erhalten' },
  };
  return {
    load: () => wait(stored),
    async save(_orgId, value) {
      await wait(null, 300);
      stored = structuredClone(value);
      if (import.meta.env.DEV) console.info('[Beispieldaten] org.checklists wäre jetzt:', JSON.stringify(stored));
    },
  };
}
