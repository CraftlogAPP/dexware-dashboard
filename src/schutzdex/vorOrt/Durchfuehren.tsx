// Unterweisung ansehen und durchführen im Browser — Ablauf und Texte wie in der App:
//   Unterweisung (src/screens/briefings/BriefingDetailScreen.tsx): Inhalt + „Mit Mitarbeiter durchführen“.
//   Durchführung (src/screens/briefings/RunBriefingScreen.tsx): Lesen → Verständnis-Check (70 % zum Bestehen) →
//     Unterschrift des Mitarbeiters auf diesem Handy → Nachweis gespeichert.
// Anders als die App lassen sich hier mehrere Teilnehmer auf einmal auswählen: Das Handy geht dann der Reihe nach
// herum, jeder durchläuft dieselben Schritte und unterschreibt selbst — je Teilnehmer entsteht genau EIN Nachweis
// (feste ID je Teilnehmer und Durchgang: ein zweiter Tipp oder ein erneuter Versuch legt nichts doppelt an).
// Gespeichert wird sofort nach jeder Unterschrift, erst auf dem Gerät, dann zum Server (queue.ts) — ein Funkloch
// kostet nichts. KI-Vorschläge und die Gefährdungsbeurteilung gibt es nur in der App.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, CloudOff, PenLine, TriangleAlert } from 'lucide-react';
import { LoadGuard, useUnsavedGuard } from '../../components/ui';
import { newId } from '../../pruefen/data';
import type { Member } from '../types';
import { loadSd, type SdBriefing, type SdState } from './backend';
import { loadTrainer, saveTrainer, usePendingSync, useSd } from './context';
import { dueInfo, dueLabel, fmtDate, lastPassedByPair } from './due';
import { pendingKey, submit, withPending, type SubmitOutcome } from './queue';
import { PASS_RATIO, buildCompletionRow, checkOutcome, contentHashInput, safeQuestions, safeSections } from './rows';
import { SignPad } from './SignPad';
import { briefingStand, useSdList } from './stand';

function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> {label}
    </Link>
  );
}

