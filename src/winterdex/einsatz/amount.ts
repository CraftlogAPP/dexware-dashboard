// Maßnahme/Streumittel — gleiche Auswahl und gleiche Speicherform wie die App
// (mobile/src/components/EinsatzFields.tsx): grit_amount bleibt Text, z. B. "12,5 kg".

import type { OperationAction } from '../types';
import type { FormValues, GritUnit } from './store';

export const ACTIONS: OperationAction[] = ['cleared', 'gritted', 'cleared_gritted', 'checked_no_action'];
export const GRIT_MATERIALS = ['Splitt', 'Salz', 'Sole', 'Granulat', 'Sonstiges'] as const;
export const GRIT_UNITS: GritUnit[] = ['kg', 'g/m²', 'l'];
export const UNIT_LABEL: Record<GritUnit, string> = { kg: 'kg', 'g/m²': 'g/m²', l: 'Liter' };
export const defaultUnitFor = (material: string): GritUnit => (material === 'Sole' ? 'l' : 'kg');
export const needsGrit = (a: OperationAction) => a === 'gritted' || a === 'cleared_gritted';

/**
 * Nur Ziffern + ein Dezimalkomma. Ein Punkt bleibt beim Tippen kurz stehen, solange offen ist, was er meint:
 * „1.500“ (genau drei Ziffern danach, kein Komma) ist ein Tausenderpunkt → 1500. „12.5“ wird beim
 * Verlassen des Felds bzw. beim Speichern zu „12,5“ (finishAmount).
 */
export function cleanAmount(input: string): string {
  const raw = input.replace(/[^0-9.,]/g, '');
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(raw)) return raw.replace('.', '');
  if (/^[1-9]\d{0,2}\.\d{0,2}$/.test(raw)) return raw; // noch offen: Dezimal- oder Tausenderpunkt
  const s = raw.replace(/\./g, ',');
  const i = s.indexOf(',');
  return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
}
/** Fertige Eingabe: stehengebliebener Punkt = Dezimalkomma, kein Komma am Ende. */
export function finishAmount(a: string): string {
  return a.replace(/\./g, ',').replace(/,$/, '');
}

export const initialForm = (performerName = ''): FormValues => ({
  action: 'cleared_gritted',
  gritMaterial: 'Splitt',
  gritAmount: '',
  gritUnit: 'kg',
  unitTouched: false,
  performerName,
  notes: '',
});

/** Werte so aufbereiten, wie sie gespeichert werden (identisch zur App). */
export function formToRecord(v: FormValues) {
  const grit = needsGrit(v.action);
  const amount = finishAmount(v.gritAmount);
  return {
    action: v.action,
    grit_material: grit ? v.gritMaterial : null,
    grit_amount: grit && amount ? `${amount} ${v.gritUnit}` : null,
    notes: v.notes.trim() || null,
    performer_name: v.performerName.trim() || null,
  };
}

/** True, wenn der ISO-Zeitstempel auf den heutigen Kalendertag fällt (lokale Zeit). */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
