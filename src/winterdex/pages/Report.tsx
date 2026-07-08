import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../OrgContext';
import { fetchOperationsForReport, fetchProperties } from '../api';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, parseLocalDate, toInputDate } from '../../lib/format';
import { buildReportHtml, openReportWindow } from '../report';
import type { Property } from '../types';

export function Report() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const [params] = useSearchParams();

  const propsState = useAsync<Property[]>(() => fetchProperties(client), [client]);

  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!orgCtx || !propertyId || !from || !to) return;
    const property = propsState.data?.find((p) => p.id === propertyId);
    if (!property) return;
    setBusy(true);
    setError(null);
    try {
      const fromDate = parseLocalDate(from);
      const toDate = parseLocalDate(to);
      const ops = await fetchOperationsForReport(client, propertyId, fromDate, toDate);
      const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(toDate.toISOString())}`;
      const html = buildReportHtml(orgCtx.org, property, ops, periodLabel);
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
      <h1>Nachweis-PDF</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Kontrollbuch je Objekt und Zeitraum — mit Rechtsgrundlage, archivierter
        Wetterlage, GPS-Stempeln und Foto-Anhang. Im Druckdialog „Als PDF speichern"
        wählen.
      </p>

      <LoadGuard state={propsState}>
        {(properties) => (
          <div className="card" style={{ maxWidth: 560 }}>
            <label className="field">
              Objekt
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">— Objekt wählen —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                Von
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                Bis
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {error && <div className="error-box">{error}</div>}
            <button
              className="btn"
              disabled={busy || !propertyId}
              onClick={() => void onGenerate()}
            >
              {busy ? 'Lade Einsätze & Fotos …' : '📄 Bericht erstellen'}
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
