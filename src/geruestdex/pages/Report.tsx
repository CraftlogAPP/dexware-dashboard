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
  fetchScaffolds,
  fetchSites,
} from '../api';
import { buildReportHtml } from '../report';
import type { Site } from '../types';

export function Report() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const [params] = useSearchParams();

  const sitesState = useAsync<Site[]>(() => fetchSites(client), [client]);

  const [siteId, setSiteId] = useState(params.get('baustelle') ?? '');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!orgCtx || !siteId || !from || !to) return;
    const site = sitesState.data?.find((s) => s.id === siteId);
    if (!site) return;
    setBusy(true);
    setError(null);
    try {
      const fromDate = parseLocalDate(from);
      const toDate = parseLocalDate(to);
      const [inspections, damages, scaffolds] = await Promise.all([
        fetchInspectionsForReport(client, siteId, fromDate, toDate),
        fetchDamagesForReport(client, siteId, fromDate, toDate),
        fetchScaffolds(client, siteId),
      ]);
      const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(toDate.toISOString())}`;
      const html = buildReportHtml(
        orgCtx.org,
        site,
        inspections,
        damages,
        scaffolds,
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
        Prüfbericht Gerüst je Baustelle und Zeitraum — mit Rechtsgrundlage
        (BetrSichV / TRBS 2121-1 / DGUV Information 201-011), Checklisten-Ergebnissen,
        Gerüst-Inventar inkl. Last-/Breitenklasse, Mängel-Liste im Ampelverfahren,
        GPS-Stempeln und Foto-Anhang. Im Druckdialog „Als PDF speichern" wählen.
      </p>

      <LoadGuard state={sitesState}>
        {(sites) => (
          <div className="card" style={{ maxWidth: 560 }}>
            <label className="field">
              Baustelle
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">— Baustelle wählen —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
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
              disabled={busy || !siteId}
              onClick={() => void onGenerate()}
            >
              {busy ? 'Lade Prüfungen & Fotos …' : '📄 Prüfbericht erstellen'}
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
