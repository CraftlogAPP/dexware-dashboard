// Gemeinsame Bausteine der Auswertungen: Kundennachricht (Kopieren / WhatsApp / E-Mail), Bestätigen, Anteil-Ring.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { Modal } from '../../components/form';
import { looksLikeEmail, mailHref, type Site } from '../types';
import { whatsAppUrl } from './logic';

type Land = 'DE' | 'AT' | 'CH';

/** In die Zwischenablage — mit Rückfall für Browser ohne Clipboard-API (z. B. ohne https). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Kundennachricht: in der App geht sie per WhatsApp (Telefon im Kontaktfeld) oder über „Teilen“ raus.
 * Am PC: Text prüfen/anpassen, dann kopieren, in WhatsApp Web öffnen oder als E-Mail.
 */
export function MessageDialog({
  title,
  text: initial,
  site,
  land,
  subject,
  onSent,
  onClose,
}: {
  title: string;
  text: string;
  site: Site | undefined;
  land: Land;
  subject: string;
  /** Nachricht ist raus (kopiert / WhatsApp / E-Mail) — z. B. „angesprochen“ setzen */
  onSent?: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const wa = whatsAppUrl(site?.operator_contact, land, text);
  const email = [site?.customer_email, site?.operator_contact].map((v) => (v ?? '').trim()).find((v) => looksLikeEmail(v));
  const mail = email ? mailHref(email, subject, text) : null;

  async function copy() {
    const ok = await copyText(text);
    setCopied(ok ? 'ok' : 'fail');
    if (ok) onSent?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2500);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label className="field">
        Text für {site?.operator_name || site?.name || 'den Kunden'}
        <textarea className="aw-msg" value={text} onChange={(e) => setText(e.target.value)} rows={11} />
      </label>
      <div className="row aw-msg-actions">
        <button type="button" className="btn small" onClick={() => void copy()}>
          <Copy className="i" aria-hidden /> {copied === 'ok' ? 'Kopiert ✓' : 'Text kopieren'}
        </button>
        {wa && (
          <a className="btn ghost small" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => onSent?.()}>
            <MessageCircle className="i" aria-hidden /> In WhatsApp öffnen
          </a>
        )}
        {mail && (
          <a className="btn ghost small" href={mail} onClick={() => onSent?.()}>
            <Mail className="i" aria-hidden /> Als E-Mail
          </a>
        )}
      </div>
      {copied === 'fail' && (
        <div className="error-box" style={{ marginTop: 10 }}>
          Kopieren hat nicht geklappt. Bitte den Text markieren und mit Strg+C kopieren.
        </div>
      )}
      {!wa && !mail && (
        <p className="muted small" style={{ marginTop: 10 }}>
          Beim Kunden ist keine Telefonnummer oder E-Mail hinterlegt — Text kopieren und selbst verschicken.
        </p>
      )}
    </Modal>
  );
}

/** Ja/Nein-Abfrage im Portal-Stil; Knopf gegen Doppelklick gesperrt, Fehler bleibt im Dialog. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={() => !busy && onClose()}>
      <div>{children}</div>
      {error && (
        <div className="error-box" style={{ marginTop: 12 }}>
          Nicht gespeichert: {error}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </button>
        <button type="button" className="btn" onClick={() => void run()} disabled={busy}>
          {busy ? 'Speichere …' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Ring für einen Anteil (0..1) — wie der Schutzschild-Ring im Garantie-Wächter der App. */
export function ShareRing({ share, label, empty }: { share: number; label: string; empty?: boolean }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="aw-ring" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="aw-ring-bg" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="aw-ring-fg"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, share)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="aw-ring-center">
        <span>🛡️</span>
        <b>{empty ? '—' : label}</b>
      </span>
    </div>
  );
}
