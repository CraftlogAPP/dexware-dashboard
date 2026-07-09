import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { deleteInspection, fetchDevice, fetchInspectionWithPhotos } from '../api';
import { InspectionDialog } from '../dialogs';
import { ResultBadge } from '../badges';
import { evaluateMeasurement, skLabel, type MeasureEval } from '../labels';
import {
  MEASUREMENTS,
  VISUAL_CHECKS,
  type Device,
  type InspectionWithPhotos,
} from '../types';

interface Data {
  inspection: InspectionWithPhotos;
  device: Device | null;
}

const EVAL_BADGE: Record<MeasureEval, { className: string; label: string } | null> = {
  ok: { className: 'badge green', label: 'im Grenzwert' },
  fail: { className: 'badge red', label: 'Grenzwert überschritten' },
  na: { className: 'badge', label: 'nicht erforderlich' },
  none: null,
};

export function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const state = useAsync<Data>(async () => {
    const inspection = await fetchInspectionWithPhotos(client, id!);
    const device = await fetchDevice(client, inspection.device_id);
    return { inspection, device };
  }, [client, id]);

  async function onDelete(i: InspectionWithPhotos) {
    if (
      !window.confirm(
        `Prüfung vom ${fmtDate(i.inspected_at)} wirklich löschen? Die Prüffrist des Geräts wird aus der neuesten verbleibenden Prüfung neu berechnet.`,
      )
    )
      return;
    try {
      const warning = await deleteInspection(client, i.id, i.device_id);
      if (warning) alert(warning);
      // Datensatz ist weg — zurück zur Prüfungsliste.
      navigate('../pruefungen');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <LoadGuard state={state}>
      {({ inspection: i, device }) => {
        const sk = device?.protection_class ?? null;
        const visualEntries = VISUAL_CHECKS.filter(
          (c) => i.visual_checks[c.key] !== undefined,
        );
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../pruefungen">← Alle Prüfungen</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>
                DGUV-V3-Prüfung · {fmtDate(i.inspected_at)}
              </h1>
              <ResultBadge result={i.result} />
            </div>
            <p className="muted">
              {device ? (
                <Link to={`../geraete/${device.id}`}>{device.name}</Link>
              ) : (
                'Gerät unbekannt'
              )}
              {device
                ? ` · ${skLabel(device.protection_class)}${
                    device.qr_code ? ` · ${device.qr_code}` : ''
                  }`
                : ''}
            </p>

            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <button className="btn ghost small" onClick={() => setEditing(true)}>
                Bearbeiten
              </button>
              <button className="btn ghost small" onClick={() => onDelete(i)}>
                Löschen
              </button>
            </div>

            {editing && org && (
              <InspectionDialog
                client={client}
                orgId={org.org.id}
                devices={device ? [device] : []}
                inspection={i}
                onClose={() => setEditing(false)}
                onSaved={(warning) => {
                  state.reload();
                  if (warning) alert(warning);
                }}
              />
            )}

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Geprüft von</div>
                <div>{i.inspector_name ?? '—'}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Nächste Fälligkeit</div>
                <div>{i.next_due_date ? fmtDate(i.next_due_date) : '—'}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Gerätetyp</div>
                <div>{device?.device_type ?? '—'}</div>
                <div className="muted small">{device?.manufacturer ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Standort</div>
                <div className="small">{device?.location_note ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Sichtprüfung</h2>
            </div>
            {visualEntries.length === 0 ? (
              <div className="card empty">Keine Sichtprüfungs-Punkte erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prüfpunkt</th>
                      <th>Ergebnis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visualEntries.map((c) => (
                      <tr key={c.key}>
                        <td className="wrap">{c.label}</td>
                        <td>
                          {i.visual_checks[c.key] ? (
                            <span className="badge green">OK</span>
                          ) : (
                            <span className="badge red">Mangel</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="section-head">
              <h2>Messwerte (VDE 0701-0702)</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Messung</th>
                    <th>Wert</th>
                    <th>Bewertung</th>
                    <th>Grenzwert</th>
                  </tr>
                </thead>
                <tbody>
                  {MEASUREMENTS.map((m) => {
                    const raw = i.measurements[m.key];
                    const ev = evaluateMeasurement(m.key, raw, sk);
                    const badge = EVAL_BADGE[ev];
                    return (
                      <tr key={m.key}>
                        <td className="wrap">{m.label}</td>
                        <td className="mono">{raw ? `${raw} ${m.unit}` : '—'}</td>
                        <td>
                          {badge ? (
                            <span className={badge.className}>{badge.label}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="muted small wrap">{m.hint}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {i.notes && (
              <>
                <div className="section-head">
                  <h2>Notizen</h2>
                </div>
                <div className="card">{i.notes}</div>
              </>
            )}

            <div className="section-head">
              <h2>Fotos ({i.photo_urls.length})</h2>
            </div>
            {i.photo_urls.length === 0 ? (
              <div className="card empty">Keine Fotos zu dieser Prüfung.</div>
            ) : (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {i.photo_urls.map((src, n) => (
                  <a key={n} href={src} target="_blank" rel="noreferrer">
                    <img
                      src={src}
                      alt={`Foto ${n + 1}`}
                      style={{
                        width: 220,
                        maxWidth: '100%',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
