// ObjektDex — „Aus WinterDex übernehmen“ (Stufe 1, Plan dexware-suite/docs/ganzjahr-2026-11-24.md 5.6).
// Erreichbar per Direktlink /app/objektdex/aus-winterdex (der ObjektDex-Bereich bleibt `unlisted`) und aus der Objektliste.
//
// Ablauf: 1. bei WinterDex anmelden (gewohnte Anmeldung; eigene Sitzung dexware-dash-winterdex im selben Browser) →
//         2. ohne ObjektDex-Betrieb: Betrieb aus den WinterDex-Angaben vorbelegen, Nutzer bestätigt (create_org_with_owner) →
//         3. Objekte und Strecken anhaken → anlegen (Gratis-Grenze wie die App) → 4. optional Leistungen für die neuen
//         Objekte (Leistungen.tsx) → 5. Team-Code teilen.
// Lesen nur über RLS mit der WinterDex-Sitzung, Schreiben nur über RLS mit der ObjektDex-Sitzung — kein Server-Schlüssel,
// kein neuer Server. Logik (Mapping, Dubletten, Umschlüsseln, Grenze): ../uebernahme.ts.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, Upload } from 'lucide-react';
import { getApp, type AppConfig } from '../../apps/registry';
import { AppAuthProvider, useAppAuth } from '../../auth/AppAuthContext';
import { LoginScreen } from '../../auth/LoginScreen';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { fetchAllOf } from '../../lib/completeQueries';
import { UEBERNAHME_PFAD } from '../../lib/ganzjahr';
import { fetchOrgContext, readableDbError, roleLabel } from '../../lib/orgApi';
import { insertInChunks, type ImportProgress, type InsertFailure } from '../../lib/tableImport';
import { useOd } from '../context';
import { CopyButton } from '../parts';
import { LeistungenSammel } from './Leistungen';
import type { OdProperty } from '../types';
import {
  betriebVorbelegung,
  GRATIS_OBJEKTE,
  gratisRahmen,
  planUebernahme,
  standardAuswahl,
  streckenZeile,
  teamText,
  uebernahmeAuftrag,
  type Land,
  type OdStreckeKurz,
  type WdObjekt,
  type WdQuelle,
  type WdStrecke,
} from '../uebernahme';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
const STRIP = /^[^:]+ konnten nicht angelegt werden: /;
const LAND_LABEL: Record<Land, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };

// ---------------------------------------------------------------------------- Rahmen

function Kopf({ children }: { children?: ReactNode }) {
  return (
    <>
      <h1>Aus WinterDex übernehmen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Objekte und Strecken aus deinem WinterDex-Betrieb in ObjektDex anlegen — für Grünpflege, Reinigung und Kehrdienst im Rest des
        Jahres. In WinterDex ändert sich nichts: Einsätze und Fotos bleiben dort als Nachweis.
      </p>
      {children}
    </>
  );
}

/** Seite im ObjektDex-Bereich (Betrieb vorhanden). Beispieldaten: WinterDex-Betrieb aus demo.ts, ohne Anmeldung. */
export function AusWinterdex() {
  const { demo, winterdexDemo } = useOd();
  if (demo) {
    return <Kopf>{winterdexDemo ? <Uebernahme quelle={winterdexDemo} onAbmelden={null} /> : null}</Kopf>;
  }
  return (
    <Kopf>
      <WinterdexSitzung>{(quelle, abmelden) => <Uebernahme quelle={quelle} onAbmelden={abmelden} />}</WinterdexSitzung>
    </Kopf>
  );
}

/** ObjektDex-Konto ohne Betrieb: Betrieb aus den WinterDex-Angaben vorbelegen und anlegen (danach geht es oben weiter). */
export function AusWinterdexOhneBetrieb({ odClient, onCreated }: { odClient: SupabaseClient; onCreated: () => void }) {
  return (
    <Kopf>
      <WinterdexSitzung>
        {(quelle, abmelden) => <BetriebAnlegen quelle={quelle} odClient={odClient} onCreated={onCreated} onAbmelden={abmelden} />}
      </WinterdexSitzung>
    </Kopf>
  );
}

// ---------------------------------------------------------------------------- WinterDex-Sitzung (nur lesen)

