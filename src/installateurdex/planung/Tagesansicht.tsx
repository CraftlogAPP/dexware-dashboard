// Plantafel: Tagesansicht mit Zeitachse — ein Tag, Spalten = Monteure, senkrecht 6–20 Uhr (bei Terminen außerhalb ausgeweitet).
// Termine als Blöcke nach Dauer, Überschneidungen nebeneinander, „Jetzt“-Linie am heutigen Tag.
// Nur Darstellung: Karten, Ziehen und Rechte kommen aus Plantafel.tsx (Blöcke bringen ihre eigene render-Funktion mit).

import { useEffect, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { dayRange, endMinuteOn, layoutColumns, minuteOfDay } from './verschieben';

/** Pixel je Minute (56 px je Stunde, 14 px je 15-Minuten-Schritt) */
export const TL_PPM = 56 / 60;

export interface TlLane {
  id: string;
  label: string;
  color: string;
  /** Ablagefläche fürs Verschieben */
  droppable: boolean;
  /** Kleine Zeile unter dem Namen (z. B. „3,5 h verplant“) */
  sub?: string;
}

export interface TlBlock {
  key: string;
  lane: string;
  starts_at: string;
  ends_at: string;
  /** Block zeichnen — `style` setzt Lage und Größe, `compact` = wenig Höhe (nur eine Zeile) */
  render: (style: CSSProperties, compact: boolean) => ReactNode;
}

/** Vorschau beim Verschieben: so steht der Termin nach dem Ablegen */
export interface TlPreview {
  lane: string;
  starts_at: string;
  ends_at: string;
  cls: string;
  label: ReactNode;
}

const two = (n: number) => String(n).padStart(2, '0');

export function Tagesansicht({
  day,
  isToday,
  lanes,
  blocks,
  preview,
  laneCls,
  wrapRef,
  canPick,
  onPick,
  busy,
}: {
  day: string;
  isToday: boolean;
  lanes: TlLane[];
  blocks: TlBlock[];
  preview: TlPreview | null;
  /** Hervorhebung einer Spalte beim Verschieben (drop-ok, drop-clash, drop-no) */
  laneCls: (laneId: string) => string;
  wrapRef?: Ref<HTMLDivElement>;
  /** Darf in dieser Spalte per Klick ein neuer Termin entstehen? (Hervorhebung beim Überfahren) */
  canPick?: (laneId: string) => boolean;
  /** Klick/Tippen auf eine freie Stelle: Spalte und Beginn (Minuten, auf 15 min abgerundet) */
  onPick?: (laneId: string, startMin: number) => void;
  /** Während des Verschiebens keine Hervorhebung und kein Klick */
  busy?: boolean;
}) {
  // Freie Stelle unter der Maus (nur Maus/Stift): zeigt, wo ein Klick einen Termin anlegt
  const [hover, setHover] = useState<{ lane: string; min: number } | null>(null);
  // „Jetzt“ jede Minute neu
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isToday) return;
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, [isToday]);

  const { startH, endH } = dayRange(blocks, day);
  const min0 = startH * 60;
  const height = (endH - startH) * 60 * TL_PPM;
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= min0 && nowMin <= endH * 60;

  /** Minute (auf 15 min abgerundet) unter dem Zeiger in einer Spalte — null über einem Block oder Knopf */
  const pickAt = (e: { clientY: number; target: EventTarget | null; currentTarget: HTMLElement }) => {
    if ((e.target as HTMLElement).closest('.pt-block, button, a')) return null;
    const m = min0 + (e.clientY - e.currentTarget.getBoundingClientRect().top) / TL_PPM;
    return Math.min(24 * 60 - 15, Math.max(0, Math.floor(m / 15) * 15));
  };

  const box = (s: number, e: number) => ({
    top: (s - min0) * TL_PPM,
    height: Math.max((Math.max(e, s) - s) * TL_PPM, 20),
  });

  return (
    <div className="pt-tl-wrap" ref={wrapRef}>
      <div className="pt-tl" style={{ gridTemplateColumns: `56px repeat(${lanes.length}, minmax(150px, 1fr))`, minWidth: 56 + lanes.length * 150 }}>
        <div className="pt-tl-corner" />
        {lanes.map((l) => (
          <div key={l.id} className="pt-tl-head" style={{ '--lane': l.color } as CSSProperties}>
            <b>{l.label}</b>
            {l.sub && <span className="muted small">{l.sub}</span>}
          </div>
        ))}

        <div className="pt-tl-gutter" style={{ height }} aria-hidden>
          {hours.map((h) => (
            <span key={h} className="pt-tl-hour" style={{ top: (h * 60 - min0) * TL_PPM }}>
              {two(h)}:00
            </span>
          ))}
        </div>

        {lanes.map((l) => {
          const mine = blocks.filter((b) => b.lane === l.id);
          const cols = layoutColumns(mine.map((b) => ({ id: b.key, s: minuteOfDay(b.starts_at), e: endMinuteOn(b, day) })));
          const pv = preview && preview.lane === l.id ? preview : null;
          const pickable = !!onPick && !!canPick?.(l.id);
          const hv = pickable && !busy && hover?.lane === l.id ? hover.min : null;
          return (
            <div
              key={l.id}
              className={`pt-tl-col ${laneCls(l.id)}${pickable ? ' pickable' : ''}`}
              style={{ height }}
              onClick={
                pickable
                  ? (e) => {
                      if (busy) return;
                      const m = pickAt(e);
                      if (m !== null) onPick!(l.id, m);
                    }
                  : undefined
              }
              onPointerMove={
                pickable
                  ? (e) => {
                      if (e.pointerType === 'touch' || busy) return;
                      const m = pickAt(e);
                      if (m === null) {
                        if (hover) setHover(null);
                      } else if (hover?.lane !== l.id || hover.min !== m) setHover({ lane: l.id, min: m });
                    }
                  : undefined
              }
              onPointerLeave={pickable ? () => setHover(null) : undefined}
              data-drop-day={l.droppable ? day : undefined}
              data-drop-lane={l.droppable ? l.id : undefined}
              data-drop-min0={l.droppable ? min0 : undefined}
              data-drop-ppm={l.droppable ? TL_PPM : undefined}
            >
              {hours.slice(1).map((h) => (
                <span key={h} className="pt-tl-line" style={{ top: (h * 60 - min0) * TL_PPM }} aria-hidden />
              ))}
              {mine.map((b) => {
                const s = minuteOfDay(b.starts_at);
                const bx = box(s, endMinuteOn(b, day));
                const c = cols.get(b.key) ?? { col: 0, cols: 1 };
                const style: CSSProperties = {
                  top: bx.top,
                  height: bx.height,
                  left: `calc(${(c.col / c.cols) * 100}% + 3px)`,
                  width: `calc(${100 / c.cols}% - 6px)`,
                };
                return b.render(style, bx.height < 44);
              })}
              {pv &&
                (() => {
                  const bx = box(minuteOfDay(pv.starts_at), endMinuteOn(pv, day));
                  return (
                    <div className={`pt-tl-preview ${pv.cls}`} style={{ top: bx.top, height: bx.height }} aria-hidden>
                      {pv.label}
                    </div>
                  );
                })()}
              {hv !== null && (
                <span className="pt-tl-pick" style={box(hv, Math.min(hv + 60, 24 * 60))} aria-hidden>
                  + {two(Math.floor(hv / 60))}:{two(hv % 60)}
                </span>
              )}
              {showNow && <span className="pt-tl-now" style={{ top: (nowMin - min0) * TL_PPM }} aria-hidden />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
