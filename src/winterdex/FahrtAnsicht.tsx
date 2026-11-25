// Fahrt bzw. Strecke anzeigen (seit 25.11.2026): echte Karte (FahrtKarte, lazy) mit Zeitmarken, darunter der
// Zeit-Regler („wann war er wo“) und die aufklappbare Zeitleiste. Rückfall ist immer die bisherige Skizze
// (RouteSketch, wie im PDF): ohne Netz, Kacheln laden nicht, Karte lässt sich nicht laden, irgendein Fehler —
// nie eine leere Seite. Alle Rechnungen einmal je Fahrt (useMemo), nicht bei jedem Render.
import { Component, lazy, Suspense, useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { RouteSketch } from './RouteSketch';
import { ROUTE_COLORS, type LatLng, type Track } from './routes';
import {
  fahrtDaten,
  fmtKm,
  fmtUhr,
  infoZuPunkt,
  infoZuZeit,
  spurStuecke,
  vereinfacheLinie,
  waehleSchritt,
  zeitleiste,
  zeitMarken,
} from './fahrtZeit';
import type { KartenCursor } from './FahrtKarte';
import {
  fmtStrecke,
  ortText,
  STRASSEN_ERMITTELT,
  STRASSEN_QUELLE,
  STRASSEN_QUELLE_URL,
  strassenAnzeige,
  strasseZu,
  strassenText,
  type StrassenStand,
} from './strassen';

const FahrtKarte = lazy(() => import('./FahrtKarte'));

export interface FahrtAnsichtProps {
  plan?: LatLng[] | null;
  track?: Track | null;
  missed?: LatLng[][] | null;
  gaps?: [string, string][] | null;
  startedAt?: string | null;
  endedAt?: string | null;
  label: string;
  /** Zeitmarken, Regler und Zeitleiste (Standard an; aus z. B. für eine Strecken-Vorlage oder „letzte Fahrt“) */
  zeit?: boolean;
  /** Straßenverlauf (route_run_strassen, seit 25.11.2026); null/undefiniert = keiner bzw. noch nicht geladen */
  strassen?: StrassenStand | null;
  /** stornierte Fahrten werden nie ermittelt → kein „wird ermittelt“ */
  canceled?: boolean;
}

/** Fängt jeden Fehler der Karte/Zeitleiste ab und zeigt stattdessen die Skizze. */
class Rueckfall extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  componentDidCatch(e: unknown) {
    console.error('Fahrt-Karte → Skizze:', e);
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

export function FahrtAnsicht(props: FahrtAnsichtProps) {
  return (
    <Rueckfall fallback={<RouteSketch plan={props.plan} track={props.track} missed={props.missed} label={props.label} />}>
      <Ansicht {...props} />
    </Rueckfall>
  );
}

/**
 * Gleicher Inhalt = gleiche Referenz: Seiten mit Live-Auffrischung (Strecke alle 30 s) laden die Fahrt neu — ohne das
 * würde die Karte jedes Mal neu aufgebaut (Ausschnitt/Zoom weg). Verglichen wird nur, wenn sich die Referenz ändert.
 */
function useGleich<T>(v: T): T {
  const ref = useRef<{ v: T; s: string } | null>(null);
  return useMemo(() => {
    const s = JSON.stringify(v) ?? '';
    if (ref.current && ref.current.s === s) return ref.current.v;
    ref.current = { v, s };
    return v;
  }, [v]);
}

function Ansicht(props: FahrtAnsichtProps) {
  const { startedAt, endedAt, label, zeit = true } = props;
  const plan = useGleich(props.plan);
  const track = useGleich(props.track);
  const missed = useGleich(props.missed);
  const gaps = useGleich(props.gaps);
  const F = useMemo(() => fahrtDaten(track, startedAt, endedAt, gaps), [track, startedAt, endedAt, gaps]);
  const zeitAn = zeit && F.mitZeit && F.n >= 2;
  const d = useMemo(() => {
    const schritt = zeitAn ? waehleSchritt(F.t[0], F.t[F.n - 1]) : 0;
    return {
      schritt,
      marken: zeitAn ? zeitMarken(F, { schrittMin: schritt }) : [],
      zeilen: zeitAn ? zeitleiste(F, { schrittMin: schritt }) : [],
      plan: vereinfacheLinie(plan),
      stuecke: spurStuecke(F),
      missed: (Array.isArray(missed) ? missed : []).map((s) => vereinfacheLinie(s)).filter((s) => s.length >= 2),
    };
  }, [F, zeitAn, plan, missed]);

  const str = useMemo(() => {
    try {
      return startedAt ? strassenAnzeige(props.strassen, { started_at: startedAt, canceled: props.canceled }, zeitAn) : null;
    } catch (e) {
      console.error('Straßenverlauf ausgelassen:', e);
      return null;
    }
  }, [props.strassen, props.canceled, startedAt, zeitAn]);
  const strTab = str?.art === 'tabelle' ? str : null;

  const [ansicht, setAnsicht] = useState<'karte' | 'skizze'>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'skizze' : 'karte',
  );
  const [kachelFehler, setKachelFehler] = useState(false);
  /** Uhrzeit des Reglers (ms) — null = noch nicht benutzt */
  const [t, setT] = useState<number | null>(null);
  /** ohne Punkt-Zeiten: angetippter Punkt (nur km) */
  const [punkt, setPunkt] = useState<number | null>(null);
  const kartenBox = useRef<HTMLDivElement>(null);
  const reglerId = useId();

  const lo = zeitAn ? Math.min(Number.isFinite(F.startMs) ? F.startMs : F.t[0], F.t[0]) : 0;
  const hi = zeitAn ? Math.max(Number.isFinite(F.endMs) ? F.endMs : F.t[F.n - 1], F.t[F.n - 1]) : 0;

  const info = useMemo(() => {
    if (zeitAn && t != null) return infoZuZeit(F, t);
    if (punkt != null && punkt < F.n) return { lat: F.lat[punkt], lng: F.lng[punkt], ...infoZuPunkt(F, punkt, false) };
    return null;
  }, [F, zeitAn, t, punkt]);
  const cursor = useMemo<KartenCursor | null>(
    () => (info ? { lat: info.lat, lng: info.lng, titel: info.titel, zusatz: info.zusatz } : null),
    [info],
  );

  const onPick = useCallback(
    (i: number) => {
      if (zeitAn) setT(F.t[i]);
      else setPunkt(i);
    },
    [F, zeitAn],
  );
  const onKachelFehler = useCallback(() => {
    setKachelFehler(true);
    setAnsicht('skizze');
  }, []);

  const hatGeo = F.n > 0 || d.plan.length > 0;
  if (!hatGeo) return <RouteSketch plan={plan} track={track} missed={missed} label={label} />;

  const startLabel = zeitAn ? `Start ${fmtUhr(lo)}` : F.n > 0 ? 'Start' : null;
  const endeLabel = zeitAn ? `Ende ${fmtUhr(hi)}` : F.n > 1 ? 'Ende' : null;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));

  /** Pfeiltasten: ±1 Min., mit Umschalt bzw. Bild↑/↓: ±10 Min. (Pos1/Ende macht der Browser) */
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const s = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown' ? 600000 : 60000;
    const vor = e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp';
    const zurueck = e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown';
    if (!vor && !zurueck) return;
    e.preventDefault();
    setT(clamp((t ?? lo) + (vor ? s : -s)));
  };
  const zeigeZeit = (ms: number) => {
    setT(ms);
    kartenBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const c = ROUTE_COLORS;
  const umschalten = (
    <button
      type="button"
      className="fk-umschalt"
      onClick={() => {
        setKachelFehler(false);
        setAnsicht(ansicht === 'karte' ? 'skizze' : 'karte');
      }}
    >
      {ansicht === 'karte' ? 'Als Skizze (wie im PDF)' : kachelFehler ? 'Karte erneut laden' : 'Als Karte'}
    </button>
  );

  return (
    <div className="fk">
      {ansicht === 'karte' ? (
        <figure className="fk-figur" ref={kartenBox}>
          <Suspense fallback={<div className="fk-map fk-wartet" aria-busy="true" aria-label="Karte wird geladen" />}>
            <FahrtKarte
              F={F}
              plan={d.plan}
              stuecke={d.stuecke}
              missed={d.missed}
              marken={d.marken}
              zeitAn={zeitAn}
              startLabel={startLabel}
              endeLabel={endeLabel}
              cursor={cursor}
              onPick={onPick}
              onKachelFehler={onKachelFehler}
              label={label}
            />
          </Suspense>
          <figcaption className="route-legend small muted">
            {d.plan.length >= 2 && (
              <span>
                <i style={{ background: c.planMap, opacity: 0.6 }} /> Strecken-Vorlage
              </span>
            )}
            {F.n >= 2 && (
              <span>
                <i style={{ background: c.track }} /> gefahren (GPS)
              </span>
            )}
            {d.missed.length > 0 && (
              <span>
                <i className="fk-leg-strich" style={{ color: c.missed }} /> nicht befahren
              </span>
            )}
            {F.unterbrechungen.length > 0 && (
              <span>
                <i className="fk-leg-punkte" /> Unterbrechung
              </span>
            )}
            {d.marken.length > 0 && <span>● 09:45 = Uhrzeit dort</span>}
            <span>● Start grün · Ende dunkel</span>
            {umschalten}
          </figcaption>
        </figure>
      ) : (
        <>
          {kachelFehler && (
            <p className="small muted fk-hinweis">Die Karte ließ sich gerade nicht laden (kein Internet?) — hier die Skizze wie im PDF.</p>
          )}
          <RouteSketch plan={plan} track={track} missed={missed} label={label} marks={d.marken} mapLink={false} extra={umschalten} />
        </>
      )}

      {zeitAn && ansicht === 'karte' && (
        <div className="fk-regler">
          <label htmlFor={reglerId} className="small muted">
            Wann war das Fahrzeug wo? Regler ziehen oder die grüne Linie antippen.
          </label>
          <input
            id={reglerId}
            type="range"
            min={0}
            max={Math.max(1, Math.round((hi - lo) / 1000))}
            step={1}
            value={t == null ? 0 : Math.round((t - lo) / 1000)}
            onChange={(e) => setT(clamp(lo + Number(e.target.value) * 1000))}
            onKeyDown={onKey}
            aria-valuetext={info ? `${info.titel}${info.zusatz ? `. ${info.zusatz}` : ''}` : `${fmtUhr(lo)} Uhr, Start`}
          />
          <div className="fk-skala small muted" aria-hidden="true">
            <span>{fmtUhr(lo)}</span>
            <span>{fmtUhr(hi)}</span>
          </div>
          <div className="fk-info">
            {info ? (
              <>
                <b>{info.titel}</b>
                {info.zusatz && <span className="muted"> · {info.zusatz}</span>}
              </>
            ) : (
              <span className="muted">Der blaue Punkt zeigt dann Uhrzeit und Kilometer an dieser Stelle.</span>
            )}
          </div>
        </div>
      )}
      {!zeitAn && F.n >= 2 && info && ansicht === 'karte' && (
        <div className="fk-info">
          <b>{info.titel}</b>
        </div>
      )}

      {str?.art === 'ermittelt' && (
        <p className="small muted fk-strassen-hinweis" data-testid="strassen-ermittelt">
          {STRASSEN_ERMITTELT}
        </p>
      )}
      {strTab && (
        <section className="fk-strassen" aria-label="Straßenverlauf">
          <h2 className="fk-strassen-titel">Straßenverlauf — wann auf welcher Straße</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Uhrzeit</th>
                  <th>Straße</th>
                  <th>Ort</th>
                  <th className="fk-r">Strecke</th>
                </tr>
              </thead>
              <tbody>
                {strTab.zeilen.map((z, i) => {
                  const von = fmtUhr(z.von);
                  const bis = fmtUhr(z.bis);
                  const zeitText = von === bis ? von : `${von}–${bis}`;
                  return (
                    <tr key={i}>
                      <td>
                        {ansicht === 'karte' ? (
                          <button type="button" className="fk-zeit-btn" onClick={() => zeigeZeit(clamp(z.von))} title="Auf der Karte zeigen">
                            {zeitText}
                          </button>
                        ) : (
                          zeitText
                        )}
                      </td>
                      <td className="wrap">
                        <b>{z.strasse}</b>
                      </td>
                      <td className="wrap">{ortText(z)}</td>
                      <td className="fk-r">{fmtStrecke(z.m)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted fk-strassen-quelle">
            Straßennamen:{' '}
            <a href={STRASSEN_QUELLE_URL} target="_blank" rel="noreferrer">
              {STRASSEN_QUELLE}
            </a>{' '}
            — nach der Fahrt aus den GPS-Punkten ermittelt, nicht Teil des Prüfcodes.
          </p>
        </section>
      )}

      {zeitAn && d.zeilen.length > 0 && (
        <details className="fk-zeitleiste">
          <summary>
            Zeitleiste: alle {d.schritt} Min. mit Kilometerstand
            <span className="small muted">Uhrzeit · km seit Start · was in der Zeit passiert ist</span>
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Uhrzeit</th>
                  <th>km seit Start</th>
                  {strTab && <th>Straße</th>}
                  <th>Abschnitt</th>
                </tr>
              </thead>
              <tbody>
                {d.zeilen.map((z, i) => {
                  const zeitText = `${fmtUhr(z.t)}${z.bis ? `–${fmtUhr(z.bis)}` : ''}`;
                  const s = strTab && z.art !== 'luecke' ? strasseZu(strTab.zeilen, z.t) : undefined;
                  return (
                    <tr key={i} className={`fk-z-${z.art}`}>
                      <td>
                        {ansicht === 'karte' ? (
                          <button type="button" className="fk-zeit-btn" onClick={() => zeigeZeit(z.t)} title="Auf der Karte zeigen">
                            {zeitText}
                          </button>
                        ) : (
                          zeitText
                        )}
                      </td>
                      <td>{fmtKm(z.dM)}</td>
                      {strTab && <td className="wrap">{s ? strassenText(s, strTab.mehrereOrte) : '—'}</td>}
                      <td className="wrap">{z.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
