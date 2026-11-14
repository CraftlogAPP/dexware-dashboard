// PinnDex — kleine Bausteine: Zustands-Etikett, Personen-Punkt, Live-Punkt, mitlaufende Uhr, seitliches Blatt.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, Check, CircleDot, Eye, Monitor, Moon, Pause, Play, Sun, X } from 'lucide-react';
import { useTheme, type ThemeChoice } from './context';
import { STATUS_LABEL, type JobStatus } from './types';
import { initials } from './logic';

const STATUS_ICON: Record<JobStatus, typeof Play> = {
  new: CircleDot,
  seen: Eye,
  running: Play,
  paused: Pause,
  done: Check,
  canceled: Ban,
};

/** Zustand groß und farbig. `key` am Aufrufer = Zustand → beim Wechsel spielt die kleine Animation neu. */
export function StatusChip({ status, big }: { status: JobStatus; big?: boolean }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`pinn-status st-${status}${big ? ' big' : ''}`}>
      <Icon className="i" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span className="pinn-avatar" style={{ '--pc': color, width: size, height: size, fontSize: Math.round(size * 0.4) } as React.CSSProperties} title={name} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Sekundentakt nur solange `on` (z. B. eine laufende Karte sichtbar ist). */
export function useNow(on: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [on, ms]);
  return now;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pinn-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Seitliches Blatt (rechts, am Handy ganzer Bildschirm). Escape/Klick daneben schließt — mit ungespeicherten
 * Änderungen erst nach Rückfrage. Fokus springt hinein und bleibt drin (Tab), beim Schließen zurück.
 */
export function Sheet({
  title,
  onClose,
  dirty,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) {
      const fine = window.matchMedia?.('(pointer: fine)').matches ?? true;
      const first = fine ? el.querySelector<HTMLElement>('[data-autofocus]') : null;
      (first ?? el).focus({ preventScroll: true });
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('Ungespeicherte Eingaben verwerfen?')) return;
    onClose();
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="pinn-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && requestClose()} onKeyDown={onKeyDown}>
      <div ref={ref} className={`pinn-sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="pinn-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn ghost small" onClick={requestClose} aria-label="Schließen">
            <X className="i" aria-hidden />
          </button>
        </div>
        <div className="pinn-sheet-body">{children}</div>
      </div>
    </div>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Dunkel', icon: Moon },
  { value: 'light', label: 'Hell', icon: Sun },
  { value: 'system', label: 'Wie das System', icon: Monitor },
];

/** Hell / Dunkel / wie das System (Navigation unten am PC, Team-Seite überall). `labels` zeigt die Wörter. */
export function ThemeSwitch({ labels }: { labels?: boolean }) {
  const t = useTheme();
  if (!t) return null;
  return (
    <div className={`pinn-theme${labels ? ' labels' : ''}`} role="group" aria-label="Darstellung">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" className={t.choice === value ? 'on' : ''} aria-pressed={t.choice === value} title={label} onClick={() => t.set(value)}>
          <Icon className="i" aria-hidden />
          <span className={labels ? '' : 'sr-only'}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Live-Anzeige: grüner Puls = Realtime verbunden, sonst Abgleich alle 20 s. */
export function LiveDot({ live, changedAt }: { live: boolean; changedAt: number }) {
  const t = new Date(changedAt);
  const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return (
    <span className={`pinn-live${live ? ' on' : ''}`} title={live ? 'Live verbunden — Änderungen erscheinen sofort' : 'Keine Live-Verbindung — Abgleich alle 20 Sekunden'}>
      <span className="pinn-live-dot" aria-hidden />
      {live ? 'Live' : 'Abgleich'}
      <span className="muted hide-sm">· {hm}</span>
    </span>
  );
}
