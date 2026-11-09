// Eine Fahrt: Skizze, Server-Werte (Länge/Abdeckung/nicht befahren), Hinweise, Prüfcode prüfen,
// Nachweis als PDF, Storno mit Pflicht-Begründung.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { FormDialog, s, type FormValues } from '../../components/form';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import { VerifyProof } from '../../components/VerifyProof';
import { fmtDateTime } from '../../lib/format';
import { openReportWindow } from '../../lib/print';
import { gritLabel, weatherLabel } from '../labels';
import { CoverageBadge, RouteSketch } from '../RouteSketch';
import { buildRunHtml } from '../routeReport';
import { cancelRun, fetchRun, fmtDistance, fmtDuration, fmtTimeSpan, type Run } from '../routes';

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [canceling, setCanceling] = useState(false);
  const [printErr, setPrintErr] = useState<string | null>(null);
  const state = useAsync<Run>(() => fetchRun(client, id!), [client, id]);

  async function onCancel(v: FormValues) {
    await cancelRun(client, id!, s(v.reason));
    state.reload();
  }
  function print(run: Run) {
    setPrintErr(null);
    if (!org) return setPrintErr('Betrieb nicht geladen.');
    if (!openReportWindow(buildRunHtml(org.org, run)))
      setPrintErr('Das Druckfenster wurde blockiert — bitte Pop-ups für dieses Dashboard erlauben.');
  }

  return (
    <LoadGuard state={state}>
      {(run) => {
        const hasPlan = !!run.planned_path && run.planned_path.length >= 2;
        const missed = run.missed ?? [];
        const name = run.route_name ?? 'Freie Fahrt';
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              {run.route_id ? <Link to={`../strecken/${run.route_id}`}>← {name}</Link> : <Link to="../strecken">← Alle Strecken</Link>}
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>
                {name} · {fmtDateTime(run.started_at)}
              </h1>
              <ActionBadge action={run.action} canceled={run.canceled} />
            </div>
            <p className="muted">
              {fmtTimeSpan(run.started_at, run.ended_at)} · dokumentiert von {run.performer_name ?? '—'}
            </p>

            {run.canceled && (
              <div className="error-box">
                Storniert am {fmtDateTime(run.canceled_at)} — Begründung: {run.cancel_reason ?? '—'}
              </div>
            )}

            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Gefahren (GPS)</div>
                <div className="kpi-value">{fmtDistance(run.track_length_m)}</div>
                <div className="kpi-sub">vom Server berechnet</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Dauer</div>
                <div className="kpi-value">{fmtDuration(Date.parse(run.ended_at) - Date.parse(run.started_at))}</div>
                <div className="kpi-sub">
                  {fmtTimeSpan(run.started_at, run.ended_at)}
                </div>
              </div>
              {hasPlan && (
                <div className="kpi">
                  <div className="kpi-label">Abgedeckt</div>
                  <div className="kpi-value">
                    <CoverageBadge pct={run.coverage_pct} />
                  </div>
                  <div className="kpi-sub">Korridor 25 m um die Vorlage</div>
                </div>
              )}
              {hasPlan && (
                <div className="kpi">
                  <div className="kpi-label">Nicht befahren</div>
                  <div className="kpi-value">{fmtDistance(run.missed_m ?? 0)}</div>
                  <div className="kpi-sub">
                    {missed.length} {missed.length === 1 ? 'Abschnitt' : 'Abschnitte'}
                  </div>
                </div>
              )}
            </div>

            <RouteSketch plan={run.planned_path} track={run.track} missed={missed} label={`Kartenskizze der Fahrt ${name} vom ${fmtDateTime(run.started_at)}`} />

            {(run.gaps.length > 0 || run.gps_mocked) && (
              <div className="card" style={{ marginBottom: 16 }}>
                {run.gaps.length > 0 && (
                  <div className="gps-warn" style={{ color: '#B91C1C', fontWeight: 700 }}>
                    Pausen in der Aufzeichnung: {run.gaps.map(([a, b]) => fmtTimeSpan(a, b)).join(', ')} (Aufzeichnung unterbrochen —
                    nicht als gefahren gewertet)
                  </div>
                )}
                {run.gps_mocked && (
                  <div className="gps-warn" style={{ color: '#B91C1C', fontWeight: 700 }}>
                    Achtung: Das Gerät hat Fake-GPS gemeldet (Android).
                  </div>
                )}
              </div>
            )}

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Maßnahme</div>
                <div>{gritLabel(run.grit_material, run.grit_amount) === '—' ? '' : `Streumittel: ${gritLabel(run.grit_material, run.grit_amount)}`}</div>
                <div className="muted small">Wetter (archiviert): {weatherLabel(run.weather)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Prüffester Nachweis</div>
                {run.entry_hash ? (
                  <>
                    <div className="muted small">
                      Server-Eingang {fmtDateTime(run.received_at ?? run.created_at)} · Prüfcode{' '}
                      <span className="mono">{run.entry_hash.slice(0, 12)}</span>
                    </div>
                    <VerifyProof id={run.id} hash={run.entry_hash} rpc="verify_route_run" />
                  </>
                ) : (
                  <div className="muted small">Kein Prüfcode vorhanden.</div>
                )}
              </div>
            </div>

            {run.notes && (
              <>
                <div className="section-head">
                  <h2>Notiz</h2>
                </div>
                <div className="card">{run.notes}</div>
              </>
            )}

            {run.photo_urls.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Beweisfotos ({run.photo_urls.length})</h2>
                </div>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  {run.photo_urls.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer">
                      <img src={src} alt={`Beweisfoto ${i + 1}`} style={{ width: 220, maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
                    </a>
                  ))}
                </div>
              </>
            )}

            <div className="row" style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => print(run)}>
                <FileDown className="i" aria-hidden /> Nachweis als PDF
              </button>
              {!run.canceled && org?.role === 'owner' && (
                <button className="btn ghost" onClick={() => setCanceling(true)}>
                  Fahrt stornieren
                </button>
              )}
            </div>
            {printErr && <div className="error-box" style={{ marginTop: 10 }}>{printErr}</div>}

            {canceling && (
              <FormDialog
                title={`Fahrt stornieren — ${fmtDateTime(run.started_at)}`}
                submitLabel="Stornieren"
                onClose={() => setCanceling(false)}
                onSave={onCancel}
                fields={[
                  {
                    key: 'reason',
                    label: 'Storno-Grund',
                    kind: 'textarea',
                    required: true,
                    hint: 'Die Fahrt bleibt im Fahrtenbuch sichtbar und wird nur gekennzeichnet',
                  },
                ]}
              />
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
