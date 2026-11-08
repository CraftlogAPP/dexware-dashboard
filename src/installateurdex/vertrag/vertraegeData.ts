// Abgeschlossene Wartungsverträge (InstallateurDex/supabase/vertraege.sql): Tabelle maintenance_contract + unterschriebenes
// PDF im privaten Bucket „documents“ (<org>/contract/<datei>.pdf). Die App legt sie beim Abschluss ab; das Portal zeigt sie
// beim Kunden und bei der Anlage. Lesen dürfen alle im Betrieb (RLS). Fehlt die Tabelle noch (Nachtrag nicht live), liefert
// list() null → der Abschnitt bleibt still ausgeblendet.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ContractRow {
  id: string;
  site_id: string | null;
  created_at: string;
  signed_on: string;
  customer_name: string;
  asset_ids: string[];
  yearly_cents: number;
  with_vat: boolean;
  consumer: boolean;
  withdrawal: boolean;
  early_start: boolean | null;
  land: string;
  pdf_path: string;
}

export interface VertraegeData {
  /** Verträge eines Kunden (Objekt), neueste zuerst. null = Tabelle fehlt noch. */
  list(siteId: string): Promise<ContractRow[] | null>;
  /** Signierter Link (5 Minuten) zum unterschriebenen PDF. */
  pdfUrl(path: string): Promise<string>;
}

const COLS = 'id, site_id, created_at, signed_on, customer_name, asset_ids, yearly_cents, with_vat, consumer, withdrawal, early_start, land, pdf_path';

type PgError = { message: string; code?: string } | null;
const isMissing = (e: PgError) => !!e && (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(e.code ?? '') || /does not exist|could not find/i.test(e.message ?? ''));

export function supabaseVertraege(sb: SupabaseClient): VertraegeData {
  return {
    async list(siteId) {
      const { data, error } = await sb.from('maintenance_contract').select(COLS).eq('site_id', siteId).order('signed_on', { ascending: false }).order('created_at', { ascending: false }).limit(200);
      if (error) {
        if (isMissing(error)) return null;
        throw new Error(`Wartungsverträge konnten nicht geladen werden: ${error.message}`);
      }
      return ((data ?? []) as ContractRow[]).map((r) => ({ ...r, asset_ids: Array.isArray(r.asset_ids) ? r.asset_ids : [] }));
    },
    async pdfUrl(path) {
      const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw new Error(`PDF nicht verfügbar: ${error?.message ?? 'kein Link erhalten'}`);
      return data.signedUrl;
    },
  };
}

/** Beispieldaten: keine Verträge (Vertrag erstellen kann man in der Vorschau trotzdem ansehen). */
export function demoVertraege(): VertraegeData {
  return {
    async list() {
      return [];
    },
    async pdfUrl() {
      throw new Error('In den Beispieldaten gibt es keine unterschriebenen Verträge.');
    },
  };
}
