import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Generische Formular-Infrastruktur für die Bearbeiten-Funktionen:
 * Modal-Overlay + deklarativer Formulardialog. Jede Entität beschreibt ihre
 * Felder als FieldDef-Liste; das Speichern übernimmt ein onSave-Callback,
 * der das App-kompatible Schreibformat baut (siehe api.ts je Bereich).
 */

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not(:disabled):not([type="hidden"]):not([readonly]), select:not(:disabled), textarea:not(:disabled):not([readonly])';

const visible = (el: HTMLElement) => el.getClientRects().length > 0;

/**
 * Dialog-Overlay für alle Dashboards.
 * - Fokus springt beim Öffnen hinein (am Rechner ins erste Feld, am Handy auf den Dialog — sonst springt die Tastatur auf),
 *   Tab bleibt im Dialog, beim Schließen geht der Fokus zurück.
 * - Escape schließt; mit Änderungen erst nach Rückfrage.
 * - Klick daneben schließt nur ohne Änderungen (sonst wackelt der Dialog kurz).
 * „Änderungen": `dirty`, falls übergeben — sonst automatisch, sobald im Dialog etwas eingetippt/ausgewählt wurde
 * (Suchfelder zählen nicht).
 */
export function Modal({
  title,
  onClose,
  children,
  dirty,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Ungespeicherte Änderungen? Ohne Angabe: erkannt an Eingaben im Dialog. */
  dirty?: boolean;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const [nudge, setNudge] = useState(false);
  const hasChanges = () => dirty ?? touched.current;

  useEffect(() => {
    const card = cardRef.current;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (card && !card.contains(document.activeElement)) {
      const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? true;
      const field = finePointer ? [...card.querySelectorAll<HTMLElement>(FIELDS)].find(visible) : undefined;
      (field ?? card).focus({ preventScroll: true });
    }
    return () => {
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  function markTouched(e: { target: EventTarget }) {
    const t = e.target as HTMLInputElement;
    if (t.type === 'search' || t.readOnly) return;
    touched.current = true;
  }

  function requestClose() {
    if (hasChanges() && !window.confirm('Ungespeicherte Eingaben verwerfen?')) return;
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation(); // nur der oberste Dialog
      requestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === card || !card.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !card.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (hasChanges()) {
          // Nicht einfach verwerfen — kurz wackeln, Fokus bleibt im Dialog
          e.preventDefault();
          setNudge(true);
          return;
        }
        onClose();
      }}
    >
      <div
        ref={cardRef}
        className={`modal-card${nudge ? ' modal-nudge' : ''}`}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && nudge) setNudge(false);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onInputCapture={markTouched}
        onChangeCapture={markTouched}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label="Schließen">
            <X className="i" aria-hidden />
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
  const [start] = useState<FormValues>(() => {
    const v: FormValues = {};
    for (const f of fields) {
      v[f.key] = initial[f.key] ?? (f.kind === 'checkbox' ? false : '');
    }
    return v;
  });
  const [values, setValues] = useState<FormValues>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = fields.some((f) => values[f.key] !== start[f.key]);
  // Während des Speicherns nicht schließen (sonst kommt die Fehlermeldung nie an)
  const close = () => {
    if (!busy) onClose();
  };

  function set(key: string, val: string | boolean) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return; // Enter doppelt gedrückt
    // HTML-required lässt reine Leerzeichen durch — hier abfangen, bevor
    // getrimmte Leerwerte an die DB gehen (z. B. Storno-Grund-RPCs).
    for (const f of fields) {
      const val = values[f.key];
      if (f.required && typeof val === 'string' && !val.trim()) {
        setError(`Bitte „${f.label}" ausfüllen.`);
        return;
      }
    }
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
    <Modal title={title} onClose={close} dirty={dirty}>
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
