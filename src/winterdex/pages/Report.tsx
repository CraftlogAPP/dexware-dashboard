import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { fetchOperationsForReport, fetchProperties } from '../api';
import { LoadGuard, useAsync } from '../../components/ui';
import { addMonthsLocalISO, fmtDate, parseLocalDate, todayLocalISO, toInputDate } from '../../lib/format';
import { openReportWindowAfter, pdfSaveHint } from '../../lib/print';
import { buildReportHtml } from '../report';
import { fetchOrgPro, withWatermark } from '../pro';
import { ladeWetterMitFrist, wetterMap } from '../wetterBeleg';
import type { Property } from '../types';

/** Schnellwahl fürs Handy: dieser Monat, Vormonat, ganze Saison (ab 1. Oktober). Kalendertage, lokale Zeit. */
function quickRange(kind: 'monat' | 'vormonat' | 'saison'): { from: string; to: string } {
  const today = todayLocalISO();
  const [y, m] = today.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  if (kind === 'monat') return { from: first, to: today };
  if (kind === 'vormonat') {
    const prevFirst = addMonthsLocalISO(first, -1);
    const [py, pm] = prevFirst.split('-').map(Number);
    return { from: prevFirst, to: toInputDate(new Date(py, pm, 0)) }; // Tag 0 des Folgemonats = Monatsletzter
  }
  // Winter-Saison: ab 1.10. — von Januar bis September gehört der 1.10. des Vorjahres dazu
  return { from: `${m >= 10 ? y : y - 1}-10-01`, to: today };
}

export function Report() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const [params] = useSearchParams();

  const propsState = useAsync<Property[]>(() => fetchProperties(client), [client]);

  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  // Standard: ein Monat zurück bis heute — mit gekapptem Monatsende (31.03. → 28./29.02., nicht 03.03.)
  const [from, setFrom] = useState(() => addMonthsLocalISO(todayLocalISO(), -1));
  const [to, setTo] = useState(() => todayLocalISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!orgCtx || !propertyId || !from || !to) return;
    const property = propsState.data?.find((p) => p.id === propertyId);
    if (!property) return;
    if (from > to) return setError('„Von“ liegt nach „Bis“ — bitte den Zeitraum prüfen.');
    setBusy(true);
    setError(null);
    try {
      const fromDate = parseLocalDate(from);
      const toDate = parseLocalDate(to);
      // Fenster sofort öffnen (im Klick), Daten danach laden — sonst blockt der Browser das Pop-up
      const opened = await openReportWindowAfter(async () => {
        const [ops, pro] = await Promise.all([
          fetchOperationsForReport(client, propertyId, fromDate, toDate),
          fetchOrgPro(client),
        ]);
        // Wetterverlauf je Einsatz (nur Pro — der Server entscheidet je Einsatz); höchstens 15 s, das PDF entsteht immer
        const wetter = wetterMap(await ladeWetterMitFrist(client, 'operation', ops.map((o) => o.id)));
        const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(toDate.toISOString())}`;
        return withWatermark(buildReportHtml(orgCtx.org, property, ops, periodLabel, wetter), pro);
      });
      if (!opened) {
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

  const setRange = (kind: 'monat' | 'vormonat' | 'saison') => {
    const r = quickRange(kind);
    setFrom(r.from);
    setTo(r.to);
    setError(null);
  };

  return (
    <>
      <h1>Nachweis-PDF</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Kontrollbuch je Objekt und Zeitraum — mit Rechtsgrundlage, archivierter
        Wetterlage, GPS-Stempeln und Foto-Anhang. {pdfSaveHint()}
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
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Zeitraum schnell wählen">
              <button type="button" className="btn ghost small" onClick={() => setRange('monat')}>
                Dieser Monat
              </button>
              <button type="button" className="btn ghost small" onClick={() => setRange('vormonat')}>
                Vormonat
              </button>
              <button type="button" className="btn ghost small" onClick={() => setRange('saison')}>
                Ganze Saison
              </button>
            </div>
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
              {busy ? 'Lade Einsätze & Fotos …' : <><FileDown className="i" aria-hidden /> Bericht erstellen</>}
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
