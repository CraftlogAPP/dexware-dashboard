// Fristen-Engine — 1:1 aus der KfzDex-App portiert (src/lib/due.ts),
// nur auf die DB-Zeilentypen (snake_case) umgestellt.

import type { Driver, Vehicle } from './types';

/** UVV-Prüffrist nach DGUV Vorschrift 70: mindestens jährlich. */
export const UVV_INTERVAL_MONTHS = 12;

/** Ab so vielen Tagen vor Fälligkeit gilt eine Frist als „bald fällig". */
export const SOON_DAYS = 30;

export type DueStatus = 'ok' | 'soon' | 'overdue' | 'missing';

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysUntil(due: Date, today: Date): number {
  const ms = due.getTime() - today.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export interface DueInfo {
  status: DueStatus;
  /** Fälligkeitsdatum; undefined wenn noch nie geprüft (status 'missing'). */
  dueDate?: Date;
  /** Tage bis zur Fälligkeit (negativ = überfällig); undefined bei 'missing'. */
  days?: number;
}

function dueInfoFrom(
  last: string | null,
  intervalMonths: number,
  today: Date,
): DueInfo {
  if (!last) return { status: 'missing' };
  const dueDate = addMonths(last, intervalMonths);
  const days = daysUntil(dueDate, today);
  const status: DueStatus =
    days < 0 ? 'overdue' : days <= SOON_DAYS ? 'soon' : 'ok';
  return { status, dueDate, days };
}

/** Nächste UVV-Fälligkeit eines Fahrzeugs. */
export function uvvDue(vehicle: Vehicle, today: Date = new Date()): DueInfo {
  return dueInfoFrom(vehicle.last_uvv, UVV_INTERVAL_MONTHS, today);
}

/** Nächste Führerscheinkontrolle eines Fahrers. */
export function licenseDue(driver: Driver, today: Date = new Date()): DueInfo {
  return dueInfoFrom(driver.last_check, driver.check_interval_months, today);
}

/** Gewicht je Frist-Status für den Fuhrpark-Gesundheitswert (1 = perfekt erfüllt). */
const HEALTH_WEIGHT: Record<DueStatus, number> = {
  ok: 1,
  soon: 0.5,
  missing: 0.15,
  overdue: 0,
};

export interface FleetHealth {
  /** 0..1 — gewichteter Anteil erfüllter Pflichten; null wenn nichts zu prüfen ist. */
  score: number | null;
  overdue: number;
  soon: number;
  /** Bewertete Pflichten insgesamt (Fahrzeuge + aktive Fahrer). */
  total: number;
}

export function fleetHealth(
  vehicles: Vehicle[],
  activeDrivers: Driver[],
  today: Date = new Date(),
): FleetHealth {
  const statuses: DueStatus[] = [
    ...vehicles.map((v) => uvvDue(v, today).status),
    ...activeDrivers.map((d) => licenseDue(d, today).status),
  ];
  const total = statuses.length;
  const overdue = statuses.filter((s) => s === 'overdue').length;
  const soon = statuses.filter((s) => s === 'soon').length;
  if (total === 0) return { score: null, overdue, soon, total };
  const sum = statuses.reduce((acc, s) => acc + HEALTH_WEIGHT[s], 0);
  return { score: sum / total, overdue, soon, total };
}
