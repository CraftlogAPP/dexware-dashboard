import { useState, type FormEvent, type ReactNode } from 'react';

/**
 * Generische Formular-Infrastruktur für die Bearbeiten-Funktionen:
 * Modal-Overlay + deklarativer Formulardialog. Jede Entität beschreibt ihre
 * Felder als FieldDef-Liste; das Speichern übernimmt ein onSave-Callback,
 * der das App-kompatible Schreibformat baut (siehe api.ts je Bereich).
 */

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface FieldDef {
  key: string;
  label: string;
  kind?: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'textarea' | 'checkbox';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /** Kleiner Hinweistext unter dem Feld */
  hint?: string;
}

export type FormValues = Record<string, string | boolean>;

export function FormDialog({
  title,
  fields,
  initial = {},
  submitLabel = 'Speichern',
  onClose,
  onSave,
}: {
  title: string;
  fields: FieldDef[];
  initial?: FormValues;
  submitLabel?: string;
  onClose: () => void;
  /** Wirft bei Fehler — die Meldung erscheint im Dialog. Bei Erfolg schließt der Dialog. */
  onSave: (values: FormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    const v: FormValues = {};
    for (const f of fields) {
      v[f.key] = initial[f.key] ?? (f.kind === 'checkbox' ? false : '');
    }
    return v;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, val: string | boolean) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    onSave(values)
      .then(onClose)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      });
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        {fields.map((f) => (
          <FieldInput key={f.key} def={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
        ))}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Speichern…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const kind = def.kind ?? 'text';

  if (kind === 'checkbox') {
    return (
      <label className="field checkbox-field">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />{' '}
        {def.label}
        {def.hint && <span className="muted small field-hint">{def.hint}</span>}
      </label>
    );
  }

  const str = typeof value === 'string' ? value : '';
  return (
    <label className="field">
      {def.label}
      {def.required && ' *'}
      {kind === 'select' ? (
        <select value={str} required={def.required} onChange={(e) => onChange(e.target.value)}>
          {!def.required && <option value="">—</option>}
          {def.required && str === '' && <option value="">Bitte wählen…</option>}
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : kind === 'textarea' ? (
        <textarea
          value={str}
          rows={3}
          placeholder={def.placeholder}
          required={def.required}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={kind === 'datetime' ? 'datetime-local' : kind}
          value={str}
          placeholder={def.placeholder}
          required={def.required}
          step={kind === 'number' ? 'any' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {def.hint && <span className="muted small field-hint">{def.hint}</span>}
    </label>
  );
}

// ── Wert-Helfer für onSave-Callbacks ─────────────────────────────────────────

/** Getrimmter String ('' wenn leer/kein String). */
export function s(v: string | boolean | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Getrimmter String oder null, wenn leer. */
export function orNull(v: string | boolean | undefined): string | null {
  const t = s(v);
  return t ? t : null;
}

/** Zahl (Komma erlaubt) oder null, wenn leer/ungültig. */
export function num(v: string | boolean | undefined): number | null {
  const t = s(v).replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** datetime-local-Wert → ISO-String (oder null). */
export function isoFromLocal(v: string | boolean | undefined): string | null {
  const t = s(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO-Timestamp → Wert fürs datetime-local-Feld (lokale Zeit, Minutengenau). */
export function localFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
