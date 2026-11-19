// Einsatz erfassen — Objektliste fürs Handy (Übergang fürs iPhone, solange es die App dort nicht gibt).
// Wie die Objektliste der App: heute noch offene Objekte zuerst, erledigte mit Uhrzeit. Antippen → erfassen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, CloudOff, Search, Smartphone } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { useEinsatz, usePendingSync } from '../einsatz/context';
import { loadEinsatzData } from '../einsatz/data';
import { isToday } from '../einsatz/amount';
import { deletePending, emitPendingChanged, listDrafts, type Draft, type Pending } from '../einsatz/store';

export function Einsatz() {
  const { be, userId, base } = useEinsatz();
  const state = useAsync(() => loadEinsatzData(be, userId), [be, userId]);
  useLiveRefresh([state.refresh]);
  const { pending, sending, sendNow } = usePendingSync();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [query, setQuery] = useState('');
  const [discard, setDiscard] = useState<Pending | null>(null);

  useEffect(() => {
    let alive = true;
    void listDrafts(userId).then((d) => {
      if (alive) setDrafts(d);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Nach dem Nachsenden die Liste auffrischen (sonst bliebe „heute offen“ stehen)
  const pendingCount = pending.length;
  const lastCount = useRef(0);
  useEffect(() => {
    const fewer = pendingCount < lastCount.current;
    lastCount.current = pendingCount;
    if (fewer) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  const draftIds = useMemo(() => new Set(drafts.map((d) => d.propertyId)), [drafts]);

  return (
    <div className="ez">
      <h1>Einsatz erfassen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Objekt antippen — Uhrzeit, Standort und Fotos werden direkt vor Ort festgehalten.
      </p>

      {pending.length > 0 && (
        <div className="ez-pending" role="status">
          <div className="ez-pending-head">
            <CloudOff className="i" aria-hidden />
            <b>
              {pending.length === 1 ? '1 Einsatz wartet' : `${pending.length} Einsätze warten`} auf die Übertragung
            </b>
          </div>
          <p className="small">
            Sicher auf diesem Gerät gespeichert. Sie werden automatisch gesendet, sobald wieder Empfang da ist —
            Zeit, Standort und Fotos bleiben die vom Einsatzort.
          </p>
          <ul>
            {pending.map((p) => (
              <li key={p.key}>
                <span>
                  {p.propertyName} · {fmtDateTime(p.row.started_at)}
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
        </div>
      )}

      <LoadGuard state={state}>
        {({ properties, todayOps, offline }) => {
          const active = properties.filter((p) => p.active);
          const doneAt = new Map<string, string>();
          for (const o of todayOps) {
            if (!o.canceled && isToday(o.started_at)) doneAt.set(o.property_id, o.started_at);
          }
          for (const p of pending) {
            if (isToday(p.row.started_at)) doneAt.set(p.row.property_id, p.row.started_at);
          }
          const q = query.trim().toLowerCase();
          const shown = active
            .filter((p) => !q || `${p.name} ${p.address} ${p.customer_name ?? ''}`.toLowerCase().includes(q))
            .sort(
              (a, b) =>
                Number(doneAt.has(a.id)) - Number(doneAt.has(b.id)) || a.name.localeCompare(b.name, 'de'),
            );
          const doneCount = active.filter((p) => doneAt.has(p.id)).length;

          if (active.length === 0) {
            return (
              <div className="card empty">
                Noch keine aktiven Objekte. Lege zuerst unter <Link to={`${base}/objekte`}>Objekte</Link> ein Objekt an —
                danach kannst du hier Einsätze erfassen.
              </div>
            );
          }
          return (
            <>
              {offline && (
                <div className="info-box">
                  Keine Verbindung — Objektliste vom letzten Laden. Erfassen geht trotzdem, gesendet wird später.
                </div>
              )}
              {!offline && <div className="ez-day">
                {doneCount === active.length ? (
                  <span className="ez-day-done">
                    <Check className="i" aria-hidden /> Alle Objekte erledigt
                  </span>
                ) : (
                  <span>
                    Heute <b>{doneCount}</b> von <b>{active.length}</b> erledigt
                  </span>
                )}
              </div>}

              {active.length > 6 && (
                <label className="ez-search">
                  <Search className="i" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Objekt suchen"
                    aria-label="Objekt suchen"
                  />
                </label>
              )}

              {shown.length === 0 ? (
                <div className="card empty">Kein Objekt gefunden.</div>
              ) : (
                <ul className="ez-list">
                  {shown.map((p) => {
                    const at = doneAt.get(p.id);
                    return (
                      <li key={p.id}>
                        <Link to={`${base}/objekt/${p.id}`} className={`ez-prop${at ? ' done' : ''}`}>
                          <span className="ez-prop-text">
                            <b>{p.name}</b>
                            <span className="muted">{p.address}</span>
                          </span>
                          <span className="ez-prop-side">
                            {draftIds.has(p.id) && <span className="badge amber">Angefangen</span>}
                            {at ? (
                              <span className="badge green">
                                <Check className="i" aria-hidden /> {fmtTime(at)}
                              </span>
                            ) : (
                              // ohne Netz ist unbekannt, was heute schon erledigt wurde → dann lieber nichts behaupten
                              !offline && <span className="badge">Heute offen</span>
                            )}
                            <ChevronRight className="i" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
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

      {discard && (
        <Modal title="Einsatz verwerfen?" onClose={() => setDiscard(null)} dirty={false}>
          <p>
            {discard.propertyName} · {fmtDateTime(discard.row.started_at)}
          </p>
          <p className="muted">
            Der Server hat diesen Einsatz nicht angenommen. Beim Verwerfen wird er samt Fotos von diesem Gerät
            gelöscht und lässt sich nicht wiederherstellen.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={() => setDiscard(null)}>
              Behalten
            </button>
            <button
              type="button"
              className="btn ez-danger"
              onClick={() => {
                void deletePending(discard.row.id).then(emitPendingChanged);
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
