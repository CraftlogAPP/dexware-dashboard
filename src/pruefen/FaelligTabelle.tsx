// Übersichtsseite der Prüf-Apps: Tabelle „Fällige Prüfungen“ — gesperrt, überfällig, noch nie geprüft und bald fällig,
// in dieser Reihenfolge wie „Vor Ort“ (due.ts → STATE_ORDER). Rechnung in lib/pruefExport.ts → dueOverview (dieselbe
// wie Excel-Prüfbuch und „Vor Ort“), Zeilentext wie „Vor Ort“ (due.ts → dueLine).
import { Link } from 'react-router-dom';
import type { DueOverview } from '../lib/pruefExport';
import { dueLine, type DueInfo } from './due';

/**
 * Fälligkeitstext mit Abzeichen. Gesperrt: rotes Abzeichen vorn (`lock` = „gesperrt“ bzw. die Warnung wie „Ablegereif“),
 * in weiteren Spalten nur der Text (`plain`) — das Datum bleibt sichtbar.
 */
function DueCell({ info, short, lock, plain = false }: { info: DueInfo; short: string; lock?: string; plain?: boolean }) {
  const badge = lock || plain
    ? null
    : info.state === 'ok'
      ? null
      : info.state === 'soon'
        ? { cls: 'badge amber', text: 'bald fällig' }
        : { cls: 'badge red', text: info.state === 'overdue' && info.daysLeft !== 0 ? 'überfällig' : 'fällig' };
  return (
    <>
      {lock && <span className="badge red">{lock}</span>} {dueLine(info, short)}{' '}
      {badge && <span className={badge.cls}>{badge.text}</span>}
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
            {rows.map((r) => {
              const blocked = r.state === 'blocked';
              return (
                <tr key={r.id}>
                  <td>
                    <Link to={`${due.sitesPath}/${r.siteId}`}>{r.name}</Link>
                  </td>
                  <td className="wrap muted">{r.place ?? '—'}</td>
                  <td className="wrap">
                    <DueCell info={r.stand.main} short={due.mainShort} lock={blocked ? (r.alert ?? 'gesperrt') : undefined} />
                  </td>
                  {due.secondTitle && (
                    <td className="wrap">
                      {r.stand.second ? (
                        // bei „gesperrt“ steht das Abzeichen schon vorn — hier nur der Text
                        <DueCell info={r.stand.second} short={due.secondShort ?? ''} plain={blocked} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
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
