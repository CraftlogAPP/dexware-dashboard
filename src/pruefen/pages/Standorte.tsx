// „Vor Ort“ — Startseite: die Standorte mit Zahl der Einheiten und Fälligkeit. Antippen → Einheiten → prüfen.
// Bewusst kurz gehalten: Liste, Suche (ab 7 Standorten), wartende Prüfungen. Alles andere liegt unter „Mehr“.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, Smartphone } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { usePruef, usePendingSync } from '../context';
import { loadPruefData, withPendingMeta } from '../data';
import { dueInfo, lastDueByUnit, unitState, type UnitState } from '../due';
import { listDrafts, type Draft } from '../store';
import { Wartend } from './Wartend';

export function Standorte() {
  const { be, cfg, userId, base, owner, intervalDays } = usePruef();
  const state = useAsync(() => loadPruefData(be, cfg.appId, userId), [be, cfg.appId, userId]);
  useLiveRefresh([state.refresh], 60000);
  const { pending, sending, sendNow } = usePendingSync();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    void listDrafts(cfg.appId, userId).then((d) => {
      if (alive) setDrafts(d);
    });
    return () => {
      alive = false;
    };
  }, [cfg.appId, userId]);

  // Nach dem Nachsenden die Liste auffrischen (sonst bliebe die alte Fälligkeit stehen)
  const pendingCount = pending.length;
  const lastCount = useRef(0);
  useEffect(() => {
    const fewer = pendingCount < lastCount.current;
    lastCount.current = pendingCount;
    if (fewer) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  const draftSites = useMemo(() => new Set(drafts.map((d) => d.siteId)), [drafts]);
  const U = cfg.labels.unit;
  const S = cfg.labels.site;

  return (
    <div className="ez">
      <h1>{S.many}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {S.one} antippen, {U.one} wählen, Prüfung dokumentieren — mit Uhrzeit, Ort und Fotos.
      </p>

      <Wartend pending={pending} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {({ sites, units, meta, openDefects, offline }) => {
          const active = sites.filter((s) => s.active);
          if (active.length === 0) {
            return (
              <div className="card empty">
                Noch keine aktiven {S.many}.{' '}
                {owner ? (
                  <>
                    Lege zuerst unter <Link to={`${base}/standorte`}>{S.many} verwalten</Link> {S.many} und {U.many} an —
                    danach kannst du hier prüfen.
                  </>
                ) : (
                  <>Bitte den Inhaber bitten, {S.many} und {U.many} anzulegen.</>
                )}
              </div>
            );
          }
          const last = lastDueByUnit(withPendingMeta(meta, pending, cfg.cols.unitFk), cfg.dueKind);
          const blocked = new Set(openDefects.filter((d) => d.blocked).map((d) => d.unitId));
          const bySite = new Map<string, Record<UnitState, number> & { total: number }>();
          for (const u of units) {
            if (u.retired) continue;
            const c = bySite.get(u.siteId) ?? { total: 0, blocked: 0, overdue: 0, never: 0, soon: 0, ok: 0 };
            c.total++;
            c[unitState(dueInfo(last.get(u.id), intervalDays), blocked.has(u.id))]++;
            bySite.set(u.siteId, c);
          }
          const q = query.trim().toLowerCase();
          const shown = active.filter((s) => !q || `${s.name} ${s.address}`.toLowerCase().includes(q));

          return (
            <>
              {offline && (
                <div className="info-box">
                  Keine Verbindung — Stand vom letzten Laden. Prüfen geht trotzdem, gesendet wird später.
                </div>
              )}
              {active.length > 6 && (
                <label className="ez-search">
                  <Search className="i" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`${S.one} suchen`}
                    aria-label={`${S.one} suchen`}
                  />
                </label>
              )}
              {shown.length === 0 ? (
                <div className="card empty">Keine Treffer.</div>
              ) : (
                <ul className="ez-list">
                  {shown.map((s) => {
                    const c = bySite.get(s.id);
                    const due = c ? c.overdue + c.never : 0;
                    return (
                      <li key={s.id}>
                        <Link to={`${base}/ort/${s.id}`} className="ez-prop">
                          <span className="ez-prop-text">
                            <b>{s.name}</b>
                            <span className="muted">{s.address}</span>
                            <span className="muted">
                              {c ? `${c.total} ${c.total === 1 ? U.one : U.many}` : `Noch keine ${U.many}`}
                            </span>
                          </span>
                          <span className="ez-prop-side">
                            {draftSites.has(s.id) && <span className="badge amber">Angefangen</span>}
                            {c && c.blocked > 0 && <span className="badge red">{c.blocked} gesperrt</span>}
                            {c && due > 0 && <span className="badge red">{due} fällig</span>}
                            {c && due === 0 && c.soon > 0 && <span className="badge amber">{c.soon} bald fällig</span>}
                            {c && due === 0 && c.soon === 0 && c.blocked === 0 && <span className="badge green">geprüft</span>}
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
    </div>
  );
}
