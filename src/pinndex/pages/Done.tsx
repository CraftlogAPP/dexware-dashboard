// PinnDex — Erledigt: Liste mit Filtern (Zeitraum, Monteur, Kunde, Suche); Klick öffnet die Karte mit Verlauf, Fotos, Zeit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Search } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { ExcelButton } from '../../components/ExcelButton';
import { downloadXlsx } from '../../lib/xlsx';
import { usePinn } from '../context';
import { checkPeriod, EXPORT_TZ, jobSheets, periodLabel, type ExportPeriod } from '../exportLists';
import { useJobSheet } from '../JobSheet';
import { addDays, dayKey, fmtWork, isMine, matchesSearch, memberName, monthStart, parseDay, stamp, startOfDay, weekStart } from '../logic';
import { StatusChip } from '../parts';
import { OUTCOME_LABEL, type ExportJob } from '../types';

type Range = 'today' | 'week' | 'lastweek' | 'month' | 'lastmonth' | '90' | 'custom';

const RANGES: [Range, string][] = [
  ['today', 'Heute'],
  ['week', 'Diese Woche'],
  ['lastweek', 'Letzte Woche'],
  ['month', 'Dieser Monat'],
  ['lastmonth', 'Letzter Monat'],
  ['90', 'Letzte 90 Tage'],
  ['custom', 'Eigener Zeitraum'],
];

function rangeOf(r: Range, fromInput: string, toInput: string): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  switch (r) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'week':
      return { from: weekStart(today), to: addDays(weekStart(today), 7) };
    case 'lastweek':
      return { from: addDays(weekStart(today), -7), to: weekStart(today) };
    case 'month':
      return { from: monthStart(today), to: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
    case 'lastmonth':
      return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: monthStart(today) };
    case '90':
      return { from: addDays(today, -89), to: addDays(today, 1) };
    case 'custom': {
      const f = fromInput ? parseDay(fromInput) : addDays(today, -29);
      const t = toInput ? addDays(parseDay(toInput), 1) : addDays(today, 1);
      return t > f ? { from: f, to: t } : { from: f, to: addDays(f, 1) };
    }
  }
}

