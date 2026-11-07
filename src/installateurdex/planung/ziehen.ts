// Plantafel: Ziehen mit Pointer Events (Maus, Stift, Finger) — ohne HTML5-Drag und ohne Zusatzpakete.
// Maus/Stift: Ziehen beginnt nach ein paar Pixeln Bewegung. Finger: kurz gedrückt halten (sonst wird normal gescrollt).
// Ablageflächen tragen data-drop-day (JJJJ-MM-TT) und optional data-drop-lane (Zeilen-ID der Wochentafel).

import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

export interface DropSpot {
  day: string;
  /** Zeilen-ID (Monteur, „none“) — leer = Monteur bleibt (Tagesleiste) */
  lane: string;
  /** Zeitachse: Minute nach Mitternacht unter dem Zeiger (Spalte trägt data-drop-min0 und data-drop-ppm) */
  minute?: number;
}

const MOUSE_SLOP = 5;
const TOUCH_SLOP = 10;
const LONG_PRESS_MS = 320;
const EDGE = 48;

/** Ablagefläche unter einem Bildschirmpunkt (die Vorschau selbst hat pointer-events: none). */
export function spotAt(x: number, y: number): DropSpot | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day]');
  if (!el) return null;
  const spot: DropSpot = { day: el.dataset.dropDay ?? '', lane: el.dataset.dropLane ?? '' };
  const min0 = Number(el.dataset.dropMin0);
  const ppm = Number(el.dataset.dropPpm);
  if (el.dataset.dropMin0 !== undefined && Number.isFinite(min0) && ppm > 0) spot.minute = min0 + (y - el.getBoundingClientRect().top) / ppm;
  return spot;
}

const sameSpot = (a: DropSpot | null, b: DropSpot | null) => a?.day === b?.day && a?.lane === b?.lane && a?.minute === b?.minute;

export interface DragHandlers<T> {
  /** Ziehen beginnt — false, wenn das Element nicht ziehbar ist (Hinweis zeigt der Aufrufer). `rect` = Lage des Elements beim Drücken. */
  onStart: (item: T, x: number, y: number, rect: DOMRect) => boolean;
  onOver: (spot: DropSpot | null) => void;
  onDrop: (spot: DropSpot | null) => void;
  onCancel: () => void;
  /** Waagrecht scrollender Bereich (Wochentafel) — wird am Rand mitgescrollt. */
  scrollEl?: () => HTMLElement | null;
}

interface Press<T> {
  item: T;
  pointerId: number;
  touch: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragging: boolean;
  spot: DropSpot | null;
  timer: number | null;
  raf: number | null;
  rect: DOMRect;
}

export function usePointerDrag<T>(handlers: DragHandlers<T>) {
  const h = useRef(handlers);
  h.current = handlers;
  const press = useRef<Press<T> | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const detach = useRef<(() => void) | null>(null);

  useEffect(() => () => detach.current?.(), []);

  const placeGhost = (x: number, y: number) => {
    const g = ghost.current;
    if (g) g.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 10)}px)`;
  };

  const track = () => {
    const p = press.current;
    if (!p?.dragging) return;
    const spot = spotAt(p.x, p.y);
    if (!sameSpot(spot, p.spot)) {
      p.spot = spot;
      h.current.onOver(spot);
    }
  };

  // Am Rand mitscrollen (Wochentafel waagrecht, Seite senkrecht), solange gezogen wird
  const autoScroll = () => {
    const p = press.current;
    if (!p?.dragging) return;
    let moved = false;
    const el = h.current.scrollEl?.();
    if (el) {
      const r = el.getBoundingClientRect();
      const dx = p.x < r.left + EDGE ? -1 : p.x > r.right - EDGE ? 1 : 0;
      if (dx && p.y >= r.top && p.y <= r.bottom) {
        const before = el.scrollLeft;
        el.scrollLeft += dx * 12;
        moved = moved || el.scrollLeft !== before;
      }
    }
    const dy = p.y < EDGE ? -1 : p.y > window.innerHeight - EDGE ? 1 : 0;
    if (dy) {
      const before = window.scrollY;
      window.scrollBy(0, dy * 12);
      moved = moved || window.scrollY !== before;
    }
    if (moved) track();
    p.raf = requestAnimationFrame(autoScroll);
  };

  const begin = () => {
    const p = press.current;
    if (!p || p.dragging) return;
    if (!h.current.onStart(p.item, p.x0, p.y0, p.rect)) {
      end(false);
      return;
    }
    p.dragging = true;
    suppressClick.current = true;
    if (p.touch && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(12);
      } catch {
        /* nicht überall erlaubt */
      }
    }
    track();
    p.raf = requestAnimationFrame(autoScroll);
  };

  /** Aufräumen; `drop` = ablegen (sonst abbrechen). */
  const end = (drop: boolean) => {
    const p = press.current;
    press.current = null;
    detach.current?.();
    detach.current = null;
    if (!p) return;
    if (p.timer !== null) window.clearTimeout(p.timer);
    if (p.raf !== null) cancelAnimationFrame(p.raf);
    if (p.dragging) {
      if (drop) h.current.onDrop(spotAt(p.x, p.y));
      else h.current.onCancel();
      // der Klick nach dem Loslassen soll keinen Dialog öffnen
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  };

  function onPointerDown(e: ReactPointerEvent<HTMLElement>, item: T) {
    if (!e.isPrimary || e.button !== 0 || press.current) return;
    if ((e.target as HTMLElement).closest('a, .pt-link, input, select, textarea')) return;
    const touch = e.pointerType === 'touch';
    const p: Press<T> = {
      item,
      pointerId: e.pointerId,
      touch,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      spot: null,
      timer: null,
      raf: null,
      rect: e.currentTarget.getBoundingClientRect(),
    };
    press.current = p;
    if (touch) p.timer = window.setTimeout(begin, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointerId) return;
      p.x = ev.clientX;
      p.y = ev.clientY;
      if (!p.dragging) {
        const dist = Math.hypot(p.x - p.x0, p.y - p.y0);
        if (p.touch) {
          if (dist > TOUCH_SLOP) end(false); // Finger bewegt sich vor dem Halten → normal scrollen
        } else if (dist > MOUSE_SLOP) begin();
        return;
      }
      placeGhost(p.x, p.y);
      track();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === p.pointerId) end(true);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId === p.pointerId) end(false);
    };
    // Während des Ziehens darf der Finger die Seite nicht scrollen
    const touchMove = (ev: TouchEvent) => {
      if (p.dragging && ev.cancelable) ev.preventDefault();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && p.dragging) {
        ev.preventDefault();
        ev.stopPropagation();
        end(false);
      }
    };
    const blur = () => end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    detach.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
    };
  }

  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  // Langes Drücken auf dem Tablet öffnet sonst das Kontextmenü
  const onContextMenu = (e: ReactMouseEvent<HTMLElement>) => {
    if (press.current) e.preventDefault();
  };

  // Die Vorschau erscheint erst im nächsten Render — beim Einhängen gleich an den Zeiger setzen
  const ghostRef = useCallback((el: HTMLDivElement | null) => {
    ghost.current = el;
    const p = press.current;
    if (el && p) el.style.transform = `translate(${Math.round(p.x + 14)}px, ${Math.round(p.y + 10)}px)`;
  }, []);

  return {
    ghostRef,
    bind: (item: T) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, item),
      onClickCapture,
      onContextMenu,
    }),
  };
}
