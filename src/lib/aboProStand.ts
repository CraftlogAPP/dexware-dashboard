// Pro-Stand für Apps OHNE Server-Auskunft org_pro_active (SchutzDex, CraftDex, TourDex): dieselben Quellen wie die App —
// RevenueCat (Einzel-„pro“, Team-Stufen, „suite“) über src/lib/abo.ts, Suite-Server (Suite-Abo aus einer anderen App),
// Suite-Server mit &app=<app> (Pro dieser App, gekauft in der Sammel-App „Dexware“ bzw. auf dem anderen System) und
// app-eigene Freischaltungen (app_metadata.pro bei SchutzDex, Tabelle pro_overrides bei CraftDex).
// Suite-Umstellung 26.11.2026: CraftDex und TourDex sind nicht mehr im Suite-Abo (registry: suiteNurBestand). Dort zählt
// eine Suite nur noch, wenn der Suite-Server sie mit &app=<app> bestätigt (Bestandsschutz, Stichtags-Liste) oder sie im
// RevenueCat-Projekt der App bis zum Stichtag gekauft wurde — das entscheidet loadAboInfo (src/lib/abo.ts). SchutzDex
// bleibt in der Suite: unverändert.
//
// Drei Zustände wie überall (src/lib/proStand.ts): true = sicher Pro · false = ALLE Quellen haben sicher „nein“ gesagt ·
// null = mindestens eine Quelle hat nicht geantwortet (dann gilt der letzte sichere Stand dieses Kontos, sonst „unklar“).
// Grenzen nutzen proFuerGrenze(…) (unklar → „gleich nochmal“), Anzeigen proFuerAnzeige(…) (unklar → Pro).

import type { Session } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { dexwareId, loadAboInfo, SUITE_ANON, SUITE_URL } from './abo';
import { proStand, type ProQuelle } from './proStand';

export interface AboProOptionen {
  /** Vom Server vergebenes Frei-/Testkonto in app_metadata.pro zählt (SchutzDex, wie compPro in der App). */
  metaPro?: boolean;
  /** Suite-Server zusätzlich mit &app=<appParam> fragen (Pro dieser App aus der Sammel-App). */
  appParam?: string;
  /** Weitere app-eigene Quelle (z. B. CraftDex pro_overrides): true/false, null = unklar. */
  extra?: ProQuelle;
}

/** Quelle aus Abo-Auskunft + Suite-Server (+ app-eigene Freischaltung). */
export function aboQuelle(app: AppConfig, session: Session, opt: AboProOptionen = {}): ProQuelle {
  return async () => {
    if (opt.metaPro && session.user.app_metadata?.pro === true) return true;
    let sicher = true;
    let schonMitApp = false;
    // 1) RevenueCat + Suite-Server (ohne &app für Suite-Apps; mit &app=<id> für Apps mit suiteNurBestand — dann zählt die
    //    Suite nur als Bestand, und die Antwort enthält schon Pro dieser App aus der Sammel-App bzw. per Gutschein)
    try {
      const abo = await loadAboInfo(app, session);
      if (abo.pro?.active || abo.suite?.active || abo.suiteBackendActive || abo.appProBackend) return true;
      if (abo.suiteBackendUnknown) sicher = false;
      else schonMitApp = !!opt.appParam && abo.suiteAppParam === opt.appParam;
    } catch {
      sicher = false; // RevenueCat hat nicht (vollständig) geantwortet
    }
    // 2) Pro dieser App aus der Sammel-App „Dexware“ (suite-status &app=) — entfällt, wenn Schritt 1 genau das schon
    //    sicher gefragt hat
    if (opt.appParam && !schonMitApp) {
      const email = session.user.email;
      if (email) {
        try {
          const id = await dexwareId(email);
          const res = await fetch(`${SUITE_URL}/suite-status?app_user_id=${id}&app=${encodeURIComponent(opt.appParam)}`, {
            headers: { Authorization: `Bearer ${SUITE_ANON}`, apikey: SUITE_ANON },
          });
          if (!res.ok) sicher = false;
          else if (((await res.json()) as { active?: unknown }).active === true) return true;
        } catch {
          sicher = false;
        }
      }
    }
    // 3) app-eigene Freischaltung
    if (opt.extra) {
      try {
        const v = await opt.extra();
        if (v === true) return true;
        if (v !== false) sicher = false;
      } catch {
        sicher = false;
      }
    }
    return sicher ? false : null;
  };
}

/** Pro-Stand dieses Kontos in dieser App (frisch gefragt, bei Unklarheit der letzte sichere Stand, sonst null). */
export function aboProStand(app: AppConfig, session: Session | null, opt: AboProOptionen = {}, fresh = true): Promise<boolean | null> {
  if (!session) return Promise.resolve(null);
  return proStand(app.id, session.user.id, aboQuelle(app, session, opt), fresh);
}
