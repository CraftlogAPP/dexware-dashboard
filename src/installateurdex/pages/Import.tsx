import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileUp, Upload } from 'lucide-react';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { downloadCsv } from '../csv';
import { useInst } from '../context';
import {
  EMPTY_KIND,
  FIELDS,
  KIND_OPTIONS,
  buildPlan,
  colLetter,
  decodeCsv,
  guessMapping,
  kindLabel,
  kindValues,
  parseCsv,
  sampleCsv,
  type FieldKey,
  type Mapping,
  type Plan,
  type PlanRow,
} from '../importer';
import { isProOrg, type Asset, type ItemKind, type Site } from '../types';

/** „1 Objekt“ / „2 Objekte“ */
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const CHUNK = 200;
/** Gratis-Grenze wie FREE_LIMITS.items in der App */
const FREE_ASSETS = 3;
const PREVIEW_ROWS = 300;

interface Loaded {
  name: string;
  rows: string[][];
  delimiter: string;
  encoding: 'utf-8' | 'windows-1252';
}

export function Import() {
  const { data, isOwner } = useInst();
  const existing = useAsync(async () => {
    const [sites, assets] = await Promise.all([data.sites(), data.assets()]);
    return { sites, assets };
  }, [data]);

  return (
    <>
      <h1>Import</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Kunden, Objekte und Anlagen aus einer CSV-Datei übernehmen — z. B. aus Excel oder deinem bisherigen Programm.
        Kostenlos. Danach stehen sie sofort in der App und im Portal.
      </p>
      {!isOwner ? (
        <div className="info-box">Importieren kann nur der Inhaber des Betriebs.</div>
      ) : (
        <LoadGuard state={existing}>
          {(ex) => <ImportFlow sites={ex.sites} assets={ex.assets} onImported={existing.refresh} />}
        </LoadGuard>
      )}
    </>
  );
}

