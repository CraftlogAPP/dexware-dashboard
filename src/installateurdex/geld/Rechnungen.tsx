// Rechnungen & Angebote — wie App InvoicesScreen: Kacheln offen / überfällig / bezahlt im Monat, Filter, Liste,
// Export für die Steuerberatung (DATEV-Buchungsstapel / BMD-Buchungsimport / Rechnungsausgangsbuch, gleiche Dateien
// wie die App: lib/accountingExport.ts + lib/invoiceExport.ts).
// Nur der Inhaber (wie in der App: Bereich „Geld“ nur für Inhaber; RLS invoice_select zeigt Monteuren nur Eigenes).
// Unterseiten: neu, firmendaten, :id (Beleg.tsx, Firmendaten.tsx).

import { useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Download, FilePlus2, FileText, Settings2 } from 'lucide-react';
import { Modal } from '../../components/form';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useInst } from '../context';
import { openCents, type StoredInvoice } from './api';
import { Beleg } from './Beleg';
import { Firmendaten } from './Firmendaten';
import { euro } from './invoice';
import { invoiceBookCsv, periodRange, type Period } from './invoiceExport';
import { accountingExport, BOOK_FORMAT_INFO, bookFormats, defaultBookFormat, missingAccountingSetup, type BookFormat } from './accountingExport';
import { InvoiceBadge } from './parts';
import { deDay, errText, isOverdue, kindLabel, localDay } from './util';
import './geld.css';

export function Rechnungen() {
  const { isOwner, base } = useInst();
  if (!isOwner) {
    return (
      <>
        <h1>Rechnungen &amp; Angebote</h1>
        <div className="info-box">
          Rechnungen, Angebote und Zahlungen verwaltet der Inhaber des Betriebs — wie in der App. Rechnungsentwürfe aus
          einem Einsatz legst du in der App beim Objekt an; der Inhaber sieht sie hier und stellt sie aus.
        </div>
      </>
    );
  }
  return (
    <Routes>
      <Route index element={<Liste />} />
      <Route path="neu" element={<Beleg />} />
      <Route path="firmendaten" element={<Firmendaten />} />
      <Route path=":id" element={<Beleg />} />
      {/* unbekannte Unterpfade (z. B. /rechnungen/x/y) → zur Liste statt leerer Seite */}
      <Route path="*" element={<Navigate to={`${base}/rechnungen`} replace />} />
    </Routes>
  );
}

type Filter = 'open' | 'overdue' | 'paid' | 'canceled' | 'drafts' | 'quotes' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Offen' },
  { id: 'overdue', label: 'Überfällig' },
  { id: 'paid', label: 'Bezahlt' },
  { id: 'canceled', label: 'Storniert' },
  { id: 'drafts', label: 'Entwürfe' },
  { id: 'quotes', label: 'Angebote' },
  { id: 'all', label: 'Alle' },
];
// wie App InvoicesScreen (+ „Storniert“: stornierte Belege und Stornorechnungen)
function matches(x: StoredInvoice, f: Filter): boolean {
  switch (f) {
    case 'open':
      return x.kind === 'invoice' && x.status === 'issued';
    case 'overdue':
      return isOverdue(x);
    case 'paid':
      return x.status === 'paid';
    case 'canceled':
      return x.status === 'canceled' || x.kind === 'credit';
    case 'drafts':
      return x.status === 'draft';
    case 'quotes':
      return x.kind === 'quote' && x.status !== 'draft';
    default:
      return true;
  }
}

type Zeitraum = 'latest' | 'month' | 'prevMonth' | 'quarter' | 'prevQuarter' | 'year' | 'prevYear';
const ZEITRAUM: { id: Zeitraum; label: string }[] = [
  { id: 'latest', label: 'Neueste 500 (wie in der App)' },
  { id: 'month', label: 'Dieser Monat' },
  { id: 'prevMonth', label: 'Vormonat' },
  { id: 'quarter', label: 'Dieses Quartal' },
  { id: 'prevQuarter', label: 'Vorquartal' },
  { id: 'year', label: 'Dieses Jahr' },
  { id: 'prevYear', label: 'Vorjahr' },
];
/** Bezugstag + Zeitraum-Art für periodRange (lokale Zeit, wie App chooseExport) */
function periodOf(z: Exclude<Zeitraum, 'latest'>): { ref: Date; p: Period } {
  const now = new Date();
  switch (z) {
    case 'month':
      return { ref: now, p: 'month' };
    case 'prevMonth':
      return { ref: new Date(now.getFullYear(), now.getMonth() - 1, 15), p: 'month' };
    case 'quarter':
      return { ref: now, p: 'quarter' };
    case 'prevQuarter':
      return { ref: new Date(now.getFullYear(), now.getMonth() - 3, 15), p: 'quarter' };
    case 'year':
      return { ref: now, p: 'year' };
    case 'prevYear':
      return { ref: new Date(now.getFullYear() - 1, 5, 15), p: 'year' };
  }
}

