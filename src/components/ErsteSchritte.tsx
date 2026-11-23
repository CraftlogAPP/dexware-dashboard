// Karte „Erste Schritte“ oben auf der Übersicht neuer Betriebe — ein Baustein für alle Bereiche mit Bestand.
// Je App nur ein kleiner Adapter (Wörter + Wege); die Haken kommen aus den Daten der Übersicht (lib/ersteSchritte.ts).
// Nur für den Inhaber, nicht in „Vor Ort“, verschwindet wenn alles erledigt ist oder per „Ausblenden“.
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, Circle, ExternalLink, FileUp, X } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from './OrgContext';
import { useAsync } from './ui';
import { fetchMembers } from '../lib/orgApi';
import { cardVisible, isNewOrg, needsMembers, playUrl, readHidden, startSteps, writeHidden, type ErsteSchritteAdapter, type StepKey } from '../lib/ersteSchritte';
// QR als SVG — derselbe Baustein wie der Bezahl-QR in InstallateurDex (qrcode-generator, ohne Rand)
import { qrSvg } from '../installateurdex/geld/qr';
import { PruefCtx } from '../pruefen/context';
import type { PruefConfig } from '../pruefen/config';
import { pruefErsteSchritte } from '../pruefen/ersteSchritte';

const countDefault = async (sb: SupabaseClient) => (await fetchMembers(sb)).length;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function narrowScreen(): boolean {
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

export function ErsteSchritte({ adapter, stock, first }: { adapter: ErsteSchritteAdapter; stock: number; first: boolean }) {
  const { app, client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const inVorOrt = useContext(PruefCtx) !== null;
  const orgId = orgCtx?.org.id ?? '';
  const owner = orgCtx?.role === 'owner' && !inVorOrt;
  const [hidden, setHidden] = useState(() => readHidden(localStore(), app.id, orgId));
  const newOrg = isNewOrg(orgCtx?.org.created_at);
  const team = adapter.teamTo !== null;
  const need = needsMembers({ owner, hidden, team, stock, first, newOrg });
  const count = adapter.countMembers ?? countDefault;
  const members = useAsync<number | null>(async () => (need ? count(client) : null), [client, need]);
  const qr = useMemo(() => (app.playId && !narrowScreen() ? qrSvg(playUrl(app.playId)) : ''), [app.playId]);

  // Mitgliederzahl noch unterwegs: lieber kurz nichts zeigen als eine Karte, die gleich wieder verschwindet
  if (need && members.loading) return null;
  const state = startSteps({ stock, first, members: members.error ? null : members.data, team });
  if (!cardVisible({ owner, hidden, state, newOrg })) return null;
  const doneOf = (k: StepKey) => state.steps.find((s) => s.key === k)?.done ?? false;
  const next = state.steps.find((s) => !s.done)?.key;
  const btn = (k: StepKey) => (next === k ? 'btn small' : 'btn ghost small');

  function hide() {
    writeHidden(localStore(), app.id, orgId);
    setHidden(true);
  }

  return (
    <section className="card" aria-label="Erste Schritte" style={{ marginBottom: 20, padding: '16px 18px' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Erste Schritte</h2>
          <span className="small muted">
            {state.done} von {state.total} erledigt · so ist {app.name} schnell startklar
          </span>
        </div>
        <button type="button" className="btn ghost small" onClick={hide} title="Karte ausblenden — kommt in diesem Browser nicht wieder">
          <X className="i" aria-hidden /> Ausblenden
        </button>
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 14 }}>
        <Step
          done={doneOf('bestand')}
          title={`${adapter.stock.what} anlegen`}
          doneText={`${stock.toLocaleString('de-DE')} angelegt`}
          text={`Am schnellsten mit deiner Liste aus Excel oder CSV${adapter.stock.hint ? ` — ${adapter.stock.hint}` : ''}. Eine Vorlage gibt es dort zum Herunterladen.`}
        >
          <Link className={btn('bestand')} to={adapter.stock.importTo}>
            <FileUp className="i" aria-hidden /> Liste aus Excel einlesen
          </Link>
          <Link className="btn ghost small" to={adapter.stock.listTo}>
            einzeln anlegen
          </Link>
        </Step>
        <Step
          done={doneOf('handy')}
          title="App aufs Handy"
          doneText={`${app.name} ist im Einsatz`}
          text={`Für unterwegs gibt es ${app.name} als App${qr ? ' — QR-Code mit dem Handy scannen' : ''}.${adapter.first.fieldTo ? ` Am iPhone geht „${adapter.first.fieldLabel}“ im Browser.` : ''}`}
          side={qr ? <div aria-label={`QR-Code: ${app.name} bei Google Play`} role="img" style={{ width: 84, height: 84, padding: 6, background: '#fff', borderRadius: 8, flex: 'none' }} dangerouslySetInnerHTML={{ __html: qr }} /> : null}
        >
          {app.playId && (
            <a className={btn('handy')} href={playUrl(app.playId)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="i" aria-hidden /> Bei Google Play öffnen
            </a>
          )}
        </Step>
        {team && (
          <Step
            done={doneOf('team')}
            title="Team einladen"
            doneText={`${(members.data ?? 0).toLocaleString('de-DE')} im Team`}
            text={`Mitarbeiter laden die App und treten mit dem Team-Code bei.${app.teamNeedsPro ? ' Mitarbeiter einladen geht mit Pro.' : ''}`}
          >
            <Link className={btn('team')} to={adapter.teamTo!}>
              Zum Team-Code
            </Link>
          </Step>
        )}
        <Step done={doneOf('erste')} title={adapter.first.title} doneText="erledigt" text={adapter.first.text}>
          {adapter.first.fieldTo && (
            <Link className={btn('erste')} to={adapter.first.fieldTo}>
              „{adapter.first.fieldLabel}“ öffnen
            </Link>
          )}
        </Step>
      </ol>
    </section>
  );
}

function Step({ done, title, doneText, text, side, children }: { done: boolean; title: string; doneText: string; text: string; side?: ReactNode; children?: ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {done ? (
        <CheckCircle2 className="i" aria-label="erledigt" style={{ color: 'var(--green)', flex: 'none', marginTop: 2 }} />
      ) : (
        <Circle className="i muted" aria-label="offen" style={{ flex: 'none', marginTop: 2 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {title}
          {done && <span className="small muted" style={{ fontWeight: 400 }}> — {doneText}</span>}
        </div>
        {!done && (
          <>
            <div className="small muted" style={{ marginTop: 2 }}>
              {text}
            </div>
            {children && (
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                {children}
              </div>
            )}
          </>
        )}
      </div>
      {!done && side}
    </li>
  );
}

/** Karte für die 8 Prüf-Apps: Bestand = Orte (Orts-Apps) bzw. Geräte, Haken bei der ersten gültigen Prüfung. */
export function PruefErsteSchritte({ cfg, stock, first }: { cfg: PruefConfig; stock: number; first: boolean }) {
  const adapter = useMemo(() => pruefErsteSchritte(cfg), [cfg]);
  return <ErsteSchritte adapter={adapter} stock={stock} first={first} />;
}
