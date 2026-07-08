import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { gpsLabel } from '../../lib/format';
import { fetchPlaces } from '../api';
import { CategoryBadge } from '../badges';
import { PLACE_TYPE_LABELS, type SavedPlace } from '../types';

export function Places() {
  const { client } = useAppAuth();

  const state = useAsync<SavedPlace[]>(() => fetchPlaces(client), [client]);

  return (
    <>
      <h1>Orte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gespeicherte Orte — Fahrten, die hier starten oder enden, bekommen
        automatisch die hinterlegte Kategorie.
      </p>

      <LoadGuard state={state}>
        {(places) =>
          places.length === 0 ? (
            <div className="card empty">Noch keine Orte in der Cloud.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ort</th>
                    <th>Typ</th>
                    <th>Adresse</th>
                    <th>GPS</th>
                    <th>Standard-Kategorie</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td className="muted">{PLACE_TYPE_LABELS[p.type] ?? p.type}</td>
                      <td className="wrap muted">{p.address ?? '—'}</td>
                      <td className="muted">
                        {gpsLabel(p.latitude, p.longitude, null)}
                      </td>
                      <td>
                        {p.defaultCategory ? (
                          <CategoryBadge category={p.defaultCategory} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGuard>
    </>
  );
}
