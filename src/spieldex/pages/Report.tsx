import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, parseLocalDate, toInputDate } from '../../lib/format';
import { openReportWindow } from '../../lib/print';
import {
  fetchDefectsForReport,
  fetchEquipment,
  fetchInspectionsForReport,
  fetchPlaygrounds,
} from '../api';
import { buildReportHtml } from '../report';
import type { Playground } from '../types';

export function Report() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const [params] = useSearchParams();

  const pgsState = useAsync<Playground[]>(() => fetchPlaygrounds(client), [client]);

  const [playgroundId, setPlaygroundId] = useState(params.get('spielplatz') ?? '');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!orgCtx || !playgroundId || !from || !to) return;
    const playground = pgsState.data?.find((p) => p.id === playgroundId);
    if (!playground) return;
    setBusy(true);
    setError(null);
    try {
      const fromDate = parseLocalDate(from);
      const toDate = parseLocalDate(to);
      const [inspections, defects, equipment] = await Promise.all([
        fetchInspectionsForReport(client, playgroundId, fromDate, toDate),
        fetchDefectsForReport(client, playgroundId, fromDate, toDate),
        fetchEquipment(client, playgroundId),
      ]);
      const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(toDate.toISOString())}`;
      const html = buildReportHtml(
        orgCtx.org,
        playground,
        inspections,
        defects,
        equipment,
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
      <h1>Kontrollbuch-PDF</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Spielplatz-Kontrollbuch je Spielplatz und Zeitraum — mit Rechtsgrundlage
        (DIN EN 1176-7), Checklisten-Ergebnissen, Geräte-Inventar, Mängel-Liste,
        GPS-Stempeln und Foto-Anhang. Im Druckdialog „Als PDF speichern" wählen.
      </p>

      <LoadGuard state={pgsState}>
        {(playgrounds) => (
          <div className="card" style={{ maxWidth: 560 }}>
            <label className="field">
              Spielplatz
              <select
                value={playgroundId}
                onChange={(e) => setPlaygroundId(e.target.value)}
              >
                <option value="">— Spielplatz wählen —</option>
                {playgrounds.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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
              disabled={busy || !playgroundId}
              onClick={() => void onGenerate()}
            >
              {busy ? 'Lade Kontrollen & Fotos …' : '📄 Kontrollbuch erstellen'}
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
