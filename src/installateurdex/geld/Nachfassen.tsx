// Angebote nachfassen (Rechnungen & Angebote → „Nachfassen“) — wie App screens/QuoteFollowUpScreen.tsx: Gewinnquote der
// letzten 90 Tage, fällige Angebote mit Alter/Betrag/Gültigkeit und Aktionen. Logik + Texte: ./nachfassLogik.ts (Kopie
// der App). Das Portal kann nicht teilen → „Nachfass-Text kopieren“. Merker (später erinnern, nachgefasst, angenommen)
// nur mit der Tabelle quote_follow_up; ohne sie zeigt die Seite an und bietet nur die Wege ohne Merker an.

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Clock3, Copy, MessageSquareText, X } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useInst } from '../context';
import type { Land } from './invoice';
import { addDaysYmd } from './invoice';
import { loadNachfassDaten, readFollowUpDays, writeFollowUpDays } from './nachfassDaten';
import {
  FOLLOW_UP_DAY_CHOICES,
  SNOOZE_DAYS,
  WIN_RATE_DAYS,
  followUpText,
  followUps,
  rejectReasonText,
  winRate,
  type FollowUpItem,
  type FollowUpMark,
  type FollowUpMarks,
} from './nachfassLogik';
import { deDay, errText, localDay } from './util';

export function Nachfassen() {
  const { ext, org, base, can } = useInst();
  // „Abgelehnt …“ (Storno) = Recht „Rechnungen & Angebote“ (Inhaber, Stellvertreter, Einzelrecht)
  const isOwner = can('rechnungen');
  const geld = ext.geld;
  const land: Land = org.land === 'DE' || org.land === 'CH' ? org.land : 'AT';
  const state = useAsync(async () => {
    const [d, profile] = await Promise.all([loadNachfassDaten(geld), geld.profile(org.id, land, org.name).catch(() => null)]);
    return { ...d, firm: profile?.legalName || org.name };
  }, [geld, org.id, land]);
  useLiveRefresh([state.refresh], 120000);

  return (
    <>
      <Link className="idx-back" to={`${base}/rechnungen`}>
        ← Rechnungen &amp; Angebote
      </Link>
      <div className="idx-head">
        <h1>Angebote nachfassen</h1>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Ausgestellte Angebote, auf die noch keine Antwort kam — wie in der App. Angenommen zählt, sobald eine Rechnung auf das Angebot verweist;
        „Abgelehnt“ storniert das Angebot mit Grund.
      </p>
      <LoadGuard state={state}>
        {(d) => <Liste all={d.all} initialMarks={d.marks} firm={d.firm} isOwner={isOwner} base={base} onChanged={state.refresh} />}
      </LoadGuard>
    </>
  );
}

