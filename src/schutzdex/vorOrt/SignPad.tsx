// Unterschrift des Mitarbeiters direkt auf der Seite (nicht im Dialog) — wie SignaturePad in der App
// (src/components/SignaturePad.tsx): Fläche zum Unterschreiben, darunter „Löschen“ und der Abschluss-Knopf.
// Ergebnis im Format der App: PNG als Daten-URI (data:image/png;base64,…), weißer Grund, dunkle Schrift — so ist sie
// im Nachweis-PDF lesbar. Die Zeichenfläche selbst ist dieselbe wie bei der Prüfer-Unterschrift (src/pruefen/Unterschrift.tsx).
import { useEffect, useRef, useState } from 'react';

const OUT_WIDTH = 480; // größte Breite des gespeicherten Bilds in Pixeln (klein genug für die Datenbank, scharf genug fürs PDF)
const PEN = '#111827';

export function SignPad({
  onConfirm,
  confirmLabel,
  busy,
  who,
}: {
  onConfirm: (dataUri: string) => void;
  confirmLabel: string;
  /** Speichern läuft — Knöpfe sperren (kein zweiter Nachweis per Doppeltipp). */
  busy?: boolean;
  /** Name der Person, die unterschreibt (für Vorlese-Programme) */
  who: string;
}) {
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
    if (busy) return;
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
    if (!uri.startsWith('data:image/png;base64,')) return;
    onConfirm(uri);
  };

  return (
    <div className="sd-sign">
      <canvas
        ref={canvasRef}
        className="pv-sig-pad sd-sign-pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={`Zeichenfläche für die Unterschrift von ${who}`}
        data-testid="sd-pad"
      />
      {empty && (
        <div className="error-box" role="alert">
          <b>Keine Unterschrift</b> — bitte zuerst unterschreiben.
        </div>
      )}
      <div className="ez-actions">
        <button type="button" className="btn ez-big" onClick={accept} disabled={busy} data-testid="sd-sign">
          {busy ? 'Speichert …' : confirmLabel}
        </button>
        <button type="button" className="btn ghost ez-big" onClick={clear} disabled={busy}>
          Löschen
        </button>
      </div>
    </div>
  );
}
