// Unterschrift der prüfenden Person — mit dem Finger auf einer weißen Fläche gezeichnet und als PNG-Daten-URI
// gespeichert, genau wie in der App (mobile/src/components/SignatureField.tsx: weißer Grund, dunkle Schrift,
// damit sie im Prüfbericht lesbar ist). Einmal hinterlegt, wird sie mit jeder Prüfung gespeichert
// (einfache elektronische Unterschrift) und auf diesem Gerät je Konto gemerkt.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/form';

const OUT_WIDTH = 480; // größte Breite des gespeicherten Bilds in Pixeln (klein genug für die Datenbank, scharf genug fürs PDF)
const PEN = '#111827';

export function Unterschrift({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (dataUri: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pv-sig">
      <span className="pv-sig-label">Unterschrift (wird mit der Prüfung gespeichert)</span>
      <button
        type="button"
        className="pv-sig-box"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={value ? 'Unterschrift ändern' : 'Unterschreiben'}
      >
        {value ? <img src={value} alt="Deine Unterschrift" /> : <span>Tippen, um einmalig zu unterschreiben</span>}
      </button>
      {value && !disabled && (
        <span className="pv-sig-actions">
          <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
            Ändern
          </button>
          <button type="button" className="btn ghost small" onClick={() => onChange('')}>
            Entfernen
          </button>
        </span>
      )}
      {open && (
        <Pad
          onClose={() => setOpen(false)}
          onDone={(sig) => {
            onChange(sig);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Pad({ onClose, onDone }: { onClose: () => void; onDone: (dataUri: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(false);
  const [empty, setEmpty] = useState(false);

  // Zeichenfläche in echter Pixeldichte anlegen (sonst wirkt der Strich am Handy unscharf)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = PEN;
    ctx.fillStyle = PEN;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ohne Zeiger-Bindung geht es auch */
    }
    drawing.current = true;
    const p = point(e);
    last.current = p;
    // ein Punkt (z. B. i-Punkt) entsteht schon beim Antippen
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
    setInk(true);
    setEmpty(false);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = PEN;
    setInk(false);
  };

  const accept = () => {
    const c = canvasRef.current;
    if (!c || !ink) return setEmpty(true);
    // verkleinern (nie vergrößern): kleines Bild auf jedem Gerät, weißer Grund (PNG ohne Durchsicht)
    const out = document.createElement('canvas');
    out.width = Math.min(OUT_WIDTH, c.width);
    out.height = Math.max(1, Math.round((out.width * c.height) / c.width));
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0, out.width, out.height);
    const uri = out.toDataURL('image/png');
    if (!uri.startsWith('data:image/png')) return;
    onDone(uri);
  };

  return (
    <Modal title="Unterschrift" onClose={onClose} dirty={ink}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Mit dem Finger unterschreiben. Die Unterschrift wird auf diesem Gerät gemerkt und mit jeder Prüfung gespeichert.
      </p>
      <canvas
        ref={canvasRef}
        className="pv-sig-pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Zeichenfläche für die Unterschrift"
      />
      {empty && <div className="error-box">Noch leer — bitte zuerst unterschreiben.</div>}
      <div className="ez-actions">
        <button type="button" className="btn ez-big" onClick={accept}>
          Übernehmen
        </button>
        <button type="button" className="btn ghost ez-big" onClick={clear}>
          Löschen
        </button>
        <button type="button" className="btn ghost ez-big" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}
