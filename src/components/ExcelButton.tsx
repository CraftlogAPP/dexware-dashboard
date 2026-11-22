// Knopf „Excel-Liste“ — Baustein für alle App-Bereiche (Datei bauen: src/lib/xlsx.ts).
// Kümmert sich um Warten, Doppelklick und Meldungen; die Seite liefert nur `onExport` (Daten laden + downloadXlsx).
// Hinweise statt Fehler (z. B. „gehört zu Pro“, „Zeitraum wählen“): `throw new ExportNotice('…')` — erscheint blau.

import { useRef, useState, type ReactNode } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { ExportNotice } from '../lib/xlsx';

export function ExcelButton({
  onExport,
  label = 'Excel-Liste',
  title,
  disabled,
  className = 'btn ghost',
  children,
}: {
  onExport: () => Promise<void>;
  label?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  /** zusätzlicher Inhalt im Knopf (z. B. ein „Pro“-Abzeichen) */
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ notice: boolean; text: string; link?: { href: string; label: string } } | null>(null);
  const running = useRef(false); // Doppelklick: nur ein Export gleichzeitig (State kommt einen Takt zu spät)

  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMsg(null);
    try {
      await onExport();
    } catch (e) {
      if (e instanceof ExportNotice) setMsg({ notice: true, text: e.message, link: e.link });
      else setMsg({ notice: false, text: e instanceof Error ? e.message : 'Die Excel-Liste konnte nicht erstellt werden.' });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void run()} disabled={busy || disabled} title={title} aria-busy={busy}>
        <FileSpreadsheet className="i" aria-hidden /> {busy ? 'Wird erstellt …' : label}
        {children}
      </button>
      {msg && (
        // excel-msg: in einer Knopf-/Filterzeile (flex-wrap) eigene Zeile über die volle Breite
        <div className={`${msg.notice ? 'info-box' : 'error-box'} excel-msg`} role={msg.notice ? 'status' : 'alert'}>
          {msg.text}
          {msg.link && (
            <>
              {' '}
              <a href={msg.link.href}>{msg.link.label}</a>
            </>
          )}
        </div>
      )}
    </>
  );
}
