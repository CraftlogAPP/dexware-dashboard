// Karte „Glätte-Frühwarnung morgens um …“ (WinterDex, Team-Seite unter „Betrieb“). Ohne die Spalte
// org.glaette_morgen_zeit (Nachtrag noch nicht eingespielt) bleibt die Karte unsichtbar.
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAsync } from '../components/ui';
import { GLAETTE_ERKLAERUNG, GLAETTE_STANDARD, glaetteZeitOptionen, hhmm, ladeGlaetteZeit, speichereGlaetteZeit } from './glaetteZeit';

export function GlaetteFruehwarnung({ client, orgId, darf }: { client: SupabaseClient; orgId: string; darf: boolean }) {
  const state = useAsync(() => ladeGlaetteZeit(client, orgId), [client, orgId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const wert = state.data;
  if (wert == null) return null; // lädt noch, Spalte fehlt oder nicht lesbar

  async function aendern(m: number) {
    setErr(null);
    setOk(false);
    setBusy(true);
    try {
      await speichereGlaetteZeit(client, orgId, m);
      state.reload();
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="section-head" style={{ margin: 0 }}>
        <h2>Glätte-Frühwarnung</h2>
      </div>
      {darf ? (
        <label className="field" style={{ maxWidth: 320, marginBottom: 6 }}>
          Glätte-Frühwarnung morgens um …
          <select value={wert} disabled={busy} onChange={(e) => void aendern(Number(e.target.value))} aria-describedby="glaette-zeit-erklaerung">
            {glaetteZeitOptionen().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p style={{ marginBottom: 6 }}>
          Glätte-Frühwarnung morgens um <b>{hhmm(wert)} Uhr</b>
          {wert === GLAETTE_STANDARD ? ' (Standard)' : ''} — ändern können Inhaber oder Verwalter.
        </p>
      )}
      <p className="muted small" id="glaette-zeit-erklaerung" style={{ marginBottom: 0 }}>
        {GLAETTE_ERKLAERUNG}
      </p>
      {ok && !err && (
        <p className="small" role="status" style={{ marginBottom: 0 }}>
          Gespeichert — die Frühwarnung kommt künftig um {hhmm(wert)} Uhr.
        </p>
      )}
      {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}
