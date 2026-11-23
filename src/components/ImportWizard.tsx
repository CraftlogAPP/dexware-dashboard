// Einträge aus einer Excel-/CSV-Liste übernehmen — gemeinsame Oberfläche in drei Schritten (wie der WinterDex-Import):
// 1. Liste wählen oder einfügen · 2. Vorschau prüfen (Spalten zuordnen, Häkchen) · 3. Anlegen.
// Lesen der Liste: lib/tableImport.ts. Was angelegt wird und wie: der Adapter der App (z. B. pruefen/importUnits.ts).
import { useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { useUnsavedGuard } from './ui';
import {
  colLetter,
  detectFieldLayout,
  guessFieldMapping,
  readImportFile,
  tableFromPaste,
  type ImportAdapter,
  type ImportPlanRow,
  type ImportProgress,
  type ImportResult,
  type Mapping,
  type Table,
} from '../lib/tableImport';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

interface Loaded {
  table: Table;
  /** Dateiname oder „Eingefügte Tabelle“ */
  source: string;
  /** Titelzeilen über den Überschriften (weggelassen) */
  skipped: number;
}

export function ImportWizard<P>({ adapter, done, onSaved }: { adapter: ImportAdapter<P>; done: { to: string; label: string }; onSaved: () => void }) {
  const { noun } = adapter;
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** gewählte Datei — für ein anderes Tabellenblatt noch einmal gelesen */
  const [file, setFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [appliedPaste, setAppliedPaste] = useState('');
  const [drag, setDrag] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [choiceValue, setChoiceValue] = useState<string | null>(null);
  /** vom Nutzer geänderte Häkchen (sonst gilt: nur „neu“-Zeilen) */
  const [toggled, setToggled] = useState<Map<number, boolean>>(new Map());
  const [phase, setPhase] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  useUnsavedGuard(
    !!phase,
    `Die ${noun.many} werden noch angelegt. Trotzdem verlassen? Schon Angelegtes bleibt — die Liste einfach noch einmal importieren, Vorhandenes wird erkannt.`,
  );

  const table = loaded?.table ?? null;
  const choice = table ? (adapter.choice?.(mapping) ?? null) : null;
  // gewählter Wert gilt, solange er zur Auswahl passt (sonst die Vorgabe)
  const choiceNow = choice ? (choiceValue !== null && choice.options.some((o) => o.value === choiceValue) ? choiceValue : choice.value) : '';
  const plan = useMemo(
    () => (table ? adapter.plan({ table, hasHeader, mapping, choice: choiceNow }) : null),
    [adapter, table, hasHeader, mapping, choiceNow],
  );
  const isSel = (r: ImportPlanRow<P>) => !!r.payload && (toggled.get(r.i) ?? r.status === 'ok');
  const selectedCount = plan ? plan.rows.filter(isSel).length : 0;
  const allowance = adapter.allowance;
  const limit = plan && adapter.limitFor ? adapter.limitFor(plan, new Set(plan.rows.filter(isSel).map((r) => r.i))) : null;
  const toCreate = limit ? limit.count : allowance === null ? selectedCount : Math.min(selectedCount, allowance);
  const limitMsg = limit?.text ?? (allowance !== null && selectedCount > allowance ? adapter.limitText(allowance) : null);
  const limited = !!limitMsg;

  function applyTable(t: Table, source: string) {
    const layout = detectFieldLayout(adapter.fields, t, adapter.fallbackMapping);
    setLoaded({ table: layout.table, source, skipped: layout.skipped });
    setHasHeader(layout.hasHeader);
    setMapping(layout.mapping);
    setMapOpen(adapter.required.some((k) => layout.mapping[k] === undefined) || !layout.hasHeader);
    setChoiceValue(null);
    setToggled(new Map());
    setResult(null);
    setRunError(null);
    setLoadError(null);
  }

  async function onFile(f: File | undefined, sheet = 0) {
    if (!f || phase) return;
    setLoadError(null);
    setReading(true);
    try {
      setFile(f);
      applyTable(await readImportFile(f, sheet), f.name);
      setPasteText('');
      setAppliedPaste('');
    } catch (e) {
      setLoaded(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  function onPasteText(text: string) {
    if (!text.trim() || phase) return;
    setAppliedPaste(text);
    setFile(null);
    try {
      applyTable(tableFromPaste(text), 'Eingefügte Tabelle');
    } catch (e) {
      setLoaded(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  function setField(key: string, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === '') delete next[key];
      else {
        // eine Spalte gehört zu einem Feld
        for (const k of Object.keys(next)) if (next[k] === Number(value)) delete next[k];
        next[key] = Number(value);
      }
      return next;
    });
    setToggled(new Map());
  }

  function changeHeader(on: boolean) {
    if (!table) return;
    setHasHeader(on);
    setMapping(on ? guessFieldMapping(adapter.fields, table.rows[0] ?? []) : { ...(adapter.fallbackMapping ?? {}) });
    setToggled(new Map());
  }

  function toggle(r: ImportPlanRow<P>, on: boolean) {
    setToggled((t) => new Map(t).set(r.i, on));
  }

  /**
   * Kopf-Häkchen: gilt nur für neue Zeilen. „Schon vorhanden“ und „doppelt“ hakt man nur einzeln an — sonst legte ein
   * Klick beim zweiten Import alles Vorhandene doppelt an. Abwählen nimmt alle Häkchen weg.
   */
  function toggleAll(on: boolean) {
    if (!plan) return;
    setToggled((t) => {
      const next = new Map(t);
      for (const r of plan.rows) {
        if (!r.payload) continue;
        if (r.status === 'ok') next.set(r.i, on);
        else if (!on) next.set(r.i, false);
      }
      return next;
    });
  }

  async function run() {
    if (!plan || phase || toCreate === 0) return;
    setRunError(null);
    setResult(null);
    let created = 0;
    try {
      setPhase({ label: 'Wird geprüft …', done: 0, total: 0 });
      const res = await adapter.write(plan, new Set(plan.rows.filter(isSel).map((r) => r.i)), choiceNow, setPhase);
      created = res.created;
      setResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(msg);
    } finally {
      setPhase(null);
      // Angelegtes ist jetzt „schon vorhanden“ — eigene Häkchen zurücksetzen, damit nichts ein zweites Mal angehakt bleibt.
      if (created > 0) setToggled(new Map());
      onSaved();
    }
  }

  async function onTemplate() {
    setTemplateError(null);
    try {
      await adapter.template();
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : String(e));
    }
  }

  const header = table ? (hasHeader ? table.rows[0] : []) : [];
  const firstData = table ? table.rows[hasHeader ? 1 : 0] : undefined;
  const colCount = table ? Math.max(...table.rows.slice(0, 50).map((r) => r.length)) : 0;
  const mapped = adapter.fields.filter((f) => mapping[f.key] !== undefined);
  const missingRequired = adapter.fields.filter((f) => adapter.required.includes(f.key) && mapping[f.key] === undefined);
  const dataCount = table ? table.rows.length - (hasHeader ? 1 : 0) : 0;
  const newRows = plan ? plan.rows.filter((r) => r.status === 'ok') : [];
  const allOn = newRows.length > 0 && newRows.every(isSel);
  /** nach erfolgreichem Anlegen ist nichts mehr zu tun — dann kein grauer „0 … anlegen“-Knopf */
  const doneNothingLeft = !!result && result.created > 0 && toCreate === 0;

  return (
    <div className="wd-imp">
      <div className="section-head">
        <h2>1. Liste wählen</h2>
      </div>
      <div
        className={`card wd-imp-drop${drag ? ' drag' : ''}`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDrag(false);
          void onFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={!!phase || reading}>
            <FileUp className="i" aria-hidden /> {reading ? 'Wird gelesen …' : 'Excel- oder CSV-Datei wählen'}
          </button>
          <button type="button" className="btn ghost" onClick={() => void onTemplate()}>
            <Download className="i" aria-hidden /> Vorlage herunterladen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.txt,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void onFile(f);
            }}
          />
        </div>
        {templateError && <div className="error-box">{templateError}</div>}
        <label className="field wd-imp-paste">
          Oder in Excel die Zeilen markieren, kopieren (Strg+C) und hier einfügen (Strg+V):
          <textarea
            rows={3}
            value={pasteText}
            placeholder="Hier einfügen …"
            disabled={!!phase}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
              const text = e.clipboardData.getData('text/plain');
              if (!text) return;
              e.preventDefault();
              setPasteText(text);
              onPasteText(text);
            }}
          />
        </label>
        {pasteText.trim() && pasteText !== appliedPaste && (
          <button type="button" className="btn ghost small" onClick={() => onPasteText(pasteText)} disabled={!!phase}>
            Eingefügte Tabelle übernehmen
          </button>
        )}
        {loadError && <div className="error-box">{loadError}</div>}
        {loaded && table && (
          <div className="wd-imp-file">
            <p style={{ margin: '14px 0 6px' }}>
              <b>{loaded.source}</b> · {plural(dataCount, 'Zeile', 'Zeilen')}
              {table.sheet && <span className="muted"> · Tabellenblatt „{table.sheet}“</span>}
            </p>
            {table.sheets && table.sheets.length > 1 && file ? (
              <p className="small" style={{ margin: '0 0 6px' }}>
                <label>
                  Anderes Tabellenblatt lesen:{' '}
                  <select value={table.sheetIndex ?? 0} onChange={(e) => void onFile(file, Number(e.target.value))} disabled={!!phase || reading}>
                    {table.sheets.map((n, i) => (
                      <option key={i} value={i}>
                        {n || `Blatt ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>{' '}
                <span className="muted">Gelesen wird immer ein Blatt.</span>
              </p>
            ) : (
              table.moreSheets && (
                <p className="small muted" style={{ margin: '0 0 6px' }}>
                  Gelesen wird nur das erste Tabellenblatt. Andere Blätter bitte einzeln speichern oder kopieren.
                </p>
              )
            )}
            {loaded.skipped > 0 && (
              <p className="small muted" style={{ margin: '0 0 6px' }}>
                {loaded.skipped === 1 ? 'Die Zeile' : `${loaded.skipped} Zeilen`} über den Überschriften{' '}
                {loaded.skipped === 1 ? 'wird' : 'werden'} nicht übernommen.
              </p>
            )}
            {table.ansi && <div className="info-box">Bitte kurz prüfen, ob die Umlaute (ä, ö, ü, ß) unten richtig aussehen.</div>}
            <label className="wd-check">
              <input type="checkbox" checked={hasHeader} onChange={(e) => changeHeader(e.target.checked)} disabled={!!phase} />
              Erste Zeile enthält Überschriften
            </label>
          </div>
        )}
      </div>

      {plan && table && dataCount === 0 && (
        <div className="info-box" style={{ marginTop: 12 }}>
          Unter den Überschriften stehen keine Zeilen. Bitte die ganze Liste markieren und kopieren.
        </div>
      )}

      {plan && table && dataCount > 0 && (
        <>
          <div className="section-head">
            <h2>2. Prüfen</h2>
          </div>
          <p className="wd-imp-summary">
            {plural(plan.count.ok, noun.one, noun.many)} neu erkannt.
            {plan.count.skip > 0 && ` ${plural(plan.count.skip, 'Zeile wird', 'Zeilen werden')} übersprungen.`}
            {plan.count.exists > 0 && ` ${plural(plan.count.exists, noun.one, noun.many)} gibt es schon — nicht angehakt.`}
            {plan.count.dup > 0 && ` ${plural(plan.count.dup, 'Zeile steht', 'Zeilen stehen')} doppelt in der Liste — nicht angehakt.`}
            {plan.notes.map((n) => ` ${n}`).join('')}
          </p>
          {adapter.notice && <div className="info-box">{adapter.notice}</div>}

          {missingRequired.length > 0 && (
            <div className="info-box">
              Keine Spalte für {missingRequired.map((f) => `„${f.label}“`).join(', ')} erkannt — bitte unten unter „Spalten zuordnen“ festlegen.
            </div>
          )}
          <details className="card wd-imp-map" open={mapOpen} onToggle={(e) => setMapOpen(e.currentTarget.open)}>
            <summary>
              Spalten zuordnen{' '}
              <span className="muted small">({mapped.length ? mapped.map((f) => f.label).join(', ') : 'nichts erkannt — bitte zuordnen'})</span>
            </summary>
            <p className="small muted">Welche Spalte der Liste gehört wohin? Nicht vorhandene Felder leer lassen.</p>
            <div className="wd-imp-map-grid">
              {adapter.fields.map((f) => (
                <label key={f.key} className="field">
                  {f.label}
                  <select value={mapping[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} disabled={!!phase}>
                    <option value="">— nicht in der Liste —</option>
                    {Array.from({ length: colCount }, (_, i) => (
                      <option key={i} value={i}>
                        {hasHeader ? `${colLetter(i)} · ${(header[i] ?? '').slice(0, 30) || '(ohne Überschrift)'}` : `Spalte ${colLetter(i)}`}
                        {firstData?.[i] ? ` — z. B. ${firstData[i].slice(0, 24)}` : ''}
                      </option>
                    ))}
                  </select>
                  {f.hint && <span className="muted small field-hint">{f.hint}</span>}
                </label>
              ))}
            </div>
          </details>

          {choice && (
            <label className="field wd-imp-land">
              {choice.label}
              <select value={choiceNow} onChange={(e) => setChoiceValue(e.target.value)} disabled={!!phase}>
                {choice.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {choice.hint && <span className="muted small field-hint">{choice.hint}</span>}
            </label>
          )}

          <div className="table-wrap wd-imp-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={`Alle neuen ${noun.many} anhaken`}
                      title={`Alle neuen ${noun.many} anhaken`}
                      checked={allOn}
                      disabled={!newRows.length || !!phase}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th>Zeile</th>
                  <th>{noun.one}</th>
                  {adapter.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th className="wd-imp-st">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => {
                  const on = isSel(r);
                  return (
                    <tr key={r.i} className={on ? undefined : 'wd-imp-off'}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Zeile ${r.line} anlegen`}
                          checked={on}
                          disabled={!r.payload || !!phase}
                          onChange={(e) => toggle(r, e.target.checked)}
                        />
                      </td>
                      <td className="muted">{r.line}</td>
                      <td className="wrap">
                        <b>{r.title || '—'}</b>
                        {r.sub && <span className="wd-imp-sub">{r.sub}</span>}
                        {r.hints.map((h) => (
                          <span key={h} className="wd-imp-sub">
                            {h}
                          </span>
                        ))}
                        {/* am Handy steht der Status hier, die Status-Spalte läge außerhalb des Bildschirms */}
                        <span className="wd-imp-st-inline">
                          <StatusBadge row={r} />
                        </span>
                      </td>
                      {adapter.columns.map((c, k) => (
                        <td key={c} className="wrap muted">
                          {r.cells[k] || '—'}
                        </td>
                      ))}
                      <td className="wd-imp-st">
                        <StatusBadge row={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="section-head">
            <h2>3. Anlegen</h2>
          </div>
          <div className="card">
            {limitMsg && <div className="info-box">{limitMsg}</div>}

            {!doneNothingLeft && (
              <div className="row" style={{ marginTop: limited ? 16 : 0 }}>
                <button type="button" className="btn" onClick={() => void run()} disabled={!!phase || toCreate === 0}>
                  <Upload className="i" aria-hidden /> {plural(toCreate, noun.one, noun.many)} anlegen
                </button>
                {!phase && toCreate === 0 && !limited && !result && <span className="small muted">Nichts angehakt.</span>}
              </div>
            )}

            {phase && <Progress phase={phase} />}
            {runError && <div className="error-box">{runError}</div>}
            {result && <ResultBox result={result} noun={noun} done={done} />}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge<P>({ row }: { row: ImportPlanRow<P> }) {
  switch (row.status) {
    case 'ok':
      return <span className="badge green">neu</span>;
    case 'skip':
      return (
        <>
          <span className="badge red">übersprungen</span>
          <span className="wd-imp-sub">{row.reason}</span>
        </>
      );
    case 'exists':
      return <span className="badge">schon vorhanden</span>;
    case 'dup':
      return (
        <>
          <span className="badge amber">doppelt</span>
          <span className="wd-imp-sub">{row.reason.replace(/^doppelt in der Liste /, '')}</span>
        </>
      );
  }
}

function Progress({ phase }: { phase: ImportProgress }) {
  if (!phase.total) {
    return (
      <p className="small muted" style={{ marginBottom: 0 }}>
        <span className="spinner" /> {phase.label}
      </p>
    );
  }
  const pct = Math.round((Math.min(phase.done, phase.total) / phase.total) * 100);
  return (
    <div className="wd-imp-progress" role="status">
      <div className="wd-imp-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="small">
        {phase.label} {Math.min(phase.done, phase.total)} von {phase.total}
      </span>
    </div>
  );
}

function ResultBox({ result, noun, done }: { result: ImportResult; noun: { one: string; many: string }; done: { to: string; label: string } }) {
  const { created, failed } = result;
  return (
    <div className="wd-imp-result" role="status">
      <p className="wd-imp-result-head">
        {created > 0 && <CheckCircle2 className="i" aria-hidden />}
        {plural(created, noun.one, noun.many)} angelegt
        {failed.length > 0 && `, ${failed.length} nicht`}.
      </p>
      {failed.length > 0 && (
        <ul className="small">
          {failed.slice(0, 10).map((f, k) => (
            <li key={`${f.line}-${k}`}>
              {f.line ? `Zeile ${f.line} „${f.name}“` : f.name}: {f.reason}
            </li>
          ))}
          {failed.length > 10 && <li>… und {failed.length - 10} weitere</li>}
        </ul>
      )}
      {result.notes.map((n) => (
        <p key={n} className="small muted">
          {n}
        </p>
      ))}
      {failed.length > 0 && (
        <p className="small muted">Die Liste einfach noch einmal importieren: schon Angelegtes wird erkannt und nicht doppelt angelegt.</p>
      )}
      <div className="row">
        <Link className="btn small" to={done.to}>
          {done.label}
        </Link>
      </div>
    </div>
  );
}
