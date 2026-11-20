import { useEffect, useState } from 'react';
import { Bug, Check, Lightbulb } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppAuth } from '../auth/AppAuthContext';
import { useAsync } from './ui';
import { fmtDate } from '../lib/format';

/**
 * „Fehler melden“ / „Verbesserung vorschlagen“ im Browser — dasselbe wie in der App (Einstellungen → Support).
 * Server: <App>/supabase/NACHTRAG-FEEDBACK-2026-11-20.sql (send_feedback, my_feedback). Fehlt die Funktion am Server
 * (App noch nicht umgestellt), bleibt nur der Weg per E-Mail.
 */
type Kind = 'fehler' | 'idee';
const MIN = 10;
const MAX = 4000;
const SUPPORT = 'support@dexware.app';

interface Mine {
  id: string;
  kind: Kind;
  body: string;
  created_at: string;
  thanked_at: string | null;
  reward_days: number | null;
  reward_until: string | null;
  reply: string | null;
}

const missing = (e: { code?: string; message: string }) => /PGRST202|42883|could not find the function|does not exist/i.test(`${e.code ?? ''} ${e.message}`);

/** Kennt der Server dieser App die Rückmeldungen schon? Sonst bleibt der Menüpunkt verborgen (nur E-Mail wäre irreführend). */
export async function fetchFeedbackAvailable(sb: SupabaseClient): Promise<boolean> {
  const { error } = await sb.rpc('my_feedback');
  return !error || !missing(error);
}

async function fetchMine(sb: SupabaseClient): Promise<Mine[] | 'fehlt'> {
  const { data, error } = await sb.rpc('my_feedback');
  if (error) {
    if (missing(error)) return 'fehlt';
    throw new Error(error.message);
  }
  return (data ?? []) as Mine[];
}

function errorText(message: string): string {
  if (/feedback limit/i.test(message)) return 'Du hast heute schon mehrere Meldungen geschickt — danke! Morgen geht es weiter, oder schreib uns per E-Mail.';
  if (/feedback too short/i.test(message)) return `Bitte beschreib es in ein, zwei Sätzen (mindestens ${MIN} Zeichen).`;
  if (/feedback too long/i.test(message)) return `Der Text ist zu lang (höchstens ${MAX} Zeichen).`;
  return 'Die Meldung konnte gerade nicht gesendet werden (kein Netz?). Dein Text bleibt stehen — bitte gleich noch einmal senden.';
}

export function FeedbackForm() {
  const { app, client, session } = useAppAuth();
  const draftKey = `dex-feedback-${app.id}-${session?.user.id ?? ''}`;
  const [kind, setKind] = useState<Kind>('fehler');
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = useAsync<Mine[] | 'fehlt'>(() => fetchMine(client), [client]);
  const mailOnly = mine.data === 'fehlt';

  // Entwurf auf diesem Gerät merken (Seite verlassen, Handy gesperrt)
  useEffect(() => {
    try {
      if (text.trim()) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    } catch {
      /* Entwurf ist nur Komfort */
    }
  }, [text, draftKey]);

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN;
  const mailto = `mailto:${SUPPORT}?subject=${encodeURIComponent(`${app.name}: ${kind === 'fehler' ? 'Fehler melden' : 'Verbesserungsvorschlag'}`)}${trimmed ? `&body=${encodeURIComponent(trimmed)}` : ''}`;

  const submit = async () => {
    if (busy || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await client.rpc('send_feedback', {
        p_kind: kind,
        p_text: trimmed,
        p_meta: { version: 'Browser', platform: 'web', device: navigator.userAgent.slice(0, 120) },
      });
      if (e) {
        setError(missing(e) ? `Bitte schreib uns per E-Mail an ${SUPPORT}.` : errorText(e.message));
        return;
      }
      setSent(true);
      setText('');
      mine.refresh();
    } catch {
      setError(errorText(''));
    } finally {
      setBusy(false);
    }
  };

  const list = Array.isArray(mine.data) ? mine.data : [];

  return (
    <div className="feedback-form">
      <h1>Rückmeldung</h1>
      <p className="muted">
        Wir lesen jede Meldung selbst. Für hilfreiche Hinweise bedanken wir uns mit 3 Tagen Pro für deinen Betrieb.
      </p>

      {sent ? (
        <div className="card feedback-done">
          <Check className="i" aria-hidden />
          <b>Danke — ist angekommen!</b>
          <p className="muted">Ob wir uns mit Pro-Tagen bedanken, siehst du unten bei „Deine Meldungen“.</p>
          <button className="btn ghost small" onClick={() => setSent(false)}>
            Noch etwas melden
          </button>
        </div>
      ) : (
        <>
          <div className="feedback-kinds" role="group" aria-label="Art der Meldung">
            <button type="button" className={`feedback-kind fehler ${kind === 'fehler' ? 'active' : ''}`} aria-pressed={kind === 'fehler'} onClick={() => setKind('fehler')}>
              <Bug className="i" aria-hidden />
              <b>Fehler melden</b>
              <small>Etwas geht nicht oder sieht falsch aus</small>
            </button>
            <button type="button" className={`feedback-kind idee ${kind === 'idee' ? 'active' : ''}`} aria-pressed={kind === 'idee'} onClick={() => setKind('idee')}>
              <Lightbulb className="i" aria-hidden />
              <b>Verbesserung vorschlagen</b>
              <small>Was fehlt dir, was wäre praktischer?</small>
            </button>
          </div>
          {mailOnly ? (
            <a className="btn" href={mailto}>
              E-Mail schreiben
            </a>
          ) : (
            <>
              <textarea
                rows={7}
                maxLength={MAX}
                value={text}
                disabled={busy}
                aria-label={kind === 'fehler' ? 'Fehler beschreiben' : 'Verbesserung beschreiben'}
                placeholder={
                  kind === 'fehler'
                    ? 'Was ist passiert — und was hast du davor gemacht?'
                    : 'Was würde dir die Arbeit erleichtern?'
                }
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
              />
              <div className="muted small feedback-count">
                {tooShort && trimmed.length > 0 ? `Noch ${MIN - trimmed.length} Zeichen · ` : ''}
                {trimmed.length}/{MAX}
              </div>
              {error && <div className="error-box">{error}</div>}
              <button className="btn" style={{ width: '100%' }} disabled={busy || tooShort} onClick={() => void submit()}>
                {busy ? 'Wird gesendet …' : 'Senden'}
              </button>
              <p className="muted small">
                Mitgesendet wird nur der Browsertyp. Lieber per E-Mail? <a href={mailto}>{SUPPORT}</a>
              </p>
            </>
          )}
        </>
      )}

      {list.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Deine Meldungen</h2>
          <div className="feedback-list">
            {list.map((m) => (
              <div className="card feedback-item" key={m.id}>
                <div className="feedback-head">
                  <span className={`badge ${m.kind === 'fehler' ? 'red' : 'amber'}`}>{m.kind === 'fehler' ? 'Fehler' : 'Verbesserung'}</span>
                  <span className="muted small">{fmtDate(m.created_at)}</span>
                  <span className={`badge ${m.thanked_at ? 'green' : ''}`}>
                    {m.thanked_at ? (m.reward_days ? `Danke · ${m.reward_days} Tage Pro` : 'Danke!') : 'Gesendet'}
                  </span>
                </div>
                <p className="feedback-body">{m.body}</p>
                {m.thanked_at && m.reward_days && m.reward_until ? (
                  <div className="small">Pro für deinen Betrieb läuft dadurch bis {fmtDate(m.reward_until)}.</div>
                ) : null}
                {m.reply && <div className="muted small">Dexware: {m.reply}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
