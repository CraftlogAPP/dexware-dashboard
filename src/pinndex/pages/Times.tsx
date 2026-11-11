// PinnDex — Zeiten: Summe je Monteur für Woche/Monat, aufklappbar je Auftrag, Export CSV und druckbares PDF.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { downloadCsv, toCsv } from '../../installateurdex/csv';
import { openReportWindow } from '../../lib/print';
import { usePinn } from '../context';
import { useJobSheet } from '../JobSheet';
import { dayKey, dayShort, decimalHours, fmtWork, hhmm, isMine, parseDay, periodRange, timesByWorker, workDay, workSecondsNow, type Period } from '../logic';
import { Segmented, useNow } from '../parts';
import { buildTimesHtml } from '../timesPrint';
import { OUTCOME_LABEL, STATUS_LABEL } from '../types';

export function Times() {
  const { data, members, org, role, me, version } = usePinn();
  const sheet = useJobSheet();
  const [kind, setKind] = useState<Period>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const { from, to, label } = periodRange(kind, anchor);
  const [open, setOpen] = useState<string | null>(null);

  const state = useAsync(async () => {
    const jobs = await data.timeJobs(from, to);
    const ids = jobs.map((j) => j.id);
    // Korrekturen (für das *) + letzter Start nur für laufende Zeilen ohne running_since
    const noSince = jobs.filter((j) => j.status === 'running' && !j.running_since).map((j) => j.id);
    const [fixes, starts] = await Promise.all([data.eventsOf(ids, ['time_fix']), data.eventsOf(noSince, ['start', 'resume'])]);
    const ev = [...fixes, ...starts];
    const since: Record<string, string> = {};
    const fixed = new Set<string>();
    for (const e of ev) {
      if (e.kind === 'time_fix') fixed.add(e.job_id);
      else since[e.job_id] = e.at;
    }
    return { jobs, since, fixed };
  }, [data, from.getTime(), to.getTime()]);
  const first = useRef(version);
  useEffect(() => {
    if (version !== first.current) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useLiveRefresh([state.refresh], 60000);

  const jobs = useMemo(() => (state.data?.jobs ?? []).filter((j) => role !== 'worker' || isMine(j, me.user_id)), [state.data, role, me.user_id]);
  const running = jobs.some((j) => j.status === 'running');
  const now = useNow(running, 30000);
  const since = useMemo(() => state.data?.since ?? {}, [state.data]);
  const fixed = useMemo(() => state.data?.fixed ?? new Set<string>(), [state.data]);
  const rows = useMemo(() => timesByWorker(jobs, members, fixed, since, now), [jobs, members, fixed, since, now]);
  const total = rows.reduce((s, r) => s + r.seconds, 0);
  const done = rows.reduce((s, r) => s + r.done, 0);
  const secondsOf = (j: (typeof jobs)[number]) => workSecondsNow(j, since[j.id], now);

  const step = (n: number) => setAnchor((a) => (kind === 'week' ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)));

  function exportCsv() {
    const header = ['Monteur', 'Tag', 'Auftrag', 'Kunde', 'Adresse', 'Start', 'Fertig', 'Stand', 'Arbeitszeit (h:mm)', 'Stunden (dezimal)', 'Korrigiert'];
    const lines = rows.flatMap((r) =>
      r.jobs.map((j) => {
        const sec = secondsOf(j);
        const day = workDay(j);
        return [
          r.name,
          day ? dayShort(parseDay(day)) + parseDay(day).getFullYear() : '',
          j.title,
          j.customer_name ?? '',
          j.address ?? '',
          j.started_at ? hhmm(j.started_at) : '',
          j.finished_at ? hhmm(j.finished_at) : '',
          j.status === 'done' ? (j.outcome && j.outcome !== 'ok' ? OUTCOME_LABEL[j.outcome] : 'erledigt') : STATUS_LABEL[j.status],
          fmtWork(sec),
          decimalHours(sec),
          fixed.has(j.id) ? 'ja' : '',
        ];
      }),
    );
    const name = `Laufzettel-Zeiten-${kind === 'week' ? 'Woche' : 'Monat'}-${dayKey(from)}.csv`;
    downloadCsv(name, toCsv(header, lines));
  }

  function printPdf() {
    const ok = openReportWindow(buildTimesHtml({ orgName: org.name, periodLabel: label, rows, fixedIds: fixed, secondsOf }));
    if (!ok) window.alert('Das Druckfenster wurde blockiert. Bitte Pop-ups für dieses Dashboard erlauben und erneut versuchen.');
  }

  return (
    <>
      <h1>Zeiten</h1>
      <div className="pinn-toolbar">
        <Segmented<Period>
          label="Zeitraum"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'week', label: 'Woche' },
            { value: 'month', label: 'Monat' },
          ]}
        />
        <div className="pinn-datenav">
          <button type="button" className="btn ghost small" onClick={() => step(-1)} aria-label="Zurück">
            <ChevronLeft className="i" aria-hidden />
          </button>
          <button type="button" className="btn ghost small" onClick={() => setAnchor(new Date())}>
            Aktuell
          </button>
          <button type="button" className="btn ghost small" onClick={() => step(1)} aria-label="Weiter">
            <ChevronRight className="i" aria-hidden />
          </button>
          <span className="pinn-datelabel">{label}</span>
        </div>
        <div className="spacer" />
        <div className="row pinn-export">
          <button type="button" className="btn ghost small" onClick={exportCsv} disabled={!rows.length}>
            <Download className="i" aria-hidden /> CSV
          </button>
          <button type="button" className="btn ghost small" onClick={printPdf} disabled={!rows.length}>
            <Printer className="i" aria-hidden /> PDF / Drucken
          </button>
        </div>
      </div>

      <LoadGuard state={state}>
        {() => (
          <>
            <div className="kpi-grid pinn-kpis">
              <div className="kpi card">
                <div className="kpi-label">Arbeitszeit gesamt</div>
                <div className="kpi-value">{fmtWork(total)}</div>
                <div className="kpi-sub">{decimalHours(total)} Stunden</div>
              </div>
              <div className="kpi card">
                <div className="kpi-label">Aufträge erledigt</div>
                <div className="kpi-value">{done}</div>
                <div className="kpi-sub">{jobs.length - done} laufend/pausiert</div>
              </div>
              <div className="kpi card">
                <div className="kpi-label">Ø je Auftrag</div>
                <div className="kpi-value">{done ? fmtWork(rows.reduce((s, r) => s + r.jobs.filter((j) => j.status === 'done').reduce((a, j) => a + j.work_seconds, 0), 0) / done) : '—'}</div>
                <div className="kpi-sub">nur erledigte</div>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="empty">In diesem Zeitraum wurde keine Arbeitszeit erfasst.</div>
            ) : (
              <div className="table-wrap pinn-table">
                <table>
                  <thead>
                    <tr>
                      <th>Monteur</th>
                      <th className="num">Aufträge</th>
                      <th className="num">Arbeitszeit</th>
                      <th className="num">Stunden</th>
                      <th className="num hide-sm">korrigiert</th>
                      <th aria-label="Aufklappen" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const key = r.userId ?? 'none';
                      const isOpen = open === key;
                      return (
                        <Fragment key={key}>
                          <tr className="pinn-row" tabIndex={0} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : key)}>
                            <td>
                              <b>{r.name}</b>
                            </td>
                            <td className="num">{r.jobs.length}</td>
                            <td className="num">
                              <b>{fmtWork(r.seconds)}</b>
                            </td>
                            <td className="num">{decimalHours(r.seconds)}</td>
                            <td className="num hide-sm">{r.fixed || '—'}</td>
                            <td className="num">
                              <ChevronDown className={`i pinn-chev${isOpen ? ' open' : ''}`} aria-hidden />
                            </td>
                          </tr>
                          {isOpen &&
                            r.jobs.map((j) => {
                              const day = workDay(j);
                              return (
                                <tr key={j.id} className="pinn-subrow" onClick={() => sheet.openJob(j.id)}>
                                  <td className="wrap">
                                    <span className="muted">{day ? dayShort(parseDay(day)) : '—'}</span> {j.title}
                                    {fixed.has(j.id) && <span className="pinn-star" title="vom Chef korrigiert"> *</span>}
                                    {j.customer_name && <div className="muted small">{j.customer_name}</div>}
                                  </td>
                                  <td className="num muted">{j.status === 'done' ? 'erledigt' : STATUS_LABEL[j.status]}</td>
                                  <td className="num">{fmtWork(secondsOf(j))}</td>
                                  <td className="num">{decimalHours(secondsOf(j))}</td>
                                  <td className="num hide-sm" />
                                  <td />
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small pinn-foot">
              Gezählt wird beim zugewiesenen Monteur, Tag = Fertigmeldung (laufende: Start). Helfer bekommen die Zeit nicht doppelt. * = vom Chef korrigiert.
            </p>
          </>
        )}
      </LoadGuard>
    </>
  );
}
