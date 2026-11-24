// Fahrt aufzeichnen im Browser — wie „Freie Fahrt“ / „Strecke fahren“ / „Einmal abfahren“ in der App
// (mobile/src/screens/RouteRunScreen.tsx). Gespeichert wird dieselbe route_run-Zeile wie aus der App;
// Länge, Abdeckung und Prüfcode rechnet der Server beim Eingang.
//   …/strecken/frei                     Freie Fahrt (ohne Vorlage)
//   …/strecken/<id>/fahren              Fahrt auf einer gespeicherten Strecke (Abdeckung in %)
//   …/strecken/frei?plan=1&name=…       Strecke einmal abfahren → wird als Vorlage gespeichert (nur Inhaber)
//   …/strecken/frei?plan=1&replace=<id> Linie einer Strecke neu aufnehmen
//   …?weiter=1                          unterbrochene Aufzeichnung fortsetzen/abschließen
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, CloudOff, Play, Square, TriangleAlert } from 'lucide-react';
import { useUnsavedGuard } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtTime } from '../../lib/format';
import { RouteSketch } from '../RouteSketch';
import { fmtDistance, type LatLng, type Route } from '../routes';
import { weatherLabel } from '../labels';
import type { WeatherSnapshot } from '../types';
import { formToRecord, initialForm } from '../einsatz/amount';
import { isNetworkError, type RunRow } from '../einsatz/backend';
import { useEinsatz } from '../einsatz/context';
import { getPerformerName, newId, setPerformerName } from '../einsatz/data';
import type { FormValues } from '../einsatz/store';
import { Felder } from './Felder';
import { PRO_HOW } from '../pro';
import { coverage, flatTrack, fmtDur, simplify, thinTrack, type Coverage } from './geo';
import { useRecorder } from './recorder';
import { deleteActiveRun, getActiveRun, saveActiveRun, submitRun, type ActiveRun, type RunMode, type RunResult } from './runStore';

export function StreckeFahren() {
  const { id } = useParams();
  const [q] = useSearchParams();
  return <Fahren key={`${id ?? 'frei'}?${q.toString()}`} routeId={id ?? null} q={q} />;
}

interface Sess {
  id: string;
  mode: RunMode;
  routeId: string | null;
  routeName: string | null;
  plan: LatLng[] | null;
  planName?: string;
  planNotes?: string;
  replaceRouteId?: string;
}

type Phase = 'loading' | 'old' | 'ready' | 'recording' | 'finish' | 'plansave' | 'done';
type Ask = null | 'stop' | 'empty' | 'discard';

const SAVE_EVERY_MS = 10000;

