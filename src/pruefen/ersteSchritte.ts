// Adapter der Karte „Erste Schritte“ (components/ErsteSchritte.tsx) für die 8 Prüf-Apps — aus ihrer „Vor Ort“-Beschreibung.
import type { ErsteSchritteAdapter } from '../lib/ersteSchritte';
import { isSiteMode, sitesPathOf, wordsOf, type PruefConfig } from './config';
import { VOR_ORT_PATH } from './Scope';

/** Dativ Mehrzahl: „mit ihren Gerüsten“, aber „mit ihren Regalzeilen“ */
const dativePlural = (w: string) => (/[ns]$/.test(w) ? w : `${w}n`);

/** Adapter der Prüf-Apps aus ihrer „Vor Ort“-Beschreibung: Orts-Apps legen Orte an, die anderen Geräte. */
export function pruefErsteSchritte(cfg: PruefConfig): ErsteSchritteAdapter {
  const W = wordsOf(cfg);
  const siteMode = isSiteMode(cfg);
  const path = sitesPathOf(cfg);
  return {
    stock: {
      what: siteMode ? cfg.labels.site.many : cfg.labels.unit.many,
      importTo: `${path}/import`,
      listTo: path,
      hint: siteMode ? `auf Wunsch gleich mit ihren ${dativePlural(cfg.labels.unit.many)}` : undefined,
    },
    first: {
      title: `Erste ${W.insp.one}`,
      text: `In der App oder unter „Vor Ort“ im Browser — mit Uhrzeit, GPS-Stempel und Prüfcode.`,
      fieldTo: VOR_ORT_PATH,
      fieldLabel: 'Vor Ort',
    },
    teamTo: 'team',
  };
}
