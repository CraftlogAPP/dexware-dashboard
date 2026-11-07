// Einführung ins Betriebsportal: einmal je Nutzer beim ersten Besuch (Merker in Portal.tsx), später über
// „Einführung ansehen“ im Menü. 5 Schritte, je eine kleine animierte Skizze des echten Bildschirms + fette Zeile +
// höchstens 2 Sätze. Tastatur: ←/→ blättern, Esc schließt, Tab bleibt im Dialog. Ohne Bewegung bei
// „Bewegung reduzieren“ (einfuehrung.css) — die Skizzen stehen dann gleich im Endzustand.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useInst } from './context';
import './einfuehrung.css';

interface Schritt {
  title: string;
  text: string;
  art: ReactNode;
}

/** Verzögerung für die Einblend-Animation (CSS-Variable --d) */
const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

export function Einfuehrung({ onClose }: { onClose: () => void }) {
  const { isOwner } = useInst();
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const steps: Schritt[] = [
    {
      title: 'Dein Büro am PC',
      text: 'Das Betriebsportal zeigt dieselben Daten wie die InstallateurDex-App – live. Was dein Team am Handy speichert, siehst du hier sofort.',
      art: <ArtSync />,
    },
    {
      title: 'Alles in klaren Gruppen',
      text: isOwner
        ? 'Links findest du Tagesgeschäft, Büro und Berichte – die Einstellungen sind eingeklappt, weil du sie selten brauchst. Am Handy stehen die 5 wichtigsten Seiten oben, der Rest steckt unter „☰ Mehr“.'
        : 'Links findest du das Tagesgeschäft und die Berichte – die Einstellungen sind eingeklappt. Am Handy stehen die 5 wichtigsten Seiten oben, der Rest steckt unter „☰ Mehr“.',
      art: <ArtMenu owner={isOwner} />,
    },
    {
      title: 'Anfragen landen direkt bei dir',
      text: 'Kunden melden Störungen und Wartungswünsche über den QR-Anlagenpass an der Anlage – der Zähler im Menü zeigt, wie viele neu sind. Termin vorschlagen oder gleich in der Plantafel einplanen.',
      art: <ArtRequests />,
    },
    {
      title: 'Fällige Wartungen im Blick',
      text: 'Die Liste zeigt, welche Anlagen überfällig oder bald fällig sind – die dringendsten zuerst. Auf Wunsch erinnert InstallateurDex deine Kunden rechtzeitig per E-Mail.',
      art: <ArtDue />,
    },
    isOwner
      ? {
          title: 'Rechnung schreiben, Export fertig',
          text: 'Aus einem dokumentierten Einsatz wird mit wenigen Klicks eine Rechnung oder ein Angebot – Arbeitszeit und Material sind schon drin. Für die Steuerberatung lädst du den Export als DATEV- oder BMD-Datei herunter.',
          art: <ArtInvoice />,
        }
      : {
          title: 'Garantie in Gefahr zuerst',
          text: 'Unter Berichte siehst du Anlagen, deren Herstellergarantie wegen einer fehlenden Wartung kippen könnte. Diese Einsätze am besten zuerst einplanen.',
          art: <ArtWarranty />,
        },
  ];
  const last = step === steps.length - 1;
  const cur = steps[step];

  // Fokus in den Dialog, Seite dahinter nicht scrollen; beim Schließen Fokus zurück, wo er war.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primary.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowRight' && !last) {
      e.preventDefault();
      setStep((s) => s + 1);
    } else if (e.key === 'ArrowLeft' && step > 0) {
      e.preventDefault();
      setStep((s) => s - 1);
    } else if (e.key === 'Tab') {
      // Fokus bleibt im Dialog
      const f = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!f || f.length === 0) return;
      const first = f[0];
      const end = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div className="ef-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="ef-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ef-title"
        aria-describedby="ef-text"
        onKeyDown={onKeyDown}
      >
        <button type="button" className="ef-close" onClick={onClose} aria-label="Einführung schließen">
          <X className="i" aria-hidden />
        </button>
        {/* key: Skizze startet bei jedem Schritt neu */}
        <div className="ef-art" key={step} aria-hidden>
          {cur.art}
        </div>
        <div className="ef-body" aria-live="polite">
          <div className="ef-step">
            Einführung · Schritt {step + 1} von {steps.length}
          </div>
          <h2 id="ef-title">{cur.title}</h2>
          <p id="ef-text">{cur.text}</p>
        </div>
        <div className="ef-foot">
          <div className="ef-dots" role="group" aria-label="Schritte">
            {steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className={i === step ? 'on' : undefined}
                aria-label={`Schritt ${i + 1}: ${s.title}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <div className="ef-actions">
            {step > 0 ? (
              <button type="button" className="btn ghost small" onClick={() => setStep(step - 1)}>
                Zurück
              </button>
            ) : (
              <button type="button" className="btn ghost small" onClick={onClose}>
                Überspringen
              </button>
            )}
            <button ref={primary} type="button" className="btn" onClick={() => (last ? onClose() : setStep(step + 1))}>
              {last ? 'Los geht’s' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Skizzen (viewBox 560 × 280, Farben aus den Portal-Variablen, siehe einfuehrung.css) ---------- */

/** 1 · Portal am PC und App am Handy, dazwischen laufen Daten; ein neuer Einsatz erscheint erst am Handy, dann im Portal. */
function ArtSync() {
  return (
    <svg viewBox="0 0 560 280" role="presentation">
      {/* Laptop */}
      <g className="ef-in" style={d(0)}>
        <rect x="36" y="34" width="300" height="196" rx="10" className="ef-scr" />
        <rect x="48" y="46" width="64" height="172" rx="6" className="ef-panel" />
        <rect x="56" y="56" width="48" height="9" rx="3" className="ef-cu" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x="56" y={76 + i * 18} width={i % 2 ? 36 : 44} height="7" rx="3" className="ef-line" />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="124" y={50 + i * 34} width="200" height="26" rx="6" className="ef-row" />
        ))}
        <path d="M16 234 H356 L342 248 H30 Z" className="ef-base" />
      </g>
      {/* Handy */}
      <g className="ef-in" style={d(0.15)}>
        <rect x="418" y="46" width="108" height="196" rx="16" className="ef-scr" />
        <rect x="452" y="54" width="40" height="5" rx="2.5" className="ef-line" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="428" y={70 + i * 32} width="88" height="24" rx="6" className="ef-row" />
        ))}
      </g>
      {/* Datenfluss */}
      <path d="M344 118 C 372 96, 392 96, 412 112" className="ef-sync" />
      <path d="M412 168 C 392 186, 372 186, 344 164" className="ef-sync" />
      {/* Neuer Einsatz: erst am Handy … */}
      <g className="ef-pop" style={d(0.6)}>
        <rect x="428" y="102" width="88" height="24" rx="6" className="ef-hl" />
        <text x="438" y="118" className="ef-t ef-t-on">✓ Wartung</text>
      </g>
      {/* … dann im Portal */}
      <g className="ef-pop" style={d(1.5)}>
        <rect x="124" y="84" width="200" height="26" rx="6" className="ef-hl" />
        <text x="136" y="101" className="ef-t ef-t-on">✓ Wartung · Fam. Huber · gerade eben</text>
      </g>
      <text x="186" y="270" className="ef-cap" textAnchor="middle">Portal im Büro</text>
      <text x="472" y="270" className="ef-cap" textAnchor="middle">App beim Monteur</text>
    </svg>
  );
}

/** 2 · Menü mit beschrifteten Gruppen (links) und Handy-Leiste mit „Mehr“ (rechts). */
function ArtMenu({ owner }: { owner: boolean }) {
  const groups: Array<{ label: string; rows: number; collapsed?: boolean }> = [
    { label: 'TAGESGESCHÄFT', rows: owner ? 4 : 5 },
    ...(owner ? [{ label: 'BÜRO', rows: 3 }] : []),
    { label: 'BERICHTE', rows: owner ? 4 : 1 },
    { label: 'EINSTELLUNGEN ▾', rows: 0, collapsed: true },
  ];
  let y = 54;
  const blocks = groups.map((g, gi) => {
    const top = y;
    y += 18 + g.rows * 11 + 6;
    return (
      <g key={g.label} className="ef-in" style={d(0.25 + gi * 0.35)}>
        <text x="66" y={top + 10} className={`ef-t ef-label${g.collapsed ? ' ef-muted' : ''}`}>
          {g.label}
        </text>
        {!g.collapsed && <rect x="58" y={top - 3} width="3" height={g.rows * 11 + 14} rx="1.5" className="ef-ice ef-mark" style={d(0.45 + gi * 0.35)} />}
        {Array.from({ length: g.rows }, (_, i) => (
          <rect key={i} x="66" y={top + 16 + i * 11} width={[118, 92, 104, 80, 98][i % 5]} height="6" rx="3" className="ef-line" />
        ))}
      </g>
    );
  });
  return (
    <svg viewBox="0 0 560 280" role="presentation">
      <g className="ef-in" style={d(0)}>
        <rect x="40" y="14" width="210" height="252" rx="12" className="ef-scr" />
        <rect x="52" y="26" width="186" height="20" rx="6" className="ef-soft" />
        <rect x="62" y="33" width="10" height="7" rx="2" className="ef-cu" />
        <text x="80" y="40" className="ef-t">Start</text>
      </g>
      {blocks}
      {/* Handy mit 5 festen Knöpfen + Mehr */}
      <g className="ef-in" style={d(0.2)}>
        <rect x="352" y="22" width="160" height="236" rx="20" className="ef-scr" />
        <rect x="364" y="44" width="136" height="30" rx="8" className="ef-panel" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={371 + i * 21} y="52" width="14" height="14" rx="4" className={i === 0 ? 'ef-cu' : 'ef-line'} />
        ))}
      </g>
      <g className="ef-pulse" style={d(1.6)}>
        <rect x="476" y="49" width="20" height="20" rx="6" className="ef-ring" />
      </g>
      <text x="486" y="63" className="ef-t" textAnchor="middle">☰</text>
      {/* „Mehr“-Tafel klappt auf */}
      <g className="ef-drop" style={d(2)}>
        <rect x="364" y="82" width="136" height="150" rx="10" className="ef-sheet" />
        {['TAGESGESCHÄFT', owner ? 'BÜRO' : 'BERICHTE', owner ? 'BERICHTE' : 'EINSTELLUNGEN'].map((t, i) => (
          <g key={t}>
            <text x="376" y={104 + i * 44} className="ef-t ef-label">
              {t}
            </text>
            <rect x="376" y={112 + i * 44} width="96" height="6" rx="3" className="ef-line" />
            <rect x="376" y={123 + i * 44} width="70" height="6" rx="3" className="ef-line" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** 3 · QR-Anlagenpass → Anfragen (Zähler) → Termin in der Plantafel. */
function ArtRequests() {
  return (
    <svg viewBox="0 0 560 280" role="presentation">
      {/* Anlage mit QR-Aufkleber */}
      <g className="ef-in" style={d(0)}>
        <rect x="26" y="64" width="78" height="130" rx="10" className="ef-scr" />
        <rect x="42" y="82" width="46" height="46" rx="4" className="ef-paper" />
        {[
          [46, 86], [62, 86], [78, 86], [46, 102], [70, 106], [46, 118], [62, 114], [78, 118],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="8" height="8" rx="1" className="ef-ink" />
        ))}
        <rect x="42" y="142" width="46" height="6" rx="3" className="ef-line" />
        <rect x="42" y="156" width="30" height="6" rx="3" className="ef-line" />
        <text x="65" y="216" className="ef-cap" textAnchor="middle">Anlagenpass</text>
      </g>
      <path d="M110 118 C 124 118, 128 118, 142 118" className="ef-sync" />
      {/* Anfragen mit Zähler */}
      <g className="ef-in" style={d(0.15)}>
        <rect x="148" y="30" width="164" height="214" rx="12" className="ef-scr" />
        <text x="162" y="56" className="ef-t ef-strong">Anfragen</text>
      </g>
      <g className="ef-pop" style={d(1.1)}>
        <circle cx="292" cy="51" r="11" className="ef-cu" />
        <text x="292" y="55.5" className="ef-t ef-t-dark" textAnchor="middle">
          3
        </text>
      </g>
      {[
        { y: 72, t: '🚨 Störung · F28', cls: 'ef-red' },
        { y: 118, t: '🔧 Wartung · WP-001', cls: 'ef-ice' },
        { y: 164, t: '📝 Angebot · Therme', cls: 'ef-amber' },
      ].map((c, i) => (
        <g key={c.t} className="ef-in-l" style={d(0.4 + i * 0.25)}>
          <rect x="160" y={c.y} width="140" height="38" rx="7" className="ef-row" />
          <rect x="160" y={c.y} width="4" height="38" rx="2" className={c.cls} />
          <text x="172" y={c.y + 16} className="ef-t">
            {c.t}
          </text>
          <rect x="172" y={c.y + 24} width="70" height="5" rx="2.5" className="ef-line" />
        </g>
      ))}
      {/* Plantafel */}
      <g className="ef-in" style={d(0.3)}>
        <rect x="340" y="30" width="196" height="214" rx="12" className="ef-scr" />
        <text x="354" y="56" className="ef-t ef-strong">Plantafel</text>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr'].map((t, i) => (
          <g key={t}>
            <text x={370 + i * 36} y="80" className="ef-t ef-muted" textAnchor="middle">
              {t}
            </text>
            <rect x={354 + i * 36} y="88" width="32" height="144" rx="5" className="ef-panel" />
          </g>
        ))}
        <rect x="354" y="150" width="32" height="34" rx="5" className="ef-soft" />
        <rect x="462" y="104" width="32" height="44" rx="5" className="ef-soft" />
      </g>
      {/* Störung wandert in die Plantafel (Di 9:00) */}
      <g className="ef-move" style={d(1.7)}>
        <rect x="390" y="100" width="32" height="40" rx="5" className="ef-cu" />
        <text x="406" y="117" className="ef-t ef-t-dark ef-small" textAnchor="middle">
          9:00
        </text>
        <text x="406" y="131" className="ef-t ef-t-dark ef-small" textAnchor="middle">
          🚨
        </text>
      </g>
    </svg>
  );
}

/** 4 · Liste fälliger Wartungen mit Ampel, eine Erinnerungsmail fliegt zum Kunden. */
function ArtDue() {
  const rows = [
    { c: 'ef-red', w: 130, t: 'überfällig' },
    { c: 'ef-red', w: 104, t: 'überfällig' },
    { c: 'ef-amber', w: 118, t: 'in 12 Tagen' },
    { c: 'ef-amber', w: 92, t: 'in 26 Tagen' },
    { c: 'ef-green', w: 110, t: 'in 74 Tagen' },
  ];
  return (
    <svg viewBox="0 0 560 280" role="presentation">
      <g className="ef-in" style={d(0)}>
        <rect x="30" y="20" width="340" height="242" rx="12" className="ef-scr" />
        <text x="46" y="46" className="ef-t ef-strong">Fällige Wartungen</text>
        <rect x="46" y="58" width="78" height="20" rx="10" className="ef-chip-red" />
        <text x="85" y="72" className="ef-t ef-small" textAnchor="middle">Überfällig 2</text>
        <rect x="130" y="58" width="78" height="20" rx="10" className="ef-chip-amber" />
        <text x="169" y="72" className="ef-t ef-small" textAnchor="middle">30 Tage 2</text>
      </g>
      {rows.map((r, i) => (
        <g key={i} className="ef-in" style={d(0.3 + i * 0.18)}>
          <rect x="44" y={90 + i * 33} width="312" height="27" rx="6" className="ef-row" />
          <circle cx="60" cy={103.5 + i * 33} r="5" className={r.c} />
          <rect x="74" y={97 + i * 33} width={r.w} height="6" rx="3" className="ef-line-strong" />
          <rect x="74" y={107 + i * 33} width={r.w - 40} height="5" rx="2.5" className="ef-line" />
          <text x="344" y={107 + i * 33} className="ef-t ef-muted ef-small" textAnchor="end">
            {r.t}
          </text>
        </g>
      ))}
      {/* Kunde bekommt die Erinnerung */}
      <g className="ef-in" style={d(0.5)}>
        <circle cx="478" cy="118" r="38" className="ef-panel" />
        <circle cx="478" cy="106" r="11" className="ef-line-strong" />
        <path d="M456 140 C 460 124, 496 124, 500 140 Z" className="ef-line-strong" />
        <text x="478" y="182" className="ef-cap" textAnchor="middle">Kunde</text>
      </g>
      <g className="ef-fly" style={d(1.4)}>
        <rect x="455" y="196" width="46" height="32" rx="5" className="ef-paper" />
        <path d="M456 198 L478 214 L500 198" className="ef-ink-line" />
      </g>
      <text x="478" y="250" className="ef-cap" textAnchor="middle">Erinnerung per E-Mail</text>
    </svg>
  );
}

/** 5 (Inhaber) · Rechnung füllt sich, wird ausgestellt; Export wandert zur Steuerberatung. */
function ArtInvoice() {
  return (
    <svg viewBox="0 0 560 280" role="presentation">
      <g className="ef-in" style={d(0)}>
        <rect x="50" y="16" width="200" height="250" rx="8" className="ef-paper" />
        <rect x="50" y="16" width="200" height="8" rx="4" className="ef-cu" />
        <text x="66" y="48" className="ef-t ef-ink-text ef-strong">Rechnung</text>
        <rect x="66" y="58" width="80" height="5" rx="2.5" className="ef-ink-soft" />
      </g>
      {[
        ['Arbeitszeit 1,5 h', '96,00'],
        ['Anfahrt', '35,00'],
        ['Dichtungssatz', '18,40'],
        ['Brennerreinigung', '89,00'],
      ].map(([a, b], i) => (
        <g key={a} className="ef-in-l" style={d(0.35 + i * 0.25)}>
          <text x="66" y={94 + i * 24} className="ef-t ef-ink-text ef-small">
            {a}
          </text>
          <text x="234" y={94 + i * 24} className="ef-t ef-ink-text ef-small" textAnchor="end">
            {b} €
          </text>
        </g>
      ))}
      <g className="ef-in" style={d(1.4)}>
        <rect x="66" y="196" width="168" height="1.5" className="ef-ink-soft" />
        <text x="66" y="216" className="ef-t ef-ink-text ef-strong">Summe</text>
        <text x="234" y="216" className="ef-t ef-ink-text ef-strong" textAnchor="end">
          238,40 €
        </text>
      </g>
      <g className="ef-stamp" style={d(1.9)}>
        <rect x="150" y="228" width="90" height="26" rx="6" className="ef-stamp-box" />
        <text x="195" y="245" className="ef-t ef-stamp-text" textAnchor="middle">
          ✓ Ausgestellt
        </text>
      </g>
      {/* Export → Steuerberatung */}
      <g className="ef-in" style={d(0.6)}>
        <path d="M430 108 h34 l8 10 h44 a6 6 0 0 1 6 6 v76 a6 6 0 0 1 -6 6 h-86 a6 6 0 0 1 -6 -6 v-86 a6 6 0 0 1 6 -6 z" className="ef-folder" />
        <text x="474" y="230" className="ef-cap" textAnchor="middle">Steuerberatung</text>
      </g>
      <g className="ef-file" style={d(2.2)}>
        <path d="M444 132 h30 l12 12 v42 h-42 z" className="ef-paper" />
        <path d="M474 132 v12 h12" className="ef-ink-line" />
        <text x="465" y="164" className="ef-t ef-ink-text ef-small" textAnchor="middle">DATEV</text>
        <text x="465" y="178" className="ef-t ef-ink-text ef-small" textAnchor="middle">BMD</text>
      </g>
      <path d="M262 150 C 300 150, 380 150, 418 150" className="ef-sync" />
    </svg>
  );
}

/** 5 (Monteur) · Schutzschild mit Ring, der schrumpft; gefährdete Anlagen darunter. */
function ArtWarranty() {
  return (
    <svg viewBox="0 0 560 280" role="presentation">
      <g className="ef-in" style={d(0)}>
        <circle cx="150" cy="140" r="78" className="ef-ring-bg" />
        <circle cx="150" cy="140" r="78" className="ef-ring-arc" transform="rotate(-90 150 140)" />
        <path d="M150 92 L188 106 V138 C188 164 170 182 150 190 C130 182 112 164 112 138 V106 Z" className="ef-shield" />
        <text x="150" y="150" className="ef-t ef-t-dark ef-big" textAnchor="middle">
          !
        </text>
      </g>
      {[
        { t: 'WP-001 · Wartung fehlt', s: 'Garantie kippt in 18 Tagen' },
        { t: 'GT-014 · Wartung fehlt', s: 'Garantie kippt in 41 Tagen' },
      ].map((r, i) => (
        <g key={r.t} className="ef-in-l" style={d(0.6 + i * 0.3)}>
          <rect x="280" y={88 + i * 60} width="250" height="48" rx="8" className="ef-row" />
          <rect x="280" y={88 + i * 60} width="4" height="48" rx="2" className="ef-amber" />
          <text x="296" y={108 + i * 60} className="ef-t">
            {r.t}
          </text>
          <text x="296" y={125 + i * 60} className="ef-t ef-muted ef-small">
            {r.s}
          </text>
        </g>
      ))}
    </svg>
  );
}
