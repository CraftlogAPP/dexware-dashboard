// Gedruckte Akte ist begrenzt (die neuesten REPORT_JOB_LIMIT Einsätze / REPORT_DEFECT_LIMIT Empfehlungen, data.ts).
// Derselbe Hinweis steht im Portal vor dem Drucken (AkteLimitHinweis.tsx) und im Druck selbst (report.ts limitNote).

import { REPORT_DEFECT_LIMIT, REPORT_JOB_LIMIT } from './data';

export type AkteCounts = { jobs: number; defects: number };

/** Kurzer Hinweis, wenn die Akte nicht alles enthält; null = vollständig. */
export function akteLimitNote(c: AkteCounts): string | null {
  const parts: string[] = [];
  if (c.jobs > REPORT_JOB_LIMIT) parts.push(`die letzten ${REPORT_JOB_LIMIT} von ${c.jobs} Einsätzen`);
  if (c.defects > REPORT_DEFECT_LIMIT) parts.push(`die letzten ${REPORT_DEFECT_LIMIT} von ${c.defects} Empfehlungen`);
  if (!parts.length) return null;
  return `Diese Akte enthält ${parts.join(' und ')}. Ältere Einträge bleiben gespeichert und sind in der App einsehbar.`;
}