// wie App: bei Schlussrechnungen ist nur der Rest nach Abzug der Abschläge offen (sonst zählten die Abschläge doppelt)
const sum = (xs: StoredInvoice[]) => xs.reduce((s, x) => s + openCents(x), 0);
const euroWhole = (c: number) => euro(c).replace(/,\d\d/, ''); // Kacheln wie in der App ohne Cent

function Liste() {
  const { ext, base } = useInst();
  const geld = ext.geld;
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.some((f) => f.id === params.get('f')) ? params.get('f') : 'open') as Filter;
  const zeitraum = (ZEITRAUM.some((z) => z.id === params.get('z')) ? params.get('z') : 'latest') as Zeitraum;
  const [query, setQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  // Kacheln aus einer eigenen, vollständigen Abfrage (alle offenen + im Monat bezahlten Rechnungen) — die Liste aus den
  // neuesten 500 Belegen bzw. dem gewählten Zeitraum. Früher kamen auch die Kacheln nur aus den neuesten 500.
  const latest = useAsync(() => geld.invoices(), [geld]);
  const monthStart = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toISOString(); // lokaler Monatsbeginn als Zeitpunkt
  })();
  const tiles = useAsync(() => geld.tileInvoices(monthStart), [geld, monthStart]);
  const ranged = useAsync(async () => {
    if (zeitraum === 'latest') return null;
    const { ref, p } = periodOf(zeitraum);
    const { from, to } = periodRange(ref, p);
    return geld.invoices({ from, to });
  }, [geld, zeitraum]);
  useLiveRefresh([latest.refresh, ranged.refresh, tiles.refresh], 60000);

  function setParam(key: 'f' | 'z', value: string, def: string) {
    const next = new URLSearchParams(params);
    if (value === def) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const all = latest.data ?? [];
  const today = localDay();
  // Vollständige Kachel-Daten; solange sie laden (oder bei Fehler), wie bisher aus den neuesten 500
  const tileSource = tiles.data ?? all;
  const invoices = tileSource.filter((x) => x.kind === 'invoice');
  const open = invoices.filter((x) => x.status === 'issued');
  const overdue = open.filter((x) => isOverdue(x, today));
  const month = today.slice(0, 7);
  const paidMonth = invoices.filter((x) => x.status === 'paid' && !!x.paidAt && localDay(new Date(x.paidAt)).slice(0, 7) === month);

  const source = zeitraum === 'latest' ? latest : ranged;
  const rows = useMemo(() => {
    // „Neueste“: dazu alle offenen/im Monat bezahlten aus der Kachel-Abfrage — ein Klick auf „offen“ zeigt dann auch
    // ältere offene Rechnungen, die nicht unter den neuesten 500 sind (gleiche Zahl wie die Kachel).
    const base = (zeitraum === 'latest' ? latest.data : ranged.data) ?? [];
    const extra = zeitraum === 'latest' ? (tiles.data ?? []).filter((t) => !base.some((x) => x.id === t.id)) : [];
    const list = extra.length ? [...base, ...extra].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : base;
    const q = query.trim().toLowerCase();
    return q
      ? list.filter((x) => [x.number, x.data?.recipient?.name, x.data?.cancels].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      : list;
  }, [zeitraum, latest.data, ranged.data, tiles.data, query]);
  const shown = rows.filter((x) => matches(x, filter));
  // Summe: nur ausgestellte Rechnungen + Stornorechnungen (Angebote/Entwürfe zählen nicht; Storno hebt das Original auf)
  const booked = shown.filter((x) => (x.kind === 'invoice' || x.kind === 'credit') && x.status !== 'draft');
  const bookedNet = booked.reduce((s, x) => s + x.netCents, 0);
  const bookedVat = booked.reduce((s, x) => s + x.vatCents, 0);

  const tile = (label: string, cents: number, count: number, f: Filter, tone: string) => (
    <button type="button" className={`kpi idx-geld-tile ${tone} ${filter === f ? 'on' : ''}`} onClick={() => setParam('f', f, 'open')} aria-pressed={filter === f}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{euroWhole(cents)}</div>
      <div className="kpi-sub">{count === 1 ? '1 Beleg' : `${count} Belege`}</div>
    </button>
  );

  return (
    <>
      <div className="idx-head">
        <h1>Rechnungen &amp; Angebote</h1>
        <div className="row">
          <Link className="btn small" to={`${base}/rechnungen/neu`}>
            <FilePlus2 className="i" aria-hidden /> Neue Rechnung
          </Link>
          <Link className="btn ghost small" to={`${base}/rechnungen/neu?art=angebot`}>
            <FileText className="i" aria-hidden /> Neues Angebot
          </Link>
          <button type="button" className="btn ghost small" onClick={() => setExportOpen(true)} disabled={!invoices.some((x) => x.status !== 'draft') && zeitraum === 'latest'}>
            <Download className="i" aria-hidden /> Export für Steuerberater
          </button>
          <Link className="btn ghost small" to={`${base}/rechnungen/firmendaten`}>
            <Settings2 className="i" aria-hidden /> Firmendaten
          </Link>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Dieselben Belege wie in der App. Nummern vergibt der Server lückenlos beim Ausstellen; ausgestellte Belege lassen
        sich nicht mehr ändern — nur stornieren (mit Stornorechnung).
      </p>

      <LoadGuard state={latest}>
        {() => (
          <>
            <div className="kpi-grid idx-geld-tiles">
              {tile('offen', sum(open), open.length, 'open', 'idx-kpi-accent')}
              {tile('überfällig', sum(overdue), overdue.length, 'overdue', 'idx-kpi-red')}
              {tile('bezahlt im Monat', sum(paidMonth), paidMonth.length, 'paid', 'idx-geld-green')}
            </div>

            <div className="idx-tabs" role="tablist" aria-label="Status">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setParam('f', f.id, 'open')}>
                  {f.label} <span className="n">{rows.filter((x) => matches(x, f.id)).length}</span>
                </button>
              ))}
            </div>
            <div className="filter-bar">
              <label className="field" style={{ minWidth: 200, flex: '1 1 240px' }}>
                Suche
                <input type="search" value={query} placeholder="Kunde oder Belegnummer …" onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="field" style={{ minWidth: 200, flex: '1 1 220px' }}>
                Zeitraum (Belegdatum)
                <select value={zeitraum} onChange={(e) => setParam('z', e.target.value, 'latest')}>
                  {ZEITRAUM.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <LoadGuard state={source as typeof latest}>
              {() =>
                shown.length === 0 ? (
                  <div className="card empty">
                    {all.length === 0
                      ? 'Noch keine Belege. Tipp: In der App nach einem Einsatz beim Objekt auf „🧾 Rechnung“ — Arbeitszeit, Anfahrt und Material sind schon drin. Oder hier oben „Neue Rechnung“.'
                      : 'Hier ist gerade nichts.'}
                  </div>
                ) : (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Beleg</th>
                            <th>Kunde</th>
                            <th>Datum</th>
                            <th className="idx-hide-sm">Fällig</th>
                            <th className="idx-num">Betrag</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((x) => (
                            <tr key={x.id}>
                              <td>
                                <Link to={`${base}/rechnungen/${x.id}`}>{x.number ?? `${kindLabel(x)} (Entwurf)`}</Link>
                                <span className="idx-sub">
                                  {kindLabel(x)}
                                  {x.kind === 'credit' && x.data?.cancels ? ` zu ${x.data.cancels}` : ''}
                                </span>
                              </td>
                              <td className="wrap">{x.data?.recipient?.name || <span className="muted">Ohne Empfänger</span>}</td>
                              <td>{x.issuedAt ? deDay(x.issuedAt) : <span className="muted">angelegt {deDay(localDay(new Date(x.createdAt)))}</span>}</td>
                              <td className="idx-hide-sm">
                                {x.status === 'issued' && x.dueAt && x.kind === 'invoice' ? deDay(x.dueAt) : <span className="muted">—</span>}
                                {(x.reminderLevel ?? 0) > 0 && x.status === 'issued' && (
                                  <span className="idx-sub">{['', 'erinnert', '1. Mahnung', '2. Mahnung'][x.reminderLevel ?? 0]}</span>
                                )}
                              </td>
                              <td className={`idx-num ${x.status === 'canceled' ? 'idx-geld-strike' : ''}`}>{euro(x.kind === 'invoice' && x.status !== 'canceled' ? openCents(x) : x.grossCents)}</td>
                              <td>
                                <InvoiceBadge x={x} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="idx-sum">
                      <b>{shown.length}</b> {shown.length === 1 ? 'Beleg' : 'Belege'}
                      {booked.length > 0 && (
                        <>
                          {' '}
                          · Rechnungen und Stornos: netto <b>{euro(bookedNet)}</b> · USt <b>{euro(bookedVat)}</b> · brutto <b>{euro(bookedNet + bookedVat)}</b>
                        </>
                      )}
                      {zeitraum === 'latest' && all.length >= 500 && <> · Ältere Belege: oben einen Zeitraum wählen.</>}
                    </p>
                  </>
                )
              }
            </LoadGuard>
          </>
        )}
      </LoadGuard>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </>
  );
}

