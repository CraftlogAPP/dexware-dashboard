import { useState } from 'react';
import { Bug, Check, CheckCheck, Lightbulb, RotateCcw } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import { LoadGuard, useAsync } from './ui';
import { fmtDate } from '../lib/format';
import { SUITE_ANON, SUITE_URL } from '../lib/abo';

/**
 * Rückmeldungen aus den Apps OHNE eigenen Rückmeldungs-Nachtrag (KfzDex, SchutzDex, CraftDex, DokuDex, TourDex,
 * BaumDex, HausDex, AngebotDex, Mietzeuge, ObjektDex, Laufzettel, Wechselzeit). Sie landen gesammelt auf dem
 * Suite-Server (Funktion `app-feedback`, dexware-suite/supabase/migrations/0005_app_feedback.sql).
 * Gezeigt wird der Block im WinterDex-Bereich unter „Rückmeldungen“; die Funktion prüft die WinterDex-Anmeldung
 * und lässt nur Konten aus app_feedback_admin durch. Geschenkte Pro-Tage gibt es hier nicht (nur Danke/Umgesetzt).
 */
interface Row {
  id: string;
  app: string;
  created_at: string;
  kind: 'fehler' | 'idee';
  body: string;
  email: string | null;
  app_version: string | null;
  platform: string | null;
  device: string | null;
  done_at: string | null;
  thanked_at: string | null;
  reply: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
}
const NAMEN: Record<string, string> = {
  kfzdex: 'KfzDex', schutzdex: 'SchutzDex', craftdex: 'CraftDex', dokudex: 'DokuDex', tourdex: 'TourDex', baumdex: 'BaumDex',
  hausdex: 'HausDex', installateurdex: 'AngebotDex', mietzeuge: 'Mietzeuge', objektdex: 'ObjektDex', laufzettel: 'Laufzettel', wechselzeit: 'Wechselzeit',
};
type Filter = 'offen' | 'umsetzen' | 'alle';
/** Funktion noch nicht ausgerollt oder Konto nicht freigeschaltet → Block bleibt unsichtbar. */
class NichtDa extends Error {}

export function FeedbackZentral() {
  const { app, client } = useAppAuth();
  const [filter, setFilter] = useState<Filter>('offen');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texte, setTexte] = useState<Record<string, string>>({});

  const ruf = async (action: string, mehr: Record<string, unknown> = {}) => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new NichtDa();
    const res = await fetch(`${SUITE_URL}/app-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${SUITE_ANON}`, apikey: SUITE_ANON },
      body: JSON.stringify({ action, app: app.id, token, ...mehr }),
    });
    if (res.status === 404 || res.status === 403 || res.status === 401) throw new NichtDa();
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Rückmeldungen der übrigen Apps: ${j?.error ?? res.status}`);
    return j;
  };
  const state = useAsync<Row[] | null>(async () => {
    try {
      return ((await ruf('list')).rows ?? []) as Row[];
    } catch (e) {
      if (e instanceof NichtDa) return null;
      throw e;
    }
  }, [client, app.id]);

  const act = async (id: string, action: string, mehr: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      await ruf(action, { id, ...mehr });
      state.refresh();
    } catch (e) {
      setError(e instanceof NichtDa ? 'Sitzung abgelaufen — bitte neu anmelden.' : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (state.data === null) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <div className="section-head">
        <h2>Übrige Apps</h2>
        <div className="row">
          {(['offen', 'umsetzen', 'alle'] as Filter[]).map((f) => (
            <button key={f} className={`btn small ${filter === f ? '' : 'ghost'}`} onClick={() => setFilter(f)}>
              {f === 'offen' ? 'Offen' : f === 'umsetzen' ? 'Noch umzusetzen' : 'Alle'}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Meldungen aus den Apps ohne eigene Rückmeldungs-Seite, gesammelt an einer Stelle. Hier gibt es keine geschenkten
        Pro-Tage: „Danke“ und „Umgesetzt“ sieht der Einsender in der App unter „Deine Meldungen“.
      </p>
      {error && <div className="error-box">{error}</div>}
      <LoadGuard state={state}>
        {(alle) => {
          const rows = alle ?? [];
          const shown =
            filter === 'offen' ? rows.filter((r) => !r.done_at && !r.thanked_at) : filter === 'umsetzen' ? rows.filter((r) => (r.done_at || r.thanked_at) && !r.resolved_at) : rows;
          if (!shown.length) {
            return <div className="empty">{filter === 'offen' ? 'Keine offenen Rückmeldungen.' : filter === 'umsetzen' ? 'Nichts mehr umzusetzen.' : 'Noch keine Rückmeldungen.'}</div>;
          }
          return (
            <div className="feedback-list">
              {shown.map((r) => {
                const Icon = r.kind === 'fehler' ? Bug : Lightbulb;
                return (
                  <div className="card feedback-item" key={r.id}>
                    <div className="feedback-head">
                      <span className={`badge ${r.kind === 'fehler' ? 'red' : 'amber'}`}>
                        <Icon className="i" aria-hidden /> {r.kind === 'fehler' ? 'Fehler' : 'Verbesserung'}
                      </span>
                      <b>{NAMEN[r.app] ?? r.app}</b>
                      <span className="muted small">{r.email ?? 'ohne E-Mail'}</span>
                      <span className="muted small">{fmtDate(r.created_at)}</span>
                      {r.thanked_at ? (
                        <span className="badge green">
                          <Check className="i" aria-hidden /> Danke
                        </span>
                      ) : r.done_at ? (
                        <span className="badge">gelesen</span>
                      ) : null}
                      {r.resolved_at && (
                        <span className="badge green">
                          <CheckCheck className="i" aria-hidden /> Umgesetzt gemeldet{r.resolved_note ? ` · ${r.resolved_note}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="feedback-body">{r.body}</p>
                    <div className="muted small">
                      {[r.app_version && `Version ${r.app_version}`, r.platform, r.device].filter(Boolean).join(' · ') || 'ohne Geräteangabe'}
                    </div>
                    {r.reply && <div className="muted small">Antwort: {r.reply}</div>}
                    {!r.resolved_at && (
                      <div className="feedback-actions">
                        <input
                          placeholder={r.thanked_at ? 'Hinweis für den Einsender, z. B. „ab Version 1.4“ (freiwillig)' : 'Kurze Antwort an den Nutzer (freiwillig)'}
                          maxLength={r.thanked_at ? 120 : 300}
                          value={texte[r.id] ?? ''}
                          onChange={(e) => setTexte((v) => ({ ...v, [r.id]: e.target.value }))}
                        />
                        {!r.thanked_at && (
                          <button className="btn small" disabled={busy === r.id} onClick={() => act(r.id, 'thank', { reply: texte[r.id]?.trim() || null })}>
                            <Check className="i" aria-hidden /> Danke
                          </button>
                        )}
                        {!r.thanked_at &&
                          (r.done_at ? (
                            <button className="btn ghost small" disabled={busy === r.id} onClick={() => act(r.id, 'done', { done: false })}>
                              <RotateCcw className="i" aria-hidden /> Wieder offen
                            </button>
                          ) : (
                            <button className="btn ghost small" disabled={busy === r.id} onClick={() => act(r.id, 'done', { done: true })}>
                              Gelesen
                            </button>
                          ))}
                        <button
                          className={`btn small ${r.thanked_at ? '' : 'ghost'}`}
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'resolve', { note: r.thanked_at ? texte[r.id]?.trim() || null : null })}
                        >
                          <CheckCheck className="i" aria-hidden /> Umgesetzt – Einsender informieren
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }}
      </LoadGuard>
    </div>
  );
}