function ImportFlow({ sites, assets, onImported }: { sites: Site[]; assets: Asset[]; onImported: () => void }) {
  const { data, org, base } = useInst();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [kindMap, setKindMap] = useState<Record<string, ItemKind | ''>>({});
  const [sitesOnly, setSitesOnly] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  useUnsavedGuard(
    !!running,
    'Der Import läuft noch. Trotzdem verlassen? Schon Angelegtes bleibt — die Datei einfach noch einmal importieren, Doppeltes wird übersprungen.',
  );
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sites: number; assets: number } | null>(null);

  const limit = isProOrg(org) ? null : FREE_ASSETS;
  const header = file ? (hasHeader ? file.rows[0] : file.rows[0].map((_, i) => `Spalte ${colLetter(i)}`)) : [];
  const firstData = file ? (hasHeader ? file.rows[1] : file.rows[0]) : undefined;
  const colCount = file ? Math.max(...file.rows.slice(0, 50).map((r) => r.length)) : 0;

  const kinds = useMemo(() => (file ? kindValues(file.rows, hasHeader, mapping) : []), [file, hasHeader, mapping]);

  // Neue Typ-Texte mit dem Vorschlag vorbelegen; eigene Auswahl bleibt erhalten.
  useEffect(() => {
    setKindMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of kinds) {
        if (!(k.key in next)) {
          next[k.key] = k.guess.kind ?? '';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [kinds]);

  const plan: Plan | null = useMemo(
    () =>
      file
        ? buildPlan({
            rows: file.rows,
            hasHeader,
            mapping,
            kindMap,
            orgId: org.id,
            existingSites: sites,
            existingAssets: assets,
            assetLimit: limit,
            sitesOnly,
          })
        : null,
    [file, hasHeader, mapping, kindMap, org.id, sites, assets, limit, sitesOnly],
  );

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFileError(null);
    setResult(null);
    setRunError(null);
    if (f.size > MAX_BYTES) return setFileError('Die Datei ist größer als 5 MB — bitte aufteilen.');
    const { text, encoding } = decodeCsv(await f.arrayBuffer());
    const { rows, delimiter } = parseCsv(text);
    if (rows.length < 1) return setFileError('In der Datei stehen keine Daten.');
    if (rows.length > MAX_ROWS + 1) return setFileError(`Die Datei hat mehr als ${MAX_ROWS} Zeilen — bitte in mehrere Dateien aufteilen.`);
    setFile({ name: f.name, rows, delimiter, encoding });
    setHasHeader(true);
    setMapping(guessMapping(rows[0]));
    setKindMap({});
    setSitesOnly(false);
  }

  const unresolved = kinds.filter((k) => !kindMap[k.key]);
  const usesAssets = !sitesOnly && kinds.length > 0;
  const blockedByLimit = !!plan?.overLimit;
  const nothing = !plan || (plan.newSites.length === 0 && plan.newAssets.length === 0);
  const canImport = !!plan && !nothing && !blockedByLimit && !(usesAssets && unresolved.length > 0) && !running;

  async function runImport() {
    if (!plan || !canImport) return;
    setRunError(null);
    let sitesDone = 0;
    let assetsDone = 0;
    try {
      for (let i = 0; i < plan.newSites.length; i += CHUNK) {
        setRunning(`Objekte anlegen … ${Math.min(i + CHUNK, plan.newSites.length)} von ${plan.newSites.length}`);
        const part = plan.newSites.slice(i, i + CHUNK);
        await data.insertSites(part);
        sitesDone += part.length;
      }
      const toAssets = sitesOnly ? [] : plan.newAssets;
      for (let i = 0; i < toAssets.length; i += CHUNK) {
        setRunning(`Anlagen anlegen … ${Math.min(i + CHUNK, toAssets.length)} von ${toAssets.length}`);
        const part = toAssets.slice(i, i + CHUNK);
        await data.insertAssets(part);
        assetsDone += part.length;
      }
      setResult({ sites: sitesDone, assets: assetsDone });
      setFile(null);
    } catch (e) {
      setRunError(
        `${e instanceof Error ? e.message : String(e)} — bis dahin angelegt: ${plural(sitesDone, 'Objekt', 'Objekte')}, ${plural(assetsDone, 'Anlage', 'Anlagen')}. ` +
          'Datei einfach noch einmal importieren: schon Angelegtes wird erkannt und übersprungen.',
      );
    } finally {
      setRunning(null);
      onImported();
    }
  }

  function setField(key: FieldKey, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === '') delete next[key];
      else next[key] = Number(value);
      return next;
    });
  }

  return (
    <div className="idx-import">
      {result && (
        <div className="card idx-import-done">
          <h3 style={{ marginTop: 0 }}>✓ Import fertig</h3>
          <p style={{ marginBottom: 12 }}>
            <b>{result.sites}</b> {result.sites === 1 ? 'Objekt' : 'Objekte'} und <b>{result.assets}</b>{' '}
            {result.assets === 1 ? 'Anlage' : 'Anlagen'} angelegt. Die QR-Anlagenpässe haben ihre Schlüssel automatisch
            bekommen — die Aufkleber druckst du in der App beim Objekt.
          </p>
          <div className="row">
            <Link className="btn small" to={`${base}/kunden`}>
              Zu Kunden &amp; Objekte
            </Link>
            <Link className="btn ghost small" to={`${base}/wartung?f=all`}>
              Zur Wartungsliste
            </Link>
          </div>
        </div>
      )}

      <div className="section-head">
        <h2>1. Datei wählen</h2>
      </div>
      <div className="card">
        <div className="row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={!!running}>
            <FileUp className="i" aria-hidden /> CSV-Datei auswählen
          </button>
          <button type="button" className="btn ghost" onClick={() => downloadCsv('InstallateurDex_Import_Muster.csv', sampleCsv())}>
            <Download className="i" aria-hidden /> Muster-CSV herunterladen
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void onFile(e)} hidden />
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Trennzeichen Semikolon oder Komma, Zeichensatz UTF-8 (in Excel: „Speichern unter → CSV UTF-8"). Eine Zeile je
          Anlage; Kunden ohne Anlage gehen auch. Höchstens {MAX_ROWS} Zeilen.
        </p>
        {fileError && <div className="error-box">{fileError}</div>}
        {file && (
          <>
            <p style={{ margin: '12px 0 6px' }}>
              <b>{file.name}</b> · {file.rows.length - (hasHeader ? 1 : 0)} Zeilen · Trennzeichen „{file.delimiter === '\t' ? 'Tab' : file.delimiter}"
            </p>
            {file.encoding === 'windows-1252' && (
              <div className="info-box">
                Die Datei war nicht in UTF-8 gespeichert und wurde als Windows-Zeichensatz gelesen. Bitte prüfe in der
                Vorschau, ob Umlaute (ä, ö, ü, ß) richtig aussehen.
              </div>
            )}
            <label className="idx-check">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              Erste Zeile enthält Überschriften
            </label>
          </>
        )}
      </div>

      {file && plan && (
        <>
          <div className="section-head">
            <h2>2. Spalten zuordnen</h2>
          </div>
          <div className="card">
            <p className="small muted" style={{ marginTop: 0 }}>
              Erkannte Spalten sind schon eingetragen. Nicht vorhandene Felder einfach leer lassen.
            </p>
            {(['site', 'asset'] as const).map((group) => (
              <div key={group}>
                <h3 className="idx-card-title" style={{ marginTop: group === 'asset' ? 16 : 4 }}>
                  {group === 'site' ? 'Kunde & Objekt' : 'Anlage'}
                </h3>
                <div className="idx-map-grid">
                  {FIELDS.filter((f) => f.group === group).map((f) => (
                    <label key={f.key} className="field">
                      {f.label}
                      <select value={mapping[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                        <option value="">— nicht in der Datei —</option>
                        {Array.from({ length: colCount }, (_, i) => (
                          <option key={i} value={i}>
                            {colLetter(i)} · {(header[i] ?? '').slice(0, 30) || '(ohne Überschrift)'}
                            {firstData?.[i] ? ` — z. B. ${firstData[i].slice(0, 24)}` : ''}
                          </option>
                        ))}
                      </select>
                      {f.hint && <span className="muted small field-hint">{f.hint}</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {kinds.length > 0 && !sitesOnly && (
            <>
              <div className="section-head">
                <h2>3. Anlagentypen zuordnen</h2>
                {unresolved.length > 0 && <span className="badge amber">{unresolved.length} offen</span>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Text in der Datei</th>
                      <th className="idx-num">Zeilen</th>
                      <th>Anlagentyp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kinds.map((k) => {
                      const chosen = kindMap[k.key] ?? '';
                      const auto = !!k.guess.kind && chosen === k.guess.kind;
                      return (
                        <tr key={k.key}>
                          <td className="wrap">
                            {k.key === EMPTY_KIND ? <span className="muted">(kein Typ angegeben)</span> : <b>{k.key}</b>}
                            {!chosen && (
                              <span className="idx-sub" style={{ color: '#fcd34d' }}>
                                {k.guess.candidates.length > 1
                                  ? `Nicht eindeutig — passt zu: ${k.guess.candidates.map(kindLabel).join(', ')}`
                                  : 'Nicht erkannt — bitte wählen'}
                              </span>
                            )}
                          </td>
                          <td className="idx-num">{k.count}</td>
                          <td style={{ minWidth: 230 }}>
                            <select
                              value={chosen}
                              aria-label={`Anlagentyp für „${k.key}"`}
                              onChange={(e) => setKindMap((m) => ({ ...m, [k.key]: e.target.value as ItemKind | '' }))}
                            >
                              <option value="">Bitte wählen …</option>
                              {KIND_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            {auto && <span className="idx-sub">automatisch erkannt</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="section-head">
            <h2>{kinds.length > 0 && !sitesOnly ? '4.' : '3.'} Vorschau &amp; Import</h2>
          </div>
          <div className="idx-import-summary">
            <span>
              <b>{plan.newSites.length}</b> {plan.newSites.length === 1 ? 'neues Objekt' : 'neue Objekte'}
            </span>
            {plan.reusedSites > 0 && (
              <span>
                <b>{plan.reusedSites}</b> {plan.reusedSites === 1 ? 'bestehendes Objekt' : 'bestehende Objekte'} ergänzt
              </span>
            )}
            {!sitesOnly && (
              <span>
                <b>{plan.newAssets.length}</b> {plan.newAssets.length === 1 ? 'neue Anlage' : 'neue Anlagen'}
              </span>
            )}
            {plan.skippedAssets > 0 && (
              <span>
                <b>{plan.skippedAssets}</b> {plan.skippedAssets === 1 ? 'Anlage gibt' : 'Anlagen gibt'} es schon (übersprungen)
              </span>
            )}
            {plan.errorRows > 0 && (
              <span className="idx-import-err">
                <b>{plan.errorRows}</b> Zeilen mit Fehlern (werden nicht importiert)
              </span>
            )}
          </div>

          {plan.overLimit && (
            <div className="error-box">
              Im Gratis-Tarif sind höchstens {plan.overLimit.limit} Anlagen möglich. Dein Betrieb hat schon{' '}
              {plan.overLimit.existing}, die Datei enthält {plan.overLimit.adding} neue. Mit <b>Pro</b> gibt es keine Grenze
              (in der App unter Abo) — oder du importierst jetzt nur Kunden &amp; Objekte und legst die Anlagen später an.
            </div>
          )}
          <div className="filter-bar">
            {kinds.length > 0 && (
              <label className="idx-check">
                <input type="checkbox" checked={sitesOnly} onChange={(e) => setSitesOnly(e.target.checked)} />
                Nur Kunden &amp; Objekte importieren (ohne Anlagen)
              </label>
            )}
            <label className="idx-check">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Nur Zeilen mit Fehlern oder Hinweisen
            </label>
          </div>

          <PreviewTable rows={plan.rows} onlyProblems={onlyProblems} sitesOnly={sitesOnly} />

          <div className="idx-save-bar">
            <button type="button" className="btn" onClick={() => void runImport()} disabled={!canImport}>
              <Upload className="i" aria-hidden />
              {running ??
                `${plural(plan.newSites.length, 'Objekt', 'Objekte')}${sitesOnly ? '' : ` und ${plural(plan.newAssets.length, 'Anlage', 'Anlagen')}`} importieren`}
            </button>
            {!running && usesAssets && unresolved.length > 0 && (
              <span className="small" style={{ color: '#fcd34d' }}>
                Erst alle Anlagentypen zuordnen ({unresolved.length} offen).
              </span>
            )}
            {!running && nothing && <span className="small muted">Nichts Neues zum Importieren.</span>}
            {runError && (
              <span className="error-box" style={{ margin: 0 }}>
                {runError}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PreviewTable({ rows, onlyProblems, sitesOnly }: { rows: PlanRow[]; onlyProblems: boolean; sitesOnly: boolean }) {
  const list = onlyProblems ? rows.filter((r) => r.status !== 'ok' || r.notes.length > 0) : rows;
  if (!list.length) return <div className="card empty">{onlyProblems ? 'Keine Fehler oder Hinweise.' : 'Keine Zeilen.'}</div>;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zeile</th>
              <th>Status</th>
              <th>Kunde · Objekt</th>
              <th className="idx-hide-sm">Adresse</th>
              {!sitesOnly && <th>Anlage</th>}
              <th>Fehler / Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, PREVIEW_ROWS).map((r) => (
              <tr key={r.line} className={r.status === 'error' ? 'idx-row-err' : undefined}>
                <td className="muted">{r.line}</td>
                <td>
                  {r.status === 'error' ? (
                    <span className="badge red">Fehler</span>
                  ) : r.status === 'skip' ? (
                    <span className="badge">übersprungen</span>
                  ) : (
                    <span className="badge green">neu</span>
                  )}
                </td>
                <td className="wrap">
                  {r.customer || '—'}
                  {r.siteNew && r.status !== 'error' && (
                    <span className="badge external" style={{ marginLeft: 6 }}>
                      neues Objekt
                    </span>
                  )}
                  <span className="idx-sub">{r.siteName}</span>
                </td>
                <td className="wrap muted idx-hide-sm">{r.address || '—'}</td>
                {!sitesOnly && (
                  <td className="wrap">
                    {r.asset ? (
                      <>
                        {r.asset.name}
                        <span className="idx-sub">
                          {kindLabel(r.asset.kind)}
                          {r.asset.maker ? ` · ${r.asset.maker}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                <td className="wrap">
                  {r.errors.map((e, i) => (
                    <div key={`e${i}`} style={{ color: '#fca5a5' }}>
                      {e}
                    </div>
                  ))}
                  {r.notes.map((n, i) => (
                    <div key={`n${i}`} className="small muted">
                      {n}
                    </div>
                  ))}
                  {!r.errors.length && !r.notes.length && <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > PREVIEW_ROWS && (
        <p className="idx-sum">
          Angezeigt: die ersten {PREVIEW_ROWS} von {list.length} Zeilen. Importiert wird alles ohne Fehler.
        </p>
      )}
    </>
  );
}
