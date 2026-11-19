// „Vor Ort“ im ORTS-MODUS (GerüstDex, RegalDex, SpielDex): Hier wird nicht die einzelne Einheit geprüft, sondern der
// ganze Ort (Baustelle, Lager, Spielplatz) — wie in den Apps (mobile/src/screens/…DetailScreen → InspectionScreen).
//   Orte  Startseite: die aktiven Orte mit Fälligkeit, Sperre und offenen Mängeln. Antippen → Ort.
//   Ort   ein Ort: Fälligkeit, großer Knopf „… dokumentieren“, darunter seine Einheiten (zur Übersicht — die
//         betroffene Einheit wird erst im Mangel/Schaden gewählt).
// Die Einheiten-Apps (LeiterDex, FeuerDex, ToreDex, GurtDex) nutzen stattdessen Standorte.tsx / Standort.tsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ClipboardCheck, Search, Smartphone, TriangleAlert } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import type { OpenDefect } from '../backend';
import { countWord, defectsPathOf, dueFkOf, kindOf, sitesPathOf, wordsOf, type PruefConfig } from '../config';
import { usePruef, usePendingSync } from '../context';
import { loadPruefData, withPendingMeta } from '../data';
import { STATE_ORDER, dueInfo, dueLine, lastDueByUnit, unitState, type DueInfo, type InspMeta, type UnitState } from '../due';
import { listDrafts, type Draft, type Pending } from '../store';
import { Wartend } from './Wartend';

const BADGE: Record<UnitState, { cls: string; label: string }> = {
  blocked: { cls: 'badge red', label: 'Gesperrt' },
  overdue: { cls: 'badge red', label: 'Fällig' },
  never: { cls: 'badge amber', label: 'Noch nie geprüft' },
  soon: { cls: 'badge amber', label: 'Bald fällig' },
  ok: { cls: 'badge green', label: 'Geprüft' },
};

/** Zeile der zweiten Frist, z. B. „Operative Kontrolle: Fällig in 5 Tagen (24.11.2026)“. */
function extraLine(label: string, info: DueInfo): string {
  return `${label}: ${info.state === 'never' ? 'noch nie — jetzt fällig' : dueLine(info, label)}`;
}

