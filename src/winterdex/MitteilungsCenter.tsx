// Mitteilungs-Center im WinterDex-Dashboard (26.11.2026, Alex' Feldtest; Vertrag v2 nach Runde 1): Glocke oben rechts in
// der Kopfzeile mit Zähler „neu seit zuletzt geöffnet“, Klappfenster mit denselben Mitteilungen wie am Handy (Heute /
// Gestern / Älter, Symbol je Art, Titel, VOLLER Text, Uhrzeit). Klick auf eine Mitteilung → BOX über der Seite (Symbol,
// Titel, voller Text, Uhrzeit, „Zur Karte“ → Karte „Heute Nacht“ aufgeklappt, „OK“) — keine eigene Detailseite mehr. Die
// Seite „Alle Mitteilungen“ (pages/Mitteilungen.tsx) öffnet dieselbe Box. Die Glocke ist nur zum Nachschauen.
// Daten: mitteilungenDaten.ts (RPC meine_mitteilungen, Vertrag v1, letzte 30 Tage), ein Abruf je Betrieb:
// mitteilungenKontext.ts. Nur im WinterDex-Bereich (WinterdexArea.tsx) — andere Apps bekommen keine Glocke. Das Dashboard
// schaltet keine Mitteilungsarten (G8: je Handy in der App, Seite „Mitteilungen einstellen“).
// Dazu (F): ErklaerListe für den Onboarding-Schritt „Wetter-Guide & Mitteilungen“ (Onboarding.tsx) und den einmaligen
// Hinweis „Neu: Heute Nacht und Mitteilungen“ für Bestandsnutzer (NeuHinweis, auf der Übersicht über der Karte und im
// Außendienst über der Karte auf der Objektliste — dort mit eigenen Texten, Prüfpunkt Runde 2).
// Browser-Zurück schließt eine offene Box zuerst (eigener Verlaufseintrag, boxVerlauf.ts).
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useLocation } from 'react-router-dom';
import {
  AlarmClock,
  Bell,
  CloudSnow,
  CloudSun,
  FlaskConical,
  Landmark,
  Map as MapIcon,
  Moon,
  RefreshCw,
  Smartphone,
  Sparkles,
  Sunrise,
  TriangleAlert,
} from 'lucide-react';
import { useAppAuth, useAppAuthOptional } from '../auth/AppAuthContext';
import { useOrg, useOrgOptional } from '../components/OrgContext';
import { nachweisZone } from './nachweisZeit';
import { MtKontext, useMitteilungen, useMitteilungenLaden, type MtStand } from './mitteilungenKontext';
import {
  artSymbol,
  artZeigen,
  boxZeile,
  EINSTELLEN_HINWEIS,
  eintragZeit,
  erklaerPunkte,
  gruppieren,
  istNeu,
  kartePfad,
  leerText,
  neuHinweisFaellig,
  neuHinweisMerken,
  PRO_HINWEIS,
  zaehlerText,
  type ErklaerOrt,
  type ErklaerPunkt,
  type Mitteilung,
  type MtSymbol,
} from './mitteilungenDaten';
import { standText } from './heuteNachtDaten';
import { boxVerlauf, type BoxVerlauf } from './boxVerlauf';

/** So viele stehen im Klappfenster, der Rest auf der Seite „Alle Mitteilungen“ */
const IM_FENSTER = 30;

/** Ein Abruf für Glocke, Liste und Box — nur innerhalb von OrgGate (Betrieb steht fest). */
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
 * Glocke in der Kopfzeile + die Box. Die Kopfzeile (AppArea) liegt außerhalb des Betriebs-Kontexts — darum hängt die Glocke
 * per Portal im Platz, den WinterdexArea dort freihält. Die Box steht NICHT im Portal, sondern hier im Bereich (dort gelten
 * die Farben der App). Unsichtbar, solange der Server keine Mitteilungen anbietet.
 */
