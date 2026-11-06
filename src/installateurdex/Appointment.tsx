// Online-Terminwahl im Anfrage-Detail: bis zu 3 Zeitfenster vorschlagen (RPC propose_slots), Link für den
// Kunden kopieren oder per E-Mail schicken. Der Kunde wählt auf …/termin/?t=… → Status „Geplant".
// Gleiche Zeitfenster-Vorschläge und gleicher Text wie SlotProposalSheet in der App.

import { useState } from 'react';
import { CalendarPlus, Copy, Mail, Trash2 } from 'lucide-react';
import { useInst } from './context';
import {
  appointmentOf,
  appointmentText,
  kindInfo,
  mailHref,
  slotLabel,
  terminUrl,
  type Asset,
  type ServiceRequest,
  type Site,
  type Slot,
} from './types';

interface Row {
  date: string;
  from: string;
  to: string;
}

const WINDOWS: { label: string; from: string; to: string }[] = [
  { label: '7–9', from: '07:00', to: '09:00' },
  { label: '8–10', from: '08:00', to: '10:00' },
  { label: '10–12', from: '10:00', to: '12:00' },
  { label: '13–15', from: '13:00', to: '15:00' },
  { label: '15–17', from: '15:00', to: '17:00' },
];
const MAX_SLOTS = 3;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** n-ter Werktag ab morgen (ohne Sonntag), wie nextDays in der App. */
function workday(n: number): string {
  const d = new Date();
  let found = 0;
  while (found < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) found += 1;
  }
  return isoDay(d);
}

