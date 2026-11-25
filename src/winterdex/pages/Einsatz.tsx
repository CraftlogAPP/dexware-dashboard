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
import { deletePending, emitPendingChanged, listDraftPropertyIds, type Pending } from '../einsatz/store';
import { nextTryLabel as nextLabel } from '../../lib/retryLater';
import { isIOS, isStandalone } from '../../lib/pwa';
import { GratisFehler } from '../GratisHinweise';
import { aufGratisAenderung, gratisArt } from '../gratisLage';
import { nachTour } from '../tour';

const HOME_HINT_KEY = 'wd-home-hinweis-weg';

export function Einsatz() {
  const { be, userId, orgId, base, owner } = useEinsatz();
  const state = useAsync(() => loadEinsatzData(be, userId, orgId), [be, userId, orgId]);
  useLiveRefresh([state.refresh]);
  // Nach „Objekte wählen“ (Gratis nach Ablauf von Pro) sind Objekte stillgelegt → Liste auffrischen
  useEffect(() => aufGratisAenderung(state.refresh), [state.refresh]);
  const { pending, sending, sendNow } = usePendingSync();
  const [draftPropIds, setDraftPropIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [discard, setDiscard] = useState<Pending | null>(null);
  const standalone = useMemo(() => isStandalone(), []);
  const iosSafari = useMemo(() => isIOS() && !standalone, [standalone]);
  const [homeHintGone, setHomeHintGone] = useState(() => {
    try {
      return localStorage.getItem(HOME_HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const hideHomeHint = () => {
    setHomeHintGone(true);
    try {
      localStorage.setItem(HOME_HINT_KEY, '1');
    } catch {
      /* nur Komfort */
    }
  };

  useEffect(() => {
    let alive = true;
    // nur die Schlüssel lesen (keine Fotos) — reicht für die Markierung „Angefangen“
    void listDraftPropertyIds(userId).then((ids) => {
      if (alive) setDraftPropIds(ids);
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

  const draftIds = useMemo(() => new Set(draftPropIds), [draftPropIds]);

  return (
    <div className="ez">
      <h1>Einsatz erfassen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Objekt antippen — Uhrzeit, Standort und Fotos werden direkt vor Ort festgehalten.
      </p>

      {/* iPhone in Safari: einmal auffällig empfehlen, den Außendienst auf den Home-Bildschirm zu legen (Feldtest 24.11.) */}
      {iosSafari && !homeHintGone && (
        <div className="ez-home-card" role="note">
          <b>
            <Smartphone className="i" aria-hidden /> Tipp: WinterDex auf den Home-Bildschirm legen
          </b>
          <p>
            Dann öffnet WinterDex wie eine App, auch im Funkloch — und deine Anmeldung und noch nicht gesendete
            Einsätze bleiben sicher: In Safari löscht das iPhone Website-Daten, wenn die Seite 7 Tage (an denen Safari
            benutzt wird) nicht geöffnet wurde. Für das Symbol auf dem Home-Bildschirm gilt das nicht.
          </p>
          <ol>
            <li>Unten auf „Teilen“ tippen (neuere iPhones: erst „…“, dann „Teilen“).</li>
            <li>„Zum Home-Bildschirm“ → „Hinzufügen“.</li>
            <li>WinterDex über das neue Symbol öffnen und dort einmal anmelden — es hat einen eigenen Speicher.</li>
          </ol>
          <p className={pending.length > 0 ? 'ez-warn small' : 'muted small'}>
            Vorher hier alles Wartende senden lassen
            {pending.length > 0 ? ` (gerade ${pending.length === 1 ? 'wartet 1 Einsatz' : `warten ${pending.length} Einsätze`})` : ''} — was
            in Safari wartet, sendet nur Safari.
          </p>
          <button type="button" className="btn ghost small" onClick={hideHomeHint}>
            Verstanden
          </button>
        </div>
      )}

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
          {/* Gratis nach Ablauf von Pro: statt nur „nicht angenommen“ gleich wählen/tauschen bzw. Pro holen */}
          {(() => {
            const g = pending.find((p) => p.lastError && gratisArt(p.lastError));
            const art = g ? gratisArt(g.lastError) : null;
            return g && art ? (
              <GratisFehler
                art={art}
                zielId={g.row.property_id}
                aboUrl={`${base}/abo`}
                zusatz="Die wartenden Einsätze bleiben auf diesem Gerät gesichert und gehen nach der Auswahl (oder mit Pro) raus."
                onGewaehlt={sendNow}
              />
            ) : null;
          })()}
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
            // Vom Server abgelehnte Einsätze zählen nicht als „heute erledigt“ — sonst steht ein grüner Haken da, obwohl
            // am Server nichts liegt (20.11.2026).
            if (!p.lastError && isToday(p.row.started_at)) doneAt.set(p.row.property_id, p.row.started_at);
          }
          const q = query.trim().toLowerCase();
          const shown = active
            .filter((p) => !q || `${p.name} ${p.address} ${p.customer_name ?? ''}`.toLowerCase().includes(q))
            // heute offene zuerst, darin in Tour-Reihenfolge (teamweit, leere zuletzt), dann Name
            .sort((a, b) => Number(doneAt.has(a.id)) - Number(doneAt.has(b.id)) || nachTour(a, b));
          const doneCount = active.filter((p) => doneAt.has(p.id)).length;

          if (active.length === 0) {
            return (
              <div className="card empty">
                {owner ? (
                  <>
                    Noch keine aktiven Objekte. Lege zuerst unter <Link to={`${base}/objekte`}>Objekte</Link> ein Objekt
                    an — danach kannst du hier Einsätze erfassen.
                  </>
                ) : (
                  'Noch keine aktiven Objekte. Objekte legt der Inhaber deines Betriebs an — danach erscheinen sie hier.'
                )}
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

      {!standalone && (
        <details className="ez-home">
          <summary>
            <Smartphone className="i" aria-hidden /> Wie eine App auf den Startbildschirm legen
          </summary>
          <p>
            <b>iPhone (Safari):</b> auf „Teilen“ tippen (neuere iPhones: erst „…“, dann „Teilen“) → „Zum
            Home-Bildschirm“ → „Hinzufügen“.
            <br />
            <b>Android (Chrome):</b> oben rechts auf ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
          </p>
          <p className="muted small">
            Das Symbol öffnet direkt den Außendienst — wenn er einmal mit Netz geöffnet war, auch im Funkloch. Am iPhone
            hat das Symbol einen eigenen Speicher: dort einmal neu anmelden, und vorher hier alles Wartende senden lassen.
            Danach bleibt die Anmeldung gespeichert. In Safari löscht das iPhone Website-Daten, wenn die Seite 7 Tage
            (an denen Safari benutzt wird) nicht geöffnet wurde — für das Symbol gilt das nicht.
          </p>
        </details>
      )}

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

