// „Kontoauszug abgleichen“: camt.053/054 oder Bank-CSV im Browser lesen (die Datei wird NICHT hochgeladen), Zahlungs-
// eingänge offenen Rechnungen zuordnen (Logik: geld/kontoabgleich.ts) und nach Bestätigung als bezahlt markieren — über
// denselben Weg wie der Knopf „Als bezahlt markieren“ im Beleg (geld.setStatus → RPC invoice_set_status).
// Zahlungsdatum = Buchungstag (paidDayFor). Ohne NACHTRAG-ZAHLUNGSDATUM am Server bucht api.ts ohne Datum (= heute)
// und meldet das; der Dialog zeigt dann einen Hinweis.

import { useMemo, useRef, useState } from 'react';
import { Check, Download, FileUp, Sparkles } from 'lucide-react';
import { Modal } from '../../components/form';
import { useAsync } from '../../components/ui';
import { useInst } from '../context';
import { euro } from './invoice';
import {
  decodeStatement,
  matchStatement,
  MAX_FILE_BYTES,
  paidDayFor,
  parseStatement,
  resultCsv,
  sampleStatementCsv,
  sortSuggestions,
  type StatementResult,
  type Suggestion,
} from './kontoabgleich';
import { deDay, errText, localDay } from './util';

const PAGE = 200;
const CONF_CLASS: Record<string, string> = { sicher: 'green', wahrscheinlich: 'amber', unsicher: '' };
/** dem Browser kurz Luft lassen (Fortschritt zeichnen), bevor eine längere Rechnung startet */
const breathe = () => new Promise((r) => setTimeout(r, 30));

