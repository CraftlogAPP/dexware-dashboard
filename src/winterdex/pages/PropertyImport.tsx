import { useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { downloadCsv } from '../../installateurdex/csv';
import type { GeoPoint } from '../../pinndex/geocode';
import { fetchProperties, insertProperties, propertyRow } from '../api';
import { addressPlace, locateAddress } from '../geo';
import {
  FIELDS,
  buildPlan,
  colLetter,
  detectLayout,
  finalRows,
  guessLand,
  importAllowance,
  mappingFor,
  readImportFile,
  tableFromPaste,
  templateCsv,
  type FieldKey,
  type Mapping,
  type PlanRow,
  type Table,
} from '../importObjects';
import { FREE_PROPERTIES, GRENZE_OBJEKTE, PRO_HOW, PRO_MAILTO, fetchOrgPro, istGratisGrenze, orgProFuerGrenze } from '../pro';
import { DUTY_DEFAULTS, DUTY_HINTS, LAND_LABELS, type DutyTimes, type Land, type Property } from '../types';

// Objekte aus einer Excel-/CSV-Liste anlegen (nur Inhaber). Logik in ../importObjects.ts, hier nur die drei Schritte:
// 1. Liste wählen oder einfügen · 2. Vorschau prüfen · 3. Objekte anlegen (mit Standort aus der Adresse).

/** Paketgröße beim Anlegen */
const CHUNK = 50;
/**
 * Mehr Objekte auf einmal werden nicht geortet: OpenStreetMap erlaubt 1 Anfrage pro Sekunde für alle Nutzer zusammen
 * und rät von Massenabfragen ab (200 ≈ 4 Minuten).
 */
const GEO_MAX = 200;
/** Fehler, bei denen jede weitere Zeile genauso scheitert — dann nicht Zeile für Zeile weiterprobieren */
const FATAL = /keine Verbindung|fehlt dir die Berechtigung|Anmeldung ist abgelaufen|Im Gratis-Paket/;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

export function PropertyImport() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const owner = org?.role === 'owner';
  const state = useAsync(async () => {
    if (!owner) return null;
    const [properties, pro] = await Promise.all([fetchProperties(client), fetchOrgPro(client, true)]);
    return { properties, pro };
  }, [client, owner]);

  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to="../objekte">← Alle Objekte</Link>
      </p>
      <h1>Objekte importieren</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Deine Objektliste aus Excel übernehmen — statt jedes Objekt einzeln anzulegen.
      </p>
      {!owner || !org ? (
        <div className="info-box">Objekte importieren kann nur der Inhaber des Betriebs.</div>
      ) : (
        <LoadGuard state={state}>
          {(d) =>
            d && <ImportFlow orgId={org.org.id} orgLand={org.org.land} properties={d.properties} pro={d.pro} onSaved={state.refresh} />
          }
        </LoadGuard>
      )}
    </>
  );
}

interface Loaded {
  table: Table;
  /** Dateiname oder „Eingefügte Tabelle“ */
  source: string;
  /** Titelzeilen über den Überschriften (weggelassen) */
  skipped: number;
}

type Phase = { step: 'check' } | { step: 'geo' | 'save'; done: number; total: number };

interface Result {
  created: number;
  failed: { line: number; name: string; reason: string }[];
  /** angelegt, aber ohne Standort */
  noLocation: string[];
  /** davon ohne PLZ/Ort in der Adresse (gar nicht gesucht) */
  noPlace: number;
  geo: boolean;
  /** inzwischen schon vorhanden (anderer Tab, zweiter Klick) */
  already: number;
  /** wegen der Gratis-Grenze nicht angelegt */
  overLimit: number;
}