/**
 * Eigene WinterDex-Sitzung (storageKey dexware-dash-winterdex) innerhalb des ObjektDex-Bereichs. Achtung: Unterhalb gibt
 * useAppAuth() WinterDex zurück — ObjektDex-Zugriffe laufen über useOd() bzw. den mitgegebenen ObjektDex-Client.
 */
function WinterdexSitzung({ children }: { children: (quelle: WdQuelle, abmelden: () => void) => ReactNode }) {
  // Keine Registrierung an dieser Stelle (ein neues WinterDex-Konto hätte nichts zu übernehmen)
  const app = useMemo<AppConfig | null>(() => {
    const a = getApp('winterdex');
    return a?.supabase ? { ...a, webSignup: false } : null;
  }, []);
  if (!app) return <div className="error-box">WinterDex ist in diesem Dashboard nicht eingerichtet.</div>;
  return (
    <AppAuthProvider app={app}>
      <WinterdexInhalt>{children}</WinterdexInhalt>
    </AppAuthProvider>
  );
}

function WinterdexInhalt({ children }: { children: (quelle: WdQuelle, abmelden: () => void) => ReactNode }) {
  const { client, session, loading, signOut } = useAppAuth();
  const email = session?.user.email ?? '';
  const state = useAsync(() => (session ? ladeWinterdex(client, email) : Promise.resolve(null)), [client, session?.user.id]);
  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (!session) {
    return (
      <>
        <div className="info-box">
          <b>Schritt 1:</b> Melde dich hier mit deinem <b>WinterDex</b>-Konto an, damit ObjektDex deine Objekte und Strecken lesen kann.
          Gelesen wird nur — in WinterDex ändert sich nichts.
        </div>
        <LoginScreen returnTo={UEBERNAHME_PFAD} />
      </>
    );
  }
  return <LoadGuard state={state}>{(q) => q && children(q, () => void signOut())}</LoadGuard>;
}

const WD_OBJEKT_COLS = 'id, name, address, lat, lng, customer_name, customer_contact, areas, notes, active';
const WD_STRECKE_COLS = 'id, name, notes, path, length_m, source, property_ids, active';

