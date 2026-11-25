// „Vor Ort“ (SchutzDex) — die beiden Listen: Unterweisungen (mit Stand über alle aktiven Mitarbeiter) und Mitarbeiter
// (mit Stand je Unterweisung, wie in der App: src/screens/MembersScreen.tsx). Fälligkeit und Wortlaut kommen 1:1 aus
// der App (due.ts). Wie dort gilt jede Unterweisung des Betriebs für jeden aktiven Mitarbeiter.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CloudOff, Plus, Search, Smartphone } from 'lucide-react';
import { Modal } from '../../components/form';
import { LoadGuard } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { MEMBER_GATE_TEXT } from '../pro';
import type { SdState } from './backend';
import { useSd } from './context';
import { dueLabel, lastPassedByPair, memberStatus, memberStatusBadge, memberStatusLabel, type MemberState } from './due';
import { deletePending, emitPendingChanged, withPending, type Pending } from './queue';
import { briefingStand, useSdList } from './stand';

const OFFLINE = 'Keine Verbindung — Stand vom letzten Laden. Unterweisen geht trotzdem, gesendet wird später.';

function HomeHint() {
  return (
    <details className="ez-home">
      <summary>
        <Smartphone className="i" aria-hidden /> Wie eine App auf den Startbildschirm legen
      </summary>
      <p>
        <b>iPhone (Safari):</b> unten auf „Teilen“ tippen → „Zum Home-Bildschirm“ → „Hinzufügen“.
        <br />
        <b>Android (Chrome):</b> oben rechts auf ⋮ → „Zum Startbildschirm hinzufügen“.
      </p>
      <p className="muted small">Das Symbol öffnet direkt diese Seite. Einmal anmelden genügt — die Anmeldung bleibt gespeichert.</p>
    </details>
  );
}

// ================================================================ Reiter „Unterweisungen“
const TONE_ORDER = { red: 0, amber: 1, '': 2, green: 3 } as const;