function Liste({
  all,
  initialMarks,
  firm,
  isOwner,
  base,
  onChanged,
}: {
  all: Parameters<typeof followUps>[0];
  initialMarks: FollowUpMarks | null;
  firm: string;
  isOwner: boolean;
  base: string;
  onChanged: () => void;
}) {
  const { ext, org } = useInst();
  const navigate = useNavigate();
  const today = localDay();
  const [marks, setMarks] = useState<FollowUpMarks | null>(initialMarks);
  const [days, setDays] = useState(readFollowUpDays);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectText, setRejectText] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [showText, setShowText] = useState<string | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const canMark = marks !== null;
  const m = useMemo(() => marks ?? {}, [marks]);

  const fu = useMemo(() => followUps(all, m, today, days), [all, m, today, days]);
  const rate = useMemo(() => winRate(all, m, today), [all, m, today]);
  const dueSum = fu.due.reduce((s, x) => s + x.amount.cents, 0);

  async function mark(id: string, patch: Partial<FollowUpMark>) {
    if (!marks) return;
    const next = { ...(marks[id] ?? {}), ...patch };
    setBusy(id);
    setError(null);
    try {
      // gespeicherter Stand = mit dem Server zusammengeführt (z. B. „angenommen“ eines Kollegen bleibt)
      const saved = await ext.geld.setFollowUpMark(org.id, id, next);
      setMarks({ ...marks, [id]: saved });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  const textOf = (x: FollowUpItem) =>
    followUpText({
      customerName: x.quote.data.recipient?.name,
      number: x.quote.number,
      amountLabel: x.amount.label,
      ageDays: x.ageDays,
      validUntil: x.validUntil,
      expired: x.expired,
      firmName: firm,
      again: x.nudges > 0,
    });

  async function copy(x: FollowUpItem) {
    const text = textOf(x);
    try {
      // ohne Fokus/Berechtigung bleibt writeText manchmal einfach hängen → nach 1,5 s auf das Textfeld ausweichen
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), 1500)),
      ]);
      setCopied(x.quote.id);
      setShowText(null);
    } catch {
      // ohne Zugriff auf die Zwischenablage: Text zum Markieren zeigen
      setShowText(x.quote.id);
    }
  }

  async function accept(x: FollowUpItem, toInvoice: boolean) {
    if (canMark) await mark(x.quote.id, { acceptedAt: today });
    if (toInvoice) navigate(`${base}/rechnungen/neu?ausAngebot=${encodeURIComponent(x.quote.id)}`);
  }

  async function reject(x: FollowUpItem) {
    setBusy(x.quote.id);
    setError(null);
    try {
      // wie App: Angebot am Server storniert mit Grund „Abgelehnt: …“ — zählt so in der Gewinnquote, auch in der App
      await ext.geld.setStatus(x.quote.id, 'canceled', rejectReasonText(rejectText));
      setRejectFor(null);
      setRejectText('');
      onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  const row = (x: FollowUpItem, waiting = false) => {
    const q = x.quote;
    const rejecting = rejectFor === q.id;
    return (
      <div key={q.id} className={`card nf-card ${x.expired && !waiting ? 'expired' : ''}`}>
        <div className="nf-head">
          <div>
            <Link to={`${base}/rechnungen/${q.id}`} className="nf-name">
              {q.data.recipient?.name || 'Ohne Empfänger'}
            </Link>
            <span className="muted small nf-sub">
              {q.number ?? 'Angebot'} · vom {deDay(q.issuedAt)} · seit {x.ageDays === 1 ? '1 Tag' : `${x.ageDays} Tagen`}
            </span>
          </div>
          <b className="nf-amount">{x.amount.label}</b>
        </div>
        <p className={`nf-info ${x.expired ? 'warn' : ''}`}>
          {x.validUntil ? (x.expired ? `Gültigkeit abgelaufen am ${deDay(x.validUntil)}` : `gültig bis ${deDay(x.validUntil)}`) : ''}
          {x.lastNudge ? `${x.validUntil ? ' · ' : ''}${x.nudges === 1 ? 'einmal' : `${x.nudges}×`} nachgefasst, zuletzt ${deDay(x.lastNudge)}` : ''}
          {waiting ? `${x.validUntil || x.lastNudge ? ' · ' : ''}nachfassen ab ${deDay(x.nextDue)}` : ''}
        </p>
        {!waiting && (
          <>
            <div className="row nf-actions">
              <button type="button" className="btn small" onClick={() => void copy(x)}>
                <Copy className="i" aria-hidden /> {copied === q.id ? 'Kopiert ✓' : 'Nachfass-Text kopieren'}
              </button>
              <button type="button" className="btn ghost small nf-ok" onClick={() => void accept(x, true)} disabled={busy === q.id}>
                <Check className="i" aria-hidden /> Angenommen → Rechnung
              </button>
              {canMark && (
                <>
                  <button type="button" className="btn ghost small" onClick={() => void mark(q.id, { snoozeUntil: addDaysYmd(today, SNOOZE_DAYS) })} disabled={busy === q.id}>
                    <Clock3 className="i" aria-hidden /> +{SNOOZE_DAYS} Tage
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => void mark(q.id, { nudgedAt: today, nudges: x.nudges + 1 })}
                    disabled={busy === q.id}
                    title="Kunde wurde kontaktiert — wieder fällig in 7 Tagen"
                  >
                    <MessageSquareText className="i" aria-hidden /> nachgefasst
                  </button>
                </>
              )}
              {isOwner && (
                <button type="button" className={`btn ghost small nf-no ${rejecting ? 'on' : ''}`} onClick={() => { setRejectFor(rejecting ? null : q.id); setRejectText(''); }}>
                  <X className="i" aria-hidden /> Abgelehnt …
                </button>
              )}
            </div>
            {canMark && (
              <button type="button" className="nf-link" onClick={() => void accept(x, false)} disabled={busy === q.id}>
                Angenommen nur merken (Rechnung später)
              </button>
            )}
            {(showText === q.id || copied === q.id) && (
              <details className="nf-text" open={showText === q.id}>
                <summary>{showText === q.id ? 'Text zum Kopieren (markieren, dann Strg+C)' : 'Text ansehen'}</summary>
                <textarea readOnly rows={8} value={textOf(x)} onFocus={(e) => e.currentTarget.select()} />
              </details>
            )}
            {rejecting && (
              <div className="nf-reject">
                <label className="field">
                  Grund (optional)
                  <input value={rejectText} maxLength={250} placeholder="z. B. zu teuer, anderer Betrieb, verschoben" onChange={(e) => setRejectText(e.target.value)} />
                </label>
                <button type="button" className="btn small nf-danger" onClick={() => void reject(x)} disabled={busy === q.id}>
                  {busy === q.id ? 'Einen Moment …' : 'Als abgelehnt markieren'}
                </button>
                <p className="muted small">Das Angebot wird mit diesem Grund storniert und zählt in der Quote als abgelehnt.</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="nf">
      <div className="kpi-grid">
        <div className="kpi idx-kpi-accent">
          <div className="kpi-label">Gewinnquote · letzte {WIN_RATE_DAYS} Tage</div>
          <div className="kpi-value">{rate.rate == null ? '–' : `${rate.rate} %`}</div>
          <div className="kpi-sub">
            {rate.accepted} angenommen · {rate.rejected} abgelehnt · {rate.open} offen
            {rate.rate == null ? ' — die Quote erscheint, sobald ein Angebot angenommen oder abgelehnt ist' : ''}
          </div>
        </div>
        <div className="kpi idx-kpi-amber">
          <div className="kpi-label">Jetzt nachfassen</div>
          <div className="kpi-value">{fu.due.length}</div>
          <div className="kpi-sub">{fu.due.length ? `zusammen ${(dueSum / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} € (Firmen netto, Privat brutto)` : 'gerade nichts fällig'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Wartet noch</div>
          <div className="kpi-value">{fu.waiting.length}</div>
          <div className="kpi-sub">offen, aber noch nicht fällig</div>
        </div>
      </div>

      <div className="nf-days">
        <span className="muted small">Nachfassen nach</span>
        <div className="idx-tabs" role="group" aria-label="Nachfassen nach Tagen">
          {FOLLOW_UP_DAY_CHOICES.map((d) => (
            <button key={d} type="button" className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => { setDays(d); writeFollowUpDays(d); }}>
              {d} Tagen
            </button>
          ))}
        </div>
      </div>

      {!canMark && (
        <div className="info-box">
          „Später erinnern“, „nachgefasst“ und „angenommen merken“ gehen erst, wenn das Nachfassen in der Datenbank eingerichtet ist
          (NACHTRAG-ANGEBOTE-2026-11-07.sql) — dann gemeinsam mit App und Team. Bis dahin: Text kopieren, Rechnung anlegen, ablehnen.
        </div>
      )}
      {error && <div className="error-box">{error}</div>}

      <h3 className="nf-h">Jetzt nachfassen{fu.due.length ? ` · ${fu.due.length}` : ''}</h3>
      {fu.due.length === 0 ? (
        <div className="card empty">
          {fu.waiting.length ? '✓ Gerade ist kein Angebot fällig.' : 'Keine offenen Angebote. Ausgestellte Angebote erscheinen hier, wenn sie länger offen sind.'}
        </div>
      ) : (
        <div className="nf-list">{fu.due.map((x) => row(x))}</div>
      )}

      {fu.waiting.length > 0 && (
        <>
          <button type="button" className="nf-more" aria-expanded={showWaiting} onClick={() => setShowWaiting((v) => !v)}>
            {showWaiting ? '▾' : '▸'} Noch nicht fällig ({fu.waiting.length})
          </button>
          {showWaiting && <div className="nf-list">{fu.waiting.map((x) => row(x, true))}</div>}
        </>
      )}
      <p className="muted small" style={{ marginTop: 14 }}>
        „Später erinnern“, „nachgefasst“ und „angenommen“ teilt das Portal mit der App und dem Team. „Abgelehnt“ storniert das Angebot mit Grund.
      </p>
    </div>
  );
}
