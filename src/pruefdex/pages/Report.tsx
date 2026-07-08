import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { openReportWindow } from '../../lib/print';
import { fetchCustomers, fetchDevices, fetchInspectionMeta } from '../api';
import { lastInspectionByDevice } from '../labels';
import { buildReportHtml, type DeviceRow } from '../report';
import type { Customer } from '../types';

export function Report() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const [params] = useSearchParams();

  const custState = useAsync<Customer[]>(() => fetchCustomers(client), [client]);

  const [customerId, setCustomerId] = useState(params.get('kunde') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!orgCtx) return;
    const customer = custState.data?.find((c) => c.id === customerId) ?? null;
    setBusy(true);
    setError(null);
    try {
      const [devices, meta] = await Promise.all([
        fetchDevices(client, { customerId: customerId || undefined }),
        fetchInspectionMeta(client, { limit: 2000 }),
      ]);
      const lastByDevice = lastInspectionByDevice(meta);
      const rows: DeviceRow[] = devices.map((device) => {
        const last = lastByDevice.get(device.id);
        return {
          device,
          lastInspectedAt: last?.inspected_at ?? null,
          lastResult: last?.result ?? null,
        };
      });
      const html = buildReportHtml(orgCtx.org, customer, rows);
      if (!openReportWindow(html)) {
        setError(
          'Der Browser hat das Berichtsfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Prüflisten-PDF</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Geräteliste mit Prüfstatus je Kunde/Standort — QR-Kennzeichnung,
        Schutzklasse, letzte Prüfung und Fälligkeit auf einen Blick. Die
        prüffesten Einzelprotokolle je Prüfung erzeugt die App. Im Druckdialog
        „Als PDF speichern" wählen.
      </p>

      <LoadGuard state={custState}>
        {(customers) => (
          <div className="card" style={{ maxWidth: 560 }}>
            <label className="field">
              Kunde/Standort
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Alle Geräte des Betriebs</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {error && <div className="error-box">{error}</div>}
            <button className="btn" disabled={busy} onClick={() => void onGenerate()}>
              {busy ? 'Lade Geräte …' : '📄 Prüfliste erstellen'}
            </button>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
