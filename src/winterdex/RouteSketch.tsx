// Kartenskizze im Dashboard: gleiche Geometrie und Farben wie im PDF (routes.ts → buildSketch).
// Bewusst ohne Kartendienst — kein Fremd-Server, lädt sofort, sieht im Druck genauso aus.

import { useEffect, useState, type ReactNode } from 'react';
import { buildSketch, firstPoint, ROUTE_COLORS, type LatLng, type Track } from './routes';

// Am Handy (≤560 px wie die Detail-Karten) schmaleres Format — sonst wird die 640er-Skizze auf
// ~360 px gestaucht und Maßstab, Nordpfeil und Linien werden winzig.
function useNarrow(max = 560): boolean {
  const q = `(max-width: ${max}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}

export function RouteSketch({
  plan,
  track,
  missed,
  label,
}: {
  plan?: LatLng[] | null;
  track?: Track | null;
  missed?: LatLng[][] | null;
  label: string;
}) {
  const narrow = useNarrow();
  const s = buildSketch(plan, track, missed, narrow ? 360 : 640, narrow ? 300 : 360);
  if (!s) return <div className="card empty">Keine Kartenskizze — es wurden keine Positionen aufgezeichnet.</div>;
  const c = ROUTE_COLORS;
  const p = firstPoint(plan, track);
  const items: ReactNode[] = [];
  if (s.plan) items.push(<span key="p"><i style={{ background: c.plan }} /> Strecken-Vorlage</span>);
  if (s.track.length) items.push(<span key="t"><i style={{ background: c.track }} /> gefahren (GPS)</span>);
  if (s.missed.length) items.push(<span key="m"><i style={{ background: c.missed }} /> nicht befahren</span>);
  return (
    <figure className="route-sketch">
      <svg viewBox={`0 0 ${s.w} ${s.h}`} role="img" aria-label={label}>
        {s.plan && <polyline points={s.plan} fill="none" stroke={c.plan} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />}
        {s.track.map((pts, i) => (
          <polyline key={`t${i}`} points={pts} fill="none" stroke={c.track} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {s.missed.map((pts, i) => (
          <polyline key={`m${i}`} points={pts} fill="none" stroke={c.missed} strokeWidth={5} strokeDasharray="8 6" />
        ))}
        {s.start && <circle cx={s.start[0]} cy={s.start[1]} r={7} fill={c.track} stroke="#fff" strokeWidth={3} />}
        {s.end && <circle cx={s.end[0]} cy={s.end[1]} r={7} fill={c.end} stroke="#fff" strokeWidth={3} />}
        <g fontFamily="Arial" fontSize={12} fill="#233648">
          <line x1={s.scale.x} y1={s.scale.y} x2={s.scale.x + s.scale.px} y2={s.scale.y} stroke="#233648" strokeWidth={3} />
          <text x={s.scale.x} y={s.scale.y - 6}>{s.scale.label}</text>
          <text x={s.w - 22} y={22} fontWeight={700}>N</text>
          <line x1={s.w - 18} y1={28} x2={s.w - 18} y2={46} stroke="#233648" strokeWidth={2} />
        </g>
      </svg>
      <figcaption className="route-legend small muted">
        {items}
        <span>● Start grün · Ende dunkel</span>
        {p && (
          <a href={`https://www.openstreetmap.org/?mlat=${p[0]}&mlon=${p[1]}#map=17/${p[0]}/${p[1]}`} target="_blank" rel="noreferrer">
            Auf Karte zeigen ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}

/** Abdeckung als farbiges Abzeichen: ab 95 % grün, ab 70 % gelb, sonst rot. */
export function CoverageBadge({ pct, canceled }: { pct: number | null | undefined; canceled?: boolean }) {
  if (canceled) return <span className="badge red">Storniert</span>;
  if (pct == null) return <span className="muted">—</span>;
  const cls = pct >= 95 ? 'badge green' : pct >= 70 ? 'badge amber' : 'badge red';
  return <span className={cls}>{pct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</span>;
}
