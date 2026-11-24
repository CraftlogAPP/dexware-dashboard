// ObjektDex — Ganzjahres-Nachweis je Objekt (…/jahresnachweis): EIN PDF für den Auftraggeber mit dem Winterdienst aus
// WinterDex und der Objektbetreuung aus ObjektDex (Soll/Ist, Einsätze, Mängel) für denselben Zeitraum.
// Erreichbar aus der Objekt-Detailseite, dem Nachweis-PDF und „Nach dem Winter“ im WinterDex-Bereich. Nur Inhaber/Verwalter.
//
// WinterDex wie bei „Aus WinterDex übernehmen“: eigene Sitzung (storageKey dexware-dash-winterdex) im selben Browser,
// gewohnte Anmeldung auf der Seite, NUR lesen (RLS). Ohne Anmeldung oder ohne passendes Objekt enthält das PDF nur die
// Objektbetreuung (dezenter Hinweis). Pro-Regeln je Teil wie in der jeweiligen App (jahresnachweisPdf.ts).
// Logik (Zeitraum, Grenzen Europe/Vienna, Objekt-Abgleich, Kennzahlen): ../jahresnachweis.ts.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FileDown } from 'lucide-react';
import { getApp, type AppConfig } from '../../apps/registry';
import { AppAuthProvider, useAppAuth } from '../../auth/AppAuthContext';
import { LoginScreen } from '../../auth/LoginScreen';
import { LoadGuard, useAsync } from '../../components/ui';
import { fetchAllOf } from '../../lib/completeQueries';
import { JAHRESNACHWEIS_PFAD } from '../../lib/ganzjahr';
import { fetchOrgContext, isOwnerOrAdmin, readableDbError, roleLabel } from '../../lib/orgApi';
import { openReportWindowAfter, pdfSaveHint } from '../../lib/print';
import { fetchOperationsBetween } from '../../winterdex/api';
import { fetchOrgPro } from '../../winterdex/pro';
import { useOd } from '../context';
import { dayOf } from '../turnus';
import {
  heute,
  passendesWinterdexObjekt,
  zeitraum,
  zeitraumGrenzen,
  zwoelfMonateAb,
  type WdNachweisQuelle,
  type WdObjektKurz,
  type ZeitraumArt,
} from '../jahresnachweis';
import { buildJahresnachweisHtml } from '../jahresnachweisPdf';

type WdZustand =
  | { art: 'laedt' }
  | { art: 'fehlt' }
  | { art: 'abgemeldet' }
  | { art: 'fehler'; text: string; erneut: () => void }
  | { art: 'bereit'; quelle: WdNachweisQuelle; abmelden: (() => void) | null };

function Kopf({ children }: { children?: ReactNode }) {
  return (
    <>
      <h1>Ganzjahres-Nachweis</h1>
      <p className="muted" style={{ marginTop: -6, maxWidth: 760 }}>
        Ein PDF je Objekt für den Auftraggeber: der Winterdienst aus WinterDex und die Objektbetreuung aus ObjektDex (Leistungen mit Soll/Ist,
        Einsätze, Mängel) für denselben Zeitraum. {pdfSaveHint()}
      </p>
      {children}
    </>
  );
}

export function Jahresnachweis() {
  const { demo, role, winterdexNachweisDemo } = useOd();
  if (!isOwnerOrAdmin(role)) {
    return (
      <Kopf>
        <div className="info-box">Den Ganzjahres-Nachweis erstellen Inhaber und Verwalter des Betriebs.</div>
      </Kopf>
    );
  }
  if (demo) {
    // Beispieldaten: WinterDex-Betrieb aus demo.ts, ohne Anmeldung
    return (
      <Kopf>
        <Formular wd={winterdexNachweisDemo ? { art: 'bereit', quelle: winterdexNachweisDemo, abmelden: null } : { art: 'fehlt' }} />
      </Kopf>
    );
  }
  return (
    <Kopf>
      <WinterdexAnbindung />
    </Kopf>
  );
}

// ---------------------------------------------------------------------------- WinterDex-Sitzung (nur lesen)

/**
 * Eigene WinterDex-Sitzung innerhalb des ObjektDex-Bereichs (wie AusWinterdex.tsx). Achtung: Unterhalb gibt useAppAuth()
 * WinterDex zurück — ObjektDex läuft über useOd(). Anders als bei der Übernahme bleibt das Formular ohne Anmeldung nutzbar.
 */
