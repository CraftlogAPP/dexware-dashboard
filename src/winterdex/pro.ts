// Gratis-/Pro-Regeln von WinterDex — EINHEITLICH mit der App (mobile/src/lib/entitlement.ts), am Konto hängend:
//   Gratis: 2 aktive Objekte, 1 aktive Strecke, PDF mit Wasserzeichen, kein Team (Einladen ist Pro).
//   Pro:    unbegrenzt, PDF ohne Wasserzeichen, Team.
// Ob ein Betrieb Pro hat, sagt der SERVER (RPC org_pro_active: Abo des Inhabers bei Google Play/RevenueCat inkl. Team-Stufen,
// Suite-Abo, Kommunal-Lizenz, Empfehlungs-Bonus, Freischaltung auf Rechnung über org.pro_bonus_until) — dieselbe Auskunft
// nutzt die App für Mitarbeiter.
//
// Antwortet der Server NICHT eindeutig (RevenueCat/Suite gestört → null, Netzfehler), gilt seit 25.11.2026:
//   · GRENZEN (Objekt/Strecke anlegen oder wieder aktivieren, Import) — orgProFuerGrenze(): der letzte SICHERE Stand
//     dieses Kontos in diesem Browser (35 Tage); gibt es keinen, freundlich „Pro-Status wird geprüft — gleich nochmal“.
//     Vorher galt hier „im Zweifel Pro“ → bei jeder Störung waren die Grenzen offen (auch der Import).
//   · ANZEIGE (Wasserzeichen, Excel-Liste, Team-Hinweis) — fetchOrgPro(): letzter sicherer Stand, sonst Pro (einen
//     zahlenden Betrieb nie wegen einer Störung mit Wasserzeichen ärgern).
// Zusätzlich prüft der Server selbst (NACHTRAG-GRATIS-GRENZE-2026-11-25, Auslöser auf property/route) — seine Ablehnung
// erkennt istGratisGrenze().

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchOrgPro as fetchOrgProApp,
  orgProFuerGrenze as orgProFuerGrenzeApp,
  orgProStand as orgProStandApp,
} from '../lib/proStand.ts';
import { getApp } from '../apps/registry.ts';
import { kasseKonfig } from '../lib/paddleKasse.ts';

// Gemeinsamer Baustein aller App-Bereiche (src/lib/proStand.ts) — gleicher Speicher-Schlüssel wie bisher
// („winterdex.orgPro.<Nutzer>“), gleiche Texte, gleiches Verhalten.
export { PRO_UNKLAR, ProUnklarError, istGratisGrenze } from '../lib/proStand.ts';

export const FREE_PROPERTIES = 2;
export const FREE_ROUTES = 1;

/**
 * Text für alle Stellen, an denen eine Gratis-Grenze greift. Ohne Paddle-Kasse: Abo nur über Google Play (ohne Android: auf
 * Rechnung). Ist die Kasse eingeschaltet (registry paddleKasse.live mit pdl_-Schlüssel, src/lib/paddleKasse.ts), nennt
 * der Text zuerst den Kauf hier im Dashboard — die Live-Schaltung braucht so nur den Schlüssel.
 */
export function proHowText(kasseAn: boolean): string {
  return kasseAn
    ? 'Pro kaufst du direkt hier im Dashboard unter „Abo“ (Zahlung über Paddle, auch am iPhone) oder in der WinterDex-App (Android) unter „Abo“. Auf Rechnung geht es auch (69,99 € pro Jahr) — schreib uns an support@dexware.app.'
    : 'Pro schließt du in der WinterDex-App (Android) unter „Abo“ ab. Kein Android-Gerät? Wir schalten Pro auch auf Rechnung frei (69,99 € pro Jahr) — schreib uns an support@dexware.app.';
}
// Nur der Live-Schlüssel zählt (Sandbox nie in Texten). In Node-Tests gibt es kein import.meta.env → wie ohne Bau-Variable.
const viteEnv = (import.meta as { env?: Record<string, unknown> }).env ?? {};
export const PRO_HOW = proHowText(kasseKonfig(getApp('winterdex')?.paddleKasse, { env: viteEnv }) !== null);
export const PRO_MAILTO = 'mailto:support@dexware.app?subject=WinterDex%20Pro%20auf%20Rechnung';

const APP = 'winterdex';

/**
 * Pro des Betriebs: true/false, null = nicht sicher feststellbar. Eine sichere Server-Antwort wird gemerkt (5 Minuten im
 * Speicher, als „letzter sicherer Stand“ 35 Tage im Browser); bei Störung kommt der letzte sichere Stand zurück.
 */
export function orgProStand(sb: SupabaseClient, fresh = false): Promise<boolean | null> {
  return orgProStandApp(sb, APP, fresh);
}

/** Für ANZEIGE (Wasserzeichen, Excel-Liste, Team-Hinweis): unklar ohne letzten Stand → Pro (nie zu Unrecht ärgern). */
export function fetchOrgPro(sb: SupabaseClient, fresh = false): Promise<boolean> {
  return fetchOrgProApp(sb, APP, fresh);
}

/**
 * Für GRENZEN (Anlegen, Wieder-Aktivieren, Import): immer frisch gefragt; unklar → letzter sicherer Stand; gibt es keinen,
 * wirft ProUnklarError (freundlicher Text PRO_UNKLAR) — weder still erlauben noch einen Zahlenden fälschlich sperren.
 */
export function orgProFuerGrenze(sb: SupabaseClient): Promise<boolean> {
  return orgProFuerGrenzeApp(sb, APP);
}

/** Text an der Objekt-Grenze (Dialog, Import, Server-Ablehnung). */
export const GRENZE_OBJEKTE = `Im Gratis-Paket sind ${FREE_PROPERTIES} aktive Objekte möglich — unbegrenzt viele gibt es mit Pro. ${PRO_HOW}`;

/** Wasserzeichen wie im PDF der App („Erstellt mit WinterDex Free“) — nur ohne Pro. */
export function withWatermark(html: string, pro: boolean): string {
  if (pro) return html;
  const mark =
    '<div style="position:fixed;top:45%;left:0;right:0;text-align:center;transform:rotate(-24deg);font-size:44px;font-weight:800;color:rgba(2,132,199,.10);pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact">Erstellt mit WinterDex Free</div>';
  return html.includes('</body>') ? html.replace('</body>', `${mark}</body>`) : html + mark;
}
