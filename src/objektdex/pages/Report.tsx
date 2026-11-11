// Nachweis-PDF je Objekt und Zeitraum (Monat oder frei) — Druckansicht im Browser („Als PDF speichern“).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { openReportWindow } from '../../lib/print';
import { useOd } from '../context';
import { buildReportHtml } from '../report';
import { addMonths, dayOf, daysBetween, firstOfMonth, formatDay, lastOfMonth, parseGermanDay, todayBerlin } from '../turnus';

export function Report() {
  const { data, orgName } = useOd();
  const [params] = useSearchParams();
  const today = todayBerlin();
  const prevFrom = addMonths(firstOfMonth(today), -1);
  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  const [scope, setScope] = useState<'prev' | 'month' | 'free'>('prev');
  const [from, setFrom] = useState(formatDay(prevFrom));
  const [to, setTo] = useState(formatDay(lastOfMonth(prevFrom)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propsState = useAsync(() => data.listProperties(), [data]);

  const period = (): { from: string; to: string; label: string } | null => {
    const mLabel = (d: string) => new Date(`${d.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
    if (scope === 'prev') return { from: prevFrom, to: lastOfMonth(prevFrom), label: mLabel(prevFrom) };
    if (scope === 'month') return { from: firstOfMonth(today), to: today, label: `${mLabel(today)} (bis ${formatDay(today)})` };
    const f = parseGermanDay(from);
    const t = parseGermanDay(to);
    if (!f || !t || f > t || daysBetween(f, t) > 400) return null;
    return { from: f, to: t, label: `${formatDay(f)} – ${formatDay(t)}` };
  };

  async function onGenerate() {
    const per = period();
    const property = propsState.data?.find((p) => p.id === propertyId);
    if (!per) return setError('Zeitraum bitte als TT.MM.JJJJ (Von nicht nach Bis, höchstens 400 Tage).');
    if (!property) return setError('Bitte ein Objekt wählen.');
    setBusy(true);
    setError(null);
    try {
      const [ops, sollIst, services, defects] = await Promise.all([
        data.listOperations({ from: per.from, to: per.to, propertyId }),
        data.sollIst(propertyId, per.from, per.to),
        data.listServices(),
        data.listDefects(),
      ]);
      const ds = defects.filter(
        (d) => d.property_id === propertyId && (d.status === 'open' || (dayOf(d.created_at) >= per.from && dayOf(d.created_at) <= per.to)),
      );
      const [opPhotos, defectPhotos] = await Promise.all([
        data.photos('operation', ops.filter((o) => o.photo_count > 0 && !o.canceled).map((o) => o.id)),
        data.photos('defect', ds.filter((d) => d.photo_count > 0).map((d) => d.id)),
      ]);
      const html = buildReportHtml({ orgName, property, periodLabel: per.label, sollIst, services, ops, defects: ds, opPhotos, defectPhotos });
      if (!openReportWindow(html)) setError('Der Browser hat das Berichtsfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.');
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
        Leistungsnachweis je Objekt: Soll/Ist, alle Einsätze mit Person, Standort-Hinweis und Prüfcode, Fotos und Mängel. Im Druckdialog „Als PDF speichern“ wählen.
      </p>
      <LoadGuard state={propsState}>
        {(props) => (
          <div className="card" style={{ maxWidth: 620 }}>
            <label className="field">
              Objekt
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">— Objekt wählen —</option>
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              Zeitraum
              <div className="od-chips">
                <button type="button" className={`od-chip ${scope === 'prev' ? 'on' : ''}`} onClick={() => setScope('prev')}>
                  Vormonat
                </button>
                <button type="button" className={`od-chip ${scope === 'month' ? 'on' : ''}`} onClick={() => setScope('month')}>
                  Dieser Monat
                </button>
                <button type="button" className={`od-chip ${scope === 'free' ? 'on' : ''}`} onClick={() => setScope('free')}>
                  Frei wählen
                </button>
              </div>
            </div>
            {scope === 'free' && (
              <div className="row">
                <label className="field" style={{ flex: 1 }}>
                  Von
                  <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="TT.MM.JJJJ" />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  Bis
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="TT.MM.JJJJ" />
                </label>
              </div>
            )}
            <p className="muted small">Zeitraum: {period()?.label ?? '—'}</p>
            {error && <div className="error-box">{error}</div>}
            <button className="btn" disabled={busy || !propertyId} onClick={() => void onGenerate()}>
              {busy ? 'Lade Einsätze & Fotos …' : <><FileDown className="i" aria-hidden /> Nachweis erstellen</>}
            </button>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
