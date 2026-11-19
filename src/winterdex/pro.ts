// Gratis-/Pro-Regeln von WinterDex — EINHEITLICH mit der App (mobile/src/lib/entitlement.ts), am Konto hängend:
//   Gratis: 2 aktive Objekte, 1 aktive Strecke, PDF mit Wasserzeichen, kein Team (Einladen ist Pro).
//   Pro:    unbegrenzt, PDF ohne Wasserzeichen, Team.
// Ob ein Betrieb Pro hat, sagt der SERVER (RPC org_pro_active: Abo des Inhabers bei Google Play/RevenueCat inkl. Team-Stufen,
// Suite-Abo, Kommunal-Lizenz, Empfehlungs-Bonus, Freischaltung auf Rechnung über org.pro_bonus_until) — dieselbe Auskunft
// nutzt die App für Mitarbeiter. Antwortet der Server nicht eindeutig, gilt „Pro“: nie einen zahlenden Betrieb zu Unrecht sperren.

import type { SupabaseClient } from '@supabase/supabase-js';

export const FREE_PROPERTIES = 2;
export const FREE_ROUTES = 1;

/** Text für alle Stellen, an denen eine Gratis-Grenze greift (Abo nur über Google Play — ohne Android: auf Rechnung). */
export const PRO_HOW =
  'Pro schließt du in der WinterDex-App (Android) unter „Abo“ ab. Kein Android-Gerät? Wir schalten Pro auch auf Rechnung frei (39,99 € pro Saison) — schreib uns an support@dexware.app.';
export const PRO_MAILTO = 'mailto:support@dexware.app?subject=WinterDex%20Pro%20auf%20Rechnung';

const cache = new WeakMap<SupabaseClient, { v: boolean; at: number }>();
const FRESH_MS = 5 * 60 * 1000;

export async function fetchOrgPro(sb: SupabaseClient, fresh = false): Promise<boolean> {
  const hit = cache.get(sb);
  if (!fresh && hit && Date.now() - hit.at < FRESH_MS) return hit.v;
  try {
    const { data, error } = await sb.rpc('org_pro_active');
    if (error || data === null || data === undefined) return true; // unklar → nicht sperren (nicht merken)
    const v = data === true;
    cache.set(sb, { v, at: Date.now() });
    return v;
  } catch {
    return true;
  }
}

/** Wasserzeichen wie im PDF der App („Erstellt mit WinterDex Free“) — nur ohne Pro. */
export function withWatermark(html: string, pro: boolean): string {
  if (pro) return html;
  const mark =
    '<div style="position:fixed;top:45%;left:0;right:0;text-align:center;transform:rotate(-24deg);font-size:44px;font-weight:800;color:rgba(2,132,199,.10);pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact">Erstellt mit WinterDex Free</div>';
  return html.includes('</body>') ? html.replace('</body>', `${mark}</body>`) : html + mark;
}