const EXPORTS: { id: Exclude<Zeitraum, 'latest'>; label: string }[] = [
  { id: 'prevMonth', label: 'Vormonat' },
  { id: 'month', label: 'Dieser Monat' },
  { id: 'prevQuarter', label: 'Vorquartal' },
  { id: 'quarter', label: 'Dieses Quartal' },
  { id: 'prevYear', label: 'Vorjahr' },
  { id: 'year', label: 'Dieses Jahr' },
];

function ExportDialog({ onClose }: { onClose: () => void }) {
  const { ext, org, base } = useInst();
  // Rechnungsprofil: Land (Vorauswahl DATEV/BMD) + Buchhaltungskonten aus den Firmendaten
  const prof = useAsync(() => ext.geld.profile(org.id, org.land, org.name), [ext.geld, org.id]);
  const land = prof.data?.land ?? org.land;
  const [picked, setPicked] = useState<BookFormat | null>(null);
  const format: BookFormat = picked ?? defaultBookFormat(land);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const missing = prof.data && format !== 'list' ? missingAccountingSetup(format, prof.data) : [];

  function download(name: string, part: BlobPart, type: string) {
    const blob = new Blob([part], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function run(z: Exclude<Zeitraum, 'latest'>) {
    if (busy) return;
    setBusy(z);
    setMsg(null);
    setWarnings([]);
    try {
      const { ref, p } = periodOf(z);
      const { from, to, label } = periodRange(ref, p);
      const rows = await ext.geld.invoices({ from, to });
      if (format === 'list') {
        const csv = invoiceBookCsv(rows, from, to);
        if (!csv.includes('\n')) {
          setMsg({ ok: false, text: 'In diesem Zeitraum gibt es keine ausgestellten Rechnungen.' });
          return;
        }
        // Gleiche Datei wie die App: UTF-8 mit BOM, Semikolon, CRLF (App InvoicesScreen exportBook)
        download(`Rechnungsausgangsbuch_${label}.csv`, String.fromCharCode(0xfeff) + csv, 'text/csv;charset=utf-8');
        const n = csv.split('\r\n').length - 1;
        setMsg({ ok: true, text: `Rechnungsausgangsbuch_${label}.csv heruntergeladen (${n} ${n === 1 ? 'Zeile' : 'Zeilen'}).` });
        return;
      }
      const profile = prof.data ?? (await ext.geld.profile(org.id, org.land, org.name));
      const out = accountingExport(format, rows, from, to, profile, { now: new Date(), label });
      if (out.count === 0) {
        setMsg({ ok: false, text: 'In diesem Zeitraum gibt es keine ausgestellten Rechnungen.' });
        return;
      }
      // DATEV/BMD: Windows-1252 (ANSI), wie beide Programme es erwarten — gleiche Bytes wie aus der App
      const bytes = new Uint8Array(out.bytes.length);
      bytes.set(out.bytes);
      download(out.fileName, bytes.buffer, 'text/csv;charset=windows-1252');
      setWarnings(out.warnings);
      setMsg({ ok: true, text: `${out.fileName} heruntergeladen (${out.count} ${out.count === 1 ? 'Buchung' : 'Buchungen'}).` });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="Export für die Steuerberatung" onClose={onClose}>
      <div className="idx-status-pick" role="radiogroup" aria-label="Format">
        {bookFormats(land).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => { setPicked(f); setMsg(null); setWarnings([]); }}>
            {BOOK_FORMAT_INFO[f].label}
          </button>
        ))}
      </div>
      <p className="muted">
        {BOOK_FORMAT_INFO[format].hint} Angebote und Entwürfe sind nicht dabei. Gleiche Datei wie aus der App.
      </p>
      {missing.length > 0 && (
        <div className="info-box">
          Noch offen: {missing.join(', ')}.{' '}
          <Link to={`${base}/rechnungen/firmendaten`} onClick={onClose}>
            In den Firmendaten unter „Buchhaltung“ ergänzen
          </Link>
        </div>
      )}
      <div className="idx-geld-export">
        {EXPORTS.map((z) => (
          <button key={z.id} type="button" className="btn ghost" onClick={() => void run(z.id)} disabled={!!busy}>
            <Download className="i" aria-hidden /> {busy === z.id ? 'Wird erstellt …' : z.label}
          </button>
        ))}
      </div>
      {msg && <div className={msg.ok ? 'info-box' : 'error-box'}>{msg.text}</div>}
      {warnings.map((w) => (
        <div key={w} className="error-box">
          {w}
        </div>
      ))}
    </Modal>
  );
}
