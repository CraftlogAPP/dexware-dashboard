// „Vor Ort“ (KfzDex) — die beiden Listen: Fahrzeuge mit UVV-Fälligkeit und Fahrer mit Fälligkeit der
// Führerscheinkontrolle. Antippen → Prüfung bzw. Kontrolle erfassen. Dringendes steht oben.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CloudOff, Search, Smartphone } from 'lucide-react';
import { Modal } from '../../components/form';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { licenseDue, uvvDue, type DueInfo, type DueStatus } from '../due';
import { VEHICLE_TYPE_LABEL } from '../types';
import { loadFleet } from './backend';
import { useKfz, useProofSync, withWaiting } from './context';
import { emitProofsChanged, removeProof, type Proof } from './queue';

const BADGE: Record<DueStatus, { cls: string; label: string }> = {
  overdue: { cls: 'badge red', label: 'Überfällig' },
  missing: { cls: 'badge amber', label: 'Noch nie' },
  soon: { cls: 'badge amber', label: 'Bald fällig' },
  ok: { cls: 'badge green', label: 'Gültig' },
};
/** Reihenfolge in den Listen: Dringendes zuerst. */
const ORDER: Record<DueStatus, number> = { overdue: 0, missing: 1, soon: 2, ok: 3 };

const day = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Eine Zeile: „bis wann gilt es / wann muss ich wieder?“ — wortgleich zur App (src/lib/due.ts → dueLabel).
 */
function dueLine(due: DueInfo, noun: string, verb: string): string {
  if (due.status === 'missing' || !due.dueDate) return `Noch keine ${noun} — jetzt fällig`;
  const date = day(due.dueDate);
  if (due.status === 'overdue') {
    const d = Math.abs(due.days ?? 0);
    return d === 0 ? `Heute fällig — seit ${date}` : `Überfällig seit ${d} ${d === 1 ? 'Tag' : 'Tagen'} — war fällig am ${date}`;
  }
  if (due.status === 'soon') {
    const d = due.days ?? 0;
    return d === 0 ? `Heute fällig — am ${date}` : `Fällig in ${d} ${d === 1 ? 'Tag' : 'Tagen'} — am ${date}`;
  }
  return `Gültig bis ${date} — dann erneut ${verb}`;
}