/** Gemeinsames Laden beider Seiten: Daten, Entwürfe, Wartendes — und Auffrischen nach dem Nachsenden. */
function useOrtsDaten() {
  const { be, cfg, userId } = usePruef();
  const state = useAsync(() => loadPruefData(be, cfg.appId, userId), [be, cfg.appId, userId]);
  useLiveRefresh([state.refresh], 60000);
  const sync = usePendingSync();
  const [drafts, setDrafts] = useState<Draft[]>([]);

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
  const pendingCount = sync.pending.length;
  const lastCount = useRef(0);
  useEffect(() => {
    const fewer = pendingCount < lastCount.current;
    lastCount.current = pendingCount;
    if (fewer) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  // Im Orts-Modus steht in Entwurf und Prüfung die ID des Orts
  const draftSites = useMemo(() => new Set(drafts.map((d) => d.siteId)), [drafts]);
  const waitingSites = useMemo(
    () => new Set(sync.pending.map((p) => String(p.inspection[dueFkOf(cfg)]))),
    [sync.pending, cfg],
  );
  return { state, ...sync, draftSites, waitingSites };
}

/** Fälligkeit und Sperre je Ort — dieselbe Rechnung für Liste und Einzelseite. */
function ortsStand(cfg: PruefConfig, meta: InspMeta[], pending: Pending[], openDefects: OpenDefect[], intervalDays: number) {
  const all = withPendingMeta(meta, pending, dueFkOf(cfg));
  const last = lastDueByUnit(all, cfg.dueKind);
  const lastExtra = cfg.extraDue ? lastDueByUnit(all, cfg.extraDue.kinds) : null;
  // Ein Ort mit offenem Sperr-Mangel (mit oder ohne Einheit) darf nicht grün „geprüft“ zeigen — wie in der App.
  const blockedSites = new Set(openDefects.filter((d) => d.blocked).map((d) => d.siteId));
  const openBySite = new Map<string, number>();
  for (const d of openDefects) openBySite.set(d.siteId, (openBySite.get(d.siteId) ?? 0) + 1);
  return {
    openBySite,
    of(siteId: string) {
      const info = dueInfo(last.get(siteId), intervalDays, cfg.dueSoonDays);
      const st = unitState(info, blockedSites.has(siteId));
      const extra =
        cfg.extraDue && lastExtra ? dueInfo(lastExtra.get(siteId), cfg.extraDue.intervalDays, cfg.extraDue.soonDays) : null;
      return { info, st, extra };
    },
  };
}

export function Orte() {
  const { cfg, base, owner, intervalDays } = usePruef();
  const { state, pending, sending, sendNow, draftSites, waitingSites } = useOrtsDaten();
  const [query, setQuery] = useState('');
  const U = cfg.labels.unit;
  const S = cfg.labels.site;
  const W = wordsOf(cfg);
  const dueShort = kindOf(cfg, cfg.dueKind).short;

  return (
    <div className="ez">
      <h1>{S.many}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {S.one} antippen, {W.insp.one} dokumentieren — mit Uhrzeit, Ort und Fotos.
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
                    Lege zuerst unter <Link to={`${base}/${sitesPathOf(cfg)}`}>{S.many} verwalten</Link> {S.many} und {U.many} an
                    — danach kannst du hier dokumentieren.
                  </>
                ) : (
                  <>Bitte den Inhaber bitten, {S.many} und {U.many} anzulegen.</>
                )}
              </div>
            );
          }
          const stand = ortsStand(cfg, meta, pending, openDefects, intervalDays);
          const unitCount = new Map<string, number>();
          for (const u of units) if (!u.retired) unitCount.set(u.siteId, (unitCount.get(u.siteId) ?? 0) + 1);
          const q = query.trim().toLowerCase();
          const shown = active
            .filter((s) => !q || `${s.name} ${s.address}`.toLowerCase().includes(q))
            .map((s) => ({ s, ...stand.of(s.id) }))
            .sort((a, b) => STATE_ORDER[a.st] - STATE_ORDER[b.st] || a.s.name.localeCompare(b.s.name, 'de', { numeric: true }));

          return (
            <>
              {offline && (
                <div className="info-box">
                  Keine Verbindung — Stand vom letzten Laden. Dokumentieren geht trotzdem, gesendet wird später.
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
                  {shown.map(({ s, info, st, extra }) => {
                    const n = unitCount.get(s.id) ?? 0;
                    const open = stand.openBySite.get(s.id) ?? 0;
                    return (
                      <li key={s.id}>
                        <Link to={`${base}/ort/${s.id}`} className="ez-prop">
                          <span className="ez-prop-text">
                            <b>{s.name}</b>
                            <span className="muted">{s.address}</span>
                            <span className={st === 'blocked' || st === 'overdue' ? 'pv-bad' : 'muted'}>
                              {st === 'blocked'
                                ? `Gesperrt — offener ${W.defect.one} mit Sperre, erst nach der Behebung wieder freigeben`
                                : dueLine(info, dueShort)}
                            </span>
                            {extra && cfg.extraDue && st !== 'blocked' && extra.state !== 'ok' && (
                              <span className={extra.state === 'soon' ? 'muted' : 'pv-bad'}>
                                {extraLine(cfg.extraDue.label, extra)}
                              </span>
                            )}
                            <span className="muted">
                              {n > 0 ? countWord(n, U) : `Noch keine ${U.many}`}
                              {open > 0 ? ` · ${open} ${open === 1 ? `offener ${W.defect.one}` : `offene ${W.defect.many}`}` : ''}
                            </span>
                          </span>
                          <span className="ez-prop-side">
                            {draftSites.has(s.id) && <span className="badge amber">Angefangen</span>}
                            {waitingSites.has(s.id) && <span className="badge amber">Wartet auf Netz</span>}
                            <span className={BADGE[st].cls}>{BADGE[st].label}</span>
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

export function Ort() {
  const { id } = useParams();
  const { cfg, base, owner, intervalDays } = usePruef();
  const { state, pending, sending, sendNow, draftSites, waitingSites } = useOrtsDaten();
  const U = cfg.labels.unit;
  const S = cfg.labels.site;
  const W = wordsOf(cfg);
  const D = W.defect;
  const dueShort = kindOf(cfg, cfg.dueKind).short;

  return (
    <div className="ez">
      <Link to={base} className="ez-back">
        <ArrowLeft className="i" aria-hidden /> {S.many}
      </Link>
      <LoadGuard state={state}>
        {({ sites, units, meta, openDefects, offline }) => {
          const site = sites.find((s) => s.id === id);
          if (!site) return <div className="error-box">{S.one} nicht gefunden — gelöscht oder aus einem anderen Betrieb?</div>;
          const { info, st, extra } = ortsStand(cfg, meta, pending, openDefects, intervalDays).of(site.id);
          const hereDefects = openDefects.filter((d) => d.siteId === site.id);
          const general = hereDefects.filter((d) => !d.unitId);
          const openCount = new Map<string, number>();
          const blockedUnits = new Set<string>();
          for (const d of hereDefects) {
            if (!d.unitId) continue;
            openCount.set(d.unitId, (openCount.get(d.unitId) ?? 0) + 1);
            if (d.blocked) blockedUnits.add(d.unitId);
          }
          const here = units
            .filter((u) => u.siteId === site.id && !u.retired)
            .sort(
              (a, b) =>
                Number(blockedUnits.has(b.id)) - Number(blockedUnits.has(a.id)) ||
                (openCount.get(b.id) ?? 0) - (openCount.get(a.id) ?? 0) ||
                a.name.localeCompare(b.name, 'de', { numeric: true }),
            );
          const draft = draftSites.has(site.id);

          return (
            <>
              <h1>{site.name}</h1>
              <p className="muted" style={{ marginTop: -6 }}>
                {site.address}
              </p>

              <Wartend pending={pending} sending={sending} sendNow={sendNow} />

              {offline && (
                <div className="info-box">
                  Keine Verbindung — Stand vom letzten Laden. Dokumentieren geht trotzdem, gesendet wird später.
                </div>
              )}

              {!site.active ? (
                <div className="info-box">
                  „{site.name}“ ist nicht mehr aktiv — hier lässt sich keine {W.insp.one} dokumentieren.
                  {owner && (
                    <>
                      {' '}
                      <Link to={`${base}/${sitesPathOf(cfg)}`}>{S.many} verwalten</Link>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="card pv-unit" data-testid="ort-stand">
                    <span>
                      <span className={BADGE[st].cls}>{BADGE[st].label}</span>
                      {waitingSites.has(site.id) && (
                        <>
                          {' '}
                          <span className="badge amber">Wartet auf Netz</span>
                        </>
                      )}
                    </span>
                    <span className={st === 'blocked' || st === 'overdue' ? 'pv-bad' : 'muted'}>{dueLine(info, dueShort)}</span>
                    {extra && cfg.extraDue && (
                      <span className={extra.state === 'overdue' || extra.state === 'never' ? 'pv-bad' : 'muted'}>
                        {extraLine(cfg.extraDue.label, extra)}
                      </span>
                    )}
                  </div>
                  {st === 'blocked' && (
                    <div className="info-box pv-blocked">
                      <TriangleAlert className="i" aria-hidden /> Gesperrt: Hier gibt es einen offenen {D.one} mit Sperre. Erst
                      nach der Behebung wieder freigeben.
                    </div>
                  )}

                  <Link to={`${base}/pruefen/${site.id}`} className="btn ez-save" data-testid="ort-pruefen" style={{ marginTop: 14 }}>
                    <ClipboardCheck className="i" aria-hidden />{' '}
                    {draft ? `Angefangene ${W.insp.one} fortsetzen` : `${W.insp.one} dokumentieren`}
                  </Link>
                  <p className="muted small">
                    Die {W.insp.one} gilt für {here.length > 0 ? `alle ${U.many} hier` : 'den ganzen Ort'}. Fällt dir etwas auf,
                    erfasst du dabei einen {D.one} und gibst an, was betroffen ist
                    {here.length > 0 ? ` (${U.one} oder „${cfg.labels.general ?? `${S.one} allgemein`}“)` : ''}.
                  </p>
                </>
              )}

              <h2 className="ez-section">
                {U.many} <span className="muted">({here.length})</span>
              </h2>
              {here.length === 0 ? (
                <div className="card empty">
                  Hier sind noch keine {U.many} erfasst. Dokumentieren geht trotzdem — ein {D.one} lässt sich dann nur „
                  {cfg.labels.general ?? `${S.one} allgemein`}“ zuordnen.{' '}
                  {owner ? (
                    <Link to={`${base}/${sitesPathOf(cfg)}/${site.id}`}>{U.one} anlegen</Link>
                  ) : (
                    <>Bitte den Inhaber bitten, die {U.many} anzulegen.</>
                  )}
                </div>
              ) : (
                <ul className="ez-list">
                  {here.map((u) => {
                    const open = openCount.get(u.id) ?? 0;
                    const blocked = blockedUnits.has(u.id);
                    return (
                      <li key={u.id}>
                        <div className="ez-prop">
                          <span className="ez-prop-text">
                            <b>{u.name}</b>
                            {u.info && <span className="muted">{u.info}</span>}
                            {blocked && <span className="pv-bad">Offener {D.one} mit Sperre — erst nach der Behebung wieder freigeben</span>}
                          </span>
                          <span className="ez-prop-side">
                            {blocked && <span className="badge red">Gesperrt</span>}
                            {open > 0 && (
                              <span className={`badge ${blocked ? 'red' : 'amber'}`}>
                                {open} {open === 1 ? `offener ${D.one}` : `offene ${D.many}`}
                              </span>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {general.length > 0 && (
                <p className={general.some((d) => d.blocked) ? 'pv-bad' : 'muted'} style={{ marginTop: 12 }}>
                  {cfg.labels.general ?? `${S.one} allgemein`}: {general.length}{' '}
                  {general.length === 1 ? `offener ${D.one}` : `offene ${D.many}`}
                  {general.some((d) => d.blocked) ? ' — mit Sperre' : ''}
                </p>
              )}
              <p className="small" style={{ marginTop: 16 }}>
                {hereDefects.length > 0 && (
                  <>
                    <Link to={`${base}/${defectsPathOf(cfg)}`}>Offene {D.many} ansehen</Link>
                    {owner ? ' · ' : ''}
                  </>
                )}
                {owner && <Link to={`${base}/${sitesPathOf(cfg)}/${site.id}`}>{U.many} verwalten (anlegen, bearbeiten)</Link>}
              </p>
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}
