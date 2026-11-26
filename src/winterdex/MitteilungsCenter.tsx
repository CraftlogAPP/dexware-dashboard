// Mitteilungs-Center im WinterDex-Dashboard (26.11.2026, Alex' Feldtest): Glocke oben rechts in der Kopfzeile mit Zähler
// „neu seit zuletzt geöffnet“, Klappfenster mit denselben Mitteilungen wie am Handy (Heute / Gestern / Älter, Symbol je
// Art, Titel, VOLLER Text, Uhrzeit), Klick → Detailseite mit der Karte „Heute Nacht“ darunter (pages/Mitteilungen.tsx).
// Daten: mitteilungenDaten.ts (RPC meine_mitteilungen, Vertrag v1), ein Abruf je Betrieb: mitteilungenKontext.ts.
// Nur im WinterDex-Bereich (WinterdexArea.tsx) — andere Apps bekommen keine Glocke. Das Dashboard schaltet keine
// Mitteilungsarten (G8: je Handy in der App, Seite „Mitteilungen“).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { AlarmClock, Bell, CloudSnow, CloudSun, FlaskConical, Landmark, Moon, RefreshCw, Sunrise, TriangleAlert } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { nachweisZone } from './nachweisZeit';
import { MtKontext, useMitteilungen, useMitteilungenLaden, type MtStand } from './mitteilungenKontext';
import {
  artSymbol,
  artZeigen,
  EINSTELLEN_HINWEIS,
  eintragZeit,
  gruppieren,
  istNeu,
  LEER_TEXT,
  vollZeit,
  zaehlerText,
  type Mitteilung,
  type MtSymbol,
} from './mitteilungenDaten';
import { standText } from './heuteNachtDaten';

/** So viele stehen im Klappfenster, der Rest auf der Seite „Alle Mitteilungen“ */
const IM_FENSTER = 30;

/** Ein Abruf für Glocke, Liste und Detail — nur innerhalb von OrgGate (Betrieb steht fest). */
export function MitteilungenProvider({ base, children }: { base: string; children: ReactNode }) {
  const { client } = useAppAuth();
  const { data } = useOrg();
  if (!data) return <>{children}</>;
  return (
    <MitteilungenLaden client={client} orgId={data.org.id} tz={nachweisZone(data.org.land)} base={base}>
      {children}
    </MitteilungenLaden>
  );
}

function MitteilungenLaden({ client, orgId, tz, base, children }: { client: SupabaseClient; orgId: string; tz: string; base: string; children: ReactNode }) {
  const stand = useMitteilungenLaden(client, orgId, tz, base);
  return <MtKontext.Provider value={stand}>{children}</MtKontext.Provider>;
}

/**
 * Glocke in der Kopfzeile: Die Kopfzeile (AppArea) liegt außerhalb des Betriebs-Kontexts — darum hängt die Glocke per
 * Portal im Platz, den WinterdexArea dort freihält. Unsichtbar, solange der Server keine Mitteilungen anbietet.
 */
export function MitteilungsGlocke({ platz }: { platz: HTMLElement | null }) {
  const st = useMitteilungen();
  if (!st || !st.da || !platz) return null;
  return createPortal(<Glocke st={st} />, platz);
}

const SYMBOL_ICON: Record<MtSymbol, typeof Bell> = {
  abend: Moon,
  frueh: Sunrise,
  schnee: CloudSnow,
  glatteis: TriangleAlert,
  vorbei: CloudSun,
  update: RefreshCw,
  amtlich: Landmark,
  wecker: AlarmClock,
  test: FlaskConical,
  info: Bell,
};

export function MtSymbolBild({ kart, kritisch }: { kart: string; kritisch: boolean }) {
  const s = artSymbol(kart);
  const I = SYMBOL_ICON[s];
  return (
    <span className={`mt-sym mt-s-${s}${kritisch ? ' mt-krit' : ''}`} aria-hidden="true">
      <I className="i" />
    </span>
  );
}

/** Inhalt eines Eintrags (Fenster und Seite): Symbol, Titel, Art · Uhrzeit, voller Text */
export function EintragInhalt({ m, jetzt, tz, neu }: { m: Mitteilung; jetzt: number; tz: string; neu: boolean }) {
  return (
    <>
      <MtSymbolBild kart={m.kart} kritisch={m.kritisch} />
      <span className="mt-inhalt">
        <span className="mt-kopf">
          {neu && (
            <span className="mt-neu" title="neu">
              <span className="mt-sr">neu: </span>
            </span>
          )}
          <b className="mt-titel">{m.titel}</b>
          <span className="mt-zeit">{eintragZeit(m.ms, jetzt, tz)}</span>
        </span>
        <span className="mt-text">{m.text}</span>
        {artZeigen(m) && <span className="mt-art">{m.art_name}</span>}
      </span>
    </>
  );
}

