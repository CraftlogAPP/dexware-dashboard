// Übersichtsseite der Prüf-Apps: Tabelle „Fällige Prüfungen“ — überfällig, noch nie geprüft und bald fällig, das
// Dringendste zuerst. Rechnung in lib/pruefExport.ts → dueOverview (dieselbe wie Excel-Prüfbuch und „Vor Ort“),
// Zeilentext wie „Vor Ort“ (due.ts → dueLine).
import { Link } from 'react-router-dom';
import type { DueOverview } from '../lib/pruefExport';
import { dueLine, type DueInfo } from './due';

function DueCell({ info, short }: { info: DueInfo; short: string }) {
  const badge =
    info.state === 'ok'
      ? null
      : info.state === 'soon'
        ? { cls: 'badge amber', text: 'bald fällig' }
        : { cls: 'badge red', text: info.state === 'overdue' && info.daysLeft !== 0 ? 'überfällig' : 'fällig' };
  return (
    <>
      {dueLine(info, short)} {badge && <span className={badge.cls}>{badge.text}</span>}
    </>
  );
}

export function FaelligTabelle<U>({ due, limit = 8 }: { due: DueOverview<U>; limit?: number }) {
  const rows = due.list.slice(0, limit);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{due.nameHeader}</th>
              <th>{due.placeHeader}</th>
              <th>{due.mainTitle}</th>
              {due.secondTitle && <th>{due.secondTitle}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`${due.sitesPath}/${r.siteId}`}>{r.name}</Link>
                </td>
                <td className="wrap muted">{r.place ?? '—'}</td>
                <td className="wrap">
                  <DueCell info={r.stand.main} short={due.mainShort} />
                </td>
                {due.secondTitle && (
                  <td className="wrap">
                    {r.stand.second ? <DueCell info={r.stand.second} short={due.secondShort ?? ''} /> : <span className="muted">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {due.list.length > limit && (
        <p className="muted small">
          … und {due.list.length - limit} weitere — vollständig im Knopf „{due.bookLabel}“ unter{' '}
          <Link to={due.sitesPath}>{due.sitesLabel}</Link>.
        </p>
      )}
    </>
  );
}
