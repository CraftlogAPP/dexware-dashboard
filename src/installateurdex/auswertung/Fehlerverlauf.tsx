// „So habt ihr das schon gelöst" auf der Anlagen-Seite — wie in der App der Verlauf im Fehlercode-Assistenten
// (screens/FaultScreen.tsx + lib/fault.ts pastFixes): eigene frühere Lösungen an dieser Anlage oder an Anlagen gleichen
// Modells, Code-Treffer zuerst. Nur aus vorhandenen Einsätzen — das Portal ruft KEINE KI auf.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../components/ui';
import { useInst } from '../context';
import { fmtDay, type Asset } from '../types';
import { pastFixes, sameModelIds } from './logic';
import './auswertung.css';

export function Fehlerverlauf({ asset }: { asset: Asset }) {
  const { data, ext, base } = useInst();
  const [code, setCode] = useState('');
  const state = useAsync(async () => {
    const assets = await data.assets();
    const jobs = await ext.auswertung.fixJobs([asset.id, ...sameModelIds(asset, assets)]);
    return { assets, jobs };
  }, [data, ext, asset.id, asset.manufacturer, asset.model]);

  const names = new Map((state.data?.assets ?? []).map((a) => [a.id, a.name]));
  const fixes = state.data ? pastFixes(asset, code, state.data.assets, state.data.jobs) : [];

  return (
    <div className="card aw-fix">
      <h3 className="idx-card-title">✅ So habt ihr das schon gelöst</h3>
      <label className="field" style={{ marginBottom: 10 }}>
        Fehlercode oder Stichwort
        <input
          type="search"
          value={code}
          maxLength={40}
          placeholder="z. B. F28"
          onChange={(e) => setCode(e.target.value)}
          aria-describedby="aw-fix-hint"
        />
      </label>
      {state.loading && !state.data ? (
        <span className="spinner" />
      ) : state.error ? (
        <div className="error-box">
          {state.error}{' '}
          <button type="button" className="btn ghost small" onClick={state.reload}>
            Erneut versuchen
          </button>
        </div>
      ) : fixes.length === 0 ? (
        <span className="muted small">
          Noch keine dokumentierten Lösungen an dieser Anlage{asset.manufacturer && asset.model ? ' oder an Anlagen gleichen Modells' : ''}.
        </span>
      ) : (
        <div className="aw-fix-list">
          {fixes.map((f) => (
            <div key={f.inspectionId} className="aw-fix-item">
              <span className="small muted">
                {fmtDay(new Date(f.date))}
                {f.sameAsset ? (
                  ' · diese Anlage'
                ) : (
                  <>
                    {' · gleiches Modell ('}
                    <Link to={`${base}/anlagen/${f.assetId}`}>{names.get(f.assetId) ?? 'Anlage'}</Link>
                    {')'}
                  </>
                )}
                {f.codeMatch && <span className="badge green aw-fix-badge">gleicher Code</span>}
              </span>
              <span className="aw-fix-text">{f.text}</span>
            </div>
          ))}
        </div>
      )}
      <p id="aw-fix-hint" className="muted small" style={{ margin: '10px 0 0' }}>
        Aus euren Einsätzen (Wartung, Reparatur, Arbeitsbericht) an dieser Anlage und an baugleichen Anlagen — Treffer zum
        Code zuerst. Die KI-Störungshilfe gibt es in der App.
      </p>
    </div>
  );
}
