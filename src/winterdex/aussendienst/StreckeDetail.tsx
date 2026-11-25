// Eine gespeicherte Strecke im Außendienst — wie RouteDetailScreen/RouteFormScreen der App:
// Karte, „Strecke fahren“, letzte Fahrten; Inhaber: umbenennen, Linie neu aufnehmen, pausieren/aktivieren.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Play } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import { FahrtAnsicht } from '../FahrtAnsicht';
import { useStrassenNachladen } from '../strassenNachladen';
import { fmtDistance, fmtPct, type Route } from '../routes';
import { ACTION_LABELS } from '../types';
import { isToday } from '../einsatz/amount';
import { isNetworkError } from '../einsatz/backend';
import { useEinsatz } from '../einsatz/context';
import { fmtDur } from './geo';
import { FREE_ROUTES, FREE_ROUTES_TEXT } from './Strecken';
import { ProUnklarError, istGratisGrenze } from '../pro';
import { useOrgOptional } from '../../components/OrgContext';
import { nachweisZone } from '../nachweisZeit';

export function StreckeDetail() {
  const { id = '' } = useParams();
  const { be, base, owner } = useEinsatz();
  // Uhrzeiten der letzten Fahrt in der Zone des Betriebs (wie Nachweis/PDF), nie in der des Geräts
  const tz = nachweisZone(useOrgOptional()?.data?.org.land);
  const navigate = useNavigate();
  const list = `${base}/strecken`;
  const state = useAsync(async () => {
    const [route, runs] = await Promise.all([be.getRoute(id), be.listRouteRuns(id, 20)]);
    return { route, runs };
  }, [be, id]);
  // Letzte gültige Fahrt mit Spur, Uhrzeiten und Straßenverlauf über der Vorlage (wie Dashboard-Strecke/Fahrt-Detail).
  // Scheitert das Laden (kein Netz), bleibt einfach die Vorlage stehen.
  const lastId = state.data?.runs.find((r) => !r.canceled)?.id ?? null;
  const lastState = useAsync(async () => {
    if (!lastId || !be.getRun) return null;
    const [run, strassen] = await Promise.all([be.getRun(lastId).catch(() => null), be.getStrassen ? be.getStrassen(lastId).catch(() => null) : null]);
    return run ? { run, strassen } : null;
  }, [be, lastId]);
  const last = lastState.data ?? null;
  // Straßenverlauf „wird ermittelt“ → alle 20 s selbst nachfragen (höchstens 10 min), ohne Neuladen
  const lastStr = useStrassenNachladen(last?.run.id, last?.strassen, be.getStrassen ? (rid) => be.getStrassen!(rid) : null, last?.run);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | 'reline' | 'gate'>(null);

  const save = async (route: Route, patch: Partial<Pick<Route, 'name' | 'notes' | 'active'>>) => {
    setBusy(true);
    setError(null);
    try {
      const next = { ...route, ...patch };
      // voller Upsert mit allen 8 Feldern — wie die App
      await be.saveRoute({
        id: route.id,
        org_id: route.org_id,
        name: next.name.trim(),
        notes: next.notes?.trim() || null,
        path: route.path ?? [],
        source: route.source,
        property_ids: route.property_ids ?? [],
        active: next.active,
      });
      setEditing(false);
      state.reload();
    } catch (e) {
      // Server-Grenze (NACHTRAG-GRATIS-GRENZE-2026-11-25): wie die eigene Prüfung → Hinweis mit Pro-Weg
      if (istGratisGrenze(e)) return setAsk('gate');
      const m = String((e as { message?: string })?.message ?? e);
      setError(
        isNetworkError(e)
          ? 'Zum Speichern einer Strecke braucht es kurz Internet. Bitte bei Empfang erneut versuchen.'
          : /row-level security|permission denied/i.test(m)
            ? 'Strecken ändern kann nur der Inhaber des Betriebs.'
            : `Nicht gespeichert: ${m}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (route: Route) => {
    if (!route.active) {
      // Wieder aktivieren zählt gegen die Gratis-Grenze (wie in der App). Erst zählen, Pro nur fragen, wenn die Grenze
      // sonst überschritten würde — sonst brach eine Störung des Abo-Dienstes das Aktivieren ohne Grund ab (Tagescheck
      // 26.11.2026, Fund 36; wie Strecken.tsx/Properties.tsx und der Server-Auslöser).
      try {
        const routes = await be.listRoutes();
        if (routes.filter((r) => r.active && r.id !== route.id).length >= FREE_ROUTES && !(await be.isPro())) return setAsk('gate');
      } catch (e) {
        // ohne diese Meldung passierte beim Tippen ohne Netz einfach nichts
        return setError(
          isNetworkError(e)
            ? 'Zum Ändern einer Strecke braucht es kurz Internet. Bitte bei Empfang erneut versuchen.'
            : e instanceof ProUnklarError
              ? e.message
              : `Nicht gespeichert: ${String((e as Error)?.message ?? e)}`,
        );
      }
    }
    await save(route, { active: !route.active });
  };

  return (
    <div className="ez">
      <Link to={list} className="ez-back">
        <ArrowLeft className="i" aria-hidden /> Strecken
      </Link>
      <LoadGuard state={state}>
        {({ route, runs }) => {
          if (!route) return <div className="error-box">Diese Strecke gibt es nicht (mehr) in deinem Betrieb.</div>;
          const valid = runs.filter((r) => !r.canceled);
          const today = valid.find((r) => isToday(r.started_at));
          return (
            <>
              <h1>{route.name}</h1>
              <p className="muted" style={{ marginTop: -6 }}>
                {fmtDistance(route.length_m)}
                {route.source === 'objects' ? ' · aus Objekten (Luftlinie)' : ''}
                {!route.active ? ' · pausiert' : ''}{' '}
                {route.active &&
                  (today ? (
                    <span className="badge green">
                      <Check className="i" aria-hidden /> Heute gefahren
                    </span>
                  ) : (
                    <span className="badge">Heute offen</span>
                  ))}
              </p>
              {route.notes && <p>{route.notes}</p>}

              {/* echte Karte der Vorlage + letzte Fahrt mit Uhrzeiten und Straßenverlauf (Skizze als Rückfall ohne Netz) */}
              <FahrtAnsicht
                key={last?.run.id ?? 'vorlage'}
                plan={route.path}
                track={last?.run.track}
                missed={last?.run.missed}
                gaps={last?.run.gaps}
                startedAt={last?.run.started_at}
                endedAt={last?.run.ended_at}
                zeit={!!last}
                strassen={lastStr}
                canceled={last?.run.canceled}
                timeZone={tz}
                gefahrenM={last?.run.track_length_m}
                label={`Karte der Strecke ${route.name}${last ? ` mit der letzten Fahrt vom ${fmtDateTime(last.run.started_at, tz)}` : ''}`}
              />
              {last && (
                <p className="small muted" style={{ marginTop: -8 }}>
                  Grün: letzte Fahrt vom {fmtDateTime(last.run.started_at, tz)}
                  {last.run.performer_name ? ` (${last.run.performer_name})` : ''} —{' '}
                  <Link to={`${base}/strecken/fahrten/${last.run.id}`}>Nachweis mit PDF öffnen</Link>
                </p>
              )}

              {route.active && (
                <Link to={`${list}/${route.id}/fahren`} className="btn ez-save">
                  <Play className="i" aria-hidden /> Strecke fahren
                </Link>
              )}

              {error && <div className="error-box">{error}</div>}
              {owner && (
                <div className="ez-actions" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn ghost ez-big"
                    onClick={() => {
                      setName(route.name);
                      setNotes(route.notes ?? '');
                      setEditing(true);
                    }}
                  >
                    Name / Hinweis ändern
                  </button>
                  <button type="button" className="btn ghost ez-big" onClick={() => setAsk('reline')}>
                    Linie neu aufnehmen (abfahren)
                  </button>
                  <button type="button" className="btn ghost ez-big" disabled={busy} onClick={() => void toggleActive(route)}>
                    {route.active ? 'Strecke pausieren (z. B. Saisonende)' : 'Strecke wieder aktivieren'}
                  </button>
                  <p className="muted small" style={{ margin: 0 }}>
                    Pausierte Strecken stehen in der Liste unten unter „Pausierte Strecken“; ihre Fahrten und Nachweise
                    bleiben erhalten.
                  </p>
                </div>
              )}

              <h2 className="ez-section">Fahrten ({runs.length}{runs.length === 20 ? '+' : ''})</h2>
              {runs.length === 0 ? (
                <div className="card empty">Noch keine Fahrten auf dieser Strecke.</div>
              ) : (
                <ul className="ez-list">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <Link to={`${base}/strecken/fahrten/${r.id}`} className="sr-route">
                        <span className="ez-prop-text">
                          <b>{fmtDateTime(r.started_at, tz)}</b>
                          <span className="muted">
                            {fmtDistance(r.track_length_m)} · {fmtDur(Date.parse(r.ended_at) - Date.parse(r.started_at))}
                            {r.coverage_pct != null ? ` · ${fmtPct(r.coverage_pct)} abgedeckt` : ''}
                          </span>
                          <span className="muted">
                            {ACTION_LABELS[r.action]}
                            {r.performer_name ? ` · ${r.performer_name}` : ''}
                          </span>
                        </span>
                        <span className="ez-prop-side">
                          {r.canceled ? <span className="badge red">Storniert</span> : r.entry_hash ? <span className="badge green">Nachweis</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small">Antippen öffnet den Nachweis mit Karte und PDF.</p>

              {editing && (
                <Modal title="Strecke bearbeiten" onClose={() => setEditing(false)}>
                  <div className="ez">
                    <label className="field">
                      Name der Strecke *
                      <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <label className="field">
                      Hinweis (optional)
                      <input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
                    </label>
                    {error && <div className="error-box">{error}</div>}
                    <div className="ez-actions">
                      <button
                        type="button"
                        className="btn ez-big"
                        disabled={busy}
                        onClick={() => (name.trim() ? void save(route, { name, notes }) : setError('Bitte der Strecke einen Namen geben, z. B. „Gehweg Hauptstraße“.'))}
                      >
                        {busy ? 'Speichern …' : 'Speichern'}
                      </button>
                    </div>
                  </div>
                </Modal>
              )}
              {ask === 'reline' && (
                <Modal title="Linie neu aufnehmen?" onClose={() => setAsk(null)} dirty={false}>
                  <p>
                    Du fährst die Strecke einmal ab, danach ersetzt die neue Linie die alte. Bisherige Nachweise bleiben
                    unverändert.
                  </p>
                  <div className="ez-actions">
                    <button type="button" className="btn ghost ez-big" onClick={() => setAsk(null)}>
                      Abbrechen
                    </button>
                    <button type="button" className="btn ez-big" onClick={() => navigate(`${list}/frei?plan=1&replace=${route.id}`)}>
                      Los geht's
                    </button>
                  </div>
                </Modal>
              )}
              {ask === 'gate' && (
                <Modal title="Mehr Strecken mit Pro" onClose={() => setAsk(null)} dirty={false}>
                  <p>{FREE_ROUTES_TEXT}</p>
                  <div className="ez-actions">
                    <button type="button" className="btn ez-big" onClick={() => setAsk(null)}>
                      Verstanden
                    </button>
                  </div>
                </Modal>
              )}
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}
