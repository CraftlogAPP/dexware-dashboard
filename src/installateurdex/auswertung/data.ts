// Datenquelle der Auswertungen + des öffentlichen Profils (Helfer-Eintrag). Anlagen, Objekte, Wartungsstand und
// Folgeeinsätze kommen aus useInst().data — hier nur, was zusätzlich gebraucht wird. Gleiche RLS wie die App.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../../lib/orgApi';
import { fetchAllRows } from '../fetchAll';
import type { FgasJob, FixJob } from './logic';

/** Eintrag im Installateur-Helfer — Felder wie HelperListing in mobile/src/data/supabaseRepository.ts */
export interface HelperListing {
  listed: boolean;
  zip: string;
  city: string;
  trades: string[];
  blurb: string;
  /** öffentliche Telefonnummer oder E-Mail hinterlegt (Pflicht fürs Listen) */
  hasContact: boolean;
  /** Ortsmitte für die Umkreissuche gesetzt (helper_lat/helper_lng) */
  hasGeo: boolean;
}

export interface HelperListingInput {
  listed: boolean;
  zip: string;
  city: string;
  trades: string[];
  blurb: string;
  /** true = Ortsmitte löschen (PLZ/Ort geändert — die Umkreissuche rechnet die App beim nächsten Speichern neu) */
  clearGeo: boolean;
}

export interface AuswertungData {
  /** Alle Einsätze eines Kalenderjahres (lokal) — schmale Spalten für den Kältemittel-Jahresbericht. */
  fgasJobs(year: number): Promise<FgasJob[]>;
  /** Fehlercode-Verlauf: gültige Wartungen/Reparaturen/Arbeitsberichte mit Text an diesen Anlagen (wie App pastFixes). */
  fixJobs(itemIds: string[]): Promise<FixJob[]>;
  /** Wartungsvertrag bei einer Anlage vermerken (RLS item_update: nur Inhaber). */
  markContract(assetId: string): Promise<void>;
  helperListing(orgId: string): Promise<HelperListing>;
  saveHelperListing(orgId: string, p: HelperListingInput): Promise<void>;
}

const FIX_COLS = 'id, item_id, type, started_at, work_done, follow_up, canceled';
const FGAS_COLS = 'id, site_id, item_id, type, started_at, measurements, inspector_name, canceled, entry_hash';

/** Fehlertext wie die App (saveHelperListing). */
export function helperSaveError(message: string): string {
  return /helper_listed_check/.test(message)
    ? 'Zum Freischalten braucht es eine PLZ und eine öffentliche Telefonnummer oder E-Mail (Einstellungen → Anlagenpass & Kunden).'
    : message;
}

export function supabaseAuswertung(sb: SupabaseClient): AuswertungData {
  return {
    async fgasJobs(year) {
      // Jahresgrenzen nach lokalem Kalender (1.1. 00:00 bis 1.1. Folgejahr) — die genaue Prüfung macht fgasYear().
      const from = new Date(year, 0, 1).toISOString();
      const to = new Date(year + 1, 0, 1).toISOString();
      const load = (cols: string) =>
        fetchAllRows<FgasJob>((a, b) =>
          sb.from('inspection').select(cols).gte('started_at', from).lt('started_at', to).order('started_at').order('id').range(a, b),
        );
      let { data, error } = await load(FGAS_COLS);
      // Ältere Datenbank ohne Prüfcode-Spalte (gps-pruefnachweis.sql fehlt): ohne Prüfcode weiter
      if (error && /entry_hash/.test(error.message ?? '')) ({ data, error } = await load(FGAS_COLS.replace(', entry_hash', '')));
      if (error) fail('Einsätze für den Jahresbericht konnten nicht geladen werden', error);
      return data.map((r) => ({ ...r, entry_hash: r.entry_hash ?? null, canceled: r.canceled === true }));
    },

    async fixJobs(itemIds) {
      // Server filtert vor (nur Einsatzarten mit Lösungstext), die genaue Auswahl macht pastFixes() wie in der App.
      const ids = [...new Set(itemIds)];
      const load = (cols: string, chunk: string[]) =>
        fetchAllRows<FixJob>((a, b) =>
          sb
            .from('inspection')
            .select(cols)
            .in('item_id', chunk)
            .eq('canceled', false)
            .in('type', ['repair', 'service', 'workReport'])
            .not('work_done', 'is', null)
            .order('started_at', { ascending: false })
            .order('id')
            .range(a, b),
        );
      const out: FixJob[] = [];
      let cols = FIX_COLS;
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100); // kurze URLs: höchstens 100 Anlagen je Abfrage
        let { data, error } = await load(cols, chunk);
        // Datenbank ohne folgeeinsatz.sql: ohne follow_up weiter
        if (error && /follow_up/.test(error.message ?? '')) {
          cols = FIX_COLS.replace(', follow_up', '');
          ({ data, error } = await load(cols, chunk));
        }
        if (error) fail('Frühere Lösungen konnten nicht geladen werden', error);
        out.push(...data.map((r) => ({ ...r, canceled: r.canceled === true })));
      }
      return out;
    },

    async markContract(assetId) {
      const { data, error } = await sb.from('asset').update({ contract: true }).eq('id', assetId).select('id');
      if (error) fail('Wartungsvertrag konnte nicht gespeichert werden', error);
      if (!data?.length) throw new Error('Nur der Inhaber kann das ändern.');
    },

    async helperListing(orgId) {
      // wie getHelperListing in der App, dazu helper_lat für den Hinweis zur Umkreissuche
      const { data, error } = await sb
        .from('org')
        .select('helper_listed, helper_zip, helper_city, helper_trades, helper_blurb, helper_lat, public_phone, public_email')
        .eq('id', orgId)
        .maybeSingle();
      if (error) {
        if (/helper_/.test(error.message ?? '')) {
          throw new Error('Der Installateur-Helfer ist in der Datenbank noch nicht eingerichtet (NACHTRAG-HELFER.sql).');
        }
        fail('Eintrag im Installateur-Helfer konnte nicht geladen werden', error);
      }
      const r = (data ?? {}) as Record<string, unknown>;
      return {
        listed: r.helper_listed === true,
        zip: typeof r.helper_zip === 'string' ? r.helper_zip : '',
        city: typeof r.helper_city === 'string' ? r.helper_city : '',
        trades: Array.isArray(r.helper_trades) ? (r.helper_trades as string[]) : [],
        blurb: typeof r.helper_blurb === 'string' ? r.helper_blurb : '',
        hasContact: !!(r.public_phone || r.public_email),
        hasGeo: typeof r.helper_lat === 'number',
      };
    },

    async saveHelperListing(orgId, p) {
      // wie saveHelperListing in der App; die Ortsmitte (helper_lat/lng) bleibt, solange PLZ/Ort gleich sind
      const { data, error } = await sb
        .from('org')
        .update({
          helper_listed: p.listed,
          helper_zip: p.zip.trim() || null,
          helper_city: p.city.trim() || null,
          helper_trades: p.trades,
          helper_blurb: p.blurb.trim() || null,
          ...(p.clearGeo ? { helper_lat: null, helper_lng: null } : {}),
        })
        .eq('id', orgId)
        .select('id');
      if (error) throw new Error(helperSaveError(error.message));
      if (!data?.length) throw new Error('Nur der Inhaber kann das ändern.');
    },
  };
}
