// Auftraggeber-Links (nur Inhaber): je Objekt ein Lese-Link für die Hausverwaltung — ohne Konto, widerrufbar.
// Der Server speichert nur den Hash: der Link ist GENAU EINMAL beim Erstellen sichtbar.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Modal } from '../../components/form';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import { CopyButton, fmtDateTimeB } from '../parts';
import { SHARE_BASE_URL } from '../types';

export function Links() {
  const { data, role, base, demo } = useOd();
  const [params] = useSearchParams();
  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; name: string } | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const state = useAsync(async () => {
    const [links, props] = await Promise.all([data.listShareLinks(), data.listProperties()]);
    return { links, props };
  }, [data]);

  if (role !== 'owner') return <div className="info-box">Auftraggeber-Links verwaltet nur der Inhaber des Betriebs.</div>;

  async function onCreate(name: string) {
    if (!propertyId) return setError('Bitte ein Objekt wählen.');
    setBusy(true);
    setError(null);
    try {
      const token = await data.createShareLink(propertyId, label);
      setCreated({ url: SHARE_BASE_URL + token, name });
      setLabel('');
      state.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm('Link widerrufen? Wer ihn hat, sieht danach nichts mehr. Das lässt sich nicht rückgängig machen.')) return;
    try {
      await data.revokeShareLink(id);
      state.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <h1>Auftraggeber-Links</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Die Hausverwaltung sieht im Browser die letzten Einsätze, Soll/Ist und Mängel ihres Objekts — ohne Konto. Personen nur mit Vorname und
        Anfangsbuchstabe, keine Koordinaten. Jederzeit widerrufbar.
      </p>
      <LoadGuard state={state}>
        {({ links, props }) => {
          const names = new Map(props.map((p) => [p.id, p.name]));
          const active = links.filter((l) => !l.revoked_at);
          const revoked = links.filter((l) => l.revoked_at);
          const chosenName = names.get(propertyId) ?? '';
          return (
            <>
              <div className="card od-filter" style={{ alignItems: 'flex-end' }}>
                <label className="field">
                  Objekt
                  <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                    <option value="">— Objekt wählen —</option>
                    {props
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Bezeichnung (nur für dich)
                  <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Hausverwaltung Meier" maxLength={80} />
                </label>
                <button className="btn" disabled={busy || !propertyId} onClick={() => void onCreate(chosenName)} style={{ marginBottom: 14 }}>
                  {busy ? 'Erstelle …' : 'Link erstellen'}
                </button>
              </div>
              {error && <div className="error-box">{error}</div>}

              <div className="section-head">
                <h2>Aktive Links ({active.length})</h2>
              </div>
              {active.length === 0 ? (
                <div className="card empty">Noch keine Links.</div>
              ) : (
                <div className="table-wrap">
                  <table className="od-ops">
                    <thead>
                      <tr>
                        <th>Objekt</th>
                        <th>Bezeichnung</th>
                        <th>Erstellt</th>
                        <th>Zuletzt angesehen</th>
                        <th>Aufrufe</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((l) => (
                        <tr key={l.id}>
                          <td className="wrap">
                            <Link to={`${base}/objekte/${l.property_id}`}>{names.get(l.property_id) ?? '—'}</Link>
                          </td>
                          <td className="wrap">{l.label ?? <span className="muted">—</span>}</td>
                          <td className="muted">{fmtDateTimeB(l.created_at)}</td>
                          <td className="muted">{l.last_viewed_at ? fmtDateTimeB(l.last_viewed_at) : 'noch nie'}</td>
                          <td>{l.view_count}</td>
                          <td>
                            <button className="btn ghost small od-danger" onClick={() => void onRevoke(l.id)}>
                              Widerrufen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted small">
                Einen bestehenden Link kann das Dashboard nicht noch einmal anzeigen (gespeichert ist nur ein Fingerabdruck). Verloren? Neuen erstellen und den alten widerrufen.
              </p>
              {revoked.length > 0 && (
                <button className="btn ghost small" onClick={() => setShowRevoked((v) => !v)}>
                  {showRevoked ? 'Widerrufene ausblenden' : `Widerrufene zeigen (${revoked.length})`}
                </button>
              )}
              {showRevoked && (
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table>
                    <tbody>
                      {revoked.map((l) => (
                        <tr key={l.id} className="od-canceled">
                          <td>{names.get(l.property_id) ?? '—'}</td>
                          <td>{l.label ?? '—'}</td>
                          <td className="muted">widerrufen {fmtDateTimeB(l.revoked_at)}</td>
                          <td className="muted">{l.view_count} Aufrufe</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
      {created && (
        <Modal title="Link erstellt" onClose={() => setCreated(null)} dirty={false}>
          <p>
            Link für <b>{created.name}</b> — <b>nur jetzt sichtbar</b>. Kopieren und an die Hausverwaltung schicken:
          </p>
          <div className="od-linkbox mono">{created.url}</div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <CopyButton text={created.url} label="Link kopieren" />
            <a className="btn ghost small" href={`mailto:?subject=${encodeURIComponent(`Leistungsnachweis ${created.name}`)}&body=${encodeURIComponent(`Hier sehen Sie unsere Einsätze und Soll/Ist für ${created.name}:\n${created.url}`)}`}>
              Per E-Mail
            </a>
          </div>
          {demo && <p className="muted small">Beispieldaten: dieser Link funktioniert nicht.</p>}
        </Modal>
      )}
    </>
  );
}
