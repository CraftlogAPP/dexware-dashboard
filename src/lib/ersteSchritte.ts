// „Erste Schritte“ auf der Übersicht neuer Betriebe — reine Logik ohne React (Karte: components/ErsteSchritte.tsx).
// Die Haken kommen aus Daten, die die Übersicht ohnehin lädt (Bestand, gültige Prüfungen/Einsätze) und aus der
// Mitgliederzahl. Keine eigenen Tabellen, kein Server-Zustand: „Ausblenden“ merkt sich nur dieser Browser.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Je App: was angelegt wird, wohin die Knöpfe führen (relativ zur Übersicht) */
export interface ErsteSchritteAdapter {
  stock: {
    /** Mehrzahl, z. B. „Leitern“, „Baustellen“, „Fahrzeuge und Fahrer“ */
    what: string;
    importTo: string;
    listTo: string;
    /** Zusatz zum Excel-Satz, z. B. „auf Wunsch mit ihren Gerüsten“ */
    hint?: string;
  };
  first: {
    /** „Erste Prüfung“, „Erster Einsatz“ */
    title: string;
    text: string;
    /** Handy-Ansicht im Browser („Vor Ort“, WinterDex „Außendienst“); null = keine */
    fieldTo: string | null;
    fieldLabel: string;
  };
  /** Team-Seite; null = App ohne Team-Funktion (Schritt entfällt) */
  teamTo: string | null;
  /** Mitglieder inkl. Inhaber zählen — Standard wie die Team-Seite (list_members) */
  countMembers?: (sb: SupabaseClient) => Promise<number>;
}

/** Reihenfolge wie auf der Karte */
export type StepKey = 'bestand' | 'handy' | 'team' | 'erste';

export interface StartFacts {
  /** angelegte Einheiten bzw. Objekte (Orts-Apps: Orte) */
  stock: number;
  /** mindestens eine gültige (nicht stornierte) Prüfung bzw. ein Einsatz */
  first: boolean;
  /** Mitglieder des Betriebs inkl. Inhaber; null = unbekannt (Fehler beim Laden) */
  members: number | null;
  /** hat die App eine Team-Funktion? Ohne fällt der Schritt weg */
  team: boolean;
}

export interface StartStep {
  key: StepKey;
  done: boolean;
}

export interface StartState {
  steps: StartStep[];
  done: number;
  total: number;
  allDone: boolean;
}

/**
 * Haken je Schritt. „App aufs Handy“ lässt sich im Browser nicht sehen — er gilt als erledigt, sobald es eine gültige
 * Prüfung gibt: Die entsteht nur in der App oder unter „Vor Ort“, das Handy ist dann eingerichtet.
 */
export function startSteps(f: StartFacts): StartState {
  const steps: StartStep[] = [
    { key: 'bestand', done: f.stock > 0 },
    { key: 'handy', done: f.first },
    ...(f.team ? [{ key: 'team' as const, done: (f.members ?? 0) > 1 }] : []),
    { key: 'erste', done: f.first },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, allDone: done === steps.length };
}

/** So lange gilt ein Betrieb als neu (Tage seit dem Anlegen) */
export const NEW_ORG_DAYS = 30;

/** Betrieb jünger als NEW_ORG_DAYS? Ohne lesbares Datum: nein (dann zählen nur Bestand und erste Prüfung). */
export function isNewOrg(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && now - t < NEW_ORG_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Karte zeigen? Nur dem Inhaber (er legt Bestand und Team an), nicht ausgeblendet, nicht alles erledigt — und nur
 * für neue Betriebe: Ältere Betriebe mit Bestand und erster Prüfung sehen sie nicht (auch wenn sie ohne Team arbeiten);
 * fehlt einem älteren Betrieb noch Bestand oder Prüfung, hilft die Karte beim Einstieg.
 */
export function cardVisible(a: { owner: boolean; hidden: boolean; state: StartState; newOrg: boolean }): boolean {
  if (!a.owner || a.hidden || a.state.allDone) return false;
  if (a.newOrg) return true;
  const open = (k: StepKey) => a.state.steps.some((s) => s.key === k && !s.done);
  return open('bestand') || open('erste');
}

/** Braucht die Karte die Mitgliederzahl? Nur wenn es den Team-Schritt gibt und die Karte sonst sichtbar sein kann. */
export function needsMembers(a: { owner: boolean; hidden: boolean; team: boolean; stock: number; first: boolean; newOrg: boolean }): boolean {
  if (!a.owner || a.hidden || !a.team) return false;
  return a.newOrg || a.stock === 0 || !a.first;
}

// ---------------------------------------------------------------------------- Ausblenden (je App + Betrieb)

export const hideKey = (appId: string, orgId: string) => `dexware:erste-schritte:${appId}:${orgId}`;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Ausgeblendet? Fehler beim Lesen (privates Fenster, gesperrt) = nein — die Karte erscheint dann einfach. */
export function readHidden(store: Store | null | undefined, appId: string, orgId: string): boolean {
  try {
    return store?.getItem(hideKey(appId, orgId)) === '1';
  } catch {
    return false;
  }
}

/** Ausblenden merken; geht das nicht, bleibt sie nur bis zum Neuladen weg. */
export function writeHidden(store: Store | null | undefined, appId: string, orgId: string): void {
  try {
    store?.setItem(hideKey(appId, orgId), '1');
  } catch {
    /* egal — die Karte ist für diese Sitzung trotzdem weg */
  }
}

/** Google-Play-Seite der App */
export const playUrl = (playId: string) => `https://play.google.com/store/apps/details?id=${encodeURIComponent(playId)}`;
