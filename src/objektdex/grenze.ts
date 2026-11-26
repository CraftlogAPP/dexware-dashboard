// ObjektDex — Gratis-Grenze wie die App (ObjektDex/mobile/src/lib/entitlement.ts: FREE_LIMITS, propertyGate, routeGate).
// Formular, Übernahme und Import halten sie selbst ein; seit NACHTRAG-GRATIS-GRENZE-2026-11-25 lehnt auch der Server ab
// (hint gratis_grenze_property / _route / _share_link). Unklare Pro-Auskunft ohne letzten sicheren Stand sperrt seit
// 25.11.2026 auch beim einzelnen Objekt — mit „gleich nochmal“ (vorher: erlaubt). Nur Imports ohne weitere Abhängigkeiten
// (Node-testbar).

import { PRO_UNKLAR } from '../lib/proStand.ts';

/** Wie FREE_LIMITS in der App: 2 AKTIVE Objekte, keine Runden (Runden sind Pro) */
export const GRATIS_OBJEKTE = 2;
export const GRATIS_STRECKEN = 0;

// ObjektDex gehört nicht zum Suite-Abo (Alex, 26.11.2026) — deshalb kein Suite-Hinweis.
const PRO_WEG = 'Pro schließt du in der ObjektDex-App unter „Abo“ ab.';

/**
 * Massen-Anlage (Übernahme, Import): wie viele dürfen neu dazu? null = unbegrenzt (Pro).
 * Unklare Pro-Auskunft (null) zählt wie Gratis — bei vielen Objekten auf einmal lieber später noch einmal.
 */
export function gratisRahmen(pro: boolean | null, aktiveObjekte: number): { objekte: number | null; strecken: number | null } {
  if (pro === true) return { objekte: null, strecken: null };
  return { objekte: Math.max(0, GRATIS_OBJEKTE - aktiveObjekte), strecken: GRATIS_STRECKEN };
}

/**
 * Einzelnes Objekt von Hand anlegen oder wieder aktivieren (Formular, „Wieder aktivieren“): wie propertyGate der App —
 * gratis höchstens 2 aktive. Unter der Grenze immer frei; darüber nur mit Pro. Ist Pro nicht feststellbar (auch kein
 * letzter sicherer Stand), kommt „gleich nochmal“ statt still zu erlauben. null = erlaubt, sonst der Satz für die Meldung.
 */
export function objektGrenzeText(pro: boolean | null, aktiveObjekte: number): string | null {
  if (pro === true || aktiveObjekte < GRATIS_OBJEKTE) return null;
  if (pro === null) return PRO_UNKLAR;
  return `Ohne ObjektDex Pro sind ${GRATIS_OBJEKTE} aktive Objekte möglich — dein Betrieb hat ${aktiveObjekte}. ${PRO_WEG} Alternativ ein anderes Objekt pausieren.`;
}

/** Auftraggeber-Link (Pro wie in der App, ShareLinksScreen): null = erlaubt, sonst der Satz für die Meldung. */
export function linkGrenzeText(pro: boolean | null): string | null {
  if (pro === true) return null;
  if (pro === null) return PRO_UNKLAR;
  return `Auftraggeber-Links gehören zu ObjektDex Pro. ${PRO_WEG}`;
}

/** Team-Code (Pro wie in der App, TeamScreen): Hinweis, wenn der Betrieb sicher kein Pro hat. */
export const TEAM_PRO_TEXT = `Mitarbeiter einladen gehört zu ObjektDex Pro — ${PRO_WEG}`;

/** Ablehnung durch den Server (Auslöser) beim Objekt-Speichern → derselbe Satz wie an der Oberfläche. */
export const OBJEKT_GRENZE_SERVER = `Ohne ObjektDex Pro sind ${GRATIS_OBJEKTE} aktive Objekte möglich. ${PRO_WEG} Alternativ ein anderes Objekt pausieren.`;