export function Done() {
  const { data, members, org, role, me, version } = usePinn();
  const sheet = useJobSheet();
  const [range, setRange] = useState<Range>('week');
  const [fromInput, setFromInput] = useState(() => dayKey(addDays(new Date(), -29)));
  const [toInput, setToInput] = useState(() => dayKey(new Date()));
  const [worker, setWorker] = useState('');
  const [customer, setCustomer] = useState('');
  const [q, setQ] = useState('');
  const [withCanceled, setWithCanceled] = useState(false);
  const { from, to } = rangeOf(range, fromInput, toInput);

  const state = useAsync(() => data.doneJobs(from, to, withCanceled), [data, from.getTime(), to.getTime(), withCanceled]);
  const first = useRef(version);
  useEffect(() => {
    if (version !== first.current) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const all = useMemo(() => (state.data ?? []).filter((j) => role !== 'worker' || isMine(j, me.user_id)), [state.data, role, me.user_id]);
  const customerNames = useMemo(() => [...new Set(all.map((j) => j.customer_name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'de')), [all]);
  /** Filter der Liste (Monteur, Kunde, Suche) — gilt genauso für die Excel-Liste. */
  const shown = (j: ExportJob) =>
    (!worker || (worker === 'none' ? !j.assignee_id : j.assignee_id === worker)) && (!customer || j.customer_name === customer) && matchesSearch(j, q);
  const rows = all.filter(shown);
  const total = rows.reduce((s, j) => s + (j.status === 'done' ? j.work_seconds : 0), 0);

  /** Excel „Aufträge zum Abrechnen“: was die Liste mit diesen Filtern zeigt, vollständig frisch geladen (im Beispiel-Modus aus den Beispieldaten). */
  async function exportExcel() {
    const period: ExportPeriod = range === 'custom' ? checkPeriod(fromInput, toInput) : { from: dayKey(from), to: dayKey(addDays(to, -1)) };
    const list = (await data.exportJobs(parseDay(period.from), addDays(parseDay(period.to), 1), withCanceled)).filter(
      (j) => (role !== 'worker' || isMine(j, me.user_id)) && shown(j),
    );
    const fixes = await data.eventsOf(
      list.filter((j) => j.status === 'done').map((j) => j.id),
      ['time_fix'],
    );
    const selection: [string, string][] = [
      ['Monteur', role === 'worker' ? `Eigene Aufträge (${memberName(me)})` : !worker ? 'Alle' : worker === 'none' ? 'Nicht zugewiesen' : memberName(byId.get(worker))],
      ['Kunde', customer || 'Alle'],
      ...(q.trim() ? [['Suche', `„${q.trim()}“`] as [string, string]] : []),
    ];
    const sheets = jobSheets({ orgName: org.name, members, jobs: list, fixedIds: new Set(fixes.map((e) => e.job_id)), period, withCanceled, selection });
    await downloadXlsx(`Laufzettel_Auftraege_${period.from}_bis_${period.to}`, sheets, {
      title: `Laufzettel Aufträge ${periodLabel(period)}`,
      creator: 'Laufzettel',
      timeZone: EXPORT_TZ,
    });
  }

  return (
    <>
      <h1>Erledigt</h1>
      <div className="filter-bar pinn-filter">
        <label className="field">
          Zeitraum
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            {RANGES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label className="field">
              von
              <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
            </label>
            <label className="field">
              bis
              <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
            </label>
          </>
        )}
        {role !== 'worker' && (
          <label className="field">
            Monteur
            <select value={worker} onChange={(e) => setWorker(e.target.value)}>
              <option value="">Alle</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberName(m)}
                  {m.active ? '' : ' (ausgeschieden)'}
                </option>
              ))}
              <option value="none">Nicht zugewiesen</option>
            </select>
          </label>
        )}
        <label className="field">
          Kunde
          <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">Alle</option>
            {customerNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field pinn-search">
          Suche
          <span className="pinn-search-box">
            <Search className="i" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titel, Adresse, Notiz …" />
          </span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={withCanceled} onChange={(e) => setWithCanceled(e.target.checked)} />
          Abgesagte zeigen
        </label>
        <ExcelButton
          onExport={exportExcel}
          title="Aufträge im gewählten Zeitraum als Excel-Datei: zum Abrechnen je Kunde und mit Stunden je Monteur"
        />
      </div>

      <LoadGuard state={state}>
        {() => (
          <>
            <p className="muted pinn-sum">
              <b>{rows.length}</b> {rows.length === 1 ? 'Auftrag' : 'Aufträge'} · Arbeitszeit <b>{fmtWork(total)}</b>
            </p>
            {rows.length === 0 ? (
              <div className="empty">Im gewählten Zeitraum ist nichts erledigt.</div>
            ) : (
              <div className="table-wrap pinn-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fertig</th>
                      <th>Auftrag</th>
                      <th>Kunde</th>
                      <th>Monteur</th>
                      <th className="num">Zeit</th>
                      <th>Ergebnis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((j) => (
                      <tr key={j.id} className="pinn-row" tabIndex={0} onClick={() => sheet.openJob(j.id)} onKeyDown={(e) => e.key === 'Enter' && sheet.openJob(j.id)}>
                        <td className="nowrap">{j.status === 'done' && j.finished_at ? stamp(j.finished_at) : stamp(j.updated_at)}</td>
                        <td className="wrap">
                          <b>{j.title}</b>
                          {(j.result_photos?.length ?? 0) > 0 && (
                            <span className="pinn-photocount" title="Fotos vom Monteur">
                              <Camera className="i" aria-hidden /> {j.result_photos!.length}
                            </span>
                          )}
                          {j.done_note && <div className="muted small pinn-clip">{j.done_note}</div>}
                        </td>
                        <td className="wrap">{j.customer_name ?? <span className="muted">—</span>}</td>
                        <td>{j.assignee_id ? memberName(byId.get(j.assignee_id)) : <span className="muted">—</span>}</td>
                        <td className="num">{j.status === 'done' ? fmtWork(j.work_seconds) : '—'}</td>
                        <td>
                          {j.status === 'canceled' ? (
                            <StatusChip status="canceled" />
                          ) : j.outcome && j.outcome !== 'ok' ? (
                            <span className={`badge ${j.outcome === 'problem' ? 'red' : 'amber'}`}>{OUTCOME_LABEL[j.outcome]}</span>
                          ) : (
                            <StatusChip status="done" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </LoadGuard>
    </>
  );
}