/** Die Abschnitte einer Unterweisung (Titel, Text, Kernpunkte). */
function Inhalt({ briefing }: { briefing: SdBriefing }) {
  const sections = safeSections(briefing.content);
  if (sections.length === 0) return <div className="card empty">Diese Unterweisung hat keinen Inhalt.</div>;
  return (
    <>
      {sections.map((s, i) => (
        <div className="card sd-section" key={i}>
          {s.titel && <b>{s.titel}</b>}
          {s.text && <p>{s.text}</p>}
          {(s.kernpunkte ?? []).length > 0 && (
            <ul>
              {(s.kernpunkte ?? []).map((k, j) => (
                <li key={j}>{k}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

// ================================================================ Unterweisung: Inhalt + Teilnehmer wählen
export function Unterweisung() {
  const { id } = useParams();
  const { base } = useSd();
  const { state, pending } = useSdList();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  return (
    <div className="ez">
      <Back to={base} label="Unterweisungen" />
      <LoadGuard state={state}>
        {(data: SdState) => {
          const briefing = data.briefings.find((b) => b.id === id);
          if (!briefing) return <div className="error-box">Unterweisung nicht gefunden — gelöscht oder aus einem anderen Betrieb?</div>;
          const active = data.members.filter((m) => m.aktiv).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
          const lastPassed = lastPassedByPair(withPending(data.completions, pending));
          const stand = briefingStand(briefing.id, active, lastPassed);
          const infoOf = (m: Member) => dueInfo(lastPassed.get(`${m.id}|${briefing.id}`));
          const due = active.filter((m) => infoOf(m).state !== 'ok');
          const questions = safeQuestions(briefing.questions);
          const toggle = (memberId: string) =>
            setChosen((prev) => {
              const next = new Set(prev);
              if (next.has(memberId)) next.delete(memberId);
              else next.add(memberId);
              return next;
            });
          // Reihenfolge wie in der Liste (nach Name) — so geht das Handy der Reihe nach herum
          const order = active.filter((m) => chosen.has(m.id)).map((m) => m.id);
          return (
            <>
              <h1>{briefing.titel}</h1>
              <p className="muted" style={{ marginTop: -6 }}>
                {[briefing.branche, briefing.taetigkeit].filter(Boolean).join(' · ') || 'Allgemein'}
                {questions.length > 0 ? ` · Verständnis-Check (${questions.length} Fragen)` : ' · ohne Verständnis-Check'}
              </p>
              {data.offline && <div className="info-box">Keine Verbindung — Stand vom letzten Laden. Unterweisen geht trotzdem, gesendet wird später.</div>}
              <p className={stand.tone === 'red' ? 'pv-bad' : 'muted'}>{stand.label}</p>

              {!picking ? (
                <button
                  type="button"
                  className="btn ez-save"
                  onClick={() => {
                    setChosen(new Set(due.map((m) => m.id)));
                    setPicking(true);
                  }}
                  disabled={active.length === 0}
                  data-testid="sd-run"
                >
                  <PenLine className="i" aria-hidden /> Mit Mitarbeiter durchführen
                </button>
              ) : (
                <div className="card" data-testid="sd-pick">
                  <b>Wer wird unterwiesen?</b>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    Mehrere möglich — das Handy geht dann der Reihe nach herum, jeder unterschreibt selbst.
                    {due.length > 0 && due.length < active.length ? ' Vorausgewählt sind alle, bei denen die Unterweisung fehlt oder abläuft.' : ''}
                  </p>
                  <ul className="pv-checks">
                    {active.map((m) => {
                      const on = chosen.has(m.id);
                      const info = infoOf(m);
                      return (
                        <li key={m.id}>
                          <button type="button" role="switch" aria-checked={on} className={`kf-check${on ? ' on' : ''}`} onClick={() => toggle(m.id)}>
                            <span className="kf-check-text">
                              {m.name}
                              <span className={`${info.state === 'overdue' ? 'pv-bad' : 'muted'} small`} style={{ display: 'block', fontWeight: 400 }}>
                                {[m.taetigkeit, dueLabel(info)].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <span className="kf-check-state">{on ? '✓ dabei' : 'nicht dabei'}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="ez-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn ez-big"
                      disabled={order.length === 0}
                      onClick={() => navigate(`${base}/durchfuehren/${briefing.id}?wer=${order.join(',')}`)}
                      data-testid="sd-start"
                    >
                      {order.length === 0 ? 'Bitte Teilnehmer wählen' : order.length === 1 ? 'Unterweisung starten' : `Unterweisung starten (${order.length} Teilnehmer)`}
                    </button>
                    <button type="button" className="btn ghost ez-big" onClick={() => setPicking(false)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
              {active.length === 0 && (
                <div className="info-box" style={{ marginTop: 12 }}>
                  Keine aktiven Mitarbeiter. Lege zuerst unter <Link to={`${base}/team`}>„Mitarbeiter“</Link> jemanden an.
                </div>
              )}

              <h2 className="ez-section">Inhalt</h2>
              <Inhalt briefing={briefing} />
              <p className="muted small" style={{ marginTop: 12 }}>
                KI-generierter Entwurf als Hilfestellung – ersetzt keine individuelle Gefährdungsbeurteilung. Vor dem Einsatz fachlich
                (z. B. durch eine Fachkraft für Arbeitssicherheit) prüfen.
              </p>
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}

// ================================================================ Durchführung
export function Durchfuehren() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { be, userId, base } = useSd();
  const wer = params.get('wer') ?? '';
  // Einmal laden und festhalten: Während der Durchführung darf sich der Inhalt nicht mehr ändern (und ein stilles
  // Neuladen darf die Antworten des Mitarbeiters nicht verwerfen).
  const [data, setData] = useState<SdState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    loadSd(be, userId).then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [be, userId, tick]);

  const back = `${base}/unterweisung/${id}`;
  if (error) {
    return (
      <div className="ez">
        <Back to={back} label="Unterweisung" />
        <div className="error-box">{error}</div>
        <button type="button" className="btn ghost" onClick={() => setTick((n) => n + 1)}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  const briefing = data.briefings.find((b) => b.id === id);
  const ids = wer.split(',').filter(Boolean);
  // nur aktive Mitarbeiter dieses Betriebs, jeder höchstens einmal, in der gewählten Reihenfolge
  const members = [...new Set(ids)].map((x) => data.members.find((m) => m.id === x && m.aktiv)).filter((m): m is Member => !!m);
  if (!briefing || members.length === 0) {
    return (
      <div className="ez">
        <Back to={briefing ? back : base} label={briefing ? 'Unterweisung' : 'Unterweisungen'} />
        <div className="error-box">
          {briefing ? 'Kein aktiver Teilnehmer gewählt — bitte in der Unterweisung auswählen, wer unterwiesen wird.' : 'Unterweisung nicht gefunden — gelöscht oder aus einem anderen Betrieb?'}
        </div>
      </div>
    );
  }
  return <Lauf key={`${briefing.id}:${members.map((m) => m.id).join(',')}`} briefing={briefing} members={members} back={back} />;
}

type Step = 'lesen' | 'check' | 'signatur' | 'fertig';

interface Result {
  member: Member;
  outcome: SubmitOutcome;
  passed: boolean;
  hadCheck: boolean;
  validUntil: Date | null;
}

/** SHA-256 (hex) über genau den gezeigten Inhalt — wie briefingContentHash in der App. Scheitert es, bleibt das Feld leer. */
async function contentHash(b: SdBriefing): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contentHashInput(b)));
    return Array.from(new Uint8Array(buf))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/** Gerät für den Nachweis (die App schreibt z. B. „android 34“): hier „web“ + System aus der Browser-Kennung. */
function deviceInfo(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const system = /\(([^)]{1,80})\)/.exec(ua)?.[1] ?? '';
  return `web${system ? ` (${system})` : ''}`;
}

function Lauf({ briefing, members, back }: { briefing: SdBriefing; members: Member[]; back: string }) {
  const { be, userId, orgId, base } = useSd();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('lesen');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [trainer, setTrainer] = useState(() => loadTrainer(userId));
  const [trainerMissing, setTrainerMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  // Feste Nachweis-ID je Teilnehmer in DIESEM Durchgang: erneuter Versuch = dieselbe Zeile, nichts doppelt.
  const ids = useRef<Map<string, string>>(new Map(members.map((m) => [m.id, newId()])));
  // Doppeltipp-Sperre: ein zweiter Tipp darf keinen zweiten Nachweis anlegen
  const signing = useRef(false);

  const member = members[index];
  // Defensiv: Fragen ohne gültige Lösung/Antworten entfallen (sie ließen den Mitarbeiter ohne eigenes Zutun durchfallen)
  const questions = useMemo(() => safeQuestions(briefing.questions), [briefing]);
  const { score, correct, passed } = useMemo(() => checkOutcome(questions, answers), [questions, answers]);
  const allAnswered = questions.every((_, i) => answers[i] !== undefined);
  const more = index < members.length - 1;
  const last = results[results.length - 1];
  const allDone = step === 'fertig' && !more;

  // Rückfrage beim Verlassen, solange Antworten oder Teilnehmer offen sind (nach dem letzten „fertig“ ist alles gespeichert)
  useUnsavedGuard(
    step === 'check' || step === 'signatur' || (step === 'fertig' && more),
    step === 'fertig'
      ? 'Unterweisung abbrechen? Es fehlen noch Teilnehmer — die bisherigen Nachweise sind gespeichert.'
      : 'Unterweisung abbrechen? Deine Eingaben sind noch nicht gespeichert.',
  );
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, index]);

  const onSign = async (signature: string) => {
    if (signing.current) return;
    if (!trainer.trim()) return setTrainerMissing(true);
    signing.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      saveTrainer(userId, trainer);
      const at = new Date().toISOString();
      const row = buildCompletionRow({
        id: ids.current.get(member.id) ?? newId(),
        at,
        orgId,
        memberId: member.id,
        memberName: member.name,
        briefingId: briefing.id,
        briefingVersion: briefing.version,
        briefingTitel: briefing.titel,
        score,
        passed,
        signature,
        deviceInfo: deviceInfo(),
        // Im Nachweis festhalten: Thema, Prüfsumme über genau den gezeigten Inhalt, unterweisende Person.
        contentHash: await contentHash(briefing),
        trainer,
      });
      const outcome = await submit(be, { key: pendingKey(userId, row.id), userId, row, briefingTitel: briefing.titel });
      // Nur eine bestandene Unterweisung erneuert die Jahres-Frist (gleiche Rechnung wie die Listen: Kalenderjahr).
      setResults((prev) => [...prev, { member, outcome, passed, hadCheck: questions.length > 0, validUntil: passed ? dueInfo(at).dueAt : null }]);
      setStep('fertig');
    } catch (e) {
      // Nur bei Fehler wieder freigeben — nach Erfolg ist der Nachweis angelegt.
      signing.current = false;
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const next = () => {
    signing.current = false;
    setAnswers({});
    setIndex((i) => i + 1);
    setStep('lesen');
  };

  const steps: Step[] = questions.length ? ['lesen', 'check', 'signatur'] : ['lesen', 'signatur'];
  const LABEL: Record<Step, string> = { lesen: 'Lesen', check: 'Verständnis', signatur: 'Unterschrift', fertig: 'Fertig' };
  const head = step !== 'fertig' && (
    <>
      {members.length > 1 && (
        <p className="sd-turn" data-testid="sd-turn">
          Teilnehmer {index + 1} von {members.length}: <b>{member.name}</b>
        </p>
      )}
      <ol className="sd-steps" aria-label={`Schritt ${steps.indexOf(step) + 1} von ${steps.length}: ${LABEL[step]}`}>
        {steps.map((s, i) => (
          <li key={s} className={i < steps.indexOf(step) ? 'done' : s === step ? 'on' : ''}>
            {LABEL[s]}
          </li>
        ))}
      </ol>
    </>
  );

  // 1) Inhalt lesen
  if (step === 'lesen') {
    return (
      <div className="ez">
        {index === 0 ? <Back to={back} label="Unterweisung" /> : null}
        {head}
        <p className="muted" style={{ marginBottom: 0 }}>
          Unterweisung für {member.name}
        </p>
        <h1 style={{ marginTop: 4 }}>{briefing.titel}</h1>
        <Inhalt briefing={briefing} />
        <button type="button" className="btn ez-save" onClick={() => setStep(questions.length ? 'check' : 'signatur')} data-testid="sd-next">
          {questions.length ? 'Weiter zum Verständnis-Check' : 'Weiter zur Unterschrift'}
        </button>
      </div>
    );
  }

  // 2) Verständnis-Check
  if (step === 'check') {
    return (
      <div className="ez">
        {head}
        <h1>Verständnis-Check</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          Beantworte alle {questions.length} Fragen ({Math.round(PASS_RATIO * 100)}% zum Bestehen).
        </p>
        {questions.map((q, i) => (
          <div className="card sd-question" key={i} role="group" aria-label={`Frage ${i + 1}`}>
            <b>
              {i + 1}. {q.frage}
            </b>
            {q.optionen.map((opt, oi) => {
              const selected = answers[i] === oi;
              return (
                <button
                  type="button"
                  key={oi}
                  className={`sd-option${selected ? ' on' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setAnswers((prev) => ({ ...prev, [i]: oi }))}
                  data-testid={`sd-opt-${i}-${oi}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ))}
        <button type="button" className="btn ez-save" onClick={() => setStep('signatur')} disabled={!allAnswered} data-testid="sd-evaluate">
          Auswerten &amp; unterschreiben
        </button>
        {!allAnswered && <p className="muted small" style={{ textAlign: 'center' }}>Bitte alle Fragen beantworten.</p>}
        <button type="button" className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep('lesen')}>
          Zurück
        </button>
      </div>
    );
  }

  // 3) Unterschrift
  if (step === 'signatur') {
    return (
      <div className="ez">
        {head}
        <h1>Unterschrift</h1>
        {questions.length > 0 && (
          <p>
            <span className={`badge ${passed ? 'green' : 'red'}`} data-testid="sd-result">
              {passed ? 'Bestanden' : 'Nicht bestanden'} · {correct}/{questions.length} richtig ({score}%)
            </span>
          </p>
        )}
        <p className="muted">
          {/* „verstanden“ nur bei bestandenem Check; ohne Fragen „zur Kenntnis genommen“, bei Nichtbestehen „teilgenommen“. */}
          {!questions.length
            ? `${member.name} bestätigt mit der Unterschrift, die Unterweisung „${briefing.titel}“ erhalten und zur Kenntnis genommen zu haben.`
            : passed
              ? `${member.name} bestätigt mit der Unterschrift, die Unterweisung „${briefing.titel}“ verstanden zu haben.`
              : `${member.name} bestätigt mit der Unterschrift die Teilnahme an der Unterweisung „${briefing.titel}“. Der Verständnis-Check wurde nicht bestanden — die Unterweisung muss wiederholt werden.`}
        </p>
        <label className="field">
          Unterwiesen durch (Vor- und Nachname)
          <input
            value={trainer}
            maxLength={120}
            autoComplete="name"
            placeholder="Wer hat unterwiesen?"
            onChange={(e) => {
              setTrainer(e.target.value);
              setTrainerMissing(false);
            }}
            data-testid="sd-trainer"
          />
        </label>
        {trainerMissing && (
          <div className="error-box" role="alert">
            <b>Name fehlt</b> — Bitte eintragen, wer die Unterweisung durchgeführt hat. Der Name steht im Nachweis.
          </div>
        )}
        <span className="pv-label">Unterschrift von {member.name}</span>
        <SignPad key={member.id} onConfirm={(sig) => void onSign(sig)} confirmLabel="Unterschreiben & abschließen" busy={saving} who={member.name} />
        {saveError && <div className="error-box">Speichern fehlgeschlagen: {saveError}</div>}
        <button type="button" className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep(questions.length ? 'check' : 'lesen')} disabled={saving}>
          Zurück
        </button>
      </div>
    );
  }

  // 4) Fertig (je Teilnehmer; nach dem letzten die Übersicht)
  return (
    <div className="ez ez-done">
      <Stand outcome={last.outcome} />
      <h1 data-testid="sd-done">Abgeschlossen</h1>
      <p className="muted">
        Die Unterweisung „{briefing.titel}“ wurde für {last.member.name} dokumentiert.
      </p>
      {last.hadCheck && !last.passed && <p className="pv-bad">Nicht bestanden — bitte wiederholen. Die Jahresfrist wird dadurch nicht erneuert.</p>}
      {last.validUntil && <p className="kf-ok">Gültig bis {fmtDate(last.validUntil)} — dann erneut unterweisen.</p>}
      <Hinweis outcome={last.outcome} />

      {more ? (
        <div className="card ez-next">
          <span className="muted small">
            Als Nächstes · Teilnehmer {index + 2} von {members.length}
          </span>
          <b>{members[index + 1].name}</b>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={next} data-testid="sd-next-member">
              Handy weitergeben — weiter mit {members[index + 1].name}
            </button>
            <Link to={back} className="btn ghost ez-big">
              Hier aufhören
            </Link>
          </div>
        </div>
      ) : (
        <>
          {allDone && results.length > 1 && (
            <div className="card" style={{ textAlign: 'left' }} data-testid="sd-summary">
              <b>{results.length} Nachweise in diesem Durchgang</b>
              <ul className="sd-stand">
                {results.map((r) => (
                  <li key={r.member.id}>
                    <span>
                      <b>{r.member.name}</b>
                      <span className="muted small">{r.outcome.result === 'synced' ? 'gespeichert' : typeof r.outcome.result === 'object' ? 'noch nicht auf dem Server' : 'wartet auf Netz'}</span>
                    </span>
                    <span className={`badge ${r.passed ? 'green' : 'red'}`}>{!r.hadCheck ? 'Unterwiesen' : r.passed ? 'Bestanden' : 'Nicht best.'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="ez-actions">
            <Link to={base} className="btn ez-big" data-testid="sd-finish">
              Fertig
            </Link>
            <Link to={`${base}/nachweise`} className="btn ghost ez-big">
              Nachweise ansehen
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Symbol oben auf der Abschluss-Seite: Haken, „wartet“ oder Warnung — je nachdem, wo der Nachweis gerade liegt. */
function useLive(outcome: SubmitOutcome) {
  const { pending, loaded } = usePendingSync();
  const queued = outcome.result !== 'synced';
  const waiting = pending.find((p) => p.key === outcome.pending.key);
  // Inzwischen doch gesendet (Netz kam zurück, solange diese Seite offen ist)?
  const stillWaiting = queued && (!loaded || !!waiting);
  const rejected = stillWaiting ? (waiting ? (waiting.lastError ?? null) : typeof outcome.result === 'object' ? outcome.result.rejected : null) : null;
  return { stillWaiting, rejected, fieldsDropped: (waiting ?? outcome.pending).fieldsDropped === true };
}

function Stand({ outcome }: { outcome: SubmitOutcome }) {
  const { stillWaiting, rejected } = useLive(outcome);
  return (
    <div className={`ez-done-icon${stillWaiting ? ' wait' : ''}`} aria-hidden>
      {rejected ? <TriangleAlert /> : stillWaiting ? <CloudOff /> : <Check />}
    </div>
  );
}

function Hinweis({ outcome }: { outcome: SubmitOutcome }) {
  const { stillWaiting, rejected, fieldsDropped } = useLive(outcome);
  if (rejected) {
    return (
      <div className="error-box" style={{ textAlign: 'left' }}>
        <TriangleAlert className="i" aria-hidden /> Vom Server nicht angenommen: {rejected}
        <br />
        Der Nachweis liegt samt Unterschrift auf diesem Gerät und wird automatisch erneut gesendet. Bleibt es dabei, bitte
        support@dexware.app melden.
      </div>
    );
  }
  if (stillWaiting) {
    return (
      <div className="info-box" style={{ textAlign: 'left' }} data-testid="sd-queued">
        {outcome.onDevice ? (
          <>
            <b>Ohne Netz gespeichert.</b> Kein Empfang — die Unterweisung samt Unterschrift ist auf dem Gerät gesichert und wird
            automatisch übertragen, sobald wieder Netz da ist.
          </>
        ) : (
          <>
            Gerade keine Verbindung — und dieser Browser erlaubt kein dauerhaftes Speichern (privates Surfen?).
            <b> Bitte diese Seite offen lassen</b>, bis der Nachweis übertragen ist.
          </>
        )}
      </div>
    );
  }
  return fieldsDropped ? (
    <div className="info-box" style={{ textAlign: 'left' }}>
      Hinweis: Die Datenbank konnte Thema, Inhaltsversion und unterweisende Person noch nicht speichern — der Nachweis ist ohne diese
      Angaben gesichert.
    </div>
  ) : null;
}