export function Unterweisungen() {
  const { base } = useSd();
  const { state, pending, sending, sendNow } = useSdList();

  return (
    <div className="ez">
      <h1>Unterweisungen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Unterweisung antippen, Teilnehmer wählen und durchführen — jeder liest, beantwortet den Verständnis-Check und
        unterschreibt direkt auf diesem Handy.
      </p>

      <Wartend pending={pending} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(data: SdState) => {
          const active = data.members.filter((m) => m.aktiv);
          const lastPassed = lastPassedByPair(withPending(data.completions, pending));
          const rows = data.briefings
            .map((b) => ({ b, stand: briefingStand(b.id, active, lastPassed) }))
            .sort((x, y) => TONE_ORDER[x.stand.tone] - TONE_ORDER[y.stand.tone] || x.b.titel.localeCompare(y.b.titel, 'de', { numeric: true }));
          return (
            <>
              {data.offline && <div className="info-box">{OFFLINE}</div>}
              {data.briefings.length === 0 ? (
                <div className="card empty">
                  Noch keine Unterweisungen. Erstelle deine erste Unterweisung in der SchutzDex-App — die KI baut Inhalt,
                  Verständnis-Check und Unterschrift zusammen. Danach kannst du sie hier durchführen.
                </div>
              ) : (
                <>
                  <h2 className="ez-section">Unterweisungen ({data.briefings.length})</h2>
                  <ul className="ez-list">
                    {rows.map(({ b, stand }) => (
                      <li key={b.id}>
                        <Link to={`${base}/unterweisung/${b.id}`} className="ez-prop" data-testid="sd-briefing">
                          <span className="ez-prop-text">
                            <b>{b.titel}</b>
                            <span className="muted">{[b.branche, b.taetigkeit].filter(Boolean).join(' · ') || 'Allgemein'}</span>
                            <span className={stand.tone === 'red' ? 'pv-bad' : 'muted'}>{stand.label}</span>
                          </span>
                          <span className="ez-prop-side">
                            {stand.badge && <span className={`badge ${stand.tone}`}>{stand.badge}</span>}
                            <ChevronRight className="i" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {active.length === 0 && data.briefings.length > 0 && (
                <div className="info-box" style={{ marginTop: 12 }}>
                  Keine aktiven Mitarbeiter. Lege zuerst unter <Link to={`${base}/team`}>„Mitarbeiter“</Link> jemanden an.
                </div>
              )}
              <p className="small" style={{ marginTop: 16 }}>
                <Link to={`${base}/nachweise`}>Nachweise (unterschrieben) — alle abgeschlossenen Unterweisungen</Link>
              </p>
            </>
          );
        }}
      </LoadGuard>

      <HomeHint />
    </div>
  );
}

// ================================================================ Reiter „Mitarbeiter“
const STATE_BADGE: Record<MemberState, string> = { none: '', ok: 'badge green', soon: 'badge amber', partial: 'badge', expired: 'badge red' };

export function Mitarbeiter() {
  const { be, base, orgId } = useSd();
  const { state, pending, sending, sendNow } = useSdList();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [gate, setGate] = useState(false);
  const [name, setName] = useState('');
  const [job, setJob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Doppeltipp: ohne Sperre würde der Mitarbeiter doppelt angelegt (zählt auch gegen die Gratis-Grenze)
  const lock = useRef(false);

  const startNew = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      // Gratis-Grenze wie in der App: ohne Pro 2 aktive Mitarbeiter. Unklar (Pro/Zählung) → Hinweis „gleich nochmal“
      // statt still zu erlauben (vorher: im Zweifel erlaubt).
      let g: { allowed: boolean };
      try {
        g = await be.memberGate();
      } catch (e) {
        return setError(e instanceof Error ? e.message : String(e));
      }
      if (!g.allowed) return setGate(true);
      setError(null);
      setAdding(true);
    } finally {
      lock.current = false;
    }
  };
  const submit = async () => {
    if (lock.current) return;
    if (!name.trim()) return setError('Bitte einen Namen eingeben.');
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const g = await be.memberGate();
      if (!g.allowed) {
        setAdding(false);
        return setGate(true);
      }
      await be.addMember(orgId, { name: name.trim(), taetigkeit: job.trim() || null });
      setName('');
      setJob('');
      setAdding(false);
      state.reload();
    } catch (e) {
      setError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };

  return (
    <div className="ez">
      <h1>Mitarbeiter</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Wer ist unterwiesen, bei wem fehlt etwas? Mitarbeiter antippen für den Stand je Unterweisung.
      </p>

      <Wartend pending={pending} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(data: SdState) => {
          const lastPassed = lastPassedByPair(withPending(data.completions, pending));
          const briefingIds = data.briefings.map((b) => b.id);
          const titles = new Map(data.briefings.map((b) => [b.id, b.titel]));
          const q = query.trim().toLowerCase();
          const shown = data.members
            .filter((m) => !q || [m.name, m.taetigkeit].some((s) => (s ?? '').toLowerCase().includes(q)))
            // aktive zuerst, inaktive am Ende
            .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name, 'de', { numeric: true }));
          return (
            <>
              {data.offline && <div className="info-box">{OFFLINE}</div>}
              {!adding && error && <div className="error-box">{error}</div>}
              {!adding && (
                <button type="button" className="btn ghost ez-big" onClick={() => void startNew()} disabled={data.offline} data-testid="sd-new-member">
                  <Plus className="i" aria-hidden /> Mitarbeiter anlegen
                </button>
              )}
              {adding && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <label className="field">
                    Name
                    <input value={name} maxLength={120} autoComplete="off" placeholder="Vor- und Nachname" onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="field">
                    Tätigkeit (optional)
                    <input value={job} maxLength={120} placeholder="z. B. Monteur, Lager, Büro" onChange={(e) => setJob(e.target.value)} />
                  </label>
                  {error && <div className="error-box">{error}</div>}
                  <div className="ez-actions">
                    <button type="button" className="btn ez-big" onClick={() => void submit()} disabled={busy}>
                      {busy ? 'Speichert …' : 'Mitarbeiter hinzufügen'}
                    </button>
                    <button type="button" className="btn ghost ez-big" onClick={() => setAdding(false)} disabled={busy}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
              {(data.members.length >= 6 || query) && (
                <label className="ez-search" style={{ marginTop: 12 }}>
                  <Search className="i" aria-hidden />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mitarbeiter suchen (Name, Tätigkeit)" aria-label="Mitarbeiter suchen" />
                </label>
              )}
              {data.members.length === 0 ? (
                <div className="card empty" style={{ marginTop: 12 }}>
                  Noch keine Mitarbeiter. Lege dein Team an — jeder Mitarbeiter kann dann Unterweisungen direkt am Handy absolvieren.
                </div>
              ) : shown.length === 0 ? (
                <div className="card empty" style={{ marginTop: 12 }}>
                  Kein Mitarbeiter passt zu deiner Suche.
                </div>
              ) : (
                <ul className="ez-list" style={{ marginTop: 12 }}>
                  {shown.map((m) => {
                    const s = memberStatus(m.id, briefingIds, lastPassed);
                    const badge = memberStatusBadge(s);
                    const isOpen = open === m.id;
                    return (
                      <li key={m.id}>
                        <button type="button" className="ez-prop sd-member" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)} data-testid="sd-member">
                          <span className="ez-prop-text">
                            <b>{m.name}</b>
                            {m.taetigkeit && <span className="muted">{m.taetigkeit}</span>}
                            {m.aktiv ? (
                              <span className={s.state === 'expired' ? 'pv-bad' : 'muted'}>{memberStatusLabel(s)}</span>
                            ) : (
                              <span className="muted">inaktiv — wird nicht mehr unterwiesen (Nachweise bleiben)</span>
                            )}
                          </span>
                          <span className="ez-prop-side">
                            {!m.aktiv ? <span className="badge">Inaktiv</span> : badge ? <span className={STATE_BADGE[s.state]}>{badge}</span> : null}
                            <ChevronRight className="i" aria-hidden style={isOpen ? { transform: 'rotate(90deg)' } : undefined} />
                          </span>
                        </button>
                        {isOpen && (
                          <div className="card sd-member-detail">
                            <span className="pv-label">Stand je Unterweisung</span>
                            {s.items.length === 0 ? (
                              <p className="muted small">Noch keine Unterweisung angelegt.</p>
                            ) : (
                              <ul className="sd-stand">
                                {s.items.map(({ briefingId, info }) => (
                                  <li key={briefingId}>
                                    <span>
                                      <b>{titles.get(briefingId)}</b>
                                      <span className={info.state === 'overdue' ? 'pv-bad small' : 'muted small'}>{dueLabel(info)}</span>
                                    </span>
                                    {m.aktiv && (
                                      <Link to={`${base}/durchfuehren/${briefingId}?wer=${m.id}`} className="btn ghost small">
                                        {info.state === 'ok' ? 'Wiederholen' : 'Unterweisen'}
                                      </Link>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="small" style={{ marginTop: 16 }}>
                <Link to={`${base}/mitarbeiter`}>Mitarbeiter verwalten (bearbeiten, inaktiv setzen, löschen)</Link>
              </p>
            </>
          );
        }}
      </LoadGuard>

      {gate && (
        <Modal title="Free-Limit erreicht" onClose={() => setGate(false)} dirty={false}>
          <p data-testid="sd-gate">{MEMBER_GATE_TEXT}</p>
          <div className="ez-actions">
            <Link to={`${base}/abo`} className="btn ez-big">
              Abo &amp; Tarif ansehen
            </Link>
            <button type="button" className="btn ghost ez-big" onClick={() => setGate(false)}>
              Später
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ================================================================ Wartende Nachweise
/** Kasten „wartet auf die Übertragung“: unterschriebene Nachweise, die noch nicht auf dem Server sind. */
export function Wartend({ pending, sending, sendNow }: { pending: Pending[]; sending: boolean; sendNow: () => void }) {
  const [discard, setDiscard] = useState<Pending | null>(null);
  if (pending.length === 0) return null;
  const line = (p: Pending) => `${p.row.signed_name} · ${p.briefingTitel} · ${fmtDateTime(p.row.abgeschlossen_am)}`;
  return (
    <div className="ez-pending" role="status">
      <div className="ez-pending-head">
        <CloudOff className="i" aria-hidden />
        <b>{pending.length === 1 ? '1 Nachweis wartet' : `${pending.length} Nachweise warten`} auf die Übertragung</b>
      </div>
      <p className="small">
        Samt Unterschrift sicher auf diesem Gerät gespeichert. Sie werden automatisch gesendet, sobald wieder Empfang da ist —
        der Zeitpunkt bleibt der der Unterschrift.
      </p>
      <ul>
        {pending.map((p) => (
          <li key={p.key}>
            <span>
              {line(p)}
              {p.lastError && <span className="ez-pending-err">Vom Server nicht angenommen: {p.lastError}</span>}
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

      {discard && (
        <Modal title="Verwerfen?" onClose={() => setDiscard(null)} dirty={false}>
          <p>{line(discard)}</p>
          <p className="muted">
            Der Server hat diesen Nachweis nicht angenommen. Beim Verwerfen wird er samt Unterschrift von diesem Gerät gelöscht
            und lässt sich nicht wiederherstellen — die Unterweisung müsste dann noch einmal unterschrieben werden.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={() => setDiscard(null)}>
              Behalten
            </button>
            <button
              type="button"
              className="btn ez-danger"
              onClick={() => {
                void deletePending(discard.key).then(emitPendingChanged);
                setDiscard(null);
              }}
            >
              Endgültig verwerfen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