function ImportFlow({
  orgId,
  orgLand,
  properties,
  pro,
  onSaved,
}: {
  orgId: string;
  orgLand: Land;
  properties: Property[];
  pro: boolean;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelGeo = useRef(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [appliedPaste, setAppliedPaste] = useState('');
  const [drag, setDrag] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [land, setLand] = useState<Land>(orgLand);
  /** vom Nutzer geänderte Häkchen (sonst gilt: nur „ok“-Zeilen) */
  const [toggled, setToggled] = useState<Map<number, boolean>>(new Map());
  const [geo, setGeo] = useState(true);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  useUnsavedGuard(
    !!phase,
    'Die Objekte werden noch angelegt. Trotzdem verlassen? Schon Angelegtes bleibt — die Liste einfach noch einmal importieren, Vorhandenes wird erkannt.',
  );

  const table = loaded?.table ?? null;
  const plan = useMemo(
    () => (table ? buildPlan({ table, hasHeader, mapping, land, existing: properties }) : null),
    [table, hasHeader, mapping, land, properties],
  );
  const activeCount = properties.filter((p) => p.active).length;
  const allowance = importAllowance(pro, activeCount);
  const isSel = (r: PlanRow) => !!r.input && (toggled.get(r.i) ?? r.status === 'ok');
  const selectedCount = plan ? plan.rows.filter(isSel).length : 0;
  const toCreate = allowance === null ? selectedCount : Math.min(selectedCount, allowance);
  const limited = allowance !== null && selectedCount > allowance;
  const usesDefaults = !!plan?.rows.some((r) => r.input && r.dutyDefault);
  // Standort: nur bis GEO_MAX Objekte, und nur Adressen mit PLZ und Ort (sonst eher ein falscher Ort als keiner)
  const geoPossible = toCreate <= GEO_MAX;
  const geoOn = geo && geoPossible;
  const noPlaceCount = plan ? plan.rows.filter((r) => isSel(r) && !addressPlace(r.address)).length : 0;

  function applyTable(t: Table, source: string) {
    const layout = detectLayout(t);
    const m = layout.mapping;
    setLoaded({ table: layout.table, source, skipped: layout.skipped });
    setHasHeader(layout.hasHeader);
    setMapping(m);
    setMapOpen(m.address === undefined && m.street === undefined);
    setLand(guessLand(layout.table, layout.hasHeader, m, orgLand));
    setToggled(new Map());
    setResult(null);
    setRunError(null);
    setLoadError(null);
  }

  async function onFile(f: File | undefined) {
    if (!f || phase) return;
    setLoadError(null);
    setReading(true);
    try {
      applyTable(await readImportFile(f), f.name);
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
    try {
      applyTable(tableFromPaste(text), 'Eingefügte Tabelle');
    } catch (e) {
      setLoaded(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  function setField(key: FieldKey, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === '') delete next[key];
      else {
        // eine Spalte gehört zu einem Feld
        for (const k of Object.keys(next) as FieldKey[]) if (next[k] === Number(value)) delete next[k];
        next[key] = Number(value);
      }
      return next;
    });
    setToggled(new Map());
  }

  function changeHeader(on: boolean) {
    if (!table) return;
    setHasHeader(on);
    setMapping(mappingFor(table, on));
    setToggled(new Map());
  }

  function toggle(r: PlanRow, on: boolean) {
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
        if (!r.input) continue;
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
    cancelGeo.current = false;
    let created = 0;
    try {
      // Frisch vom Server: Objektliste (nichts doppelt anlegen) und Pro (Gratis-Grenze). Pro unklar → letzter sicherer
      // Stand, sonst Abbruch mit „gleich nochmal“ (ProUnklarError) — nicht mehr „im Zweifel Pro“ (unbegrenzter Import).
      setPhase({ step: 'check' });
      const [fresh, proNow] = await Promise.all([fetchProperties(client), orgProFuerGrenze(client)]);
      const { rows, already, overLimit } = finalRows(plan, new Set(plan.rows.filter(isSel).map((r) => r.i)), fresh, proNow);

      // Standort aus der Adresse (OpenStreetMap, ≥ 1,1 s Abstand; nur mit PLZ und Ort) — abbrechbar, dann ohne Standort weiter
      const loc = new Map<number, GeoPoint>();
      const geoNow = geo && rows.length <= GEO_MAX;
      const findable = geoNow ? rows.filter((r) => addressPlace(r.address)) : [];
      for (let k = 0; k < findable.length && !cancelGeo.current; k++) {
        setPhase({ step: 'geo', done: k, total: findable.length });
        const { point } = await locateAddress(findable[k].address);
        if (point) loc.set(findable[k].i, point);
      }

      // Anlegen in Paketen; schlägt ein Paket fehl, einzeln wiederholen und die fehlerhaften Zeilen benennen.
      // Kein Netz, keine Berechtigung, Anmeldung abgelaufen: der Rest scheitert genauso — nicht Zeile für Zeile probieren.
      const items = rows.map((r) => ({ r, row: propertyRow(orgId, r.input!, undefined, loc.get(r.i) ?? null) }));
      const failed: Result['failed'] = [];
      const okIds = new Set<number>();
      // Lehnt der Server wegen der Gratis-Grenze ab (Auslöser NACHTRAG-GRATIS-GRENZE-2026-11-25), scheitert jede weitere Zeile genauso.
      const why = (e: unknown) =>
        istGratisGrenze(e) ? GRENZE_OBJEKTE : (e instanceof Error ? e.message : String(e)).replace(/^Objekte konnten nicht angelegt werden: /, '');
      let fatal = '';
      for (let k = 0; k < items.length; k += CHUNK) {
        setPhase({ step: 'save', done: k, total: items.length });
        const part = items.slice(k, k + CHUNK);
        if (!fatal) {
          try {
            await insertProperties(client, part.map((it) => it.row));
            part.forEach((it) => okIds.add(it.r.i));
            created += part.length;
            continue;
          } catch (e) {
            if (FATAL.test(why(e))) fatal = why(e);
          }
        }
        for (const it of part) {
          if (fatal) {
            failed.push({ line: it.r.line, name: it.r.name, reason: fatal });
            continue;
          }
          try {
            await insertProperties(client, [it.row]);
            okIds.add(it.r.i);
            created++;
          } catch (e) {
            const reason = why(e);
            if (FATAL.test(reason)) fatal = reason;
            failed.push({ line: it.r.line, name: it.r.name, reason });
          }
        }
      }
      setResult({
        created,
        failed,
        noLocation: rows.filter((r) => okIds.has(r.i) && !loc.has(r.i)).map((r) => r.name),
        noPlace: rows.filter((r) => okIds.has(r.i) && !addressPlace(r.address)).length,
        geo: geoNow,
        already,
        overLimit,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(
        created
          ? `${msg} — bis dahin angelegt: ${plural(created, 'Objekt', 'Objekte')}. Die Liste einfach noch einmal importieren: Vorhandenes wird erkannt.`
          : msg,
      );
    } finally {
      setPhase(null);
      // Angelegtes ist jetzt „schon vorhanden“ — eigene Häkchen zurücksetzen, damit nichts ein zweites Mal angehakt bleibt.
      // Ging gar nichts (z. B. kein Netz), bleibt die Auswahl für den nächsten Versuch stehen.
      if (created > 0) setToggled(new Map());
      onSaved();
    }
  }

  const header = table ? (hasHeader ? table.rows[0] : []) : [];
  const firstData = table ? table.rows[hasHeader ? 1 : 0] : undefined;
  const colCount = table ? Math.max(...table.rows.slice(0, 50).map((r) => r.length)) : 0;
  const mapped = FIELDS.filter((f) => mapping[f.key] !== undefined);
  const dataCount = table ? table.rows.length - (hasHeader ? 1 : 0) : 0;
  const newRows = plan ? plan.rows.filter((r) => r.status === 'ok') : [];
  const allOn = newRows.length > 0 && newRows.every(isSel);
  const hasAddressCol = mapping.address !== undefined || mapping.street !== undefined;
  /** nach erfolgreichem Anlegen ist nichts mehr zu tun — dann kein grauer „0 Objekte anlegen“-Knopf */
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
          <button type="button" className="btn ghost" onClick={() => downloadCsv('WinterDex_Objekte_Vorlage.csv', templateCsv())}>
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
            {table.moreSheets && (
              <p className="small muted" style={{ margin: '0 0 6px' }}>
                Gelesen wird nur das erste Tabellenblatt. Andere Blätter bitte einzeln speichern oder kopieren.
              </p>
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
            {plural(plan.count.ok, 'neues Objekt', 'neue Objekte')} erkannt.
            {plan.count.missing > 0 && ` ${plural(plan.count.missing, 'Zeile', 'Zeilen')} ohne Adresse ${plan.count.missing === 1 ? 'wird' : 'werden'} übersprungen.`}
            {plan.count.exists > 0 && ` ${plural(plan.count.exists, 'Objekt gibt', 'Objekte gibt')} es schon — nicht angehakt.`}
            {plan.count.dup > 0 && ` ${plural(plan.count.dup, 'Zeile steht', 'Zeilen stehen')} doppelt in der Liste — nicht angehakt.`}
          </p>

          {!hasAddressCol && (
            <div className="info-box">Keine Adress-Spalte erkannt — bitte unten unter „Spalten zuordnen“ festlegen.</div>
          )}
          <details className="card wd-imp-map" open={mapOpen} onToggle={(e) => setMapOpen(e.currentTarget.open)}>
            <summary>
              Spalten zuordnen{' '}
              <span className="muted small">
                ({mapped.length ? mapped.map((f) => f.label.replace(/ \(.*\)$/, '')).join(', ') : 'nichts erkannt — bitte zuordnen'})
              </span>
            </summary>
            <p className="small muted">Welche Spalte der Liste gehört wohin? Nicht vorhandene Felder leer lassen.</p>
            <div className="wd-imp-map-grid">
              {FIELDS.map((f) => (
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

          {usesDefaults && (
            <label className="field wd-imp-land">
              Pflichtzeiten, wo in der Liste keine stehen
              <select value={land} onChange={(e) => setLand(e.target.value as Land)} disabled={!!phase}>
                {(Object.keys(LAND_LABELS) as Land[]).map((l) => (
                  <option key={l} value={l}>
                    {LAND_LABELS[l]}
                  </option>
                ))}
              </select>
              <span className="muted small field-hint">
                Vorgabe: {dutyText(DUTY_DEFAULTS[land])}. {DUTY_HINTS[land]}
              </span>
            </label>
          )}

          <div className="table-wrap wd-imp-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Alle neuen Objekte anhaken"
                      title="Alle neuen Objekte anhaken"
                      checked={allOn}
                      disabled={!newRows.length || !!phase}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th>Zeile</th>
                  <th>Objekt</th>
                  <th>Auftraggeber</th>
                  <th>Pflichtzeiten</th>
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
                          disabled={!r.input || !!phase}
                          onChange={(e) => toggle(r, e.target.checked)}
                        />
                      </td>
                      <td className="muted">{r.line}</td>
                      <td className="wrap">
                        <b>{r.name || '—'}</b>
                        {r.nameFromAddress && r.name && <span className="muted small"> (Name aus der Adresse)</span>}
                        <span className="wd-imp-sub">{r.address || '—'}</span>
                        {/* am Handy steht der Status hier, die Status-Spalte läge außerhalb des Bildschirms */}
                        <span className="wd-imp-st-inline">
                          <StatusBadge row={r} />
                        </span>
                      </td>
                      <td className="wrap muted">{r.customer || '—'}</td>
                      <td className="muted small">
                        {r.input ? dutyText(r.input.duty_times) : '—'}
                        {r.input && r.dutyDefault && <span className="wd-imp-sub">Vorgabe {LAND_LABELS[land]}</span>}
                      </td>
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
            <label className="wd-check">
              <input type="checkbox" checked={geoOn} onChange={(e) => setGeo(e.target.checked)} disabled={!!phase || !geoPossible} />
              Standort aus der Adresse bestimmen (für Glätte-Frühwarnung und GPS-Abstand)
            </label>
            <p className="small muted" style={{ margin: '4px 0 0 26px' }}>
              {geoPossible
                ? 'Dazu werden die Adressen an OpenStreetMap (Nominatim) gesendet — etwa 1 Sekunde je Objekt.'
                : `Bei mehr als ${GEO_MAX} Objekten auf einmal geht das nicht. Den Standort dann in der App vor Ort festlegen — oder die Liste aufteilen.`}
              {geoOn && noPlaceCount > 0 && ` ${plural(noPlaceCount, 'Adresse hat', 'Adressen haben')} keine PLZ und keinen Ort — dafür wird kein Standort gesucht.`}
            </p>

            {limited && (
              <div className="info-box">
                Im Gratis-Paket sind {FREE_PROPERTIES} aktive Objekte möglich
                {allowance === 0
                  ? ` — dein Betrieb hat schon ${activeCount}. `
                  : ` — angelegt ${allowance === 1 ? 'wird' : 'werden'} jetzt nur ${allowance === 1 ? 'das erste' : `die ersten ${allowance}`} der Auswahl. `}
                Unbegrenzt viele gibt es mit Pro. {PRO_HOW} <a href={PRO_MAILTO}>E-Mail schreiben</a>
              </div>
            )}

            {!doneNothingLeft && (
              <div className="row" style={{ marginTop: 16 }}>
                <button type="button" className="btn" onClick={() => void run()} disabled={!!phase || toCreate === 0}>
                  <Upload className="i" aria-hidden /> {plural(toCreate, 'Objekt', 'Objekte')} anlegen
                </button>
                {!phase && toCreate === 0 && !limited && !result && <span className="small muted">Nichts angehakt.</span>}
              </div>
            )}

            {phase && (
              <Progress
                phase={phase}
                onCancel={() => {
                  cancelGeo.current = true;
                }}
              />
            )}
            {runError && <div className="error-box">{runError}</div>}
            {result && <ResultBox result={result} />}
          </div>
        </>
      )}
    </div>
  );
}

function dutyText(d: DutyTimes): string {
  if (d.mo_fr && d.mo_fr === d.sa && d.sa === d.so) return `täglich ${d.mo_fr}`;
  return [d.mo_fr && `Mo–Fr ${d.mo_fr}`, d.sa && `Sa ${d.sa}`, d.so && `So ${d.so}`].filter(Boolean).join(' · ') || '—';
}

function StatusBadge({ row }: { row: PlanRow }) {
  switch (row.status) {
    case 'ok':
      return <span className="badge green">neu</span>;
    case 'missing':
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

function Progress({ phase, onCancel }: { phase: Phase; onCancel: () => void }) {
  if (phase.step === 'check') {
    return (
      <p className="small muted" style={{ marginBottom: 0 }}>
        <span className="spinner" /> Objektliste wird geprüft …
      </p>
    );
  }
  const pct = phase.total ? Math.round((phase.done / phase.total) * 100) : 0;
  const left = Math.ceil((phase.total - phase.done) * 1.1);
  return (
    <div className="wd-imp-progress" role="status">
      <div className="wd-imp-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      {phase.step === 'geo' ? (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small">
            Standort {phase.done + 1} von {phase.total} wird bestimmt … {left > 3 && <span className="muted">noch etwa {left} s</span>}
          </span>
          <button type="button" className="btn ghost small" onClick={onCancel}>
            Abbrechen — ohne Standort weiter
          </button>
        </div>
      ) : (
        <span className="small">
          Objekte werden angelegt … {Math.min(phase.done + CHUNK, phase.total)} von {phase.total}
        </span>
      )}
    </div>
  );
}

function ResultBox({ result }: { result: Result }) {
  const { created, failed, noLocation } = result;
  return (
    <div className="wd-imp-result" role="status">
      <p className="wd-imp-result-head">
        {created > 0 && <CheckCircle2 className="i" aria-hidden />}
        {plural(created, 'Objekt', 'Objekte')} angelegt
        {failed.length > 0 && `, ${failed.length} nicht`}.
      </p>
      {failed.length > 0 && (
        <ul className="small">
          {failed.slice(0, 10).map((f) => (
            <li key={f.line}>
              Zeile {f.line} „{f.name}“: {f.reason}
            </li>
          ))}
          {failed.length > 10 && <li>… und {failed.length - 10} weitere</li>}
        </ul>
      )}
      {result.already > 0 && (
        <p className="small muted">
          {plural(result.already, 'Objekt war', 'Objekte waren')} inzwischen schon vorhanden und {result.already === 1 ? 'wurde' : 'wurden'} nicht
          noch einmal angelegt.
        </p>
      )}
      {result.overLimit > 0 && (
        <p className="small muted">{plural(result.overLimit, 'Objekt', 'Objekte')} nicht angelegt — Gratis-Grenze erreicht.</p>
      )}
      {created > 0 && noLocation.length > 0 && (
        <p className="small muted">
          {result.geo
            ? `Ohne Standort (in der App vor Ort festlegen): ${noLocation.slice(0, 15).join(', ')}${noLocation.length > 15 ? ` und ${noLocation.length - 15} weitere` : ''}.`
            : 'Den Standort legst du in der App vor Ort fest.'}
          {result.geo && result.noPlace > 0 && ' Tipp: Mit PLZ und Ort in der Adresse wird der Standort automatisch bestimmt.'}
        </p>
      )}
      {failed.length > 0 && (
        <p className="small muted">Die Liste einfach noch einmal importieren: schon Angelegtes wird erkannt und nicht doppelt angelegt.</p>
      )}
      <div className="row">
        <Link className="btn small" to="../objekte">
          Zur Objektliste
        </Link>
      </div>
    </div>
  );
}
