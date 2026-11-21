// Strecken im Außendienst — wie der Reiter „Strecken“ der App (mobile/src/screens/RoutesScreen.tsx + RouteFormScreen.tsx):
// Freie Fahrt, gespeicherte Strecken mit „heute gefahren“, neue Strecke (einmal abfahren oder aus Objekten).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, CloudOff, Play, Plus, Route as RouteIcon } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { fmtDistance, RoutesMissingError, type LatLng, type Route, type RunMeta } from '../routes';
import type { Property } from '../types';
import { isToday } from '../einsatz/amount';
import { isNetworkError } from '../einsatz/backend';
import { useEinsatz, usePendingSync } from '../einsatz/context';
import { newId } from '../einsatz/data';
import { emitPendingChanged, onPendingChanged } from '../einsatz/store';
import { pathLengthM, round6 } from './geo';
import { nextTryLabel as nextLabel } from '../../lib/retryLater';
import { FREE_ROUTES, PRO_HOW } from '../pro';
import { deleteActiveRun, deletePendingRun, getActiveRun, listPendingRuns, type ActiveRun, type PendingRun } from './runStore';

export { FREE_ROUTES };
export const FREE_ROUTES_TEXT = `Im Gratis-Paket ist 1 aktive Strecke möglich — mehr Strecken (Gehwege, Straßen, Radwege) gibt es mit Pro. ${PRO_HOW}`;