function toSlots(rows: Row[]): { slots: Slot[]; error?: string } {
  const slots: Slot[] = [];
  for (const [i, r] of rows.entries()) {
    const n = rows.length > 1 ? ` (Termin ${i + 1})` : '';
    if (!r.date || !r.from || !r.to) return { slots, error: `Bitte Datum und Uhrzeit ausfüllen${n}.` };
    const start = new Date(`${r.date}T${r.from}:00`);
    const end = new Date(`${r.date}T${r.to}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { slots, error: `Datum oder Uhrzeit ungültig${n}.` };
    if (end <= start) return { slots, error: `„bis" muss nach „von" liegen${n}.` };
    if (start.getTime() <= Date.now()) return { slots, error: `Der Termin liegt in der Vergangenheit${n}.` };
    if (end.getTime() - start.getTime() > 12 * 3_600_000) return { slots, error: `Ein Zeitfenster darf höchstens 12 Stunden lang sein${n}.` };
    if (slots.some((s) => s.start === start.toISOString())) return { slots, error: `Zwei Termine beginnen gleichzeitig${n}.` };
    slots.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return { slots: slots.sort((a, b) => a.start.localeCompare(b.start)) };
}

export function AppointmentCard({
  r,
  asset,
  site,
  onChanged,
}: {
  r: ServiceRequest;
  asset: Asset | null;
  site: Site | null;
  onChanged: () => void;
}) {
  const { data, org } = useInst();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [{ date: workday(1), from: '08:00', to: '10:00' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justProposed, setJustProposed] = useState(false);

  const appt = appointmentOf(r);
  const closed = r.status === 'done' || r.status === 'dismissed';
  const link = closed ? null : terminUrl(r.slot_token);
  const slots = Array.isArray(r.slots) ? r.slots : [];
  const name = r.contact_name || site?.operator_name || '';
  // „Ihre Anlage …" passt für jeden Typ (nicht „Ihre Warmwasserspeicher").
  const what = asset ? `Ihre Anlage ${asset.name} (${kindInfo(asset.kind).label})` : 'Ihren Termin';

  const subject = appt?.state === 'picked' ? 'Ihr Termin' : 'Terminvorschläge';
  const body = link
    ? appt?.state === 'picked'
      ? `${name ? `Guten Tag ${name},` : 'Guten Tag,'}\n\nIhr Termin für ${what}: ${slotLabel(appt.start, appt.end)} Uhr.\n` +
        `Details und Kalender-Eintrag: ${link}\n\nViele Grüße\n${org.name}`
      : `${name ? `Guten Tag ${name},` : 'Guten Tag,'}\n\nfür ${what} schlagen wir vor:\n` +
        slots.map((s) => `• ${slotLabel(s.start, s.end)} Uhr`).join('\n') +
        `\n\nBitte hier mit einem Klick wählen: ${link}\n\nViele Grüße\n${org.name}`
    : '';
  const mail = link && r.contact_email ? mailHref(r.contact_email, subject, body) : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback ohne Clipboard-API (ältere Browser, http)
      const el = document.getElementById(`termin-link-${r.id}`) as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function propose() {
    const { slots: s, error: e } = toSlots(rows);
    if (e) return setError(e);
    setBusy(true);
    setError(null);
    try {
      await data.proposeSlots(r.id, s);
      setEditing(false);
      setJustProposed(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="card">
      <h3 className="idx-card-title">Termin</h3>
      {appt ? (
        <div className={`idx-appt ${appt.state}`}>{appointmentText(appt)}</div>
      ) : (
        <p className="small muted" style={{ marginTop: 0 }}>
          Noch keine Termine vorgeschlagen. Schlag bis zu {MAX_SLOTS} Zeitfenster vor — der Kunde wählt per Link mit einem
          Klick, die Anfrage steht dann auf „Geplant".
        </p>
      )}

      {slots.length > 0 && !editing && (
        <ul className="idx-slot-list">
          {slots.map((s) => {
            const chosen = r.scheduled_at && new Date(r.scheduled_at).getTime() === new Date(s.start).getTime();
            const past = new Date(s.start).getTime() <= Date.now();
            return (
              <li key={s.start} className={chosen ? 'chosen' : past ? 'past' : undefined}>
                {slotLabel(s.start, s.end)} Uhr {chosen && <b>· gewählt</b>}
                {!chosen && past && <span className="muted"> · verstrichen</span>}
              </li>
            );
          })}
        </ul>
      )}

      {link && !editing && (
        <div className="idx-link-box">
          {justProposed && <div className="idx-ok" style={{ marginBottom: 6 }}>✓ Vorgeschlagen — jetzt den Link an den Kunden schicken.</div>}
          <label className="field" style={{ marginBottom: 8 }}>
            Link für den Kunden
            <input id={`termin-link-${r.id}`} type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn small" onClick={() => void copy()}>
              <Copy className="i" aria-hidden /> {copied ? 'Kopiert ✓' : 'Link kopieren'}
            </button>
            {mail ? (
              <a className="btn ghost small" href={mail}>
                <Mail className="i" aria-hidden /> Per E-Mail senden
              </a>
            ) : (
              <span className="small muted">
                {r.contact_email ? 'Diese E-Mail-Adresse wird nicht verlinkt — Link bitte kopieren.' : 'Keine E-Mail-Adresse — Link kopieren und z. B. per SMS schicken.'}
              </span>
            )}
          </div>
        </div>
      )}

      {closed ? (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Für erledigte oder abgelehnte Anfragen gibt es keine Terminwahl.
        </p>
      ) : editing ? (
        <div className="idx-slot-editor">
          {rows.map((row, i) => (
            <div key={i} className="idx-slot-row">
              <label className="field">
                Tag
                <input type="date" value={row.date} min={isoDay(new Date())} onChange={(e) => setRow(i, { date: e.target.value })} />
              </label>
              <label className="field">
                von
                <input type="time" value={row.from} step={900} onChange={(e) => setRow(i, { from: e.target.value })} />
              </label>
              <label className="field">
                bis
                <input type="time" value={row.to} step={900} onChange={(e) => setRow(i, { to: e.target.value })} />
              </label>
              {rows.length > 1 && (
                <button type="button" className="btn ghost small idx-slot-del" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`Termin ${i + 1} entfernen`}>
                  <Trash2 className="i" aria-hidden />
                </button>
              )}
              <div className="idx-slot-windows">
                {WINDOWS.map((w) => (
                  <button
                    key={w.label}
                    type="button"
                    className={row.from === w.from && row.to === w.to ? 'on' : ''}
                    onClick={() => setRow(i, { from: w.from, to: w.to })}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {rows.length < MAX_SLOTS && (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setRows((rs) => [...rs, { date: workday(rs.length + 1), from: rs[rs.length - 1]?.from ?? '08:00', to: rs[rs.length - 1]?.to ?? '10:00' }])}
            >
              ＋ weiteres Zeitfenster
            </button>
          )}
          {appt?.state === 'picked' && (
            <div className="info-box">Der Kunde hat schon gewählt — ein neuer Vorschlag hebt den gewählten Termin auf.</div>
          )}
          {appt && appt.state !== 'picked' && <div className="info-box">Ein neuer Vorschlag macht den bisherigen Link ungültig.</div>}
          {error && <div className="error-box">{error}</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => void propose()} disabled={busy}>
              {busy ? 'Wird gespeichert …' : rows.length === 1 ? 'Termin vorschlagen' : `${rows.length} Termine vorschlagen`}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setEditing(false); setError(null); }} disabled={busy}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`btn ${appt ? 'ghost ' : ''}small`}
          style={{ marginTop: 10 }}
          onClick={() => {
            setEditing(true);
            setJustProposed(false);
          }}
        >
          <CalendarPlus className="i" aria-hidden /> {appt ? 'Neue Termine vorschlagen' : 'Termine vorschlagen'}
        </button>
      )}
    </div>
  );
}
