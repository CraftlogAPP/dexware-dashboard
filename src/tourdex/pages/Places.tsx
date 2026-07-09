import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { gpsLabel } from '../../lib/format';
import { deletePlace, fetchPlaces, insertPlace, updatePlace } from '../api';
import { CategoryBadge } from '../badges';
import {
  CATEGORY_LABELS,
  PLACE_TYPE_LABELS,
  type PlaceType,
  type SavedPlace,
  type TripCategory,
} from '../types';

export function Places() {
  const { client, session } = useAppAuth();
  const [editing, setEditing] = useState<SavedPlace | 'new' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const state = useAsync<SavedPlace[]>(() => fetchPlaces(client), [client]);

  async function onSave(v: FormValues) {
    if (!editing) throw new Error('Kein Ort gewählt');
    const input = {
      label: s(v.label),
      type: s(v.type) as PlaceType,
      address: orNull(v.address) ?? undefined,
      defaultCategory: (orNull(v.defaultCategory) as TripCategory | null) ?? undefined,
    };
    if (editing === 'new') {
      if (!session) throw new Error('Nicht angemeldet');
      await insertPlace(client, session.user.id, input);
    } else {
      await updatePlace(client, editing.id, input);
    }
    state.reload();
  }

  async function onDelete(p: SavedPlace) {
    if (!session) return;
    if (
      !window.confirm(
        `Ort „${p.label}" wirklich löschen? Er wird beim nächsten Sync auch aus der App entfernt.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deletePlace(client, session.user.id, p.id);
      state.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Orte</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Ort anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Gespeicherte Orte — Fahrten, die hier starten oder enden, bekommen
        automatisch die hinterlegte Kategorie. Ohne GPS-Koordinaten (setzt die
        App beim Besuch) greift die automatische Standort-Zuordnung noch nicht.
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
                        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <button className="btn ghost small" onClick={() => setEditing(p)}>
                            Bearbeiten
                          </button>
                          <button
                            className="btn ghost small"
                            disabled={deleting}
                            onClick={() => onDelete(p)}
                          >
                            Löschen
                          </button>
                        </span>
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
          title={editing === 'new' ? 'Ort anlegen' : `${editing.label} bearbeiten`}
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
            {
              key: 'address',
              label: 'Adresse',
              hint:
                editing === 'new'
                  ? 'GPS-Koordinaten setzt die App beim Besuch — bis dahin dient der Ort v. a. als Vorlage.'
                  : undefined,
            },
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
          initial={
            editing === 'new'
              ? { type: 'other' }
              : {
                  label: editing.label,
                  type: editing.type,
                  address: editing.address ?? '',
                  defaultCategory: editing.defaultCategory ?? '',
                }
          }
        />
      )}
    </>
  );
}