export function MitteilungsGlocke({ platz }: { platz: HTMLElement | null }) {
  const st = useMitteilungen();
  if (!st || !st.da) return null;
  return (
    <>
      {platz && createPortal(<Glocke st={st} />, platz)}
      {st.offen && <MitteilungBox key={st.offen.id} m={st.offen} tz={st.tz} basis={st.basis} onClose={st.schliessen} />}
    </>
  );
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

export function MtSymbolBild({ kart, kritisch, gross = false }: { kart: string; kritisch: boolean; gross?: boolean }) {
  const s = artSymbol(kart);
  const I = SYMBOL_ICON[s];
  return (
    <span className={`mt-sym mt-s-${s}${kritisch ? ' mt-krit' : ''}${gross ? ' mt-sym-gross' : ''}`} aria-hidden="true">
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
  const { alsGesehen, zeigen } = st;

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
    const taste = (e: globalThis.KeyboardEvent) => {
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

  // Eintrag angeklickt: Fenster zu, Fokus auf die Glocke (dorthin kehrt er nach der Box zurück), Box auf
  function oeffne(m: Mitteilung) {
    zu(true);
    zeigen(m);
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
            <div className="due-pop-empty">{leerText(st.pro)}</div>
          ) : (
            <div className="mt-liste">
              {gruppen.map((g) => (
                <div className="mt-gruppe" key={g.gruppe}>
                  <div className="mt-gruppe-kopf">{g.gruppe}</div>
                  {g.eintraege.map((m) => (
                    // Knopf, kein Link: der Eintrag öffnet nur die Box (die Seite bleibt, wo sie ist — auch mitten im
                    // Außendienst). Erst „Zur Karte“ in der Box wechselt die Seite, und das ist ein Link (Rückfrage
                    // „Aufzeichnung läuft“ greift).
                    <button key={m.id} type="button" className={`mt-eintrag${m.kritisch ? ' mt-kritisch' : ''}`} onClick={() => oeffne(m)}>
                      <EintragInhalt m={m} jetzt={jetzt} tz={st.tz} neu={istNeu(m, vorher, jetzt)} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="mt-fuss">
            <Link to={st.seite} onClick={() => zu()}>
              Alle Mitteilungen ›
            </Link>
            <span>{EINSTELLEN_HINWEIS}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const FOKUSSIERBAR = 'a[href], button:not(:disabled)';

/**
 * Box „Mitteilung“ (rein, auch für die Vorschau): Symbol der Art, Titel, Art · volle Uhrzeit, VOLLER Text, große Knöpfe
 * „Zur Karte“ (Link → Karte „Heute Nacht“ aufgeklappt) und „OK“. Fokus beim Öffnen auf „OK“, Tab bleibt in der Box,
 * Escape / Klick daneben / OK schließen, danach Fokus zurück (Glocke bzw. Eintrag der Seite).
 */
export function MitteilungBox({ m, tz, basis, onClose }: { m: Mitteilung; tz: string; basis: string; onClose: () => void }) {
  const { pathname } = useLocation();
  const titelId = useId();
  const textId = useId();
  const kartenRef = useRef<HTMLDivElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  // Browser-Zurück (Zurück-Geste am Handy) schließt zuerst die Box: eigener Verlaufseintrag mit derselben Adresse
  const verlaufRef = useRef<BoxVerlauf | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const v = boxVerlauf(window, () => onCloseRef.current());
    verlaufRef.current = v;
    return () => {
      v.abbauen();
      if (verlaufRef.current === v) verlaufRef.current = null;
    };
  }, []);

  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    okRef.current?.focus({ preventScroll: true });
    return () => {
      if (vorher && vorher.isConnected) vorher.focus({ preventScroll: true });
    };
  }, []);

  function taste(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const karte = kartenRef.current;
    if (!karte) return;
    const ziele = [...karte.querySelectorAll<HTMLElement>(FOKUSSIERBAR)];
    if (!ziele.length) return;
    const erstes = ziele[0];
    const letztes = ziele[ziele.length - 1];
    const aktiv = document.activeElement;
    // aktiv === karte: nach einem Klick in den Text steht der Fokus auf der Box selbst (tabIndex -1) — Umschalt+Tab
    // ginge von dort zum Element VOR der Box, also hinaus auf die Seite dahinter (und Escape schlösse dann nicht mehr)
    if (e.shiftKey && (aktiv === erstes || aktiv === karte || !karte.contains(aktiv))) {
      e.preventDefault();
      letztes.focus();
    } else if (!e.shiftKey && (aktiv === letztes || !karte.contains(aktiv))) {
      e.preventDefault();
      erstes.focus();
    }
  }

  return (
    <div
      className="modal-backdrop mt-box-hinter"
      onKeyDown={taste}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={kartenRef}
        className={`modal-card mt-box${m.kritisch ? ' mt-kritisch' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={textId}
        // Klick in den Text: Fokus bleibt in der Box (sonst ginge er an <body>, und Escape schlösse nicht mehr)
        tabIndex={-1}
      >
        <div className="mt-box-kopf">
          <MtSymbolBild kart={m.kart} kritisch={m.kritisch} gross />
          <div className="mt-box-titel">
            <h2 id={titelId}>{m.titel}</h2>
            <p className="muted">{boxZeile(m, tz)}</p>
          </div>
        </div>
        <p id={textId} className="mt-box-text">
          {m.text}
        </p>
        <div className="mt-box-knoepfe">
          {/* replace: der Sprung ersetzt den Verlaufseintrag der Box — Zurück führt danach auf die Seite von vorher. Die
              Rückfrage „Aufzeichnung läuft“ (useUnsavedGuard) fängt den Klick vorher ab; bei „Abbrechen“ bleibt alles offen. */}
          <Link
            className="btn ghost mt-box-knopf"
            to={kartePfad(basis, pathname)}
            replace
            onClick={(e) => {
              // Strg-/Umschalt-Klick (neuer Tab) bleibt hier: dann wie „OK“ (Eintrag wieder weg)
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) verlaufRef.current?.verlassen();
              onClose();
            }}
          >
            <MapIcon className="i" aria-hidden /> Zur Karte
          </Link>
          <button ref={okRef} type="button" className="btn mt-box-knopf" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

const ERKLAER_ICON: Record<ErklaerPunkt['art'], typeof Bell> = {
  karte: Moon,
  glocke: Bell,
  handy: Smartphone,
  wecker: AlarmClock,
};

/**
 * Punkte „Heute Nacht“, „Glocke oben rechts“, „Mitteilungen aufs Handy“ (Onboarding-Schritt und Hinweis „Neu“), dazu
 * „Schnee-Wecker“ (Pro) nur, wenn der Server ihn freigegeben hat (`wecker`).
 */
export function ErklaerListe({ wecker = false, ort = 'dashboard' }: { wecker?: boolean; ort?: ErklaerOrt }) {
  return (
    <ul className="mt-erklaer">
      {erklaerPunkte(wecker, ort).map((p) => {
        const I = ERKLAER_ICON[p.art];
        return (
          <li key={p.art}>
            <span className="mt-sym" aria-hidden="true">
              <I className="i" />
            </span>
            <span>
              <b>{p.titel}</b>
              {p.pro && <span className="badge mt-pro">Pro</span>}
              <br />
              {p.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Hinweis „Neu“ selbst (rein, auch für die Vorschau). Im Außendienst (`ort`) eigene Texte und nur „Alles klar“: „Alle
 * Mitteilungen“ läge im Dashboard (Büro-Ansicht) — die Glocke steht ohnehin oben rechts.
 */
export function NeuHinweisKarte({
  seite,
  pro,
  wecker,
  onZu,
  ort = 'dashboard',
}: {
  seite: string;
  pro: boolean | null;
  wecker: boolean;
  onZu: () => void;
  ort?: ErklaerOrt;
}) {
  const titelId = useId();
  return (
    <section className="card mt-neu-hinweis" aria-labelledby={titelId}>
      <h2 id={titelId}>
        <Sparkles className="i" aria-hidden /> Neu: Heute Nacht und Mitteilungen
      </h2>
      <ErklaerListe wecker={wecker} ort={ort} />
      {pro === false && <p className="muted small">{PRO_HINWEIS}</p>}
      <div className="mt-neu-knoepfe">
        <button type="button" className="btn" onClick={onZu}>
          Alles klar
        </button>
        {ort === 'dashboard' && (
          <Link className="btn ghost" to={seite}>
            Alle Mitteilungen
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * Einmaliger Hinweis „Neu: Heute Nacht und Mitteilungen“ für Bestandsnutzer (F) — auf der Übersicht bzw. im Außendienst
 * (`ort`, Objektliste) direkt über der Karte „Heute Nacht“ (HeuteNacht `davor`: erscheint nur, wenn die Karte selbst zu
 * sehen ist). Ein Merker je Konto für beide Orte: wer ihn im Büro gesehen hat, sieht ihn draußen nicht noch einmal. Nur mit Glocke (Server-
 * Nachtrag da), nicht nach einer Neuanlage (mitteilungenDaten.ts: neuHinweisFaellig). Der Merker wird schon beim Zeigen
 * gesetzt — EINMAL heißt einmal; der Hinweis bleibt bis „Alles klar“ bzw. bis man die Übersicht verlässt.
 * `wecker`: Schnee-Wecker am Server freigegeben (aus der Karte „Heute Nacht“: guide_live_arten).
 */
export function NeuHinweis({ wecker, ort = 'dashboard' }: { wecker: boolean; ort?: ErklaerOrt }) {
  const st = useMitteilungen();
  const uid = useAppAuthOptional()?.session?.user.id ?? null;
  const angelegt = useOrgOptional()?.data?.org.created_at ?? null;
  const [stand, setStand] = useState<'offen' | 'zu' | null>(null);
  // einmal entscheiden, sobald die Glocke da ist (Zustand aus dem Rendern abgeleitet, kein Effekt-Umweg)
  if (stand === null && st?.da && uid) setStand(neuHinweisFaellig(uid, angelegt, Date.now()) ? 'offen' : 'zu');
  useEffect(() => {
    if (stand === 'offen') neuHinweisMerken(uid);
  }, [stand, uid]);
  if (stand !== 'offen' || !st) return null;
  return <NeuHinweisKarte seite={st.seite} pro={st.pro} wecker={wecker} ort={ort} onZu={() => setStand('zu')} />;
}
