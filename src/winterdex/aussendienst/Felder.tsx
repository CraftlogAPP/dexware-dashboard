// Abschluss-Felder einer Fahrt — bewusst GLEICH wie beim Objekt-Einsatz, damit niemand etwas Neues lernen muss:
// Maßnahme, Streumittel, Menge + Einheit, Beweisfotos, „Dokumentiert von“, Notiz (wie EinsatzFields in der App).
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Camera, X } from 'lucide-react';
import { ACTION_LABELS } from '../types';
import {
  ACTIONS,
  GRIT_MATERIALS,
  GRIT_UNITS,
  UNIT_LABEL,
  cleanAmount,
  defaultUnitFor,
  finishAmount,
  needsGrit,
} from '../einsatz/amount';
import { fileToPhoto } from '../einsatz/photo';
import type { FormValues } from '../einsatz/store';

export function Felder({
  form,
  photos,
  onForm,
  onPhotos,
  onBusy,
  performerRef,
  notePlaceholder = 'z. B. Höhe Schule nur einspurig geräumt',
}: {
  form: FormValues;
  photos: string[];
  onForm: (f: FormValues) => void;
  onPhotos: (update: (prev: string[]) => string[]) => void;
  /** true, solange ein Foto verarbeitet wird (Speichern so lange sperren) */
  onBusy?: (busy: boolean) => void;
  performerRef?: RefObject<HTMLInputElement | null>;
  notePlaceholder?: string;
}) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormValues>) => onForm({ ...form, ...patch });

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setError(null);
    setBusy((n) => n + files.length);
    for (const f of files) {
      try {
        const uri = await fileToPhoto(f);
        onPhotos((prev) => [...prev, uri]);
      } catch {
        setError('Ein Foto konnte nicht verarbeitet werden. Bitte noch einmal aufnehmen.');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };
  // Speichern gesperrt, solange IRGENDEIN Foto verarbeitet wird (auch bei zwei Auswahlen kurz nacheinander)
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(() => onBusyRef.current?.(busy > 0), [busy]);

  return (
    <>
      <h2 className="ez-section">Maßnahme</h2>
      <div className="ez-chips" role="group" aria-label="Maßnahme">
        {ACTIONS.map((a) => (
          <button key={a} type="button" className={`ez-chip${form.action === a ? ' on' : ''}`} aria-pressed={form.action === a} onClick={() => set({ action: a })}>
            {ACTION_LABELS[a]}
          </button>
        ))}
      </div>

      {needsGrit(form.action) && (
        <>
          <h2 className="ez-section">Streumittel</h2>
          <div className="ez-chips" role="group" aria-label="Streumittel">
            {GRIT_MATERIALS.map((m) => (
              <button
                key={m}
                type="button"
                className={`ez-chip${form.gritMaterial === m ? ' on' : ''}`}
                aria-pressed={form.gritMaterial === m}
                onClick={() => set({ gritMaterial: m, gritUnit: form.unitTouched ? form.gritUnit : defaultUnitFor(m) })}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="ez-amount">
            <label className="field">
              Menge (optional)
              <input
                inputMode="decimal"
                autoComplete="off"
                maxLength={8}
                value={form.gritAmount}
                placeholder="z. B. 120"
                aria-label={`Streumenge in ${UNIT_LABEL[form.gritUnit]}`}
                onChange={(e) => set({ gritAmount: cleanAmount(e.target.value) })}
                onBlur={() => set({ gritAmount: finishAmount(form.gritAmount) })}
              />
            </label>
            <div className="ez-chips ez-units" role="group" aria-label="Einheit">
              {GRIT_UNITS.map((u) => (
                <button key={u} type="button" className={`ez-chip${form.gritUnit === u ? ' on' : ''}`} aria-pressed={form.gritUnit === u} onClick={() => set({ gritUnit: u, unitTouched: true })}>
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <h2 className="ez-section">Beweisfotos</h2>
      <div className="ez-photos">
        {photos.map((uri, i) => (
          <div className="ez-photo" key={uri.slice(-32) + i}>
            <img src={uri} alt={`Beweisfoto ${i + 1}`} />
            <button type="button" aria-label={`Beweisfoto ${i + 1} entfernen`} onClick={() => onPhotos((prev) => prev.filter((_, j) => j !== i))}>
              <X className="i" aria-hidden />
            </button>
          </div>
        ))}
        {busy > 0 && (
          <div className="ez-photo busy" aria-label="Foto wird verarbeitet">
            <span className="spinner" />
          </div>
        )}
        <label className="ez-photo-add">
          <Camera className="i" aria-hidden />
          <span>Foto</span>
          <input type="file" accept="image/*" multiple onChange={(e) => void onFiles(e)} aria-label="Beweisfoto hinzufügen" />
        </label>
      </div>
      {error && <div className="error-box">{error}</div>}

      <label className="field">
        Dokumentiert von
        <input
          ref={performerRef}
          value={form.performerName}
          maxLength={80}
          autoComplete="name"
          placeholder="Name fürs Protokoll"
          onChange={(e) => set({ performerName: e.target.value })}
        />
      </label>
      <label className="field">
        Notiz (optional)
        <textarea rows={3} value={form.notes} maxLength={2000} placeholder={notePlaceholder} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </>
  );
}
