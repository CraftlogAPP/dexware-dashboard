import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';

/**
 * „Prüfcode prüfen“: fragt den Server, ob der gespeicherte Prüfcode (SHA-256) noch zum
 * Inhalt des Eintrags passt — Nachweis gegenüber Gutachter/Versicherung, dass nichts
 * nachträglich verändert wurde. rpc = verify_inspection (Prüf-Apps) bzw. verify_operation (WinterDex).
 */
export function VerifyProof({ id, hash, rpc = 'verify_inspection' }: { id: string; hash?: string | null; rpc?: string }) {
  const { client } = useAppAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad' | 'err'>('idle');
  if (!hash) return null;
  async function check() {
    setState('busy');
    const arg = rpc === 'verify_operation' ? { p_operation: id } : { p_inspection: id };
    const { data, error } = await client.rpc(rpc, arg);
    if (error) return setState('err');
    const r = Array.isArray(data) ? data[0] : data;
    setState(r?.ok ? 'ok' : 'bad');
  }
  return (
    <div className="small" style={{ marginTop: 6 }}>
      <button className="btn ghost small" onClick={() => void check()} disabled={state === 'busy'}>
        <ShieldCheck className="i" aria-hidden /> {state === 'busy' ? 'Prüfe …' : 'Prüfcode prüfen'}
      </button>{' '}
      {state === 'ok' && <b style={{ color: 'var(--ok, #15803D)' }}>✓ Unverändert — Prüfcode stimmt mit dem Inhalt überein.</b>}
      {state === 'bad' && <b style={{ color: 'var(--danger, #DC2626)' }}>✗ Prüfcode passt NICHT zum Inhalt — bitte support@dexware.app melden.</b>}
      {state === 'err' && <span className="muted">Prüfung gerade nicht möglich (Datenbank-Update fehlt oder keine Verbindung).</span>}
    </div>
  );
}
