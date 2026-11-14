// Kleine Bausteine des ObjektDex-Bereichs: Tagesstatus, Soll/Ist-Anzeige, Fotos, Datum/Zeit (Berlin).
import { useEffect, useState } from 'react';
import { Modal } from '../components/form';
import { isSafeImgSrc } from '../lib/imgSrc';
import { useOd } from './context';
import { STATUS_BADGE, STATUS_LABEL } from './types';
import { dayOf, formatDay, isoDow, WEEKDAY_SHORT, type Day, type DayStatus } from './turnus';

export function DayBadge({ status }: { status: DayStatus }) {
  return <span className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</span>;
}

/** „4 von 4“ grün, „2 von 4“ orange, „0 von 0“ neutral „noch nicht fällig“, nach Bedarf „3×“ */
export function SollIstBadge({ soll, ist }: { soll: number | null; ist: number }) {
  if (soll == null) return <span className="badge">{ist}× nach Bedarf</span>;
  if (soll === 0) return <span className="badge">noch nicht fällig{ist ? ` · ${ist}× erledigt` : ''}</span>;
  const cls = ist >= soll ? 'badge green' : ist === 0 ? 'badge red' : 'badge amber';
  return (
    <span className={cls}>
      {ist} von {soll}
    </span>
  );
}

const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const dtFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Uhrzeit in Berliner Zeit */
export const fmtTimeB = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '—');
/** Datum + Uhrzeit in Berliner Zeit */
export const fmtDateTimeB = (iso: string | null | undefined) => (iso ? `${dtFmt.format(new Date(iso))} Uhr` : '—');
/** „Mi, 11.11.2026“ aus einem Berliner Tag */
export const fmtDayLong = (d: Day) => `${WEEKDAY_SHORT[isoDow(d)]}, ${formatDay(d)}`;
/** Berliner Tag eines Zeitstempels als „TT.MM.JJJJ“ */
export const fmtDayOf = (iso: string | null | undefined) => (iso ? formatDay(dayOf(iso)) : '—');

/** Fotos eines Einsatzes/Mangels: Knopf „n Fotos“ öffnet eine Bildansicht. */
export function PhotoButton({ kind, id, count }: { kind: 'operation' | 'defect'; id: string; count: number }) {
  const [open, setOpen] = useState(false);
  if (!count) return <span className="muted">—</span>;
  return (
    <>
      <button className="btn ghost small" onClick={() => setOpen(true)}>
        {count} {count === 1 ? 'Foto' : 'Fotos'}
      </button>
      {open && <PhotoModal kind={kind} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

function PhotoModal({ kind, id, onClose }: { kind: 'operation' | 'defect'; id: string; onClose: () => void }) {
  const { data } = useOd();
  const [urls, setUrls] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    data
      .photos(kind, [id])
      .then((m) => setUrls((m.get(id) ?? []).filter(isSafeImgSrc)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [data, kind, id]);
  return (
    <Modal title="Fotos" onClose={onClose} dirty={false}>
      {err && <div className="error-box">{err}</div>}
      {!urls && !err && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
      {urls && urls.length === 0 && <p className="muted">Keine Fotos verfügbar.</p>}
      <div className="od-photos">
        {(urls ?? []).map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer">
            <img src={u} alt={`Foto ${i + 1}`} />
          </a>
        ))}
      </div>
    </Modal>
  );
}

/** In die Zwischenablage kopieren, mit kurzer Bestätigung. */
export function CopyButton({ text, label = 'Kopieren' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn small"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          },
          () => window.prompt('Bitte kopieren:', text),
        );
      }}
    >
      {done ? 'Kopiert ✓' : label}
    </button>
  );
}