/** Fuhrpark laden (mit gemerktem Stand fürs Funkloch) und nach dem Nachsenden auffrischen. */
function useFleetList() {
  const { be, userId } = useKfz();
  const state = useAsync(() => loadFleet(be, userId), [be, userId]);
  useLiveRefresh([state.refresh], 60000);
  const sync = useProofSync();
  const count = sync.waiting.length;
  const last = useRef(0);
  useEffect(() => {
    const fewer = count < last.current;
    last.current = count;
    if (fewer) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  return { state, ...sync };
}

const OFFLINE = 'Keine Verbindung — Stand vom letzten Laden. Erfassen geht trotzdem, gesendet wird später.';

export function Fahrzeuge() {
  const { base } = useKfz();
  const { state, waiting, sending, sendNow } = useFleetList();
  const [query, setQuery] = useState('');
  const waitingIds = new Set(waiting.filter((p) => p.kind === 'uvv').map((p) => (p.row as { vehicle_id: string }).vehicle_id));

  return (
    <div className="ez">
      <h1>Fahrzeuge</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Fahrzeug antippen und die UVV-Prüfung durchführen — Punkt für Punkt, mit Datum und Prüfer.
      </p>

      <Wartend waiting={waiting} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(fleet) => {
          const vehicles = withWaiting(fleet, waiting).vehicles;
          if (vehicles.length === 0) {
            return (
              <div className="card empty">
                Noch kein Fahrzeug im Fuhrpark. <Link to={`${base}/fahrzeuge`}>Fahrzeug anlegen</Link> — danach kannst du hier
                prüfen.
              </div>
            );
          }
          const q = query.trim().toLowerCase();
          const shown = vehicles
            .filter((v) => !q || [v.plate, v.name, VEHICLE_TYPE_LABEL[v.type]].some((s) => (s ?? '').toLowerCase().includes(q)))
            .map((v) => ({ v, due: uvvDue(v) }))
            .sort((a, b) => ORDER[a.due.status] - ORDER[b.due.status] || a.v.plate.localeCompare(b.v.plate, 'de', { numeric: true }));
          return (
            <>
              {fleet.offline && <div className="info-box">{OFFLINE}</div>}
              {vehicles.length >= 6 && (
                <label className="ez-search">
                  <Search className="i" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Kennzeichen oder Bezeichnung suchen"
                    aria-label="Fahrzeug suchen"
                  />
                </label>
              )}
              {shown.length === 0 ? (
                <div className="card empty">Keine Treffer.</div>
              ) : (
                <ul className="ez-list">
                  {shown.map(({ v, due }) => (
                    <li key={v.id}>
                      <Link to={`${base}/uvv/${v.id}`} className="ez-prop" data-testid="kf-vehicle">
                        <span className="ez-prop-text">
                          <b>{v.plate}</b>
                          <span className="muted">{[v.name, VEHICLE_TYPE_LABEL[v.type]].filter(Boolean).join(' · ')}</span>
                          <span className={due.status === 'overdue' ? 'pv-bad' : 'muted'}>{dueLine(due, 'UVV-Prüfung', 'prüfen')}</span>
                        </span>
                        <span className="ez-prop-side">
                          {waitingIds.has(v.id) && <span className="badge amber">Wartet auf Netz</span>}
                          <span className={BADGE[due.status].cls}>{BADGE[due.status].label}</span>
                          <ChevronRight className="i" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small" style={{ marginTop: 16 }}>
                <Link to={`${base}/fahrzeuge`}>Fahrzeuge verwalten (anlegen, bearbeiten, Prüf-Historie)</Link>
              </p>
            </>
          );
        }}
      </LoadGuard>

      <details className="ez-home">
        <summary>
          <Smartphone className="i" aria-hidden /> Wie eine App auf den Startbildschirm legen
        </summary>
        <p>
          <b>iPhone (Safari):</b> unten auf „Teilen“ tippen → „Zum Home-Bildschirm“ → „Hinzufügen“.
          <br />
          <b>Android (Chrome):</b> oben rechts auf ⋮ → „Zum Startbildschirm hinzufügen“.
        </p>
        <p className="muted small">
          Das Symbol öffnet direkt diese Seite. Einmal anmelden genügt — die Anmeldung bleibt gespeichert.
        </p>
      </details>
    </div>
  );
}

export function FahrerListe() {
  const { base } = useKfz();
  const { state, waiting, sending, sendNow } = useFleetList();
  const [query, setQuery] = useState('');
  const waitingIds = new Set(waiting.filter((p) => p.kind === 'license').map((p) => (p.row as { driver_id: string }).driver_id));

  return (
    <div className="ez">
      <h1>Fahrer</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Fahrer antippen, den Original-Führerschein zeigen lassen und die Kontrolle bestätigen.
      </p>

      <Wartend waiting={waiting} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(fleet) => {
          const drivers = withWaiting(fleet, waiting).drivers;
          if (drivers.length === 0) {
            return (
              <div className="card empty">
                Noch kein Fahrer angelegt. <Link to={`${base}/fahrer`}>Fahrer anlegen</Link> — danach kannst du hier kontrollieren.
              </div>
            );
          }
          const q = query.trim().toLowerCase();
          const shown = drivers
            .filter((d) => !q || d.name.toLowerCase().includes(q))
            .map((d) => ({ d, due: licenseDue(d) }))
            // aktive zuerst, darin Dringendes oben; inaktive (keine Kontrollen fällig) am Ende
            .sort(
              (a, b) =>
                Number(b.d.active) - Number(a.d.active) ||
                ORDER[a.due.status] - ORDER[b.due.status] ||
                a.d.name.localeCompare(b.d.name, 'de', { numeric: true }),
            );
          return (
            <>
              {fleet.offline && <div className="info-box">{OFFLINE}</div>}
              {drivers.length >= 6 && (
                <label className="ez-search">
                  <Search className="i" aria-hidden />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Fahrer suchen" aria-label="Fahrer suchen" />
                </label>
              )}
              {shown.length === 0 ? (
                <div className="card empty">Keine Treffer.</div>
              ) : (
                <ul className="ez-list">
                  {shown.map(({ d, due }) => (
                    <li key={d.id}>
                      <Link to={`${base}/kontrolle/${d.id}`} className="ez-prop" data-testid="kf-driver">
                        <span className="ez-prop-text">
                          <b>{d.name}</b>
                          <span className="muted">
                            {d.license_classes ? `Klassen ${d.license_classes} · ` : ''}Kontrolle alle {d.check_interval_months} Monate
                          </span>
                          {d.active ? (
                            <span className={due.status === 'overdue' ? 'pv-bad' : 'muted'}>{dueLine(due, 'Kontrolle', 'kontrollieren')}</span>
                          ) : (
                            <span className="muted">
                              Inaktiv — keine Kontrollen fällig{d.last_check ? ` (letzte Kontrolle ${fmtDate(d.last_check)})` : ''}
                            </span>
                          )}
                        </span>
                        <span className="ez-prop-side">
                          {waitingIds.has(d.id) && <span className="badge amber">Wartet auf Netz</span>}
                          {d.active ? <span className={BADGE[due.status].cls}>{BADGE[due.status].label}</span> : <span className="badge">Inaktiv</span>}
                          <ChevronRight className="i" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small" style={{ marginTop: 16 }}>
                <Link to={`${base}/fahrer`}>Fahrer verwalten (anlegen, bearbeiten, Kontroll-Historie)</Link>
              </p>
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}

const what = (p: Proof) => (p.kind === 'uvv' ? 'UVV-Prüfung' : 'Führerscheinkontrolle');

/** Kasten „wartet auf die Übertragung“: Nachweise, die noch nicht (ganz) auf dem Server sind. */
export function Wartend({ waiting, sending, sendNow }: { waiting: Proof[]; sending: boolean; sendNow: () => void }) {
  const { userId } = useKfz();
  const [discard, setDiscard] = useState<Proof | null>(null);
  if (waiting.length === 0) return null;
  return (
    <div className="ez-pending" role="status">
      <div className="ez-pending-head">
        <CloudOff className="i" aria-hidden />
        <b>{waiting.length === 1 ? '1 Nachweis wartet' : `${waiting.length} Nachweise warten`} auf die Übertragung</b>
      </div>
      <p className="small">
        Sicher auf diesem Gerät gespeichert. Sie werden automatisch gesendet, sobald wieder Empfang da ist — das Datum
        bleibt das vom Tag der Prüfung.
      </p>
      <ul>
        {waiting.map((p) => (
          <li key={p.key}>
            <span>
              {what(p)} · {p.label} · {fmtDate(p.row.date)}
              {p.sent && (
                <span className="muted small" style={{ display: 'block' }}>
                  Der Nachweis ist übertragen — nur die neue Frist fehlt noch
                </span>
              )}
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
          <p>
            {what(discard)} · {discard.label} · {fmtDate(discard.row.date)}
          </p>
          <p className="muted">
            {discard.sent
              ? 'Der Nachweis selbst ist schon auf dem Server und bleibt dort. Verworfen wird nur das Nachziehen der Frist — trage das Datum danach bitte beim Fahrzeug bzw. Fahrer von Hand ein.'
              : 'Der Server hat diesen Nachweis nicht angenommen. Beim Verwerfen wird er von diesem Gerät gelöscht und lässt sich nicht wiederherstellen.'}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={() => setDiscard(null)}>
              Behalten
            </button>
            <button
              type="button"
              className="btn ez-danger"
              onClick={() => {
                removeProof(userId, discard.key);
                emitProofsChanged();
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
