import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { aboProStand } from '../lib/aboProStand';
import { GRENZE_UNKLAR, ProUnklarError, proFuerAnzeige, proFuerGrenze } from '../lib/proStand';

// Pro wie in der TourDex-App (services/subscription.ts): TourDex Pro (RevenueCat), Dexware Suite oder TourDex Pro aus der
// Sammel-App „Dexware“ (suite-status &app=tourdex). Seit 25.11.2026 mit letztem sicherem Stand (src/lib/proStand.ts).
// Seit 26.11.2026 ist TourDex nicht mehr im Suite-Abo: eine Suite zählt nur noch als Bestand (src/lib/abo.ts), die Texte
// werben deshalb nicht mehr mit ihr.

/** Pro-Stand dieses Kontos: true/false, null = nicht feststellbar und kein letzter sicherer Stand. */
export function tourdexProStand(app: AppConfig, session: Session | null): Promise<boolean | null> {
  return aboProStand(app, session, { appParam: 'tourdex' });
}

/**
 * Darf dieses Konto das Fahrtenbuch-PDF erzeugen? Wie in der TourDex-App (useExport.ts: PDF nur mit Pro).
 * ANZEIGE-Regel: unklar → letzter sicherer Stand, gibt es keinen → erlauben (lieber einmal zu großzügig als einem
 * zahlenden Konto das PDF verweigern; die Daten gehören dem Konto ohnehin).
 */
export async function tourdexPdfAllowed(app: AppConfig, session: Session): Promise<boolean> {
  return proFuerAnzeige(await tourdexProStand(app, session));
}

/** Gratis-Grenze wie FREE_TRIP_LIMIT der App (src/types/index.ts): 10 Fahrten je Kalendermonat, stornierte zählen nicht. */
export const FREE_TRIP_LIMIT = 10;

export const TRIP_GATE_TEXT = `Im Gratis-Paket sind ${FREE_TRIP_LIMIT} Fahrten pro Monat möglich (stornierte zählen nicht) — unbegrenzt viele gibt es mit TourDex Pro. Pro schließt du in der TourDex-App unter „Mehr“ ab.`;

/** Monat einer Fahrt wie monthKey() der App: Ortszeit des Geräts (hier: des Browsers). */
export function monatVon(iso: string): { start: string; ende: string; key: string } {
  const d = new Date(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), 1);
  const b = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start: a.toISOString(), ende: b.toISOString(), key: `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}` };
}

/**
 * Darf im Monat dieser Fahrt noch eine (weitere) Fahrt dazukommen? Wie die App beim Speichern einer Aufzeichnung
 * (countTripsInMonth: nicht stornierte Fahrten mit Start in diesem Monat). `ohneId` = die Fahrt selbst (Bearbeiten,
 * Verschieben in einen anderen Monat) zählt nicht mit. Unklare Zählung oder unklarer Pro-Status → ProUnklarError.
 */
export async function tripGate(
  sb: SupabaseClient,
  pro: () => Promise<boolean | null>,
  startIso: string,
  ohneId?: string,
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const m = monatVon(startIso);
  const { data, error } = await sb
    .from('sync_items')
    .select('item_id, canceled:data->canceled')
    .eq('collection', 'trips')
    .eq('deleted', false)
    .gte('data->>startTime', m.start)
    .lt('data->>startTime', m.ende)
    .limit(1000);
  if (error || !Array.isArray(data)) throw new ProUnklarError(GRENZE_UNKLAR);
  const count = (data as { item_id: string; canceled: unknown }[]).filter((t) => t.canceled !== true && t.item_id !== ohneId).length;
  if (count < FREE_TRIP_LIMIT) return { allowed: true, count, limit: FREE_TRIP_LIMIT };
  return { allowed: proFuerGrenze(await pro().catch(() => null)), count, limit: FREE_TRIP_LIMIT };
}
