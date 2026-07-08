import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, parseLocalDate, toInputDate } from '../../lib/format';
import { openReportWindow } from '../../lib/print';
import {
  fetchDamagesForReport,
  fetchInspectionsForReport,
  fetchRacks,
  fetchWarehouses,
} from '../api';
import { buildReportHtml } from '../report';
import type { Warehouse } from '../types';

export function Report() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const [params] = useSearchParams();

  const whsState = useAsync<Warehouse[]>(() => fetchWarehouses(client), [client]);

  const [warehouseId, setWarehouseId] = useState(params.get('lager') ?? '');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!orgCtx || !warehouseId || !from || !to) return;
    const warehouse = whsState.data?.find((w) => w.id === warehouseId);
    if (!warehouse) return;
    setBusy(true);
    setError(null);
    try {
      const fromDate = parseLocalDate(from);
      const toDate = parseLocalDate(to);
      const [inspections, damages, racks] = await Promise.all([
        fetchInspectionsForReport(client, warehouseId, fromDate, toDate),
        fetchDamagesForReport(client, warehouseId, fromDate, toDate),
        fetchRacks(client, warehouseId),
      ]);
      const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(toDate.toISOString())}`;
      const html = buildReportHtml(
        orgCtx.org,
        warehouse,
        inspections,
        damages,
        racks,
        periodLabel,
      );
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
      <h1>Prüfbericht-PDF</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Prüfbericht Regalinspektion je Lager und Zeitraum — mit Rechtsgrundlage
        (DIN EN 15635 / DGUV Regel 108-007), Checklisten-Ergebnissen, Regal-Inventar,
        Schadens-Liste im Ampelverfahren, GPS-Stempeln und Foto-Anhang. Im Druckdialog
        „Als PDF speichern" wählen.
      </p>

      <LoadGuard state={whsState}>
        {(warehouses) => (
          <div className="card" style={{ maxWidth: 560 }}>
            <label className="field">
              Lager
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">— Lager wählen —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                Von
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                Bis
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {error && <div className="error-box">{error}</div>}
            <button
              className="btn"
              disabled={busy || !warehouseId}
              onClick={() => void onGenerate()}
            >
              {busy ? 'Lade Inspektionen & Fotos …' : '📄 Prüfbericht erstellen'}
            </button>
            <p className="muted small" style={{ marginTop: 10 }}>
              Bei vielen Beweisfotos kann das Laden einen Moment dauern — die Fotos
              werden vollständig in den Bericht eingebettet.
            </p>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
