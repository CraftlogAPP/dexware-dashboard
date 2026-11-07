// Anlagen-Schema im Portal — wie App components/anlage/AnlagenSchema.tsx: jede Anlage als ruhiges Schaubild
// Quelle → Gerät → Verbraucher, Vorlauf warm (Kupfer) und Rücklauf kühl (Eisblau) als gestrichelte Leitungen,
// Status-Licht nach Wartungsstand, darunter Hauptzeile, Hinweise und 2–4 Kennzahlen. Logik in ./anlagenBild.ts.
//
// Bewegung: nur CSS (stroke-dashoffset), keine JS-Schleife. „Bewegung reduzieren“ → stehendes Bild (anlagenSchema.css).
// Außer Betrieb / ausgesondert: Leitungen ohne Strichelung, Teile gedämpft (die Anlage läuft ja auch nicht).
// Größen: „large“ (Anlagenseite, fließend) und „small“ (Objektseite, Liste: still, ohne Beschriftung).

import { useMemo, type ComponentType, type CSSProperties } from 'react';
import {
  AirVent,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Barrel,
  Building2,
  CircleGauge,
  Cog,
  CornerRightDown,
  Cylinder,
  Database,
  Droplet,
  Droplets,
  Fan,
  Filter,
  Flame,
  Gauge,
  Heater,
  House,
  ShowerHead,
  Snowflake,
  SolarPanel,
  ThermometerSun,
  Toilet,
  Waves,
  Wind,
  type LucideProps,
} from 'lucide-react';
import type { Asset } from '../types';
import { anlagenBild, type AnlagenBild, type AnlagenStand, type SchemaLine, type SchemaNode, type StatusTone } from './anlagenBild';
import './anlagenSchema.css';

/** App-Symbole (MaterialCommunityIcons) → lucide */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  fan: Fan,
  'heat-pump': ThermometerSun,
  'water-boiler': Cylinder,
  'water-well': ArrowDownToLine,
  'air-conditioner': Snowflake,
  'pipe-valve': CircleGauge,
  radiator: Heater,
  barrel: Barrel,
  'storage-tank': Database,
  fireplace: Flame,
  'heat-wave': Waves,
  'heating-coil': ArrowRightLeft,
  water: Droplet,
  'shower-head': ShowerHead,
  'solar-panel': SolarPanel,
  'weather-windy': Wind,
  hvac: AirVent,
  'home-outline': House,
  'water-percent': Droplets,
  filter: Filter,
  'water-pump': Gauge,
  'office-building': Building2,
  toilet: Toilet,
  pump: ArrowUpFromLine,
  pipe: CornerRightDown,
  cog: Cog,
};
const iconOf = (name: string) => ICONS[name] ?? Cog;

type Size = 'large' | 'small';

function Pipes({ lines, mode }: { lines: SchemaLine[]; mode: 'flow' | 'still' | 'off' }) {
  return (
    <div className="as-pipes">
      {lines.map((l, i) => (
        <span key={i} className={`as-pipe t-${l.tone}${l.reverse ? ' rev' : ''}`} title={l.label}>
          {mode !== 'off' && (
            <svg aria-hidden focusable="false">
              <line x1="0" y1="50%" x2="100%" y2="50%" className={mode === 'flow' ? 'flow' : undefined} />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}

function Node({ node, main, multi, led, size }: { node: SchemaNode; main?: boolean; multi?: boolean; led?: StatusTone; size: Size }) {
  const Icon = iconOf(node.icon);
  const px = size === 'small' ? (main ? 19 : 16) : main ? 30 : 24;
  return (
    <span className={`as-node${main ? ' main' : ''}`} title={node.label}>
      {multi ? (
        <span className="as-multi">
          <Icon size={px * 0.78} aria-hidden />
          <Icon size={px * 0.78} aria-hidden className="as-muted" />
        </span>
      ) : (
        <Icon size={px} aria-hidden />
      )}
      {led && <span className={`as-led tone-${led}`} aria-hidden />}
    </span>
  );
}

/** Nur die Zeichnung: Teile, Leitungen, Status-Licht, Beschriftungen (large). */
export function SchemaDrawing({ bild, size = 'large', still = false }: { bild: AnlagenBild; size?: Size; still?: boolean }) {
  const { spec } = bild;
  const hasMid = !!spec.mid;
  const mode = !bild.flowing ? 'off' : still ? 'still' : 'flow';
  const cols = hasMid ? 'var(--as-node) 1fr var(--as-main) 1fr var(--as-node)' : 'var(--as-node) 1fr var(--as-main)';
  return (
    <div className={`as-draw ${size}${bild.flowing ? '' : ' dim'}`} style={{ gridTemplateColumns: cols } as CSSProperties}>
      <Node node={spec.left} size={size} />
      <div className="as-link">
        {bild.lineText && size === 'large' && <span className="as-linetext">{bild.lineText}</span>}
        <Pipes lines={spec.linkA} mode={mode} />
      </div>
      {spec.mid ? (
        <>
          <Node node={spec.mid} main led={bild.tone} size={size} />
          <div className="as-link">
            <Pipes lines={spec.linkB} mode={mode} />
          </div>
          <Node node={spec.right} multi={spec.rightMulti} size={size} />
        </>
      ) : (
        <Node node={spec.right} main multi={spec.rightMulti} led={bild.tone} size={size} />
      )}
      {size === 'large' && (
        <>
          <span className="as-label">{spec.left.label}</span>
          <span />
          {spec.mid && (
            <>
              <span className="as-label">{spec.mid.label}</span>
              <span />
            </>
          )}
          <span className="as-label">{spec.right.label}</span>
        </>
      )}
    </div>
  );
}

/**
 * Zeichnet ein fertig berechnetes Bild. `size="small"`: ruhige Kurzform für Listen (still, ohne Texte);
 * `still`: gestrichelt, aber ohne Bewegung. `framed={false}`: ohne eigene Karte.
 */
export function AnlagenSchemaBild({ bild, size = 'large', still = false, framed = true }: { bild: AnlagenBild; size?: Size; still?: boolean; framed?: boolean }) {
  if (size === 'small') {
    return (
      <div className="as-small" role="img" aria-label={bild.a11y} title={bild.a11y}>
        <SchemaDrawing bild={bild} size="small" still />
      </div>
    );
  }
  return (
    <div className={framed ? 'as-card' : 'as-bare'} role="img" aria-label={bild.a11y}>
      <SchemaDrawing bild={bild} still={still} />
      <div className={`as-status tone-${bild.tone}`}>
        <span className={`as-led tone-${bild.tone}`} aria-hidden />
        <b>{bild.headline}</b>
      </div>
      {bild.hints.map((h) => (
        <div key={h.text} className={`as-hint tone-${h.tone}`}>
          <span className="as-dot" aria-hidden />
          {h.text}
        </div>
      ))}
      {bild.kennzahlen.length > 0 && (
        <div className="as-grid">
          {bild.kennzahlen.map((k) => (
            <div key={k.label} className="as-cell">
              <span className="as-cell-label">{k.label}</span>
              <span className="as-cell-value">{k.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bild einer Anlage aus dem, was das Portal je Anlage weiß (letzte Wartung, Dichtheit, offene Mängel). */
export function AnlagenSchema({ asset, stand, size = 'large', still }: { asset: Asset; stand: AnlagenStand; size?: Size; still?: boolean }) {
  const bild = useMemo(() => anlagenBild(asset, stand), [asset, stand]);
  return <AnlagenSchemaBild bild={bild} size={size} still={still} />;
}