function Fahren({ routeId, q }: { routeId: string | null; q: URLSearchParams }) {
  const { be, userId, orgId, base, owner } = useEinsatz();
  const navigate = useNavigate();
  const list = `${base}/strecken`;

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sess, setSess] = useState<Sess | null>(null);
  const [old, setOld] = useState<ActiveRun | null>(null);
  const [stoppedAt, setStoppedAt] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(() => initialForm(getPerformerName(userId)));
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const weatherRef = useRef<WeatherSnapshot | null>(null);
  const [cov, setCov] = useState<Coverage | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ result: RunResult; onDevice: boolean; lengthM: number } | null>(null);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);

  const rec = useRecorder((lat, lng) => {
    if (weatherRef.current) return;
    void be.weather(lat, lng).then((r) => {
      if (r.weather && !weatherRef.current) {
        weatherRef.current = r.weather;
        setWeather(r.weather);
      }
    });
  });

  // --- Laden: Strecke (Vorlage) + evtl. unterbrochene Aufzeichnung ---------------------------
  const adopt = useCallback(
    (a: ActiveRun, cont: boolean) => {
      setSess({ id: a.id, mode: a.mode, routeId: a.routeId, routeName: a.routeName, plan: a.plan, planName: a.planName, planNotes: a.planNotes, replaceRouteId: a.replaceRouteId });
      weatherRef.current = a.weather;
      setWeather(a.weather);
      if (a.form) setForm(a.form);
      setPhotos(a.photos);
      const data = { startedAt: a.startedAt, track: a.track, gaps: a.gaps, lengthM: a.lengthM };
      if (a.stoppedAt || !cont) {
        // schon beendet (oder „Jetzt abschließen“): Ende = Stopp bzw. letzte Sicherung
        rec.load(data);
        setStoppedAt(a.stoppedAt ?? a.savedAt);
        setPhase(a.mode === 'plan' ? 'plansave' : 'finish');
      } else {
        rec.resume(data, a.savedAt);
        setPhase('recording');
      }
    },
    [rec],
  );
  const adoptRef = useRef(adopt);
  adoptRef.current = adopt;

  useEffect(() => {
    let alive = true;
    (async () => {
      const active = await getActiveRun(userId);
      if (!alive) return;
      if (active && q.has('weiter')) return adoptRef.current(active, q.get('weiter') !== 'ende');
      const planMode = q.has('plan');
      const replace = q.get('replace') ?? undefined;
      let route: Route | null = null;
      const wanted = routeId ?? replace;
      if (wanted) {
        route = await be.getRoute(wanted);
        if (!alive) return;
        if (!route) return setLoadError('Diese Strecke gibt es nicht (mehr) in deinem Betrieb.');
      }
      if (planMode && !owner) return setLoadError('Strecken anlegen und ändern kann nur der Inhaber des Betriebs.');
      setSess({
        id: newId(),
        mode: planMode ? 'plan' : 'run',
        routeId: planMode ? null : routeId,
        routeName: planMode ? null : (route?.name ?? null),
        plan: planMode ? null : (route?.path ?? null),
        planName: planMode ? (replace ? route?.name : q.get('name') ?? undefined) : undefined,
        planNotes: planMode ? (q.get('notes') ?? undefined) : undefined,
        replaceRouteId: planMode ? replace : undefined,
      });
      if (active) {
        setOld(active);
        setPhase('old');
      } else setPhase('ready');
    })().catch((e) => {
      if (alive) setLoadError(isNetworkError(e) ? 'Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.' : e instanceof Error ? e.message : String(e));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sicherung der laufenden Aufzeichnung ---------------------------------------------------
  const finishedRef = useRef(false);
  const snap = useRef<() => void>(() => undefined);
  snap.current = () => {
    if (!sess || finishedRef.current || !rec.data.startedAt) return;
    if (phase !== 'recording' && phase !== 'finish' && phase !== 'plansave') return;
    void saveActiveRun({
      userId,
      ...sess,
      startedAt: rec.data.startedAt,
      stoppedAt,
      track: rec.data.track,
      gaps: rec.data.gaps,
      lengthM: rec.data.lengthM,
      weather: weatherRef.current,
      form: phase === 'finish' ? form : null,
      photos: phase === 'finish' ? photos : [],
    });
  };
  useEffect(() => {
    if (phase !== 'recording') return;
    snap.current();
    // Im Hintergrund ruht die Aufzeichnung (Pause). Dort NICHT weiter sichern: jede Sicherung stempelt eine frische Zeit,
    // und nach einem Neuladen würde die Unterbrechung dann zu kurz (oder gar nicht) im Nachweis stehen (20.11.2026).
    // Die Sicherung beim Verlassen (onHide unten) hält den Stand vom Moment des Verlassens fest.
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') snap.current();
    }, SAVE_EVERY_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') snap.current();
    };
    const onPageHide = () => snap.current();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      snap.current(); // Seite wird verlassen: letzten Stand sofort sichern
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== 'finish' && phase !== 'plansave') return;
    const t = setTimeout(() => snap.current(), 800);
    return () => clearTimeout(t);
  }, [phase, form, photos, stoppedAt]);

  // --- Live-Abdeckung gegen die Vorlage (nur Vorschau, maßgeblich ist der Server) -----------------
  const plan = sess?.plan && sess.plan.length >= 2 ? sess.plan : null;
  useEffect(() => {
    if (!plan || (phase !== 'recording' && phase !== 'finish')) return;
    const calc = () => setCov(coverage(plan, rec.data.track));
    calc();
    if (phase !== 'recording') return;
    const t = setInterval(calc, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, phase]);

  useUnsavedGuard(
    phase === 'recording',
    'Die Aufzeichnung läuft. Seite trotzdem verlassen? Die Aufzeichnung bleibt auf dem Gerät gesichert und kann unter „Strecken“ fortgesetzt werden — die Unterbrechung wird als Pause vermerkt.',
  );

  // --- Aktionen ---------------------------------------------------------------------------------
  const start = () => {
    rec.start();
    setStoppedAt(null);
    setPhase('recording');
  };

  const discard = async () => {
    finishedRef.current = true;
    rec.stop();
    await deleteActiveRun(userId);
    navigate(list, { replace: true });
  };

  const savePlan = useCallback(
    async (s: Sess) => {
      setSaving(true);
      setSaveError(null);
      try {
        const path = simplify(flatTrack(rec.data.track), 4);
        if (path.length < 2) throw new Error('Es wurde keine Strecke aufgezeichnet.');
        const existing = s.replaceRouteId ? await be.getRoute(s.replaceRouteId) : null;
        if (s.replaceRouteId && !existing) throw new Error('Die Strecke gibt es nicht mehr.');
        if (!existing) {
          // Gratis-Paket: 1 aktive Strecke (wie in der App). Die Aufnahme bleibt in jedem Fall gesichert.
          const [routes, pro] = await Promise.all([be.listRoutes(), be.isPro()]);
          if (!pro && routes.filter((r) => r.active && r.id !== s.id).length >= 1) {
            throw new Error(
              `Im Gratis-Paket ist 1 aktive Strecke möglich. Die Aufnahme bleibt gesichert — mit Pro hier unter „Strecken“ fortsetzen und speichern. ${PRO_HOW}`,
            );
          }
        }
        await be.saveRoute(
          existing
            ? { id: existing.id, org_id: existing.org_id, name: existing.name.trim(), notes: existing.notes?.trim() || null, path, source: 'recorded', property_ids: existing.property_ids ?? [], active: existing.active }
            : { id: s.id, org_id: orgId, name: s.planName?.trim() || 'Neue Strecke', notes: s.planNotes?.trim() || null, path, source: 'recorded', property_ids: [], active: true },
        );
        finishedRef.current = true;
        await deleteActiveRun(userId);
        setSavedRouteId(existing?.id ?? s.id);
        setPhase('done');
      } catch (e) {
        setSaveError(
          isNetworkError(e)
            ? 'Zum Speichern einer Strecke braucht es kurz Internet. Die Aufnahme bleibt gesichert — bitte bei Empfang erneut auf „Strecke speichern“ tippen.'
            : /row-level security|permission denied/i.test(String((e as Error)?.message))
              ? 'Strecken anlegen und ändern kann nur der Inhaber des Betriebs.'
              : e instanceof Error
                ? e.message
                : String(e),
        );
      } finally {
        setSaving(false);
      }
    },
    [be, orgId, rec.data, userId],
  );

  const confirmStop = () => {
    if (!sess) return;
    const stopAt = Date.now();
    setStoppedAt(new Date(stopAt).toISOString());
    // GPS-Loch bis zum Beenden als Unterbrechung — nur bei Fahrten (eine aufgenommene Strecke hat keinen Nachweis)
    rec.stop(sess.mode === 'run' ? stopAt : undefined);
    setAsk(null);
    if (sess.mode === 'plan') {
      setPhase('plansave');
      void savePlan(sess);
    } else {
      setPhase('finish');
      window.scrollTo({ top: 0 });
    }
  };

  const saveRun = async () => {
    if (!sess || saving) return;
    // Ohne aufgezeichnete Strecke gibt es nichts zu belegen: über „Abschließen“ in der Streckenliste kam man bisher
    // auch mit 0 Punkten zum Speichern und bekam einen Prüfcode für eine Fahrt über 0 m (20.11.2026).
    if (rec.data.track.reduce((n, seg) => n + seg.length, 0) < 2) {
      setSaveError('Es wurde keine Strecke aufgezeichnet (kein GPS-Signal). Bitte die Aufzeichnung verwerfen und neu starten.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const row: RunRow = {
        id: sess.id,
        org_id: orgId,
        route_id: sess.routeId,
        started_at: rec.data.startedAt,
        ended_at: stoppedAt ?? now, // Stopp-Zeitpunkt, nicht Speicher-Zeitpunkt
        track: thinTrack(rec.data.track.filter((s) => s.length)),
        gaps: rec.data.gaps,
        gps_mocked: null, // der Browser meldet kein Fake-GPS
        ...formToRecord(form),
        weather: weatherRef.current,
        performed_by: userId,
        created_at: now,
      };
      finishedRef.current = true;
      const res = await submitRun(be, { userId, routeName: sess.routeName, row, photos });
      setPerformerName(userId, form.performerName.trim());
      // Aufzeichnung erst weg, wenn die fertige Fahrt sicher ist (Server oder dauerhaft auf dem Gerät) — sonst bleibt sie als letzte Sicherung.
      if (res.result === 'synced' || res.onDevice) await deleteActiveRun(userId);
      setResult({ ...res, lengthM: rec.data.lengthM });
      setPhase('done');
      window.scrollTo({ top: 0 });
    } catch (e) {
      finishedRef.current = false;
      setSaveError(`${e instanceof Error ? e.message : String(e)} — Die Fahrt bleibt gesichert, einfach erneut versuchen.`);
    } finally {
      setSaving(false);
    }
  };

  // --- Anzeige ----------------------------------------------------------------------------------
  const sketch = useMemo(
    () => (
      <div className="sr-map">
        <RouteSketch plan={plan} track={rec.data.track} missed={cov && cov.pct > 0 ? cov.missed : null} label="Gefahrene Strecke" />
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, phase === 'recording' ? Math.floor(Date.now() / 3000) : rec.points, cov, phase],
  );

  const back = (
    <Link to={list} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> Strecken
    </Link>
  );
  if (loadError) {
    return (
      <div className="ez">
        {back}
        <div className="error-box">{loadError}</div>
      </div>
    );
  }
  if (phase === 'loading' || !sess) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  const isPlan = sess.mode === 'plan';
  const title = isPlan ? `Neue Strecke: ${sess.planName?.trim() || 'Neue Strecke'}` : (sess.routeName ?? 'Freie Fahrt');

  if (phase === 'old' && old) {
    return (
      <div className="ez">
        {back}
        <h1>Unterbrochene Aufzeichnung</h1>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Auf diesem Gerät liegt noch eine {old.stoppedAt ? 'nicht gespeicherte Fahrt' : 'unterbrochene Aufzeichnung'}:
            <br />
            <b>
              {old.mode === 'plan' ? `Neue Strecke: ${old.planName ?? ''}` : (old.routeName ?? 'Freie Fahrt')} · Beginn {fmtTime(old.startedAt)} ·{' '}
              {fmtDistance(old.lengthM)}
            </b>
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => adopt(old, true)}>
              Die alte fortsetzen
            </button>
            <button type="button" className="btn ghost ez-big" onClick={() => setAsk('discard')}>
              Alte verwerfen, neu starten
            </button>
            <Link to={list} className="btn ghost ez-big">
              Abbrechen
            </Link>
          </div>
        </div>
        {/* Ein Fehlgriff hätte eine ganze, noch nicht gesendete Fahrt gelöscht → erst nachfragen */}
        {ask === 'discard' && (
          <DiscardDialog
            onClose={() => setAsk(null)}
            onDiscard={() => {
              setAsk(null);
              void deleteActiveRun(userId);
              setOld(null);
              setPhase('ready');
            }}
          />
        )}
      </div>
    );
  }

  if (phase === 'done') {
    const rejected = result && typeof result.result === 'object' ? result.result.rejected : null;
    const queued = !!result && result.result !== 'synced';
    return (
      <div className="ez ez-done">
        <div className={`ez-done-icon${queued ? ' wait' : ''}`} aria-hidden>
          {queued ? <CloudOff /> : <Check />}
        </div>
        <h1>{isPlan ? 'Strecke gespeichert' : queued ? 'Auf dem Gerät gesichert' : 'Fahrt gesichert'}</h1>
        <p className="muted">{title}</p>
        {isPlan ? (
          <p>Die Strecke steht jetzt als Vorlage bereit — jede Fahrt darauf wird mit Abdeckung in % nachgewiesen.</p>
        ) : rejected ? (
          <div className="error-box" style={{ textAlign: 'left' }}>
            <TriangleAlert className="i" aria-hidden /> Vom Server nicht angenommen: {rejected}
            <br />
            Die Fahrt ist auf diesem Gerät gespeichert und wird später automatisch erneut gesendet (mit wachsenden
            Abständen; „Jetzt senden“ unter „Strecken“ versucht es sofort). Bleibt es dabei, bitte support@dexware.app
            melden.
          </div>
        ) : queued ? (
          <div className="info-box" style={{ textAlign: 'left' }}>
            {result?.onDevice
              ? 'Gerade keine Verbindung. Die Fahrt liegt sicher auf diesem Gerät und wird automatisch übertragen, sobald wieder Empfang da ist. Bitte diese Seite später noch einmal öffnen, bis unter „Strecken“ nichts mehr wartet.'
              : 'Gerade keine Verbindung — und dieser Browser erlaubt kein dauerhaftes Speichern (privates Surfen?). Bitte diese Seite offen lassen, bis die Fahrt übertragen ist.'}
          </div>
        ) : (
          <p>
            {fmtDistance(result?.lengthM)}
            {cov ? ` · ${String(cov.pct).replace('.', ',')} % der Strecke` : ''} · Prüfcode vergeben
          </p>
        )}
        <div className="ez-actions">
          {isPlan && savedRouteId && (
            <Link to={`${list}/${savedRouteId}`} className="btn ez-big">
              Zur Strecke
            </Link>
          )}
          <Link to={list} className={`btn ez-big${isPlan ? ' ghost' : ''}`}>
            Fertig
          </Link>
        </div>
      </div>
    );
  }

  const elapsed = rec.data.startedAt ? (stoppedAt ? Date.parse(stoppedAt) : Date.now()) - Date.parse(rec.data.startedAt) : 0;
  const stats = (
    <div className="sr-stats">
      <div className="sr-stat">
        <b>{fmtDistance(rec.data.lengthM)}</b>
        <span>Strecke</span>
      </div>
      <div className="sr-stat">
        <b>{fmtDur(elapsed)}</b>
        <span>Zeit</span>
      </div>
      {plan && (
        <div className="sr-stat">
          <b>{cov ? `${String(cov.pct).replace('.', ',')} %` : '—'}</b>
          <span>Abgedeckt</span>
        </div>
      )}
    </div>
  );
  const g = rec.gps;
  const gpsLine =
    g.state === 'ok'
      ? { tone: '', dot: 'green', text: `GPS gut (±${g.acc} m)` }
      : g.state === 'weak'
        ? { tone: 'warn', dot: 'amber', text: `GPS schwach (±${g.acc} m) — ungenaue Punkte werden ausgelassen` }
        : g.state === 'lost'
          ? {
              tone: 'bad',
              dot: 'red',
              text: `Kein GPS-Signal seit ${Math.round((Date.now() - g.since) / 1000)} s — es wird gerade nichts aufgezeichnet${
                phase === 'recording' ? '. Ab 45 s steht die Zeit als Unterbrechung im Nachweis.' : ''
              }`,
            }
          : g.state === 'denied'
            ? { tone: 'bad', dot: 'red', text: 'Standort nicht erlaubt — bitte in den Einstellungen des Browsers erlauben (iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden“ + „Genauer Standort“), dann die Seite neu laden.' }
            : g.state === 'unsupported'
              ? { tone: 'bad', dot: 'red', text: 'Dieser Browser kann keinen Standort ermitteln.' }
              : { tone: '', dot: 'amber', text: 'Warte auf GPS-Signal … (unter freiem Himmel geht es schneller)' };
  const gapText = rec.data.gaps.map(([a, b]) => `${fmtTime(a).replace(' Uhr', '')}–${fmtTime(b).replace(' Uhr', '')}`).join(', ');
  // Pause (Seite verlassen/gesperrt) oder GPS-Loch über 45 s — beides steht so im Nachweis (wie in der App)
  const gapsN = rec.data.gaps.length;
  const gapLine = `${gapsN === 1 ? '1 Unterbrechung' : `${gapsN} Unterbrechungen`} der Aufzeichnung (Pause oder kein GPS: ${gapText}) — wird im Nachweis vermerkt und nicht als gefahren gewertet.`;

  if (phase === 'finish') {
    return (
      <div className="ez">
        <h1>Fahrt abschließen</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          {title} · {fmtTime(rec.data.startedAt).replace(' Uhr', '')}–{fmtTime(stoppedAt)}
          {weather && weatherLabel(weather) !== '—' ? ` · ${weatherLabel(weather)}` : ''}
        </p>
        {sketch}
        {stats}
        {plan && <p className="muted small">Die Abdeckung wird beim Übertragen vom Server bestätigt (prüffest).</p>}
        {rec.data.gaps.length > 0 && <p className="ez-warn small">{gapLine}</p>}
        <Felder form={form} photos={photos} onForm={setForm} onPhotos={setPhotos} onBusy={setPhotoBusy} />
        {saveError && <div className="error-box">Fahrt nicht gespeichert: {saveError}</div>}
        <button type="button" className="btn ez-save" onClick={() => void saveRun()} disabled={saving || photoBusy}>
          <Check className="i" aria-hidden /> {saving ? 'Speichern …' : 'Fahrt speichern'}
        </button>
        <p className="muted small">
          Hinweis: Fahrten sind nach dem Speichern nicht mehr änderbar (Beweiskette) — nur Storno mit Begründung ist
          möglich.
        </p>
        <button type="button" className="btn ghost small" onClick={() => setAsk('discard')}>
          Aufzeichnung verwerfen
        </button>
        {ask === 'discard' && <DiscardDialog onClose={() => setAsk(null)} onDiscard={() => void discard()} />}
      </div>
    );
  }

  if (phase === 'plansave') {
    return (
      <div className="ez">
        <h1>{title}</h1>
        {sketch}
        {stats}
        {saveError && <div className="error-box">Strecke nicht gespeichert: {saveError}</div>}
        <button type="button" className="btn ez-save" onClick={() => void savePlan(sess)} disabled={saving}>
          <Check className="i" aria-hidden /> {saving ? 'Speichern …' : 'Strecke speichern'}
        </button>
        <button type="button" className="btn ghost small" onClick={() => setAsk('discard')}>
          Aufzeichnung verwerfen
        </button>
        {ask === 'discard' && <DiscardDialog onClose={() => setAsk(null)} onDiscard={() => void discard()} />}
      </div>
    );
  }

  // bereit / Aufzeichnung läuft
  const recording = phase === 'recording';
  return (
    <div className="ez">
      {!recording && back}
      <h1>{title}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {recording ? 'Aufzeichnung läuft' : 'Bereit'}
        {recording ? ` · seit ${fmtTime(rec.data.startedAt)}` : ''}
      </p>

      {stats}
      {sketch}

      <div className={`sr-status ${gpsLine.tone}`} role="status">
        <span className={`ez-dot ${gpsLine.dot}${recording && g.state === 'ok' ? ' pulse' : ''}`} aria-hidden />
        <p>{gpsLine.text}</p>
      </div>

      {recording ? (
        <>
          <p className="muted small">
            📱 Seite offen und Bildschirm an lassen (Handy in die Halterung) — der Browser kann im Hintergrund nicht
            aufzeichnen. Verlassen oder Sperren wird als Pause im Nachweis vermerkt.
            {rec.awake === false && ' Dieser Browser kann den Bildschirm nicht selbst wach halten: bitte die automatische Sperre für die Fahrt ausschalten.'}
            {rec.awake === true && ' Der Bildschirm bleibt von selbst an.'}
          </p>
          {gapsN > 0 && <p className="ez-warn small">{gapLine}</p>}
          <button type="button" className="btn ez-big sr-stop" onClick={() => setAsk(rec.points < 2 ? 'empty' : 'stop')}>
            <Square className="i" aria-hidden /> {isPlan ? 'Strecke fertig' : 'Fahrt beenden'}
          </button>
          <button type="button" className="btn ghost small" style={{ marginTop: 14 }} onClick={() => setAsk('discard')}>
            Aufzeichnung verwerfen
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            {isPlan
              ? 'Fahre die Strecke einmal komplett ab. Daraus wird die Vorlage für alle künftigen Fahrten. Tipp: Erst starten, wenn du am Anfang der Strecke stehst.'
              : 'Tippe auf Start, sobald du losfährst. Die gefahrene Strecke wird live eingezeichnet.'}
          </p>
          <button type="button" className="btn ez-save" onClick={start} disabled={g.state === 'denied' || g.state === 'unsupported'}>
            <Play className="i" aria-hidden /> Start
          </button>
          <p className="muted small">
            Wichtig im Browser: Während der Fahrt muss diese Seite offen und der Bildschirm an bleiben. Mit gesperrtem
            Handy oder in einer anderen App wird nichts aufgezeichnet (das kann nur die Android-App).
          </p>
        </>
      )}

      {ask === 'stop' && (
        <Modal title={isPlan ? 'Strecke fertig abgefahren?' : 'Fahrt beenden?'} onClose={() => setAsk(null)} dirty={false}>
          <p>
            {plan && cov
              ? `${String(cov.pct).replace('.', ',')} % der Strecke abgedeckt${cov.missed.length ? ` — ${cov.missed.length} ${cov.missed.length === 1 ? 'Abschnitt' : 'Abschnitte'} noch nicht befahren (rot auf der Karte).` : '.'}`
              : `${fmtDistance(rec.data.lengthM)} aufgezeichnet.${isPlan ? '' : ' Danach trägst du Maßnahme und Fotos ein.'}`}
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ghost ez-big" onClick={() => setAsk(null)}>
              Weiter fahren
            </button>
            <button type="button" className="btn ez-big" onClick={confirmStop}>
              {isPlan ? 'Ja, Strecke speichern' : 'Ja, beenden'}
            </button>
          </div>
        </Modal>
      )}
      {ask === 'empty' && (
        <Modal title="Noch keine Strecke aufgezeichnet" onClose={() => setAsk(null)} dirty={false}>
          <p>Bisher wurde keine Bewegung erfasst. Erst losfahren, dann beenden.</p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => setAsk(null)}>
              Weiter aufzeichnen
            </button>
            <button type="button" className="btn ghost ez-big" onClick={() => void discard()}>
              Verwerfen
            </button>
          </div>
        </Modal>
      )}
      {ask === 'discard' && <DiscardDialog onClose={() => setAsk(null)} onDiscard={() => void discard()} />}
    </div>
  );
}

function DiscardDialog({ onClose, onDiscard }: { onClose: () => void; onDiscard: () => void }) {
  return (
    <Modal title="Aufzeichnung verwerfen?" onClose={onClose} dirty={false}>
      <p>Die bisher gefahrene Strecke wird nicht gespeichert.</p>
      <div className="ez-actions">
        <button type="button" className="btn ghost ez-big" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="btn ez-big ez-danger" onClick={onDiscard}>
          Verwerfen
        </button>
      </div>
    </Modal>
  );
}