export function KontoauszugDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { ext, demo } = useInst();
  const geld = ext.geld;
  // Alle offenen Rechnungen + die der letzten 180 Tage bezahlten (um „schon bezahlt“ zu erkennen) — vollständig
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString();
  }, []);
  const invs = useAsync(() => geld.tileInvoices(since), [geld, since]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ name: string; st: StatementResult; list: Suggestion[] } | null>(null);
  /** Buchung (tx.key) → 'ok' oder Fehlertext */
  const [done, setDone] = useState<Record<string, string>>({});
  /** in dieser Sitzung als bezahlt markierte Rechnungen */
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [otherLimit, setOtherLimit] = useState(50);
  /** Server kennt das Zahlungsdatum noch nicht (NACHTRAG-ZAHLUNGSDATUM fehlt) → es gilt „heute“ */
  const [dateIgnored, setDateIgnored] = useState(false);

  async function analyse(name: string, text: string) {
    setErr('');
    setResult(null);
    setDone({});
    setLimit(PAGE);
    setOtherLimit(50);
    setReading(true);
    try {
      // Rechnungen frisch lesen: was eben (auch in einem anderen Fenster) als bezahlt markiert wurde, ist dann „schon
      // bezahlt“ und wird nie ein zweites Mal zugeordnet. Ohne Netz: der beim Öffnen geladene Stand.
      let source = invs.data ?? [];
      try {
        source = await geld.tileInvoices(since);
      } catch {
        /* letzter Stand */
      }
      await breathe();
      const st = parseStatement(text);
      await breathe();
      const list = sortSuggestions(matchStatement(st.credits, source));
      setResult({ name, st, list });
    } catch (e) {
      setErr(`Die Datei ließ sich nicht lesen: ${errText(e)}`);
    } finally {
      setReading(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setErr('Die Datei ist größer als 20 MB. Bitte einen kürzeren Zeitraum exportieren.');
      return;
    }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      await analyse(f.name, decodeStatement(bytes));
    } catch (e) {
      setErr(errText(e));
    } finally {
      if (fileRef.current) fileRef.current.value = ''; // dieselbe Datei erneut wählbar
    }
  }

  const usable = (s: Suggestion) =>
    !!s.invoice && s.invoice.status === 'issued' && s.kind !== 'paidAlready' && s.kind !== 'duplicate' && done[s.tx.key] !== 'ok' && !paid.has(s.invoice.id);
  const list = result?.list ?? [];
  const matched = list.filter((s) => s.invoice);
  const others = list.filter((s) => !s.invoice);
  const autoRows = matched.filter((s) => s.autoOk && usable(s));

  /** Nacheinander als bezahlt markieren (je Rechnung nur einmal, auch wenn zwei Buchungen auf sie zeigen) */
  async function markPaid(rows: Suggestion[], label: string) {
    if (working) return;
    setWorking(label);
    const d: Record<string, string> = { ...done };
    const p = new Set(paid);
    let changed = false;
    for (const s of rows) {
      const inv = s.invoice;
      if (!inv || p.has(inv.id) || d[s.tx.key] === 'ok') continue;
      try {
        // Zahlungsdatum = Buchungstag (nicht vor dem Rechnungsdatum, nicht nach heute)
        const res = await geld.setStatus(inv.id, 'paid', undefined, paidDayFor(s.tx.date, inv.issuedAt, localDay()));
        if (res.paidDateIgnored) setDateIgnored(true);
        d[s.tx.key] = 'ok';
        p.add(inv.id);
        changed = true;
      } catch (e) {
        d[s.tx.key] = errText(e);
      }
      setDone({ ...d });
      setPaid(new Set(p));
    }
    setWorking(null);
    if (changed) onChanged();
  }

  function confirmOne(s: Suggestion) {
    if (!s.invoice) return;
    const what = `Rechnung ${s.invoice.number} (${s.invoice.data.recipient.name}) als bezahlt markieren?`;
    const warn = s.kind === 'partial' || s.kind === 'over' ? `\n\n${s.hint ?? ''}\n\nTrotzdem als bezahlt markieren?` : s.confidence === 'unsicher' ? '\n\nDie Zuordnung ist unsicher — bitte Betrag und Kunde prüfen.' : '';
    if (warn && !window.confirm(what + warn)) return;
    void markPaid([s], s.tx.key);
  }

  function confirmAll() {
    const sum = autoRows.reduce((a, s) => a + s.tx.amountCents, 0);
    if (!window.confirm(`${autoRows.length === 1 ? '1 Rechnung' : `${autoRows.length} Rechnungen`} über zusammen ${euro(sum)} als bezahlt markieren?\n\nNur sichere Zuordnungen: Rechnungsnummer im Verwendungszweck und Betrag stimmt.`)) return;
    void markPaid(autoRows, 'all');
  }

  function downloadResult() {
    const csv = resultCsv(list, done);
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kontoabgleich_${localDay()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const count = (c: string) => matched.filter((s) => s.confidence === c && s.kind !== 'paidAlready').length;

  return (
    <Modal title="Kontoauszug abgleichen" onClose={onClose} dirty={!!working}>
      <p className="muted" style={{ marginTop: 0 }}>
        Umsätze aus dem Online-Banking als <b>camt.053</b>/<b>camt.054</b> (XML) oder <b>CSV</b> exportieren und hier wählen. Die Datei wird nur in
        deinem Browser gelesen und nicht hochgeladen. Berücksichtigt werden nur Gutschriften.
      </p>
      <div className="row">
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={reading || !invs.data || !!working}>
          <FileUp className="i" aria-hidden /> {reading ? 'Wird gelesen …' : 'Datei wählen'}
        </button>
        {demo && (
          <button type="button" className="btn ghost small" disabled={reading || !invs.data || !!working} onClick={() => void analyse('Beispiel-Kontoauszug.csv', sampleStatementCsv(invs.data ?? [], localDay()))}>
            <Sparkles className="i" aria-hidden /> Beispiel laden
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xml,.csv,.txt,text/csv,application/xml,text/xml" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {invs.loading && !invs.data && <p className="small muted">Offene Rechnungen werden geladen …</p>}
      {invs.error && <div className="error-box">Die Rechnungen konnten nicht geladen werden: {invs.error}</div>}
      {err && <div className="error-box">{err}</div>}

      {result && (
        <div className="idx-konto">
          <p className="small muted" style={{ margin: '12px 0 6px' }}>
            {result.name} · {result.st.layout} · {result.st.credits.length === 1 ? '1 Gutschrift' : `${result.st.credits.length} Gutschriften`}
            {result.st.debits > 0 && ` · ${result.st.debits} Abbuchungen übersprungen`}
            {result.st.skipped > 0 && ` · ${result.st.skipped} Zeilen ohne Buchung übersprungen`}
          </p>
          {result.st.warnings.map((w) => (
            <div key={w} className="error-box">
              {w}
            </div>
          ))}
          {matched.length > 0 && (
            <p className="small" style={{ margin: '0 0 8px' }}>
              <span className="badge green">{count('sicher')} sicher</span> <span className="badge amber">{count('wahrscheinlich')} wahrscheinlich</span>{' '}
              <span className="badge">{count('unsicher')} unsicher</span>
            </p>
          )}
          <div className="row" style={{ marginBottom: 8 }}>
            <button type="button" className="btn small" onClick={confirmAll} disabled={!autoRows.length || !!working}>
              <Check className="i" aria-hidden /> {working === 'all' ? 'Wird übernommen …' : `Alle sicheren übernehmen (${autoRows.length})`}
            </button>
            {list.length > 0 && (
              <button type="button" className="btn ghost small" onClick={downloadResult}>
                <Download className="i" aria-hidden /> Liste als CSV
              </button>
            )}
          </div>
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            Als Zahlungsdatum gilt der Buchungstag (frühestens das Rechnungsdatum). Teilzahlungen werden nie automatisch übernommen.
          </p>
          {dateIgnored && (
            <div className="info-box">
              Datum = heute: Der Server kennt das Zahlungsdatum noch nicht (Datenbank-Update ausstehend). Die Rechnungen sind
              trotzdem als bezahlt markiert, nur mit dem heutigen Tag statt dem Buchungstag.
            </div>
          )}

          {matched.slice(0, limit).map((s) => (
            <Row key={s.tx.key} s={s} state={done[s.tx.key]} paidBefore={!!s.invoice && s.kind !== 'paidAlready' && paid.has(s.invoice.id) && done[s.tx.key] !== 'ok'} usable={usable(s)} working={working === s.tx.key} disabled={!!working} onConfirm={() => confirmOne(s)} />
          ))}
          {matched.length > limit && (
            <button type="button" className="btn ghost small" onClick={() => setLimit((l) => l + PAGE)}>
              Weitere {Math.min(PAGE, matched.length - limit)} von {matched.length - limit} zeigen
            </button>
          )}

          {others.length > 0 && (
            <details className="idx-konto-others">
              <summary>Ohne passende offene Rechnung ({others.length})</summary>
              {others.slice(0, otherLimit).map((s) => (
                <Row key={s.tx.key} s={s} usable={false} working={false} disabled />
              ))}
              {others.length > otherLimit && (
                <button type="button" className="btn ghost small" onClick={() => setOtherLimit((l) => l + PAGE)}>
                  Weitere zeigen ({others.length - otherLimit})
                </button>
              )}
            </details>
          )}
          {!list.length && !result.st.warnings.length && <p className="muted">In der Datei sind keine Gutschriften.</p>}
        </div>
      )}
    </Modal>
  );
}

function Row({
  s,
  state,
  paidBefore,
  usable,
  working,
  disabled,
  onConfirm,
}: {
  s: Suggestion;
  state?: string;
  paidBefore?: boolean;
  usable: boolean;
  working: boolean;
  disabled: boolean;
  onConfirm?: () => void;
}) {
  const inv = s.invoice;
  return (
    <div className={`idx-konto-row ${state === 'ok' ? 'done' : ''}`}>
      <div className="idx-konto-tx">
        <b>{euro(s.tx.amountCents)}</b> <span className="muted">{deDay(s.tx.date)}</span>
        <div className="idx-konto-name">{s.tx.name || <span className="muted">ohne Namen</span>}</div>
        {s.tx.text && <div className="small muted idx-konto-text">{s.tx.text}</div>}
      </div>
      <div className="idx-konto-match">
        {inv ? (
          <>
            <div>
              → <b>{inv.number}</b> {inv.data.recipient.name}
              {s.openCents != null && s.kind !== 'paidAlready' && <span className="muted"> · offen {euro(s.openCents)}</span>}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              {s.confidence && s.kind !== 'paidAlready' && <span className={`badge ${CONF_CLASS[s.confidence]}`}>{s.confidence}</span>}
              {s.reasons.length > 0 && <span className="small muted">{s.reasons.join(' · ')}</span>}
            </div>
          </>
        ) : (
          <div className="small muted">keine passende offene Rechnung</div>
        )}
        {s.hint && <div className={`small ${s.kind === 'partial' || s.kind === 'over' || s.kind === 'duplicate' ? 'idx-geld-bad' : 'muted'}`} style={{ marginTop: 4 }}>{s.hint}</div>}
        {state === 'ok' && <div className="small idx-konto-ok">✓ als bezahlt markiert</div>}
        {state && state !== 'ok' && <div className="small idx-geld-bad">Nicht übernommen: {state}</div>}
        {paidBefore && <div className="small muted">Diese Rechnung ist inzwischen als bezahlt markiert — nichts mehr zu tun.</div>}
        {usable && onConfirm && (
          <button type="button" className={`btn small ${s.autoOk ? '' : 'ghost'}`} style={{ marginTop: 6 }} onClick={onConfirm} disabled={disabled}>
            {working ? 'Einen Moment …' : s.kind === 'partial' || s.kind === 'over' ? 'Trotzdem als bezahlt …' : 'Als bezahlt markieren'}
          </button>
        )}
      </div>
    </div>
  );
}
