// Beispiel-Zugang (NUR Dev-Server, siehe docs/beispiel-zugang.md): ein Speicher-Client anstelle von Supabase.
// Er kann, was die Dashboard-Seiten von supabase-js brauchen — from().select/eq/neq/in/gt/gte/lt/lte/is/not/or/contains/
// like/ilike/order/limit/range/single/maybeSingle (+ count/head), insert/upsert/update/delete (nur im Speicher), rpc,
// auth (feste Beispiel-Sitzung), storage (Bilder aus den Beispieldaten), channel (stumm).
// Unbekannte Tabellen/RPCs liefern LEERE Daten statt Fehler und werden in der Konsole gemeldet ([Beispiel] …).
// Kein Netz: Der Client schickt nie eine Anfrage an einen Server.
// Importe mit Dateiendung: tests/beispiel-zugang.test.mjs lädt die Datei direkt mit Node.

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { BeispielDaten, RpcAntwort, Tabellen, Zeile } from './typen.ts';

/** Eindeutiges Merkwort: steht im Beispiel-Code und darf im Produktions-Build (dist/) NIE vorkommen. */
export const MERKWORT = 'DEX-BEISPIEL-ZUGANG-NUR-DEV';

type Fehler = { message: string; code?: string; details?: string; hint?: string };
type Antwort = { data: unknown; error: Fehler | null; count: number | null; status: number; statusText: string };
type Pruefer = (z: Zeile) => boolean;

const gemeldet = new Set<string>();
/** Alle Meldungen dieser Seite (zum Nachsehen: window.__beispiel.meldungen) */
export const meldungen: string[] = [];
/** Einmal je Anlass in der Konsole melden (sonst flutet z. B. fetchAllOf die Konsole) */
function melde(text: string): void {
  if (gemeldet.has(text)) return;
  gemeldet.add(text);
  meldungen.push(text);
  console.warn(`[Beispiel] ${text}`);
}

// ---------------------------------------------------------------------------- Vergleiche wie PostgreSQL (vereinfacht)

const ZEITSTEMPEL = /^\d{4}-\d{2}-\d{2}T/;
const ZAHL = /^-?\d+(\.\d+)?$/;

function wert(x: unknown): number | string {
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'string') {
    if (ZEITSTEMPEL.test(x)) {
      const t = Date.parse(x);
      if (!Number.isNaN(t)) return t;
    }
    if (ZAHL.test(x)) return Number(x);
    return x;
  }
  return JSON.stringify(x);
}

/** <0, 0, >0 — Zahlen/Zeitpunkte numerisch, sonst Text (Byte-Reihenfolge wie Collation „C“) */
export function vergleiche(a: unknown, b: unknown): number {
  let x = wert(a);
  let y = wert(b);
  // reines Datum gegen Zeitstempel: Datum als Tagesbeginn (UTC) lesen
  if (typeof x === 'number' && typeof y === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(y)) y = Date.parse(`${y}T00:00:00Z`);
  if (typeof y === 'number' && typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) x = Date.parse(`${x}T00:00:00Z`);
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  const s = String(x);
  const t = String(y);
  return s < t ? -1 : s > t ? 1 : 0;
}

function gleich(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false; // eq null trifft in PostgreSQL nie (dafür gibt es is)
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return vergleiche(a, b) === 0;
}

function enthaelt(feld: unknown, soll: unknown): boolean {
  if (Array.isArray(soll)) return Array.isArray(feld) && soll.every((s) => feld.some((f) => gleich(f, s) || JSON.stringify(f) === JSON.stringify(s)));
  if (soll && typeof soll === 'object') {
    if (!feld || typeof feld !== 'object') return false;
    return Object.entries(soll).every(([k, v]) => JSON.stringify((feld as Zeile)[k]) === JSON.stringify(v));
  }
  return gleich(feld, soll);
}

