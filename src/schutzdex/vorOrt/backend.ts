// Datenzugriff von „Vor Ort“ (SchutzDex) hinter einer Schnittstelle — Supabase (echter Betrieb) oder Beispieldaten
// (demo.tsx, nur Dev-Server). Geschrieben wird wie in der App (src/lib/queries.ts): gleiche Spalten (rows.ts), die
// Unterschrift als PNG-Daten-URI in der Zeile; Nachweise sind danach unveränderlich.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllOf } from '../../lib/completeQueries';
import { fail } from '../../lib/orgApi';
import { isNetworkError } from '../../pruefen/backend';
import { kvGet, kvPut } from '../../pruefen/kv';
import { insertMember } from '../api';
import { memberGate, type MemberGate } from '../pro';
import type { Briefing, Member } from '../types';
import { withoutNewFields, type CompletionRow } from './rows';

/** Unterweisung MIT Inhalt und Fragen (zum Durchführen, auch ohne Netz). */
export interface SdBriefing extends Briefing {
  content: unknown;
  questions: unknown;
}

/** Schmale Nachweis-Daten für die Fälligkeit — ohne die (große) Unterschrift. */
export interface SdCompletion {
  id: string;
  member_id: string | null;
  briefing_id: string | null;
  check_passed: boolean;
  abgeschlossen_am: string;
}

export interface SdData {
  members: Member[];
  briefings: SdBriefing[];
  completions: SdCompletion[];
}

export interface SdBackend {
  load(): Promise<SdData>;
  /**
   * Nachweis anlegen; „ID gibt es schon“ (Wiederholung) zählt als Erfolg. Kennt die Datenbank die Felder des
   * Nachtrags (Thema, Inhaltsversion, unterweisende Person) noch nicht, wird ohne sie gespeichert (wie die App).
   */
  insertCompletion(row: CompletionRow): Promise<{ fieldsDropped: boolean }>;
  /** Mitarbeiter anlegen (Name, Tätigkeit) — wie addMember in der App. */
  addMember(orgId: string, input: { name: string; taetigkeit: string | null }): Promise<void>;
  /** Gratis-Grenze: 2 aktive Mitarbeiter ohne Pro. Im Zweifel erlaubt — nie zu Unrecht sperren. */
  memberGate(): Promise<MemberGate>;
}

type DbError = { code?: string; message?: string };

const missingColumn = (e: DbError) => e.code === 'PGRST204' || e.code === '42703';

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout (Zeitüberschreitung)')), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function supabaseSdBackend(sb: SupabaseClient, isPro: () => Promise<boolean>): SdBackend {
  return {
    async load() {
      const [m, b, c] = await Promise.all([
        fetchAllOf<Member>(() => sb.from('member').select('*'), [['created_at']]),
        fetchAllOf<SdBriefing>(() => sb.from('briefing').select('*'), [['created_at', false]]),
        fetchAllOf<SdCompletion>(() => sb.from('completion').select('id, member_id, briefing_id, check_passed, abgeschlossen_am'), [['abgeschlossen_am', false]]),
      ]);
      if (m.error) fail('Mitarbeiter konnten nicht geladen werden', m.error);
      if (b.error) fail('Unterweisungen konnten nicht geladen werden', b.error);
      if (c.error) fail('Nachweise konnten nicht geladen werden', c.error);
      return { members: m.data ?? [], briefings: b.data ?? [], completions: c.data ?? [] };
    },

    async insertCompletion(row) {
      let fieldsDropped = false;
      let { error } = (await withTimeout(sb.from('completion').insert(row), 20000)) as { error: DbError | null };
      if (error && missingColumn(error)) {
        fieldsDropped = true;
        ({ error } = (await withTimeout(sb.from('completion').insert(withoutNewFields(row)), 20000)) as { error: DbError | null });
      }
      if (error && error.code !== '23505') throw error; // 23505 = ID schon vorhanden (Wiederholung)
      return { fieldsDropped };
    },

    async addMember(orgId, input) {
      await insertMember(sb, orgId, { name: input.name, taetigkeit: input.taetigkeit, email: null, telefon: null, eintritt_am: null, aktiv: true });
    },

    memberGate: () => memberGate(sb, isPro),
  };
}

// --- Laden; der letzte Stand wird je Konto gemerkt (Baustelle, Keller: Unterweisen geht auch ohne Netz) ----------
// Im Gerätespeicher (IndexedDB) statt localStorage: Unterweisungen mit Inhalt und Fragen sind dafür zu groß.

interface Stand extends SdData {
  key: string;
}
const standKey = (userId: string) => `schutzdex:stand:${userId}`;

export interface SdState extends SdData {
  /** true = ohne Netz aus dem Gerätespeicher geladen (Stand vom letzten Laden) */
  offline: boolean;
}

export async function loadSd(be: SdBackend, userId: string): Promise<SdState> {
  try {
    const data = await be.load();
    void kvPut<Stand>({ key: standKey(userId), ...data });
    return { ...data, offline: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = await kvGet<Stand>(standKey(userId));
    if (!cached?.briefings || !cached.members) throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
    return { members: cached.members, briefings: cached.briefings, completions: cached.completions ?? [], offline: true };
  }
}
