// ObjektDex — Gratis-Grenze wie die App (ObjektDex/mobile/src/lib/entitlement.ts: FREE_LIMITS, propertyGate, routeGate).
// Der Server prüft sie nicht — Formular, Übernahme und Import halten sie selbst ein. Bewusst ohne Imports (klein, testbar).

/** Wie FREE_LIMITS in der App: 2 AKTIVE Objekte, keine Runden (Runden sind Pro) */
export const GRATIS_OBJEKTE = 2;
export const GRATIS_STRECKEN = 0;

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
 * gratis höchstens 2 aktive. Gesperrt wird nur bei klarem „kein Pro“; unklare Auskunft sperrt hier nicht (ein Objekt,
 * nie einen zahlenden Betrieb aussperren — wie alle Dashboard-Grenzen). null = erlaubt, sonst der Satz für die Meldung.
 */
export function objektGrenzeText(pro: boolean | null, aktiveObjekte: number): string | null {
  if (pro !== false || aktiveObjekte < GRATIS_OBJEKTE) return null;
  return `Ohne ObjektDex Pro sind ${GRATIS_OBJEKTE} aktive Objekte möglich — dein Betrieb hat ${aktiveObjekte}. Pro schließt du in der ObjektDex-App unter „Abo“ ab (mit einem Dexware-Suite-Abo ist es schon dabei). Alternativ ein anderes Objekt pausieren.`;
}
