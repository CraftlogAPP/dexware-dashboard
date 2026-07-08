import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchDrivers, fetchLicenseChecks } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { licenseDue } from '../due';
import type { Driver, LicenseCheck } from '../types';

export function DriverDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<{ driver: Driver | null; checks: LicenseCheck[] }>(
    async () => {
      const [drivers, checks] = await Promise.all([
        fetchDrivers(client),
        fetchLicenseChecks(client, { driverId: id }),
      ]);
      return { driver: drivers.find((d) => d.id === id) ?? null, checks };
    },
    [client, id],
  );

  return (
    <LoadGuard state={state}>
      {({ driver: d, checks }) => {
        if (!d) {
          return <div className="error-box">Fahrer nicht gefunden.</div>;
        }
        const due = licenseDue(d);

        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../fahrer">← Alle Fahrer</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{d.name}</h1>
              <span className="row" style={{ gap: 8 }}>
                {d.active ? (
                  <span className="badge green">aktiv</span>
                ) : (
                  <span className="badge">inaktiv</span>
                )}
                {d.active && <DueBadge status={due.status} />}
              </span>
            </div>
            <p className="muted">
              Führerscheinklassen: {d.license_classes ?? '—'}
            </p>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Kontroll-Intervall</div>
                <div>alle {d.check_interval_months} Monate</div>
              </div>
              <div className="card">
                <div className="kpi-label">Letzte Kontrolle</div>
                <div>{fmtDate(d.last_check)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Nächste Kontrolle</div>
                <div>{dueLabel(due)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Kontrollen</div>
                <div>{checks.length}</div>
                <div className="muted small">dokumentierte Nachweise</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Kontroll-Historie</h2>
            </div>
            {checks.length === 0 ? (
              <div className="card empty">
                Für diesen Fahrer sind noch keine Führerscheinkontrollen dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Kontrolliert von</th>
                      <th>Foto-Nachweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={c.id}>
                        <td className="muted">{fmtDate(c.date)}</td>
                        <td className="wrap">{c.checked_by}</td>
                        <td className="muted">
                          {/* photo_uri ist ein lokaler Pfad auf dem Kontroll-Gerät —
                              hier nur anzeigen, DASS ein Foto existiert. */}
                          {c.photo_uri ? '📷 auf dem Kontroll-Gerät' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
