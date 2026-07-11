// Zuordnung App-ID → Fälligkeits-Adapter. Apps ohne Fristen-Konzept
// (CraftDex/TourDex/DokuDex/SchutzDex) und externe (BaumDex) fehlen bewusst.

import type { DueAdapter } from './types';
import { feuerdexDue } from './feuerdex';
import { geruestdexDue } from './geruestdex';
import { leiterdexDue } from './leiterdex';
import { regaldexDue } from './regaldex';
import { spieldexDue } from './spieldex';
import { winterdexDue } from './winterdex';
import { pruefdexDue } from './pruefdex';
import { kfzdexDue } from './kfzdex';

export const ADAPTERS: Record<string, DueAdapter> = {
  feuerdex: feuerdexDue,
  geruestdex: geruestdexDue,
  leiterdex: leiterdexDue,
  regaldex: regaldexDue,
  spieldex: spieldexDue,
  winterdex: winterdexDue,
  pruefdex: pruefdexDue,
  kfzdex: kfzdexDue,
};
