// Zuordnung App-ID → Fälligkeits-Adapter. Apps ohne Fristen-Konzept
// (CraftDex/TourDex/DokuDex/SchutzDex) und externe (BaumDex) fehlen bewusst.

import type { DueAdapter } from './types';
import { leiterdexDue } from './leiterdex';
import { regaldexDue } from './regaldex';
import { spieldexDue } from './spieldex';
import { winterdexDue } from './winterdex';
import { pruefdexDue } from './pruefdex';
import { kfzdexDue } from './kfzdex';

export const ADAPTERS: Record<string, DueAdapter> = {
  leiterdex: leiterdexDue,
  regaldex: regaldexDue,
  spieldex: spieldexDue,
  winterdex: winterdexDue,
  pruefdex: pruefdexDue,
  kfzdex: kfzdexDue,
};
