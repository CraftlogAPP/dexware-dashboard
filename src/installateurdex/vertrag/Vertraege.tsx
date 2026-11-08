// Wartungsverträge beim Kunden (Karte) und Hinweis bei der Anlage — Daten: vertraegeData.ts (ext.vertraege).
import { useState } from 'react';
import { useAsync } from '../../components/ui';
import { useInst } from '../context';
import type { ContractRow } from './vertraegeData';

// Kalendertag „JJJJ-MM-TT“ direkt umstellen (kein Date-Objekt → keine Zeitzonen-Verschiebung)
const fmtDate = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : day || '—';
};

const euro = (cents: number) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

function PdfButton({ c, label = 'PDF öffnen' }: { c: ContractRow; label?: string }) {
  const { ext } = useInst();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    // Fenster sofort öffnen (Popup-Sperre), Link danach einsetzen
    const w = window.open('', '_blank');
    setBusy(true);
    setError(null);
    try {
      const url = await ext.vertraege.pdfUrl(c.pdf_path);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e) {
      w?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="btn ghost small" disabled={busy} onClick={() => void open()}>
        {busy ? 'Einen Moment …' : `📄 ${label}`}
      </button>
      {error && <div className="error-box small" style={{ marginTop: 6 }}>{error}</div>}
    </>
  );
}

/** Karte „Wartungsverträge“ beim Kunden. Ohne Tabelle (Nachtrag fehlt) oder ohne Verträge: nichts. */
export function VertraegeKarte({ siteId, assetNames }: { siteId: string; assetNames: Map<string, string> }) {
  const { ext } = useInst();
  const state = useAsync(() => ext.vertraege.list(siteId), [ext, siteId]);
  const list = state.data;
  if (state.error) return <div className="card"><h3 className="idx-card-title">Wartungsverträge</h3><span className="small muted">{state.error}</span></div>;
  if (!list || list.length === 0) return null;
  return (
    <div className="card">
      <h3 className="idx-card-title">🤝 Wartungsverträge ({list.length})</h3>
      <div className="idx-reco-list">
        {list.map((c) => {
          const names = c.asset_ids.map((id) => assetNames.get(id)).filter(Boolean) as string[];
          return (
            <div key={c.id} className="idx-reco-item">
              <b>
                Unterschrieben am {fmtDate(c.signed_on)} · {c.customer_name}
              </b>
              <span className="small">
                {euro(c.yearly_cents)} im Jahr {c.with_vat ? '(inkl. USt)' : '(ohne USt)'} · {c.asset_ids.length}{' '}
                {c.asset_ids.length === 1 ? 'Anlage' : 'Anlagen'}
                {names.length ? `: ${names.join(', ')}` : ''}
              </span>
              <span className="small muted">
                {c.consumer ? 'Privatkunde' : 'Firmenkunde'}
                {c.consumer && c.withdrawal ? ' · Widerrufsbelehrung erteilt' : ''}
                {c.consumer && c.early_start === true ? ' · vorzeitiger Beginn verlangt' : ''}
                {c.consumer && c.early_start === false ? ' · Beginn erst nach der Widerrufsfrist' : ''}
                {` · ${c.land}`}
              </span>
              <div className="row" style={{ gap: 8 }}>
                <PdfButton c={c} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Kurzer Hinweis bei der Anlage, wenn sie in einem unterschriebenen Vertrag steht. */
export function VertragHinweis({ siteId, assetId }: { siteId: string; assetId: string }) {
  const { ext } = useInst();
  const state = useAsync(() => ext.vertraege.list(siteId), [ext, siteId]);
  const c = state.data?.find((x) => x.asset_ids.includes(assetId));
  if (!c) return null;
  return (
    <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>
        🤝 Steht im Wartungsvertrag vom <b>{fmtDate(c.signed_on)}</b> ({c.customer_name}, {euro(c.yearly_cents)} im Jahr)
      </span>
      <PdfButton c={c} label="Vertrag (PDF)" />
    </div>
  );
}