const missingTable = (e: { code?: string; message?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(e.message ?? '');

/** Betrieb, Rolle, Objekte und Strecken aus WinterDex — vollständig (seitenweise), nur lesend. */
async function ladeWinterdex(sb: SupabaseClient, email: string): Promise<WdQuelle> {
  const ctx = await fetchOrgContext(sb);
  if (!ctx) return { betrieb: null, rolle: null, email, objekte: [], strecken: [] };
  const [p, r] = await Promise.all([
    fetchAllOf<WdObjekt>(() => sb.from('property').select(WD_OBJEKT_COLS), [['active', false], ['name']]),
    fetchAllOf<WdStrecke>(() => sb.from('route').select(WD_STRECKE_COLS), [['active', false], ['name']]),
  ]);
  if (p.error) throw new Error(`WinterDex-Objekte konnten nicht geladen werden: ${readableDbError(p.error)}`);
  const ohneStrecken = !!r.error && missingTable(r.error);
  if (r.error && !ohneStrecken) throw new Error(`WinterDex-Strecken konnten nicht geladen werden: ${readableDbError(r.error)}`);
  return {
    betrieb: { name: ctx.org.name, land: ctx.org.land, address: ctx.org.address },
    rolle: ctx.role,
    email,
    objekte: p.data,
    strecken: ohneStrecken ? [] : r.data,
    ohneStrecken,
  };
}

/** Woher gelesen wird — mit „Anderes WinterDex-Konto“. Leer: kein Hinweis. */
function QuelleZeile({ quelle, onAbmelden }: { quelle: WdQuelle; onAbmelden: (() => void) | null }) {
  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          <span className="muted small">Aus WinterDex:</span> <b>{quelle.betrieb?.name ?? '—'}</b>
          <span className="muted small"> · {quelle.email}</span>
        </span>
        {onAbmelden && (
          <button type="button" className="btn ghost small" onClick={onAbmelden}>
            Anderes WinterDex-Konto
          </button>
        )}
      </div>
    </div>
  );
}

/** Kann aus diesem WinterDex-Konto übernommen werden? null = ja, sonst der Grund. */
function quelleProblem(q: WdQuelle): string | null {
  if (!q.betrieb) return 'Zu diesem WinterDex-Konto gibt es keinen Betrieb — hier gibt es nichts zu übernehmen. Bitte mit dem Konto des Inhabers anmelden.';
  if (q.rolle !== 'owner') return `Übernehmen kann nur der Inhaber des WinterDex-Betriebs — du bist dort ${roleLabel(q.rolle)}. Bitte mit dem Konto des Inhabers anmelden.`;
  return null;
}

// ---------------------------------------------------------------------------- Betrieb anlegen (ObjektDex-Konto ohne Betrieb)

function BetriebAnlegen({
  quelle,
  odClient,
  onCreated,
  onAbmelden,
}: {
  quelle: WdQuelle;
  odClient: SupabaseClient;
  onCreated: () => void;
  onAbmelden: () => void;
}) {
  const start = betriebVorbelegung(quelle.betrieb);
  const [name, setName] = useState(start.name);
  const [land, setLand] = useState<Land>(start.land);
  const [address, setAddress] = useState(start.address);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problem = quelleProblem(quelle);

  async function anlegen() {
    setErr(null);
    if (!name.trim()) return setErr('Bitte den Namen des Betriebs eingeben.');
    setBusy(true);
    try {
      const { error } = await odClient.rpc('create_org_with_owner', { p_name: name.trim(), p_land: land, p_address: address.trim() });
      if (error) throw new Error(`Betrieb nicht angelegt: ${readableDbError(error)}`);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <QuelleZeile quelle={quelle} onAbmelden={onAbmelden} />
      {problem ? (
        <div className="info-box">{problem}</div>
      ) : (
        <div className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Schritt 2: ObjektDex-Betrieb anlegen</h2>
          <p className="muted">
            Dein Konto hat in ObjektDex noch keinen Betrieb. Die Angaben stammen aus WinterDex — bitte kurz prüfen. Danach wählst du die
            Objekte und Strecken aus.
          </p>
          <label className="field">
            Name des Betriebs
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="organization" />
          </label>
          <label className="field">
            Land
            <select value={land} onChange={(e) => setLand(e.target.value as Land)}>
              {(Object.keys(LAND_LABEL) as Land[]).map((l) => (
                <option key={l} value={l}>
                  {LAND_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Adresse (optional)
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={240} autoComplete="street-address" />
          </label>
          {err && <div className="error-box">{err}</div>}
          <button type="button" className="btn" disabled={busy} onClick={() => void anlegen()}>
            {busy ? 'Wird angelegt …' : 'Betrieb anlegen und weiter'}
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------- Auswahl + Anlegen

interface Ziel {
  od: OdProperty[];
  odStrecken: OdStreckeKurz[];
  pro: boolean | null;
  /** neu geladen → Auswahl frisch aufbauen */
  stand: number;
}

interface Ergebnis {
  objekte: number;
  strecken: number;
  failed: InsertFailure[];
  notes: string[];
  /** ObjektDex-ids der neu angelegten Objekte */
  neueObjekte: string[];
  pro: boolean | null;
}

let standZaehler = 0;

function Uebernahme({ quelle, onAbmelden }: { quelle: WdQuelle; onAbmelden: (() => void) | null }) {
  const { data, role, base } = useOd();
  const ziel = useAsync<Ziel>(async () => {
    const [od, odStrecken, pro] = await Promise.all([data.listProperties(), data.listRoutes(), data.proStatus()]);
    return { od, odStrecken, pro, stand: ++standZaehler };
  }, [data]);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const problem = quelleProblem(quelle);

  return (
    <>
      <QuelleZeile quelle={quelle} onAbmelden={onAbmelden} />
      {problem ? (
        <div className="info-box">{problem}</div>
      ) : role !== 'owner' ? (
        <div className="info-box">Objekte und Strecken legt in ObjektDex nur der Inhaber an. Bitte mit dem Konto des Inhabers anmelden.</div>
      ) : !quelle.objekte.length && !quelle.strecken.length ? (
        <div className="info-box">Im WinterDex-Betrieb gibt es noch keine Objekte und Strecken — hier gibt es nichts zu übernehmen.</div>
      ) : (
        <>
          <LoadGuard state={ziel}>
            {(z) => (
              <Auswahl
                key={z.stand}
                quelle={quelle}
                ziel={z}
                onRecheck={ziel.reload}
                onDone={(e) => {
                  setErgebnis(e);
                  ziel.refresh();
                }}
              />
            )}
          </LoadGuard>
          {ergebnis && <ErgebnisBox e={ergebnis} base={base} />}
          {ergebnis && ergebnis.neueObjekte.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <div className="section-head">
                <h2>Weiter: Leistungen für die übernommenen Objekte</h2>
              </div>
              <LeistungenSammel key={ergebnis.neueObjekte.join()} vorauswahl={ergebnis.neueObjekte} />
            </section>
          )}
          {ergebnis && ergebnis.objekte + ergebnis.strecken > 0 && <TeamKarte pro={ergebnis.pro} />}
        </>
      )}
    </>
  );
}

function Auswahl({ quelle, ziel, onRecheck, onDone }: { quelle: WdQuelle; ziel: Ziel; onRecheck: () => void; onDone: (e: Ergebnis) => void }) {
  const { data } = useOd();
  const plan = useMemo(
    () => planUebernahme({ objekte: quelle.objekte, strecken: quelle.strecken, od: ziel.od, odStrecken: ziel.odStrecken }),
    [quelle, ziel],
  );
  const aktiv = ziel.od.filter((p) => p.active).length;
  const rahmen = gratisRahmen(ziel.pro, aktiv);
  const streckenErlaubt = rahmen.strecken !== 0;
  const [objekte, setObjekte] = useState(() => standardAuswahl(plan, streckenErlaubt).objekte);
  const [strecken, setStrecken] = useState(() => standardAuswahl(plan, streckenErlaubt).strecken);
  const [phase, setPhase] = useState<ImportProgress | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useUnsavedGuard(!!phase, 'Die Objekte werden noch angelegt. Trotzdem verlassen? Schon Angelegtes bleibt — beim nächsten Mal wird es erkannt.');

  const nObj = objekte.size;
  const nStr = strecken.size;
  const anzObj = rahmen.objekte === null ? nObj : Math.min(nObj, rahmen.objekte);
  const anzStr = rahmen.strecken === null ? nStr : Math.min(nStr, rahmen.strecken);
  const neueObjekte = plan.objekte.filter((z) => z.status === 'neu');
  const alleObj = neueObjekte.length > 0 && neueObjekte.every((z) => objekte.has(z.w.id));
  const neueStrecken = plan.strecken.filter((z) => z.status === 'neu');
  const alleStr = neueStrecken.length > 0 && neueStrecken.every((z) => strecken.has(z.w.id));

  const umschalten = (set: Set<string>, id: string, an: boolean) => {
    const n = new Set(set);
    if (an) n.add(id);
    else n.delete(id);
    return n;
  };

  async function anlegen() {
    setFehler(null);
    setPhase({ label: 'Wird geprüft …', done: 0, total: 0 });
    try {
      // frisch prüfen: anderer Tab, zweiter Klick, Pro inzwischen gekauft
      const [od, odStrecken, pro] = await Promise.all([data.listProperties(), data.listRoutes(), data.proStatus()]);
      const a = uebernahmeAuftrag({ plan, objekte, strecken, od, odStrecken, pro, neueId: () => crypto.randomUUID() });
      const r1 = await insertInChunks(
        a.objekte,
        (part) => data.createProperties(part.map((x) => x.zeile)),
        (x) => ({ line: 0, name: x.zeile.name }),
        { strip: STRIP, progress: (done) => setPhase({ label: 'Objekte werden angelegt …', done, total: a.objekte.length }) },
      );
      const neu = r1.ok.map((x) => x.zeile.id);
      const gibtEs = new Set([...od.map((p) => p.id), ...neu]);
      const zeilen = a.strecken.map((w) => streckenZeile(w, crypto.randomUUID(), a.zuordnung, gibtEs));
      // Strecken tragen ihren Pfad mit (bis 20.000 Punkte) — kleine Pakete
      const r2 = await insertInChunks(zeilen, (part) => data.createRoutes(part), (x) => ({ line: 0, name: x.name }), {
        chunk: 10,
        strip: STRIP,
        progress: (done) => setPhase({ label: 'Strecken werden angelegt …', done, total: zeilen.length }),
      });
      const notes: string[] = [];
      if (a.inzwischenDa) notes.push(`${plural(a.inzwischenDa, 'Objekt gab', 'Objekte gab')} es inzwischen schon in ObjektDex — nicht noch einmal angelegt.`);
      if (a.streckenInzwischenDa) notes.push(`${plural(a.streckenInzwischenDa, 'Strecke gab', 'Strecken gab')} es inzwischen schon — nicht noch einmal angelegt.`);
      if (a.ueberGrenze) notes.push(`${plural(a.ueberGrenze, 'Objekt', 'Objekte')} nicht angelegt — Gratis-Grenze (${GRATIS_OBJEKTE} aktive Objekte). Mit ObjektDex Pro geht der Rest beim nächsten Mal.`);
      if (a.streckenUeberGrenze) notes.push(`${plural(a.streckenUeberGrenze, 'Strecke', 'Strecken')} nicht angelegt — Runden gibt es in ObjektDex nur mit Pro.`);
      onDone({ objekte: r1.ok.length, strecken: r2.ok.length, failed: [...r1.failed, ...r2.failed], notes, neueObjekte: neu, pro });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase(null);
    }
  }

  return (
    <div className="wd-imp">
      <GrenzHinweis pro={ziel.pro} aktiv={aktiv} frei={rahmen.objekte ?? 0} hatStrecken={plan.strecken.length > 0} onRecheck={onRecheck} />

      <div className="section-head">
        <h2>1. Objekte</h2>
      </div>
      {plan.objekte.length === 0 ? (
        <p className="muted">Keine Objekte in WinterDex.</p>
      ) : (
        <>
          <p className="wd-imp-summary">
            {plural(neueObjekte.length, 'Objekt ist', 'Objekte sind')} neu für ObjektDex
            {plan.objekte.length > neueObjekte.length &&
              `, ${(plan.objekte.length - neueObjekte.length).toLocaleString('de-DE')} gibt es dort schon (gleiche Adresse) — nicht angehakt`}
            . Objekte in Saison-Pause sind grau, aber wählbar — in ObjektDex werden sie aktiv angelegt.
          </p>
          <div className="table-wrap wd-imp-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Alle neuen Objekte anhaken"
                      title="Alle neuen Objekte anhaken"
                      checked={alleObj}
                      disabled={!neueObjekte.length || !!phase}
                      onChange={(e) => setObjekte(e.target.checked ? new Set([...objekte, ...neueObjekte.map((z) => z.w.id)]) : new Set())}
                    />
                  </th>
                  <th>Objekt</th>
                  <th className="wd-imp-st">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.objekte.map((z) => {
                  const an = objekte.has(z.w.id);
                  const status = (
                    <>
                      {z.status === 'neu' ? <span className="badge green">neu</span> : <span className="badge">schon in ObjektDex</span>}
                      {!z.w.active && <> <span className="badge">Saison-Pause</span></>}
                      {z.status === 'vorhanden' && z.odName && z.odName !== z.w.name && <span className="wd-imp-sub">dort: {z.odName}</span>}
                    </>
                  );
                  return (
                    <tr key={z.w.id} className={an && z.w.active ? undefined : 'wd-imp-off'}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${z.w.name} übernehmen`}
                          checked={an}
                          disabled={!!phase}
                          onChange={(e) => setObjekte(umschalten(objekte, z.w.id, e.target.checked))}
                        />
                      </td>
                      <td className="wrap">
                        <b>{z.w.name || '—'}</b>
                        <span className="wd-imp-sub">{z.w.address || 'ohne Adresse'}</span>
                        {z.w.customer_name && <span className="wd-imp-sub">Auftraggeber: {z.w.customer_name}</span>}
                        {z.w.areas && <span className="wd-imp-sub">Flächen: {z.w.areas}</span>}
                        <span className="wd-imp-st-inline">{status}</span>
                      </td>
                      <td className="wd-imp-st">{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(plan.strecken.length > 0 || quelle.ohneStrecken) && (
        <>
          <div className="section-head">
            <h2>2. Strecken</h2>
          </div>
          {quelle.ohneStrecken ? (
            <p className="muted">Dein WinterDex-Betrieb hat noch keine Strecken.</p>
          ) : (
            <>
              <p className="wd-imp-summary">
                In ObjektDex werden Strecken zu <b>Runden</b> (Kehr-, Mäh-, Kontroll- oder Reinigungsrunde) — gleiche Bedienung wie im
                Winter. Verbundene Objekte werden mitgenommen, soweit es sie in ObjektDex gibt.
              </p>
              <div className="table-wrap wd-imp-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Alle neuen Strecken anhaken"
                          title="Alle neuen Strecken anhaken"
                          checked={alleStr}
                          disabled={!neueStrecken.length || !streckenErlaubt || !!phase}
                          onChange={(e) => setStrecken(e.target.checked ? new Set([...strecken, ...neueStrecken.map((z) => z.w.id)]) : new Set())}
                        />
                      </th>
                      <th>Strecke</th>
                      <th>Länge</th>
                      <th className="wd-imp-st">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.strecken.map((z) => {
                      const an = strecken.has(z.w.id);
                      const status = (
                        <>
                          {z.status === 'neu' ? <span className="badge green">neu</span> : <span className="badge">schon in ObjektDex</span>}
                          {!z.w.active && <> <span className="badge">Saison-Pause</span></>}
                        </>
                      );
                      return (
                        <tr key={z.w.id} className={an ? undefined : 'wd-imp-off'}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${z.w.name} übernehmen`}
                              checked={an}
                              disabled={!streckenErlaubt || !!phase}
                              onChange={(e) => setStrecken(umschalten(strecken, z.w.id, e.target.checked))}
                            />
                          </td>
                          <td className="wrap">
                            <b>{z.w.name}</b>
                            <span className="wd-imp-sub">
                              {z.w.source === 'objects' ? `aus Objekten · ${plural(z.objekte, 'Objekt', 'Objekte')}` : 'aufgezeichnet'}
                            </span>
                            <span className="wd-imp-st-inline">{status}</span>
                          </td>
                          <td className="muted">{laenge(z.w.length_m)}</td>
                          <td className="wd-imp-st">{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <div className="section-head">
        <h2>{plan.strecken.length > 0 ? '3.' : '2.'} Anlegen</h2>
      </div>
      <div className="card">
        {nObj > anzObj && (
          <div className="info-box">
            Angehakt {nObj === 1 ? 'ist' : 'sind'} {plural(nObj, 'Objekt', 'Objekte')} — angelegt {anzObj === 1 ? 'wird' : 'werden'}{' '}
            {anzObj === 0 ? 'jetzt keines' : `die ersten ${anzObj} (Reihenfolge der Liste)`}.
          </div>
        )}
        <div className="row" style={{ marginTop: nObj > anzObj ? 16 : 0 }}>
          <button type="button" className="btn" disabled={!!phase || anzObj + anzStr === 0} onClick={() => void anlegen()}>
            <Upload className="i" aria-hidden /> {plural(anzObj, 'Objekt', 'Objekte')}
            {anzStr > 0 ? ` und ${plural(anzStr, 'Strecke', 'Strecken')}` : ''} anlegen
          </button>
          {!phase && nObj + nStr === 0 && <span className="small muted">Nichts angehakt.</span>}
        </div>
        {phase && <Fortschritt phase={phase} />}
        {fehler && <div className="error-box">{fehler}</div>}
      </div>
    </div>
  );
}

function laenge(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;
}

/** Gratis-Grenze verständlich: wie viele gehen, warum, und was bei unklarer Pro-Auskunft passiert. */
function GrenzHinweis({
  pro,
  aktiv,
  frei,
  hatStrecken,
  onRecheck,
}: {
  pro: boolean | null;
  aktiv: number;
  /** so viele Objekte dürfen noch dazu */
  frei: number;
  hatStrecken: boolean;
  onRecheck: () => void;
}) {
  if (pro === true) return null;
  return (
    <div className="info-box">
      {pro === null && (
        <p style={{ marginTop: 0 }}>
          Ob dein ObjektDex-Betrieb Pro hat, ließ sich gerade nicht prüfen. Bis dahin gilt die Gratis-Grenze.{' '}
          <button type="button" className="btn ghost small" onClick={onRecheck}>
            Erneut prüfen
          </button>
        </p>
      )}
      <p style={{ margin: 0 }}>
        Ohne ObjektDex Pro sind {GRATIS_OBJEKTE} aktive Objekte möglich — dein Betrieb hat {aktiv}.{' '}
        {frei === 0 ? 'Neue Objekte gehen erst mit Pro.' : `Jetzt ${frei === 1 ? 'kommt höchstens 1 Objekt' : `kommen höchstens ${frei} Objekte`} dazu.`}
        {hatStrecken && ' Strecken werden zu Runden — die gehören zu Pro.'} Pro schließt du in der ObjektDex-App unter „Abo“ ab (mit einem
        Dexware-Suite-Abo ist es schon dabei).
      </p>
    </div>
  );
}

function Fortschritt({ phase }: { phase: ImportProgress }) {
  if (!phase.total) {
    return (
      <p className="small muted" style={{ marginBottom: 0 }}>
        <span className="spinner" /> {phase.label}
      </p>
    );
  }
  const pct = Math.round((Math.min(phase.done, phase.total) / phase.total) * 100);
  return (
    <div className="wd-imp-progress" role="status">
      <div className="wd-imp-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="small">
        {phase.label} {Math.min(phase.done, phase.total)} von {phase.total}
      </span>
    </div>
  );
}

function ErgebnisBox({ e, base }: { e: Ergebnis; base: string }) {
  return (
    <div className="card wd-imp-result" role="status" style={{ marginTop: 14 }}>
      <p className="wd-imp-result-head">
        {e.objekte + e.strecken > 0 && <CheckCircle2 className="i" aria-hidden />}
        {plural(e.objekte, 'Objekt', 'Objekte')}
        {e.strecken > 0 && ` und ${plural(e.strecken, 'Strecke', 'Strecken')}`} angelegt
        {e.failed.length > 0 && `, ${e.failed.length} nicht`}.
      </p>
      {e.failed.length > 0 && (
        <ul className="small">
          {e.failed.slice(0, 10).map((f, k) => (
            <li key={k}>
              „{f.name}“: {f.reason}
            </li>
          ))}
          {e.failed.length > 10 && <li>… und {e.failed.length - 10} weitere</li>}
        </ul>
      )}
      {e.notes.map((n) => (
        <p key={n} className="small muted">
          {n}
        </p>
      ))}
      {e.failed.length > 0 && <p className="small muted">Einfach noch einmal anlegen: schon Übernommenes wird erkannt und nicht doppelt angelegt.</p>}
      <div className="row">
        <Link className="btn small" to={`${base}/objekte`}>
          Zu den Objekten
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- Team

/** Konten lassen sich nicht übertragen (zwei Projekte, Einwilligung) — Team-Code mit fertigem Text teilen. Einladen ist Pro. */
function TeamKarte({ pro }: { pro: boolean | null }) {
  const { data } = useOd();
  const code = useAsync(() => (pro ? data.teamCode(false).catch(() => null) : Promise.resolve(null)), [data, pro]);
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h2 style={{ marginTop: 0 }}>Dein Team</h2>
      <p className="muted">
        Dein WinterDex-Team kommt nicht automatisch mit — ObjektDex ist eine eigene App mit eigenen Konten. Deine Leute installieren
        ObjektDex und treten mit dem Team-Code bei.
      </p>
      {!pro ? (
        <div className="info-box">Mitarbeiter einladen gehört zu ObjektDex Pro — Pro schließt du in der ObjektDex-App unter „Abo“ ab.</div>
      ) : (
        <LoadGuard state={code} empty={<div className="info-box">Den Team-Code findest du unter „Team“.</div>}>
          {(c) => {
            if (!c) return null;
            const text = teamText(c.code);
            return (
              <>
                <label className="field">
                  Text zum Teilen
                  <textarea readOnly rows={3} value={text} onFocus={(e) => e.currentTarget.select()} />
                </label>
                <div className="row">
                  <CopyButton text={text} label="Text kopieren" />
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button type="button" className="btn ghost small" onClick={() => void navigator.share({ text }).catch(() => {})}>
                      Teilen …
                    </button>
                  )}
                </div>
              </>
            );
          }}
        </LoadGuard>
      )}
    </div>
  );
}