export function Strecken() {
  const { be, userId, base, owner } = useEinsatz();
  const navigate = useNavigate();
  const list = `${base}/strecken`;
  const state = useAsync(async () => {
    try {
      const [routes, runs] = await Promise.all([be.listRoutes(), be.listTodayRuns()]);
      return { routes, runs, missing: false };
    } catch (e) {
      if (e instanceof RoutesMissingError) return { routes: [] as Route[], runs: [] as RunMeta[], missing: true };
      if (isNetworkError(e)) throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
      throw e;
    }
  }, [be]);
  useLiveRefresh([state.refresh]);
  // wartende Einsätze und Fahrten im Hintergrund nachsenden; „Jetzt senden“ versucht auch abgelehnte sofort
  const { sending, sendNow } = usePendingSync();

  const [active, setActive] = useState<ActiveRun | null>(null);
  const [pending, setPending] = useState<PendingRun[]>([]);
  const [creating, setCreating] = useState(false);
  const [gate, setGate] = useState(false);
  const [discard, setDiscard] = useState<'active' | PendingRun | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    const read = () => {
      void getActiveRun(userId).then((a) => alive && setActive(a));
      void listPendingRuns(userId).then((p) => {
        if (!alive) return;
        setPending((prev) => {
          if (p.length < prev.length) state.refresh();
          return p;
        });
      });
    };
    read();
    const off = onPendingChanged(read);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const newRoute = async (routes: Route[]) => {
    if (routes.filter((r) => r.active).length >= FREE_ROUTES && !(await be.isPro())) return setGate(true);
    setCreating(true);
  };

  return (
    <div className="ez">
      <h1>Strecken</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Für Gehwege, Straßen und Radwege: jede Räumfahrt mit Karte, Uhrzeit und gefahrenen Metern nachweisen.
      </p>

      {active && (
        <div className="ez-pending" role="status">
          <div className="ez-pending-head">
            <RouteIcon className="i" aria-hidden />
            <b>{active.stoppedAt ? 'Fahrt noch nicht gespeichert' : 'Unterbrochene Aufzeichnung'}</b>
          </div>
          <p className="small">
            {active.mode === 'plan' ? `Neue Strecke: ${active.planName ?? ''}` : (active.routeName ?? 'Freie Fahrt')} · Beginn{' '}
            {fmtDateTime(active.startedAt)} · {fmtDistance(active.lengthM)}
          </p>
          <div className="ez-actions" style={{ marginTop: 8 }}>
            <Link to={`${list}/frei?weiter=1`} className="btn ez-big">
              <Play className="i" aria-hidden /> {active.stoppedAt ? 'Jetzt abschließen' : 'Fortsetzen'}
            </Link>
            {!active.stoppedAt && active.mode === 'run' && (
              <Link to={`${list}/frei?weiter=ende`} className="btn ghost ez-big">
                Abschließen (Ende {fmtTime(active.savedAt)})
              </Link>
            )}
            <button type="button" className="btn ghost small" onClick={() => setDiscard('active')}>
              Verwerfen
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="ez-pending" role="status">
          <div className="ez-pending-head">
            <CloudOff className="i" aria-hidden />
            <b>{pending.length === 1 ? '1 Fahrt wartet' : `${pending.length} Fahrten warten`} auf die Übertragung</b>
          </div>
          <p className="small">Sicher auf diesem Gerät gespeichert, wird automatisch gesendet, sobald wieder Empfang da ist.</p>
          <ul>
            {pending.map((p) => (
              <li key={p.key}>
                <span>
                  {p.routeName ?? 'Freie Fahrt'} · {fmtDateTime(p.row.started_at)}
                  {p.lastError && (
                    <span className="ez-pending-err">
                      Vom Server nicht angenommen: {p.lastError}
                      {nextLabel(p)}
                    </span>
                  )}
                </span>
                {p.lastError && (
                  <button type="button" className="btn ghost small" onClick={() => setDiscard(p)}>
                    Verwerfen
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn small" onClick={sendNow} disabled={sending}>
            {sending ? 'Sendet …' : 'Jetzt senden'}
          </button>
        </div>
      )}

      <LoadGuard state={state}>
        {({ routes, runs, missing }) => {
          if (missing) {
            return (
              <div className="info-box">
                Diese Funktion wird für deinen Betrieb gerade freigeschaltet. Bitte später noch einmal vorbeischauen —
                deine Objekte und Einsätze funktionieren wie gewohnt.
              </div>
            );
          }
          const today = runs.filter((r) => !r.canceled && isToday(r.started_at));
          const doneAt = new Map<string, string>();
          for (const r of today) if (r.route_id && !doneAt.has(r.route_id)) doneAt.set(r.route_id, r.started_at);
          for (const p of pending) if (p.row.route_id && isToday(p.row.started_at)) doneAt.set(p.row.route_id, p.row.started_at);
          const freeToday = today.filter((r) => !r.route_id && !r.route_name).length;
          const act = routes.filter((r) => r.active);
          const paused = routes.filter((r) => !r.active);
          const q = query.trim().toLowerCase();
          const shown = act
            .filter((r) => !q || `${r.name} ${r.notes ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => Number(doneAt.has(a.id)) - Number(doneAt.has(b.id)) || a.name.localeCompare(b.name, 'de'));
          const doneCount = act.filter((r) => doneAt.has(r.id)).length;
          return (
            <>
              <div className="sr-top">
                <Link to={`${list}/frei`} className="sr-route">
                  <span className="ez-prop-text">
                    <b>Freie Fahrt</b>
                    <span className="muted">Einmalig aufzeichnen – mit Nachweis, ohne Vorlage</span>
                  </span>
                  <Play className="i" aria-hidden />
                </Link>
                {owner && (
                  <button type="button" className="sr-route" style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer' }} onClick={() => void newRoute(routes)}>
                    <span className="ez-prop-text">
                      <b>Neue Strecke</b>
                      <span className="muted">Bleibt als Vorlage – immer wieder fahren, Abdeckung in %</span>
                    </span>
                    <Plus className="i" aria-hidden />
                  </button>
                )}
              </div>

              {act.length > 0 && (
                <div className="ez-day">
                  {doneCount === act.length ? (
                    <span className="ez-day-done">
                      <Check className="i" aria-hidden /> Alle Strecken gefahren
                    </span>
                  ) : (
                    <span>
                      Heute gefahren: <b>{doneCount}</b> von <b>{act.length}</b>
                    </span>
                  )}
                  {freeToday > 0 && <span className="muted"> · + {freeToday === 1 ? '1 freie Fahrt' : `${freeToday} freie Fahrten`} heute</span>}
                </div>
              )}
              {act.length === 0 && (
                <div className="card empty">
                  Noch keine gespeicherte Strecke. Die Strecke wird einmal abgefahren und gespeichert — danach weist du
                  jede Räumfahrt mit Karte, Uhrzeit und gefahrenen Metern nach.
                  {!owner && ' Sobald dein Betrieb Strecken angelegt hat, siehst du sie hier.'}
                  {freeToday > 0 && ` Heute ${freeToday === 1 ? '1 freie Fahrt' : `${freeToday} freie Fahrten`} dokumentiert.`}
                </div>
              )}

              {act.length >= 6 && (
                <label className="ez-search">
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Strecke suchen" aria-label="Strecke suchen" style={{ paddingLeft: 14 }} />
                </label>
              )}
              <ul className="ez-list">
                {shown.map((r) => {
                  const at = doneAt.get(r.id);
                  return (
                    <li key={r.id}>
                      <Link to={`${list}/${r.id}`} className="sr-route">
                        <span className="ez-prop-text">
                          <b>{r.name}</b>
                          <span className="muted">
                            {fmtDistance(r.length_m)}
                            {r.source === 'objects' ? ` · Objekt-Tour (${r.property_ids?.length ?? 0} Objekte)` : ' · eigene Strecke'}
                          </span>
                        </span>
                        <span className="ez-prop-side">
                          {at ? (
                            <span className="badge green">
                              <Check className="i" aria-hidden /> {fmtTime(at)}
                            </span>
                          ) : (
                            <span className="badge">Heute offen</span>
                          )}
                        </span>
                        <ChevronRight className="i" aria-hidden />
                      </Link>
                      {!at && !active && (
                        <Link to={`${list}/${r.id}/fahren`} className="btn ez-big" style={{ marginTop: 6 }}>
                          <Play className="i" aria-hidden /> Jetzt fahren
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
              {q && shown.length === 0 && <div className="card empty">Keine Strecke gefunden für „{query.trim()}“.</div>}

              {owner && paused.length > 0 && (
                <details className="ez-home">
                  <summary>Pausierte Strecken ({paused.length})</summary>
                  <ul className="ez-list" style={{ marginTop: 10 }}>
                    {paused.map((r) => (
                      <li key={r.id}>
                        <Link to={`${list}/${r.id}`} className="sr-route off">
                          <span className="ez-prop-text">
                            <b>{r.name}</b>
                            <span className="muted">pausiert — antippen, um sie wieder zu aktivieren</span>
                          </span>
                          <ChevronRight className="i" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {creating && <NeueStrecke onClose={() => setCreating(false)} onSaved={(id) => navigate(`${list}/${id}`)} />}
            </>
          );
        }}
      </LoadGuard>

      {gate && (
        <Modal title="Mehr Strecken mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>{FREE_ROUTES_TEXT}</p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => setGate(false)}>
              Verstanden
            </button>
          </div>
        </Modal>
      )}
      {discard && (
        <Modal title={discard === 'active' ? 'Aufzeichnung verwerfen?' : 'Fahrt verwerfen?'} onClose={() => setDiscard(null)} dirty={false}>
          <p>
            {discard === 'active'
              ? 'Die bisher gefahrene Strecke wird nicht gespeichert.'
              : 'Der Server hat diese Fahrt nicht angenommen. Beim Verwerfen wird sie samt Fotos von diesem Gerät gelöscht und lässt sich nicht wiederherstellen.'}
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ghost ez-big" onClick={() => setDiscard(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn ez-big ez-danger"
              onClick={() => {
                const d = discard;
                setDiscard(null);
                void (d === 'active' ? deleteActiveRun(userId) : deletePendingRun(d.row.id)).then(emitPendingChanged);
              }}
            >
              Verwerfen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Neue Strecke: Name + Hinweis, dann „Einmal abfahren“ (empfohlen) oder „Aus Objekten verbinden“. */
function NeueStrecke({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { be, userId, orgId, base } = useEinsatz();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [how, setHow] = useState<'drive' | 'objects'>('drive');
  const [props, setProps] = useState<Property[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [id] = useState(newId);

  useEffect(() => {
    if (how !== 'objects' || props) return;
    be.listProperties().then(
      (p) => setProps(p.filter((x) => x.active && x.lat != null && x.lng != null)),
      () => setError('Objekte konnten nicht geladen werden. Bitte Internet prüfen.'),
    );
  }, [how, props, be, userId]);

  const pickedProps = picked.map((pid) => props?.find((p) => p.id === pid)).filter((p): p is Property => !!p);
  const path: LatLng[] = pickedProps.map((p) => [round6(p.lat!), round6(p.lng!)]);

  const go = async () => {
    setError(null);
    if (!name.trim()) return setError('Bitte der Strecke einen Namen geben, z. B. „Gehweg Hauptstraße“.');
    if (how === 'drive') {
      const q = new URLSearchParams({ plan: '1', name: name.trim() });
      if (notes.trim()) q.set('notes', notes.trim());
      return navigate(`${base}/strecken/frei?${q.toString()}`);
    }
    if (picked.length < 2) return setError('Bitte mindestens zwei Objekte in der Reihenfolge antippen, in der die Strecke gefahren wird.');
    setBusy(true);
    try {
      await be.saveRoute({ id, org_id: orgId, name: name.trim(), notes: notes.trim() || null, path, source: 'objects', property_ids: picked, active: true });
      onSaved(id);
    } catch (e) {
      setError(
        isNetworkError(e)
          ? 'Zum Speichern einer Strecke braucht es kurz Internet. Bitte bei Empfang erneut versuchen.'
          : `Nicht gespeichert: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Neue Strecke" onClose={onClose}>
      <div className="ez">
        <label className="field">
          Name der Strecke *
          <input value={name} maxLength={120} placeholder="z. B. Gehweg Hauptstraße" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Hinweis (optional)
          <input value={notes} maxLength={300} placeholder="z. B. beidseitig, inkl. Bushaltestelle" onChange={(e) => setNotes(e.target.value)} />
        </label>
        <h2 className="ez-section" style={{ marginTop: 6 }}>Wie soll die Strecke angelegt werden?</h2>
        <div className="ez-chips" role="group" aria-label="Art">
          <button type="button" className={`ez-chip${how === 'drive' ? ' on' : ''}`} aria-pressed={how === 'drive'} onClick={() => setHow('drive')}>
            Einmal abfahren (empfohlen)
          </button>
          <button type="button" className={`ez-chip${how === 'objects' ? ' on' : ''}`} aria-pressed={how === 'objects'} onClick={() => setHow('objects')}>
            Aus Objekten verbinden
          </button>
        </div>
        {how === 'drive' ? (
          <p className="muted small">Du fährst die Strecke einmal ab — sie wird dabei genau aufgezeichnet. Tipp: Erst losfahren, wenn du am Anfang der Strecke stehst.</p>
        ) : (
          <>
            <p className="muted small">Objekte in Fahrreihenfolge antippen. Die Linie verbindet sie zunächst gerade.</p>
            {props === null ? (
              <span className="spinner" />
            ) : props.length < 2 ? (
              <div className="info-box">Dafür braucht es mindestens zwei Objekte mit Standort. Lege Objekte an oder wähle „Einmal abfahren“.</div>
            ) : (
              <div className="ez-chips">
                {props.map((p) => {
                  const n = picked.indexOf(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`ez-chip${n >= 0 ? ' on' : ''}`}
                      aria-pressed={n >= 0}
                      onClick={() => setPicked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                    >
                      {n >= 0 ? `${n + 1}. ` : ''}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
            {picked.length >= 2 && (
              <p className="muted small">
                {picked.length} Objekte · ca. {fmtDistance(pathLengthM(path))} Luftlinie
              </p>
            )}
          </>
        )}
        {error && <div className="error-box">{error}</div>}
        <div className="ez-actions">
          <button type="button" className="btn ez-big" onClick={() => void go()} disabled={busy}>
            {how === 'drive' ? 'Weiter zur Aufzeichnung' : busy ? 'Speichern …' : 'Strecke speichern'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
