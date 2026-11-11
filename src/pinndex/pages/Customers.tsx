// PinnDex — Kunden: Liste mit Suche, anlegen, bearbeiten, löschen (weich: deleted_at). Entsteht sonst nebenbei beim Anlegen
// von Aufträgen. Nur Chef/Disponent (Stammdaten). CSV-Import kommt später (KONZEPT.md Abschnitt 5).

import { useState } from 'react';
import { MapPin, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { FormDialog, orNull, s, type FieldDef, type FormValues } from '../../components/form';
import { LoadGuard, useAsync } from '../../components/ui';
import { usePinn } from '../context';
import { useJobSheet } from '../JobSheet';
import { mapsUrl, telHref } from '../logic';
import type { Customer } from '../types';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, placeholder: 'z. B. Familie Maier' },
  { key: 'phone', label: 'Telefon' },
  { key: 'address', label: 'Adresse', placeholder: 'Straße, PLZ Ort' },
  { key: 'note', label: 'Notiz', kind: 'textarea', placeholder: 'z. B. Schlüssel beim Hausmeister', hint: 'Sehen alle im Team.' },
];

export function Customers() {
  const { data, canManage } = usePinn();
  const sheet = useJobSheet();
  const state = useAsync(() => data.customers(), [data]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <>
        <h1>Kunden</h1>
        <div className="info-box">Die Kundenliste pflegen Chef und Disponent.</div>
      </>
    );
  }

  async function onSave(v: FormValues) {
    const input = { name: s(v.name).slice(0, 120), phone: orNull(v.phone), address: orNull(v.address), note: orNull(v.note) };
    await data.saveCustomer(input, edit && edit !== 'new' ? edit.id : undefined);
    state.refresh();
  }

  async function remove(c: Customer) {
    if (!window.confirm(`„${c.name}“ aus der Kundenliste löschen? Bestehende Aufträge behalten Name, Telefon und Adresse.`)) return;
    setError(null);
    try {
      await data.deleteCustomer(c.id);
      state.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const needle = q.trim().toLowerCase();

  return (
    <>
      <div className="pinn-head">
        <h1>Kunden</h1>
        <button type="button" className="btn" onClick={() => setEdit('new')}>
          <Plus className="i" aria-hidden /> Kunde
        </button>
      </div>
      <div className="filter-bar">
        <label className="field pinn-search">
          Suche
          <span className="pinn-search-box">
            <Search className="i" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Adresse, Telefon …" />
          </span>
        </label>
      </div>
      {error && <div className="error-box">{error}</div>}
      <LoadGuard state={state}>
        {(list) => {
          const rows = list.filter((c) => !needle || [c.name, c.address, c.phone, c.note].some((v) => (v ?? '').toLowerCase().includes(needle)));
          if (!list.length) return <div className="empty">Noch keine Kunden. Sie entstehen nebenbei, wenn du Aufträge anlegst — oder hier mit „+ Kunde“.</div>;
          return (
            <>
              <p className="muted pinn-sum">
                <b>{rows.length}</b> von {list.length} Kunden
              </p>
              <div className="pinn-custlist">
                {rows.map((c) => (
                  <div key={c.id} className="card pinn-custcard">
                    <div className="pinn-custmain">
                      <b>{c.name}</b>
                      {c.phone && (
                        <a href={telHref(c.phone)} className="small">
                          <Phone className="i" aria-hidden /> {c.phone}
                        </a>
                      )}
                      {c.address && (
                        <a href={mapsUrl(c.address)} target="_blank" rel="noreferrer" className="small">
                          <MapPin className="i" aria-hidden /> {c.address}
                        </a>
                      )}
                      {c.note && <span className="muted small">{c.note}</span>}
                    </div>
                    <div className="pinn-custbtns">
                      <button type="button" className="btn ghost small" onClick={() => sheet.newJob({ customer: c })} title="Neuer Auftrag für diesen Kunden">
                        <Plus className="i" aria-hidden /> Auftrag
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => setEdit(c)} aria-label={`${c.name} bearbeiten`}>
                        <Pencil className="i" aria-hidden />
                      </button>
                      <button type="button" className="btn ghost small pinn-danger" onClick={() => void remove(c)} aria-label={`${c.name} löschen`}>
                        <Trash2 className="i" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </LoadGuard>
      {edit && (
        <FormDialog
          title={edit === 'new' ? 'Neuer Kunde' : 'Kunde bearbeiten'}
          fields={FIELDS}
          initial={edit === 'new' ? {} : { name: edit.name, phone: edit.phone ?? '', address: edit.address ?? '', note: edit.note ?? '' }}
          onClose={() => setEdit(null)}
          onSave={onSave}
        />
      )}
    </>
  );
}