function Glocke({ st }: { st: MtStand }) {
  const [offen, setOffen] = useState(false);
  // Stand „gesehen“ VOR dem Öffnen — damit im Fenster die neuen Einträge markiert bleiben
  const [vorher, setVorher] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const knopfRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { alsGesehen } = st;

  const zu = useCallback(
    (fokus = false) => {
      setOffen(false);
      // was während des offenen Fensters dazukam, gilt auch als gesehen
      alsGesehen();
      if (fokus) knopfRef.current?.focus();
    },
    [alsGesehen],
  );

  // Klick außerhalb / Escape schließt (wie die Fälligkeiten-Glocke der Startseite)
  useEffect(() => {
    if (!offen) return;
    const weg = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) zu();
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zu(true);
    };
    document.addEventListener('mousedown', weg);
    document.addEventListener('keydown', taste);
    return () => {
      document.removeEventListener('mousedown', weg);
      document.removeEventListener('keydown', taste);
    };
  }, [offen, zu]);

  function auf() {
    setVorher(st.gesehen);
    setOffen(true);
    alsGesehen();
  }
  function oeffne(ziel: string) {
    zu();
    navigate(ziel);
  }

  const jetzt = st.abgerufen ?? Date.now();
  const zahl = zaehlerText(st.neu);
  const gruppen = gruppieren(st.liste.slice(0, IM_FENSTER), jetzt, st.tz);
  return (
    <div className="due-bell mt-glocke" ref={wrapRef}>
      <button
        ref={knopfRef}
        type="button"
        className="due-bell-btn"
        onClick={() => (offen ? zu() : auf())}
        aria-label={`Mitteilungen${zahl ? `: ${zahl} neu` : ''}`}
        aria-expanded={offen}
        title="Mitteilungen"
      >
        <Bell className="i" aria-hidden />
        {zahl && <span className="due-bell-count">{zahl}</span>}
      </button>

      {offen && (
        <div className="due-pop mt-pop" role="dialog" aria-label="Mitteilungen">
          <div className="due-pop-head">
            Mitteilungen
            {st.gestoert && st.abgerufen !== null && <span className="due-pop-loading">nicht aktuell · Stand {standText(st.abgerufen, Date.now(), st.tz)}</span>}
          </div>
          {gruppen.length === 0 ? (
            <div className="due-pop-empty">{LEER_TEXT}</div>
          ) : (
            <div className="mt-liste">
              {gruppen.map((g) => (
                <div className="mt-gruppe" key={g.gruppe}>
                  <div className="mt-gruppe-kopf">{g.gruppe}</div>
                  {g.eintraege.map((m) => (
                    <button type="button" key={m.id} className={`mt-eintrag${m.kritisch ? ' mt-kritisch' : ''}`} onClick={() => oeffne(st.pfad(m.id))}>
                      <EintragInhalt m={m} jetzt={jetzt} tz={st.tz} neu={istNeu(m, vorher, jetzt)} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="mt-fuss">
            <Link to={st.pfad()} onClick={() => zu()}>
              Alle Mitteilungen ›
            </Link>
            <span>{EINSTELLEN_HINWEIS}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Detail (rein, auch für die Vorschau): Titel, Art, volle Uhrzeit, voller Text; darunter `karte` (Heute Nacht). */
export function MitteilungAnsicht({ m, tz, zurueck, karte }: { m: Mitteilung; tz: string; zurueck: string; karte?: ReactNode }) {
  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to={zurueck}>← Alle Mitteilungen</Link>
      </p>
      <div className={`card mt-detail${m.kritisch ? ' mt-kritisch' : ''}`}>
        <div className="mt-detail-kopf">
          <MtSymbolBild kart={m.kart} kritisch={m.kritisch} />
          <div>
            <h1>{m.titel}</h1>
            <p className="muted">{artZeigen(m) ? `${m.art_name} · ${vollZeit(m.ms, tz)}` : vollZeit(m.ms, tz)}</p>
          </div>
        </div>
        <p className="mt-detail-text">{m.text}</p>
      </div>
      {karte}
    </>
  );
}
