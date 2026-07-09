import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { gpsLabel } from '../../lib/format';
import { fetchPlaces, updatePlace } from '../api';
import { CategoryBadge } from '../badges';
import {
  CATEGORY_LABELS,
  PLACE_TYPE_LABELS,
  type PlaceType,
  type SavedPlace,
  type TripCategory,
} from '../types';

export function Places() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<SavedPlace | null>(null);

  const state = useAsync<SavedPlace[]>(() => fetchPlaces(client), [client]);

  async function onSave(v: FormValues) {
    if (!editing) throw new Error('Kein Ort gewählt');
    await updatePlace(client, editing.id, {
      label: s(v.label),
      type: s(v.type) as PlaceType,
      address: orNull(v.address) ?? undefined,
      defaultCategory: (orNull(v.defaultCategory) as TripCategory | null) ?? undefined,
    });
    state.reload();
  }

  return (
    <>
      <h1>Orte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gespeicherte Orte — Fahrten, die hier starten oder enden, bekommen
        automatisch die hinterlegte Kategorie. Neue Orte entstehen in der App
        (GPS-Position nötig).
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
                    <th></th>
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
                      <td>
                        <button className="btn ghost small" onClick={() => setEditing(p)}>
                          Bearbeiten
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGuard>

      {editing && (
        <FormDialog
          title={`${editing.label} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'label', label: 'Bezeichnung', required: true },
            {
              key: 'type',
              label: 'Typ',
              kind: 'select',
              required: true,
              options: (Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map((t) => ({
                value: t,
                label: PLACE_TYPE_LABELS[t],
              })),
            },
            { key: 'address', label: 'Adresse' },
            {
              key: 'defaultCategory',
              label: 'Standard-Kategorie',
              kind: 'select',
              hint: 'Fahrten von/zu diesem Ort werden automatisch so kategorisiert',
              options: (Object.keys(CATEGORY_LABELS) as TripCategory[]).map((c) => ({
                value: c,
                label: CATEGORY_LABELS[c],
              })),
            },
          ]}
          initial={{
            label: editing.label,
            type: editing.type,
            address: editing.address ?? '',
            defaultCategory: editing.defaultCategory ?? '',
          }}
        />
      )}
    </>
  );
}
