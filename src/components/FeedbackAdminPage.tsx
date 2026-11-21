import { useState } from 'react';
import { Bug, Check, CheckCheck, Gift, Lightbulb, RotateCcw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppAuth } from '../auth/AppAuthContext';
import { LoadGuard, useAsync } from './ui';
import { fmtDate } from '../lib/format';

/**
 * Rückmeldungen aus der App („Fehler melden“ / „Verbesserung vorschlagen“) — nur für Dexware selbst.
 * Server: <App>/supabase/NACHTRAG-FEEDBACK-2026-11-20.sql. Sichtbar ist die Seite nur für Konten aus
 * public.app_admin (RPC feedback_admin); jeder Aufruf wird am Server noch einmal geprüft.
 * „Danke“ schenkt dem Betrieb 3 Tage Pro (hängt an einen laufenden Bonus hinten an), je Meldung einmal.
 */
export const FEEDBACK_REWARD_DAYS = 3;

export interface FeedbackRow {
  id: string;
  created_at: string;
  kind: 'fehler' | 'idee';
  body: string;
  app_version: string | null;
  platform: string | null;
  device: string | null;
  email: string | null;
  org_id: string | null;
  org_name: string | null;
  org_bonus_until: string | null;
  org_last_reward: string | null;
  done_at: string | null;
  thanked_at: string | null;
  reward_days: number | null;
  reward_until: string | null;
  reply: string | null;
  /** „Umgesetzt“ an den Einsender zurückgemeldet (er sieht es in der App, ggf. mit Mitteilung aufs Handy). */
  resolved_at?: string | null;
  resolved_note?: string | null;
}

/** Darf dieses Konto die Rückmeldungen lesen? Fehlt die Funktion am Server (noch), ist die Antwort nein. */
export async function fetchFeedbackAdmin(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.rpc('feedback_admin');
  return !error && data === true;
}

async function fetchFeedback(sb: SupabaseClient): Promise<FeedbackRow[]> {
  const { data, error } = await sb.rpc('feedback_list', { p_limit: 500 });
  if (error) throw new Error(`Rückmeldungen konnten nicht geladen werden: ${error.message}`);
  return (data ?? []) as FeedbackRow[];
}

type Filter = 'offen' | 'umsetzen' | 'alle';

