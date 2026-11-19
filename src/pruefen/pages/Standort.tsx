// „Vor Ort“ — ein Standort: seine Einheiten mit Status (gesperrt / fällig / geprüft bis). Antippen → prüfen.
// Statt QR-Scan gibt es eine Suche (Bezeichnung, Bauart) — der Scan bräuchte eine zusätzliche Bibliothek.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { kindOf, sitesPathOf, unitAlertOf } from '../config';
import { usePruef, usePendingSync } from '../context';
import { loadPruefData, withPendingMeta } from '../data';
import { STATE_ORDER, dueInfo, dueLine, lastDueByUnit, unitState, type UnitState } from '../due';
import { listDrafts, type Draft } from '../store';
import { Wartend } from './Wartend';

const BADGE: Record<UnitState, { cls: string; label: string }> = {
  blocked: { cls: 'badge red', label: 'Gesperrt' },
  overdue: { cls: 'badge red', label: 'Fällig' },
  never: { cls: 'badge amber', label: 'Noch nie geprüft' },
  soon: { cls: 'badge amber', label: 'Bald fällig' },
  ok: { cls: 'badge green', label: 'Geprüft' },
};

export function Standort() {
  const { id } = useParams();
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

  const pendingCount = pending.length;
  const lastCount = useRef(0);
  useEffect(() => {
    const fewer = pendingCount < lastCount.current;
    lastCount.current = pendingCount;
    if (fewer) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  const draftUnits = useMemo(() => new Set(drafts.map((d) => d.unitId)), [drafts]);
  const waitingUnits = useMemo(
    () => new Set(pending.map((p) => String(p.inspection[cfg.cols.unitFk]))),
    [pending, cfg.cols.unitFk],
  );
  const U = cfg.labels.unit;
  const S = cfg.labels.site;
  const dueShort = kindOf(cfg, cfg.dueKind).short;

  const back = (
    <Link to={base} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> {S.many}
    </Link>
  );

  return (
    <div className="ez">
      {back}
      <LoadGuard state={state}>
        {({ sites, units, meta, openDefects, offline }) => {
          const site = sites.find((s) => s.id === id);
          if (!site) return <div className="error-box">{S.one} nicht gefunden — gelöscht oder aus einem anderen Betrieb?</div>;
          const last = lastDueByUnit(withPendingMeta(meta, pending, cfg.cols.unitFk), cfg.dueKind);
          const blocked = new Set(openDefects.filter((d) => d.blocked).map((d) => d.unitId));
          const openCount = new Map<string, number>();
          for (const d of openDefects) openCount.set(d.unitId, (openCount.get(d.unitId) ?? 0) + 1);
          const here = units
            .filter((u) => u.siteId === site.id && !u.retired)
            .map((u) => {
              const info = dueInfo(last.get(u.id), intervalDays);
              // Warnung aus den Stammdaten (z. B. GurtDex: ablegereif) — nur wenn nicht ohnehin gesperrt
              const alert = blocked.has(u.id) ? null : unitAlertOf(cfg, u);
              return { u, info, alert, st: unitState(info, blocked.has(u.id)) };
            })
            .sort(
              (a, b) =>
                (a.alert ? 0 : STATE_ORDER[a.st]) - (b.alert ? 0 : STATE_ORDER[b.st]) ||
                a.u.name.localeCompare(b.u.name, 'de', { numeric: true }),
            );
          const q = query.trim().toLowerCase();
          const shown = here.filter(({ u }) => !q || `${u.name} ${u.info}`.toLowerCase().includes(q));

          return (
            <>
              <h1>{site.name}</h1>
              <p className="muted" style={{ marginTop: -6 }}>
                {site.address}
              </p>

              <Wartend pending={pending} sending={sending} sendNow={sendNow} />

              {offline && (
                <div className="info-box">
                  Keine Verbindung — Stand vom letzten Laden. Prüfen geht trotzdem, gesendet wird später.
                </div>
              )}

              {here.length === 0 ? (
                <div className="card empty">
                  Hier sind noch keine {U.many} erfasst — geprüft wird immer je {U.full}.{' '}
                  {owner ? (
                    <Link to={`${base}/${sitesPathOf(cfg)}/${site.id}`}>{U.one} anlegen</Link>
                  ) : (
                    <>Bitte den Inhaber bitten, die {U.many} anzulegen.</>
                  )}
                </div>
              ) : (
                <>
                  <h2 className="ez-section">
                    {U.which} <span className="muted">({here.length})</span>
                  </h2>
                  {here.length > 6 && (
                    <label className="ez-search">
                      <Search className="i" aria-hidden />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`${U.one} suchen (Bezeichnung, Bauart)`}
                        aria-label={`${U.one} suchen`}
                      />
                    </label>
                  )}
                  {shown.length === 0 ? (
                    <div className="card empty">Keine Treffer.</div>
                  ) : (
                    <ul className="ez-list">
                      {shown.map(({ u, info, alert, st }) => {
                        const open = openCount.get(u.id) ?? 0;
                        return (
                          <li key={u.id}>
                            <Link to={`${base}/pruefen/${u.id}`} className="ez-prop">
                              <span className="ez-prop-text">
                                <b>{u.name}</b>
                                {u.info && <span className="muted">{u.info}</span>}
                                <span className={st === 'blocked' || st === 'overdue' ? 'pv-bad' : 'muted'}>
                                  {st === 'blocked'
                                    ? `${cfg.labels.blockedShort} — offener Mangel, erst nach Behebung wieder benutzen`
                                    : dueLine(info, dueShort)}
                                  {st !== 'blocked' && open > 0 ? ` · ${open} ${open === 1 ? 'offener Mangel' : 'offene Mängel'}` : ''}
                                </span>
                                {alert && <span className="pv-bad">{alert.text}</span>}
                              </span>
                              <span className="ez-prop-side">
                                {draftUnits.has(u.id) && <span className="badge amber">Angefangen</span>}
                                {waitingUnits.has(u.id) && <span className="badge amber">Wartet auf Netz</span>}
                                {alert ? <span className="badge red">{alert.badge}</span> : <span className={BADGE[st].cls}>{BADGE[st].label}</span>}
                                <ChevronRight className="i" aria-hidden />
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {owner && (
                    <p className="small" style={{ marginTop: 16 }}>
                      <Link to={`${base}/${sitesPathOf(cfg)}/${site.id}`}>{U.many} verwalten (anlegen, bearbeiten)</Link>
                    </p>
                  )}
                </>
              )}
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}