function muster(m: string, gross: boolean): RegExp {
  const re = m.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${re}$`, gross ? 'i' : '');
}

/** Wert aus einem Filter-Text („null“, „true“, „(a,b)“ …) */
function textWert(v: string): unknown {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('(') && v.endsWith(')')) return v.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
  return v.replace(/^"|"$/g, '');
}

/** Filter wie PostgREST-Operatoren (eq, neq, gt, gte, lt, lte, in, is, like, ilike, cs) */
function operator(spalte: string, op: string, v: unknown): Pruefer {
  switch (op) {
    case 'eq':
      return (z) => gleich(z[spalte], v);
    case 'neq':
      return (z) => z[spalte] != null && !gleich(z[spalte], v);
    case 'gt':
      return (z) => z[spalte] != null && vergleiche(z[spalte], v) > 0;
    case 'gte':
      return (z) => z[spalte] != null && vergleiche(z[spalte], v) >= 0;
    case 'lt':
      return (z) => z[spalte] != null && vergleiche(z[spalte], v) < 0;
    case 'lte':
      return (z) => z[spalte] != null && vergleiche(z[spalte], v) <= 0;
    case 'in': {
      const liste = Array.isArray(v) ? v : typeof v === 'string' ? (textWert(v) as unknown[]) : [v];
      return (z) => liste.some((x) => gleich(z[spalte], x));
    }
    case 'is':
      return (z) => (v === null || v === 'null' ? z[spalte] == null : z[spalte] === (v === 'true' ? true : v === 'false' ? false : v));
    case 'like':
      return (z) => typeof z[spalte] === 'string' && muster(String(v), false).test(z[spalte] as string);
    case 'ilike':
      return (z) => typeof z[spalte] === 'string' && muster(String(v), true).test(z[spalte] as string);
    case 'cs':
    case 'contains':
      return (z) => enthaelt(z[spalte], v);
    default:
      melde(`Filter-Operator „${op}“ wird nicht nachgebaut — ignoriert`);
      return () => true;
  }
}

/** .or('a.is.null,b.lt.2026-01-01') — ohne Verschachtelung (and(...) kommt im Dashboard nicht vor) */
function oder(text: string): Pruefer {
  const teile = text.split(',').map((t) => t.trim()).filter(Boolean);
  const pruefer = teile.map((t) => {
    const [spalte, op, ...rest] = t.split('.');
    const roh = rest.join('.');
    if (op === 'not') {
      const [op2, ...r2] = roh.split('.');
      const p = operator(spalte, op2, textWert(r2.join('.')));
      return (z: Zeile) => !p(z);
    }
    return operator(spalte, op, textWert(roh));
  });
  return (z) => pruefer.some((p) => p(z));
}

// ---------------------------------------------------------------------------- Spalten-Auswahl

/** select('id, name, alias:spalte') → [Ziel, Quelle]; null = alle Spalten */
function spaltenListe(sel: string): [string, string][] | null {
  const teile = sel.split(',').map((s) => s.trim()).filter(Boolean);
  if (teile.length === 0 || teile.includes('*')) return null;
  return teile.map((t) => {
    const ohneCast = t.replace(/::\w+$/, '');
    const [a, b] = ohneCast.split(':');
    return b ? [a.trim(), b.trim()] : [a.trim(), a.trim()];
  });
}

function auswahl(z: Zeile, spalten: [string, string][] | null): Zeile {
  if (!spalten) return structuredClone(z);
  const out: Zeile = {};
  // Spalte fehlt in den Beispieldaten → null (wie eine leere Spalte; PostgREST würde bei einer unbekannten Spalte 42703 melden)
  for (const [ziel, quelle] of spalten) out[ziel] = z[quelle] === undefined ? null : structuredClone(z[quelle]);
  return out;
}

// ---------------------------------------------------------------------------- Abfrage (verkettbar, await-bar)

type Art = 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc';

interface Ziel {
  tabellen: Tabellen;
  /** RPC-Ergebnis (nur Art rpc) */
  rpcWert?: unknown;
}

export class Abfrage implements PromiseLike<Antwort> {
  private readonly ziel: Ziel;
  private readonly tabelle: string;
  private art: Art;
  private pruefer: Pruefer[] = [];
  private sortierung: { spalte: string; auf: boolean; nullsFirst?: boolean }[] = [];
  private bereich: [number, number] | null = null;
  private hoechstens: number | null = null;
  private spalten: [string, string][] | null = null;
  private zaehlen = false;
  private nurKopf = false;
  private zurueck = false;
  private einzeln: 'single' | 'maybe' | null = null;
  private werfen = false;
  private nutzlast: Zeile[] = [];
  private aenderung: Zeile = {};
  private konflikt = ['id'];
  private doppelteAuslassen = false;

  constructor(ziel: Ziel, tabelle: string, art: Art = 'select') {
    this.ziel = ziel;
    this.tabelle = tabelle;
    this.art = art;
  }

  // --- Lesen / Rückgabe
  select(spalten = '*', opt?: { count?: string; head?: boolean }): this {
    if (this.art !== 'select' && this.art !== 'rpc') this.zurueck = true;
    this.spalten = spaltenListe(spalten);
    if (opt?.count) this.zaehlen = true;
    if (opt?.head) this.nurKopf = true;
    return this;
  }

  // --- Schreiben (nur im Speicher)
  insert(werte: Zeile | Zeile[]): this {
    this.art = 'insert';
    this.nutzlast = (Array.isArray(werte) ? werte : [werte]).map((w) => structuredClone(w));
    return this;
  }
  upsert(werte: Zeile | Zeile[], opt?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.art = 'upsert';
    this.nutzlast = (Array.isArray(werte) ? werte : [werte]).map((w) => structuredClone(w));
    if (opt?.onConflict) this.konflikt = opt.onConflict.split(',').map((s) => s.trim());
    this.doppelteAuslassen = !!opt?.ignoreDuplicates;
    return this;
  }
  update(werte: Zeile): this {
    this.art = 'update';
    this.aenderung = structuredClone(werte);
    return this;
  }
  delete(): this {
    this.art = 'delete';
    return this;
  }

  // --- Filter
  eq(s: string, v: unknown): this {
    return this.add(operator(s, 'eq', v));
  }
  neq(s: string, v: unknown): this {
    return this.add(operator(s, 'neq', v));
  }
  gt(s: string, v: unknown): this {
    return this.add(operator(s, 'gt', v));
  }
  gte(s: string, v: unknown): this {
    return this.add(operator(s, 'gte', v));
  }
  lt(s: string, v: unknown): this {
    return this.add(operator(s, 'lt', v));
  }
  lte(s: string, v: unknown): this {
    return this.add(operator(s, 'lte', v));
  }
  in(s: string, v: readonly unknown[]): this {
    return this.add(operator(s, 'in', [...v]));
  }
  is(s: string, v: unknown): this {
    return this.add(operator(s, 'is', v));
  }
  like(s: string, v: string): this {
    return this.add(operator(s, 'like', v));
  }
  ilike(s: string, v: string): this {
    return this.add(operator(s, 'ilike', v));
  }
  contains(s: string, v: unknown): this {
    return this.add(operator(s, 'cs', v));
  }
  match(obj: Zeile): this {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  not(s: string, op: string, v: unknown): this {
    const p = operator(s, op, typeof v === 'string' ? textWert(v) : v);
    return this.add((z) => !p(z));
  }
  filter(s: string, op: string, v: unknown): this {
    if (op.startsWith('not.')) return this.not(s, op.slice(4), v);
    return this.add(operator(s, op, typeof v === 'string' ? textWert(v) : v));
  }
  or(text: string): this {
    return this.add(oder(text));
  }
  textSearch(): this {
    melde(`textSearch auf „${this.tabelle}“ wird nicht nachgebaut — ignoriert`);
    return this;
  }

  // --- Reihenfolge, Ausschnitt
  order(spalte: string, opt?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.sortierung.push({ spalte, auf: opt?.ascending ?? true, nullsFirst: opt?.nullsFirst });
    return this;
  }
  limit(n: number): this {
    this.hoechstens = n;
    return this;
  }
  range(von: number, bis: number): this {
    this.bereich = [von, bis];
    return this;
  }
  single(): this {
    this.einzeln = 'single';
    return this;
  }
  maybeSingle(): this {
    this.einzeln = 'maybe';
    return this;
  }

  // --- ohne Wirkung im Speicher
  abortSignal(): this {
    return this;
  }
  returns(): this {
    return this;
  }
  overrideTypes(): this {
    return this;
  }
  throwOnError(): this {
    this.werfen = true;
    return this;
  }

  then<A = Antwort, B = never>(
    ok?: ((v: Antwort) => A | PromiseLike<A>) | null,
    fehler?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return Promise.resolve()
      .then(() => this.ausfuehren())
      .then((a) => {
        if (this.werfen && a.error) throw Object.assign(new Error(a.error.message), a.error);
        return a;
      })
      .then(ok, fehler);
  }

  private add(p: Pruefer): this {
    this.pruefer.push(p);
    return this;
  }

  private zeilen(): Zeile[] | null {
    const t = this.ziel.tabellen[this.tabelle];
    if (!t) {
      melde(`keine Beispieldaten für Tabelle „${this.tabelle}“ — leere Antwort`);
      return null;
    }
    return t;
  }

  private sortiere(liste: Zeile[]): Zeile[] {
    if (this.sortierung.length === 0) return liste;
    return [...liste].sort((a, b) => {
      for (const { spalte, auf, nullsFirst } of this.sortierung) {
        const x = a[spalte];
        const y = b[spalte];
        if (x == null || y == null) {
          if (x == null && y == null) continue;
          // PostgreSQL: aufsteigend NULLS LAST, absteigend NULLS FIRST (sofern nicht angegeben)
          const nullVorn = nullsFirst ?? !auf;
          return (x == null ? -1 : 1) * (nullVorn ? 1 : -1);
        }
        const d = vergleiche(x, y);
        if (d !== 0) return auf ? d : -d;
      }
      return 0;
    });
  }

  private antwort(data: unknown, count: number | null = null, error: Fehler | null = null): Antwort {
    return { data: error ? null : data, error, count, status: error ? 400 : 200, statusText: error ? 'Bad Request' : 'OK' };
  }

  private ausfuehren(): Antwort {
    if (this.art === 'rpc') return this.ausRpc();
    if (this.art === 'select') return this.lesen(this.zeilen() ?? []);
    return this.schreiben();
  }

  private lesen(alle: Zeile[]): Antwort {
    const passend = this.sortiere(alle.filter((z) => this.pruefer.every((p) => p(z))));
    const anzahl = passend.length;
    let teil = passend;
    if (this.bereich) teil = teil.slice(this.bereich[0], this.bereich[1] + 1);
    if (this.hoechstens != null) teil = teil.slice(0, this.hoechstens);
    const zaehl = this.zaehlen ? anzahl : null;
    if (this.nurKopf) return this.antwort(null, zaehl);
    const daten = teil.map((z) => auswahl(z, this.spalten));
    return this.einzelAntwort(daten, zaehl);
  }

  private einzelAntwort(daten: Zeile[], zaehl: number | null): Antwort {
    if (this.einzeln === null) return this.antwort(daten, zaehl);
    if (daten.length === 1) return this.antwort(daten[0], zaehl);
    if (daten.length === 0 && this.einzeln === 'maybe') return this.antwort(null, zaehl);
    return this.antwort(null, zaehl, {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
      details: `The result contains ${daten.length} rows`,
    });
  }

  private ausRpc(): Antwort {
    const w = this.ziel.rpcWert;
    if (Array.isArray(w)) return this.lesen(w as Zeile[]);
    return this.antwort(w === undefined ? null : structuredClone(w));
  }

  private schreiben(): Antwort {
    let t = this.ziel.tabellen[this.tabelle];
    if (!t) {
      melde(`Schreiben in „${this.tabelle}“ ohne Beispieldaten — neue Tabelle im Speicher angelegt`);
      t = this.ziel.tabellen[this.tabelle] = [];
    }
    let betroffen: Zeile[] = [];
    if (this.art === 'insert') {
      for (const z of this.nutzlast) {
        if (z.id != null && t.some((x) => gleich(x.id, z.id))) {
          return this.antwort(null, null, { code: '23505', message: `duplicate key value violates unique constraint "${this.tabelle}_pkey"` });
        }
      }
      t.push(...this.nutzlast);
      betroffen = this.nutzlast;
    } else if (this.art === 'upsert') {
      for (const z of this.nutzlast) {
        const da = t.find((x) => this.konflikt.every((k) => gleich(x[k], z[k])));
        if (da && this.doppelteAuslassen) continue;
        if (da) Object.assign(da, z);
        else t.push(z);
        betroffen.push(da ?? z);
      }
    } else if (this.art === 'update') {
      betroffen = t.filter((z) => this.pruefer.every((p) => p(z)));
      for (const z of betroffen) Object.assign(z, structuredClone(this.aenderung));
    } else if (this.art === 'delete') {
      betroffen = t.filter((z) => this.pruefer.every((p) => p(z)));
      this.ziel.tabellen[this.tabelle] = t.filter((z) => !betroffen.includes(z));
    }
    console.info(`[Beispiel] ${this.art} „${this.tabelle}“: ${betroffen.length} Zeile(n) — nur im Speicher, nach dem Neuladen wieder wie vorher`);
    if (!this.zurueck) return this.antwort(null, this.zaehlen ? betroffen.length : null);
    return this.einzelAntwort(betroffen.map((z) => auswahl(z, this.spalten)), null);
  }
}

// ---------------------------------------------------------------------------- Standard-RPCs aller Dex-Apps

/**
 * RPCs, die viele Bereiche fragen. Pro ist im Beispiel immer aktiv (org_pro_active) — so erscheinen weder Paywall noch
 * Gratis-Hinweise. Die Beispieldaten einer App können jede davon überschreiben (BeispielDaten.rpc).
 */
function standardRpc(daten: BeispielDaten, mitglieder: () => Zeile[]): Record<string, RpcAntwort> {
  const ablauf = new Date(Date.now() + 23 * 86_400_000).toISOString();
  return {
    org_pro_active: () => true,
    // Rückmeldungen: Menüpunkt „Fehler melden“ wie bei einem normalen Konto, keine Dexware-Verwaltung
    my_feedback: () => [],
    feedback_admin: () => false,
    list_members: () => mitglieder(),
    team_code: () => [{ code: `${daten.app.slice(0, 2).toUpperCase()}-7K3M9Q`, expires_at: ablauf, use_count: Math.max(0, mitglieder().length - 1) }],
    sync_seat_limit: () => [{ seat_limit: 20, members: mitglieder().length }],
  };
}

// ---------------------------------------------------------------------------- Sitzung

export function beispielSitzung(daten: BeispielDaten): Session {
  const seit = (daten.tabellen.membership?.[0]?.created_at as string | undefined) ?? new Date(Date.now() - 400 * 86_400_000).toISOString();
  const jetzt = Math.floor(Date.now() / 1000);
  return {
    access_token: `beispiel.${daten.app}`,
    refresh_token: `beispiel.${daten.app}`,
    token_type: 'bearer',
    expires_in: 3600 * 24,
    expires_at: jetzt + 3600 * 24,
    user: {
      id: daten.nutzer.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: daten.nutzer.email,
      email_confirmed_at: seit,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: seit,
    },
  } as Session;
}

// ---------------------------------------------------------------------------- Client

const NICHT_MOEGLICH: Fehler = { message: 'Im Beispielmodus nicht möglich (kein Server).', code: 'BEISPIEL' };

/** Speicher-Client mit den Beispieldaten (jede App eine eigene Kopie — Schreiben ändert nur diesen Speicher). */
export function beispielClient(daten: BeispielDaten, session: Session = beispielSitzung(daten)): SupabaseClient {
  const tabellen: Tabellen = structuredClone(daten.tabellen);
  const mitglieder = (): Zeile[] => {
    const ms = tabellen.membership ?? [];
    return ms.map((m) => ({
      membership_id: m.id,
      user_id: m.user_id,
      email: (m.email as string | undefined) ?? (m.user_id === daten.nutzer.id ? daten.nutzer.email : ''),
      role: m.role,
      joined_at: m.created_at,
    }));
  };
  const rpcs: Record<string, RpcAntwort> = { ...standardRpc(daten, mitglieder), ...(daten.rpc ?? {}) };
  const fotos = daten.fotos ?? {};

  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
      setTimeout(() => cb('INITIAL_SESSION', session), 0);
      return { data: { subscription: { id: 'beispiel', callback: cb, unsubscribe: () => undefined } } };
    },
    signOut: async () => ({ error: null }),
    refreshSession: async () => ({ data: { session, user: session.user }, error: null }),
  };
  const authProxy = new Proxy(auth, {
    get(ziel, name) {
      if (typeof name === 'string' && !(name in ziel)) {
        return async () => {
          melde(`auth.${name}() — im Beispielmodus nicht möglich`);
          return { data: { user: null, session: null }, error: NICHT_MOEGLICH };
        };
      }
      return Reflect.get(ziel, name);
    },
  });

  const signiert = (bucket: string, pfad: string): string | null => fotos[`${bucket}/${pfad}`] ?? fotos[pfad] ?? null;
  const storage = {
    from: (bucket: string) => ({
      createSignedUrls: async (pfade: string[]) => ({
        data: pfade.map((p) => {
          const url = signiert(bucket, p);
          if (!url) melde(`kein Beispielbild für ${bucket}/${p}`);
          return { path: p, signedUrl: url ?? '', error: url ? null : 'Object not found' };
        }),
        error: null,
      }),
      createSignedUrl: async (p: string) => {
        const url = signiert(bucket, p);
        return url ? { data: { signedUrl: url }, error: null } : { data: null, error: { message: 'Object not found' } };
      },
      getPublicUrl: (p: string) => ({ data: { publicUrl: signiert(bucket, p) ?? '' } }),
      upload: async (p: string) => {
        melde(`Foto-Upload ${bucket}/${p} — nur simuliert`);
        return { data: { path: p, id: p, fullPath: `${bucket}/${p}` }, error: null };
      },
      remove: async () => ({ data: [], error: null }),
      list: async () => ({ data: [], error: null }),
      download: async () => ({ data: null, error: NICHT_MOEGLICH }),
    }),
  };

  const kanal = {
    on() {
      return kanal;
    },
    subscribe(cb?: (status: string) => void) {
      setTimeout(() => cb?.('SUBSCRIBED'), 0);
      return kanal;
    },
    unsubscribe: async () => 'ok',
    send: async () => 'ok',
  };

  const client = {
    from: (tabelle: string) => new Abfrage({ tabellen }, tabelle),
    schema: () => client,
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      const f = rpcs[name];
      if (!f) melde(`keine Beispiel-Antwort für RPC „${name}“ — leere Antwort`);
      let wert: unknown = null;
      try {
        wert = f ? f(args, tabellen) : null;
      } catch (e) {
        console.error(`[Beispiel] RPC ${name}:`, e);
      }
      return new Abfrage({ tabellen, rpcWert: wert }, `rpc:${name}`, 'rpc');
    },
    auth: authProxy,
    storage,
    channel: () => kanal,
    removeChannel: async () => 'ok',
    removeAllChannels: async () => [],
    getChannels: () => [],
    functions: {
      invoke: async (name: string) => {
        melde(`Edge-Funktion „${name}“ — im Beispielmodus nicht verfügbar`);
        return { data: null, error: NICHT_MOEGLICH };
      },
    },
    /** zum Nachsehen in der Konsole: window.__beispiel.tabellen */
    __beispiel: { merkwort: MERKWORT, tabellen, meldungen },
  };

  return new Proxy(client, {
    get(ziel, name) {
      if (typeof name === 'string' && name !== 'then' && !(name in ziel)) melde(`client.${name} — im Speicher-Client nicht nachgebaut`);
      return Reflect.get(ziel, name);
    },
  }) as unknown as SupabaseClient;
}