export function FeedbackAdminPage() {
  const { client } = useAppAuth();
  const state = useAsync<FeedbackRow[]>(() => fetchFeedback(client), [client]);
  const [filter, setFilter] = useState<Filter>('offen');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const act = async (id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const { error: e } = await fn();
      if (e) setError(e.message);
      else state.refresh();
    } catch (e) {
      // ohne Netz passierte beim Klick sonst einfach nichts
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const thank = (r: FeedbackRow, days: number) =>
    act(r.id, () => client.rpc('feedback_thank', { p_id: r.id, p_days: days, p_reply: replies[r.id]?.trim() || null }));
  const resolve = (r: FeedbackRow) =>
    act(r.id, () => client.rpc('feedback_resolve', { p_id: r.id, p_note: replies[r.id]?.trim() || null }));
  const done = (r: FeedbackRow, value: boolean) => act(r.id, () => client.rpc('feedback_done', { p_id: r.id, p_done: value }));

  return (
    <div>
      <div className="section-head">
        <h1>Rückmeldungen</h1>
        <div className="row">
          <button className={`btn small ${filter === 'offen' ? '' : 'ghost'}`} onClick={() => setFilter('offen')}>
            Offen
          </button>
          <button className={`btn small ${filter === 'umsetzen' ? '' : 'ghost'}`} onClick={() => setFilter('umsetzen')} title="Bedankt oder gelesen, aber noch nicht als umgesetzt zurückgemeldet">
            Noch umzusetzen
          </button>
          <button className={`btn small ${filter === 'alle' ? '' : 'ghost'}`} onClick={() => setFilter('alle')}>
            Alle
          </button>
        </div>
      </div>
      <p className="muted">
        Meldungen aus der App und dem Außendienst. „Danke“ schenkt dem Betrieb {FEEDBACK_REWARD_DAYS} Tage Pro und zeigt dem
        Nutzer den Dank in der App — je Meldung einmal, nicht rückholbar. „Umgesetzt“ sagt dem Einsender später, dass sein
        Hinweis in der App steckt.
      </p>
      {error && <div className="error-box">{error}</div>}
      <LoadGuard state={state}>
        {(rows) => {
          const open = rows.filter((r) => !r.done_at && !r.thanked_at);
          const todo = rows.filter((r) => (r.done_at || r.thanked_at) && !r.resolved_at);
          const shown = filter === 'offen' ? open : filter === 'umsetzen' ? todo : rows;
          if (!shown.length) {
            return (
              <div className="empty">
                {filter === 'offen' ? 'Keine offenen Rückmeldungen.' : filter === 'umsetzen' ? 'Nichts mehr umzusetzen.' : 'Noch keine Rückmeldungen.'}
              </div>
            );
          }
          return (
            <div className="feedback-list">
              {shown.map((r) => {
                const Icon = r.kind === 'fehler' ? Bug : Lightbulb;
                const closed = !!r.done_at || !!r.thanked_at;
                return (
                  <div className="card feedback-item" key={r.id}>
                    <div className="feedback-head">
                      <span className={`badge ${r.kind === 'fehler' ? 'red' : 'amber'}`}>
                        <Icon className="i" aria-hidden /> {r.kind === 'fehler' ? 'Fehler' : 'Verbesserung'}
                      </span>
                      <b>{r.org_name ?? 'ohne Betrieb'}</b>
                      <span className="muted small">{r.email ?? 'Konto gelöscht'}</span>
                      <span className="muted small">{fmtDate(r.created_at)}</span>
                      {r.thanked_at ? (
                        <span className="badge green">
                          <Check className="i" aria-hidden />{' '}
                          {r.reward_days ? `Danke · ${r.reward_days} Tage Pro bis ${fmtDate(r.reward_until)}` : 'Danke (ohne Tage)'}
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
                      {r.org_last_reward && !r.thanked_at ? ` · Betrieb zuletzt belohnt am ${fmtDate(r.org_last_reward)}` : ''}
                      {r.org_bonus_until && !r.thanked_at ? ` · Bonus läuft bis ${fmtDate(r.org_bonus_until)}` : ''}
                    </div>
                    {r.reply && <div className="muted small">Antwort: {r.reply}</div>}
                    {r.thanked_at && !r.resolved_at && (
                      <div className="feedback-actions">
                        <input
                          placeholder="Hinweis für den Einsender, z. B. „ab Version 0.7.8“ (freiwillig)"
                          maxLength={120}
                          value={replies[r.id] ?? ''}
                          onChange={(e) => setReplies((v) => ({ ...v, [r.id]: e.target.value }))}
                        />
                        <button className="btn small" disabled={busy === r.id} onClick={() => resolve(r)}>
                          <CheckCheck className="i" aria-hidden /> Umgesetzt – Einsender informieren
                        </button>
                      </div>
                    )}
                    {!r.thanked_at && (
                      <div className="feedback-actions">
                        <input
                          
                          placeholder="Kurze Antwort an den Nutzer (freiwillig)"
                          maxLength={300}
                          value={replies[r.id] ?? ''}
                          onChange={(e) => setReplies((v) => ({ ...v, [r.id]: e.target.value }))}
                        />
                        <button className="btn small" disabled={busy === r.id} onClick={() => thank(r, FEEDBACK_REWARD_DAYS)}>
                          <Gift className="i" aria-hidden /> Danke – {FEEDBACK_REWARD_DAYS} Tage Pro
                        </button>
                        <button className="btn ghost small" disabled={busy === r.id} onClick={() => thank(r, 0)}>
                          Nur Danke
                        </button>
                        {closed ? (
                          <button className="btn ghost small" disabled={busy === r.id} onClick={() => done(r, false)}>
                            <RotateCcw className="i" aria-hidden /> Wieder offen
                          </button>
                        ) : (
                          <button className="btn ghost small" disabled={busy === r.id} onClick={() => done(r, true)}>
                            Gelesen
                          </button>
                        )}
                        {!r.resolved_at && (
                          <button className="btn ghost small" disabled={busy === r.id} onClick={() => resolve(r)} title="Ohne Dank direkt als umgesetzt zurückmelden">
                            <CheckCheck className="i" aria-hidden /> Umgesetzt
                          </button>
                        )}
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