function WinterdexAnbindung() {
  // Keine Registrierung an dieser Stelle (ein neues WinterDex-Konto hätte keinen Winterdienst)
  const app = useMemo<AppConfig | null>(() => {
    const a = getApp('winterdex');
    return a?.supabase ? { ...a, webSignup: false } : null;
  }, []);
  if (!app) return <Formular wd={{ art: 'fehlt' }} />;
  return (
    <AppAuthProvider app={app}>
      <MitWinterdex />
    </AppAuthProvider>
  );
}

function MitWinterdex() {
  const { client, session, loading, signOut } = useAppAuth();
  const email = session?.user.email ?? '';
  const state = useAsync(() => (session ? ladeWinterdex(client, email) : Promise.resolve(null)), [client, session?.user.id]);
  let wd: WdZustand;
  if (loading) wd = { art: 'laedt' };
  else if (!session) wd = { art: 'abgemeldet' };
  else if (state.error) wd = { art: 'fehler', text: state.error, erneut: state.reload };
  else if (!state.loading && state.data) wd = { art: 'bereit', quelle: state.data, abmelden: () => void signOut() };
  else wd = { art: 'laedt' };
  return <Formular wd={wd} />;
}

const WD_OBJEKT_COLS = 'id, name, address, customer_name, active';

/** Betrieb, Rolle und Objekte aus WinterDex — vollständig (seitenweise), nur lesend. Einsätze erst beim Erstellen. */
async function ladeWinterdex(sb: SupabaseClient, email: string): Promise<WdNachweisQuelle> {
  const ctx = await fetchOrgContext(sb);
  if (!ctx) return { betrieb: null, rolle: null, email, objekte: [], pro: async () => true, einsaetze: async () => [] };
  const p = await fetchAllOf<WdObjektKurz>(() => sb.from('property').select(WD_OBJEKT_COLS), [['active', false], ['name']]);
  if (p.error) throw new Error(`WinterDex-Objekte konnten nicht geladen werden: ${readableDbError(p.error)}`);
  return {
    betrieb: ctx.org,
    rolle: ctx.role,
    email,
    objekte: p.data,
    pro: () => fetchOrgPro(sb),
    einsaetze: (id, abIso, bisVorIso, fotos) => fetchOperationsBetween(sb, id, abIso, bisVorIso, fotos),
  };
}

/** Kann der Winterdienst-Teil aus diesem WinterDex-Konto kommen? null = ja, sonst der Grund. */
function winterdexProblem(q: WdNachweisQuelle): string | null {
  if (!q.betrieb) return 'Zu diesem WinterDex-Konto gibt es keinen Betrieb — der Nachweis enthält dann nur die Objektbetreuung.';
  if (!isOwnerOrAdmin(q.rolle))
    return `Im WinterDex-Betrieb bist du ${roleLabel(q.rolle)} — den Winterdienst-Teil erstellen Inhaber und Verwalter. Bitte mit deren Konto anmelden, sonst enthält der Nachweis nur die Objektbetreuung.`;
  return null;
}

// ---------------------------------------------------------------------------- Formular

const chipText = (art: ZeitraumArt, jahr: number) =>
  art === 'zwoelf' ? 'Letzte 12 Monate' : art === 'jahr' ? `${jahr} bis heute` : art === 'vorjahr' ? `Kalenderjahr ${jahr - 1}` : 'Frei wählen';

