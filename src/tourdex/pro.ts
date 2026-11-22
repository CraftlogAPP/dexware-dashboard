import type { Session } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { dexwareId, loadAboInfo, SUITE_ANON, SUITE_URL } from '../lib/abo';

/**
 * Darf dieses Konto das Fahrtenbuch-PDF erzeugen? Wie in der TourDex-App (useExport.ts: PDF nur mit Pro):
 * TourDex Pro (RevenueCat), Dexware Suite oder TourDex Pro aus der Sammel-App „Dexware“ (suite-status &app=tourdex).
 * Unklare Auskunft (Netz, RevenueCat, Suite-Server) → NICHT sperren: lieber einmal zu großzügig als einem zahlenden
 * Konto das PDF verweigern.
 */
export async function tourdexPdfAllowed(app: AppConfig, session: Session): Promise<boolean> {
  try {
    const info = await loadAboInfo(app, session);
    if (info.pro?.active || info.suite?.active || info.suiteBackendActive || info.suiteBackendUnknown) return true;
  } catch {
    return true;
  }
  try {
    const email = session.user.email;
    if (!email) return false;
    const id = await dexwareId(email);
    const res = await fetch(`${SUITE_URL}/suite-status?app_user_id=${id}&app=tourdex`, {
      headers: { Authorization: `Bearer ${SUITE_ANON}`, apikey: SUITE_ANON },
    });
    if (!res.ok) return true;
    const body = (await res.json()) as { active?: boolean };
    return body.active === true;
  } catch {
    return true;
  }
}