function Formular({ wd }: { wd: WdZustand }) {
  const { data, orgName } = useOd();
  const [params] = useSearchParams();
  const heuteTag = useMemo(() => heute(), []);
  const jahr = Number(heuteTag.slice(0, 4));
  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  const [art, setArt] = useState<ZeitraumArt>('zwoelf');
  const [von, setVon] = useState(() => zwoelfMonateAb(heuteTag));
  const [bis, setBis] = useState(heuteTag);
  /** null = automatisch per Adresse, '' = kein Winterdienst, sonst gewählte WinterDex-Objekt-id */
  const [wdWahl, setWdWahl] = useState<string | null>(null);
  const [fotos, setFotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propsState = useAsync(() => data.listProperties(), [data]);

  const z = zeitraum(art, heuteTag, { von, bis });
  const property = propsState.data?.find((p) => p.id === propertyId) ?? null;
  const quelle = wd.art === 'bereit' && !winterdexProblem(wd.quelle) ? wd.quelle : null;
  const auto = quelle && property ? passendesWinterdexObjekt(property, quelle.objekte) : null;
  // Eine Wahl aus einem anderen WinterDex-Konto (abgemeldet, neu angemeldet) gilt nicht mehr → wieder automatisch
  const wahlGilt = wdWahl === '' || (wdWahl !== null && !!quelle?.objekte.some((o) => o.id === wdWahl));
  const wdId = quelle ? (wahlGilt ? (wdWahl ?? '') : (auto?.id ?? '')) : '';
  const wdObjekt = quelle ? (quelle.objekte.find((o) => o.id === wdId) ?? null) : null;

  async function erstellen() {
    if ('fehler' in z) return setError(z.fehler);
    if (!property) return setError('Bitte ein Objekt wählen.');
    const per = z;
    const prop = property;
    const mitFotos = fotos;
    const winter = quelle && quelle.betrieb && wdObjekt ? { quelle, betrieb: quelle.betrieb, objekt: wdObjekt } : null;
    setBusy(true);
    setError(null);
    try {
      // Fenster sofort öffnen (im Klick), Daten danach laden — sonst blockt der Browser das Pop-up
      const opened = await openReportWindowAfter(async () => {
        const { abIso, bisVorIso } = zeitraumGrenzen(per);
        const [ops, sollIst, services, defects, odPro, wdOps, wdPro] = await Promise.all([
          data.listOperations({ from: per.from, to: per.to, propertyId: prop.id }),
          data.sollIst(prop.id, per.from, per.to),
          data.listServices(),
          data.listDefects(),
          data.proStatus(),
          winter ? winter.quelle.einsaetze(winter.objekt.id, abIso, bisVorIso, mitFotos) : Promise.resolve(null),
          winter ? winter.quelle.pro() : Promise.resolve(true),
        ]);
        // Mängel wie im Nachweis-PDF von ObjektDex: offene + im Zeitraum gemeldete
        const ds = defects.filter(
          (d) => d.property_id === prop.id && (d.status === 'open' || (dayOf(d.created_at) >= per.from && dayOf(d.created_at) <= per.to)),
        );
        const [opPhotos, defectPhotos] = mitFotos
          ? await Promise.all([
              data.photos('operation', ops.filter((o) => o.photo_count > 0 && !o.canceled).map((o) => o.id)),
              data.photos('defect', ds.filter((d) => d.photo_count > 0).map((d) => d.id)),
            ])
          : [new Map<string, string[]>(), new Map<string, string[]>()];
        return buildJahresnachweisHtml({
          betrieb: orgName,
          objekt: prop,
          zeitraum: per,
          fotos: mitFotos,
          od: { sollIst, services, ops, defects: ds, opPhotos, defectPhotos, pro: odPro },
          wd: winter && wdOps ? { betrieb: winter.betrieb, objekt: winter.objekt, ops: wdOps, pro: wdPro } : null,
        });
      });
      if (!opened) setError('Der Browser hat das Berichtsfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="section-head">
        <h2>1. Objekt und Zeitraum</h2>
      </div>
      <LoadGuard state={propsState}>
        {(props) => (
          <div className="card">
            {props.length === 0 ? (
              <div className="info-box">In ObjektDex gibt es noch keine Objekte.</div>
            ) : (
              <label className="field">
                Objekt (ObjektDex)
                <select
                  value={propertyId}
                  onChange={(e) => {
                    setPropertyId(e.target.value);
                    setWdWahl(null); // neues Objekt → WinterDex-Objekt wieder automatisch suchen
                    setError(null);
                  }}
                >
                  <option value="">— Objekt wählen —</option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.active ? '' : ' (pausiert)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="field">
              Zeitraum
              <div className="od-chips" role="group" aria-label="Zeitraum wählen">
                {(['zwoelf', 'jahr', 'vorjahr', 'frei'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`od-chip ${art === a ? 'on' : ''}`}
                    aria-pressed={art === a}
                    onClick={() => {
                      setArt(a);
                      setError(null);
                    }}
                  >
                    {chipText(a, jahr)}
                  </button>
                ))}
              </div>
            </div>
            {art === 'frei' && (
              <div className="row">
                <label className="field" style={{ flex: 1 }}>
                  Von
                  <input type="date" value={von} max={heuteTag} onChange={(e) => setVon(e.target.value)} />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  Bis
                  <input type="date" value={bis} max={heuteTag} onChange={(e) => setBis(e.target.value)} />
                </label>
              </div>
            )}
            <p className="muted small" style={{ marginBottom: 0 }}>
              {'fehler' in z ? <span style={{ color: 'var(--danger, #B91C1C)' }}>{z.fehler}</span> : <>Zeitraum: {z.label}</>}
            </p>
          </div>
        )}
      </LoadGuard>

      <div className="section-head">
        <h2>2. Winterdienst aus WinterDex</h2>
      </div>
      <WinterdienstWahl
        wd={wd}
        property={property}
        auto={auto}
        wdId={wdId}
        onWahl={(id) => {
          setWdWahl(id);
          setError(null);
        }}
      />

      <div className="section-head">
        <h2>3. Erstellen</h2>
      </div>
      <div className="card">
        <label className="checkbox-field">
          <input type="checkbox" checked={fotos} onChange={(e) => setFotos(e.target.checked)} disabled={busy} />
          Fotos anhängen
          <span className="muted small field-hint">
            Ohne Häkchen werden Fotos nur gezählt — das PDF bleibt bei einem ganzen Jahr deutlich kleiner.
          </span>
        </label>
        <p className="small muted">
          {property
            ? wdObjekt
              ? `Enthält: Winterdienst (WinterDex-Objekt „${wdObjekt.name}“) und Objektbetreuung (ObjektDex).`
              : 'Enthält nur die Objektbetreuung — ohne Winterdienst.'
            : 'Bitte oben ein Objekt wählen.'}
        </p>
        {error && <div className="error-box">{error}</div>}
        <button className="btn" disabled={busy || !property || 'fehler' in z} onClick={() => void erstellen()}>
          {busy ? 'Lade Einsätze und Fotos …' : <><FileDown className="i" aria-hidden /> Ganzjahres-Nachweis erstellen</>}
        </button>
        {fotos && (
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            Bei vielen Fotos kann das Laden einen Moment dauern — die Fotos werden vollständig in den Bericht eingebettet.
          </p>
        )}
      </div>
    </div>
  );
}

/** Abschnitt 2: Anmeldung bei WinterDex bzw. Auswahl des WinterDex-Objekts (automatisch per Adresse, änderbar). */
function WinterdienstWahl({
  wd,
  property,
  auto,
  wdId,
  onWahl,
}: {
  wd: WdZustand;
  property: { name: string; address: string } | null;
  auto: WdObjektKurz | null;
  wdId: string;
  onWahl: (id: string) => void;
}) {
  if (wd.art === 'laedt') {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (wd.art === 'fehlt') {
    return <div className="info-box">WinterDex ist in diesem Dashboard nicht eingerichtet — der Nachweis enthält nur die Objektbetreuung.</div>;
  }
  if (wd.art === 'abgemeldet') {
    return (
      <>
        <div className="info-box">
          Für den Winterdienst-Teil hier mit deinem <b>WinterDex</b>-Konto anmelden. Gelesen wird nur — in WinterDex ändert sich nichts. Ohne
          Anmeldung enthält der Nachweis nur die Objektbetreuung.
        </div>
        <LoginScreen returnTo={JAHRESNACHWEIS_PFAD} />
      </>
    );
  }
  if (wd.art === 'fehler') {
    return (
      <div>
        <div className="error-box">{wd.text}</div>
        <button type="button" className="btn ghost small" onClick={wd.erneut}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  const q = wd.quelle;
  const problem = winterdexProblem(q);
  const kopf = (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
      <span>
        <span className="muted small">WinterDex:</span> <b>{q.betrieb?.name ?? '—'}</b>
        {q.email && <span className="muted small"> · {q.email}</span>}
      </span>
      {wd.abmelden && (
        <button type="button" className="btn ghost small" onClick={wd.abmelden}>
          Anderes WinterDex-Konto
        </button>
      )}
    </div>
  );
  if (problem) {
    return (
      <div className="card">
        {kopf}
        <div className="info-box" style={{ marginBottom: 0 }}>
          {problem}
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      {kopf}
      <label className="field">
        Objekt in WinterDex
        <select value={wdId} onChange={(e) => onWahl(e.target.value)} disabled={!property}>
          <option value="">— kein Winterdienst —</option>
          {q.objekte.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.address ? ` · ${o.address}` : ''}
              {o.active ? '' : ' (Saison-Pause)'}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small" style={{ marginBottom: 0 }}>
        {!property
          ? 'Erst oben ein Objekt wählen — das passende WinterDex-Objekt wird dann über die Adresse gesucht.'
          : auto && wdId === auto.id
            ? 'Über die Adresse gefunden — bitte kurz prüfen.'
            : !auto && !wdId
              ? 'Kein WinterDex-Objekt mit dieser Adresse gefunden. Hat das Objekt Winterdienst, hier wählen — sonst bleibt es bei „kein Winterdienst“.'
              : wdId
                ? 'Von Hand gewählt.'
                : 'Ohne Winterdienst — der Nachweis enthält nur die Objektbetreuung.'}
      </p>
    </div>
  );
}
