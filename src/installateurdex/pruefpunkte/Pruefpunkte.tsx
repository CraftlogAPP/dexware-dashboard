// Eigene Prüfpunkte & Messwerte — Editor wie die App (mobile/src/screens/CustomChecksScreen.tsx), am großen Bildschirm:
// links Anlagentyp, Mitte bearbeiten, rechts die Vorschau, wie der Monteur die Liste sieht.
// Gespeichert in org.checklists (ganzes Team, auch im Protokoll-PDF). Nur Inhaber, Ändern nur mit Pro (wie die App).
// Logik + Mergen ohne Datenverlust: logic.ts · Datenweg: data.ts

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ListChecks, Lock, Pencil, Plus, RotateCcw, Ruler, Smartphone, Trash2, X } from 'lucide-react';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { useInst } from '../context';
import { ITEM_KINDS, isProOrg, jobInfo, kindInfo, type InspectionType } from '../types';
import { saveErrorText } from './data';
import {
  ALL,
  CHECK_TYPES,
  MAX_CHECKS_BYTES,
  MAX_FIELD_LABEL,
  MAX_FIELDS,
  MAX_LABEL,
  MAX_OWN,
  MAX_UNIT,
  SUGGEST_ALL,
  checklistFor,
  cleanChecks,
  cleanFieldPart,
  cleanLabel,
  countCustom,
  jsonBytes,
  measuresWithCustom,
  mergeChecks,
  sameChecks,
  type CheckCustom,
  type CustomChecks,
} from './logic';
import './pruefpunkte.css';

const lower = (s: string) => s.toLocaleLowerCase('de');
const kindName = (k: string) => (k === ALL ? 'Alle Anlagen' : kindInfo(k).label);
const kindEmoji = (k: string) => (k === ALL ? '🏠' : kindInfo(k).emoji);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Pruefpunkte() {
  const { ext, org } = useInst();
  const state = useAsync(() => ext.pruefpunkte.load(org.id), [ext, org.id]);
  return (
    <div className="pp">
      <h1>Prüfpunkte &amp; Messwerte</h1>
      <p className="muted pp-intro">
        Passe die Checklisten an deinen Betrieb an: eigene Prüfpunkte ergänzen — etwa von eurem Papier-Protokoll — und
        Standard-Punkte ausblenden, die ihr nicht braucht. Dazu eigene Messwerte. Gilt für dein ganzes Team und steht so im
        Protokoll-PDF.
      </p>
      <LoadGuard state={state}>{(raw) => <Editor key={JSON.stringify(raw)} initialRaw={raw} onReload={state.reload} />}</LoadGuard>
    </div>
  );
}

type Conflict = { fresh: unknown } | null;

function Editor({ initialRaw, onReload }: { initialRaw: unknown; onReload: () => void }) {
  const { ext, org, isOwner, base, demo } = useInst();
  const pro = isProOrg(org);
  const canEdit = isOwner && pro;

  // Stand in der Datenbank (bereinigt) und bearbeiteter Stand
  const [saved, setSaved] = useState<CustomChecks>(() => cleanChecks(initialRaw));
  const [checks, setChecks] = useState<CustomChecks>(saved);
  const [type, setType] = useState<InspectionType>('service');
  const [kind, setKind] = useState<string>(ALL);
  const [previewPick, setPreviewPick] = useState<string>('hp_air');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [conflict, setConflict] = useState<Conflict>(null);

  // Schmale Ansicht: Anlagentypen stehen in einer waagerechten Leiste — den gewählten sichtbar halten
  const kindListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = kindListRef.current;
    const on = list?.querySelector<HTMLElement>('.pp-kind.on');
    if (!list || !on || list.scrollWidth <= list.clientWidth) return;
    const l = list.getBoundingClientRect();
    const r = on.getBoundingClientRect();
    if (r.left < l.left) list.scrollLeft -= l.left - r.left + 16;
    else if (r.right > l.right) list.scrollLeft += r.right - l.right + 16;
  }, [kind]);

  const dirty = !sameChecks(checks, saved);
  useUnsavedGuard(canEdit && dirty, 'Deine eigenen Prüfpunkte sind noch nicht gespeichert. Seite trotzdem verlassen?');

  const cur: CheckCustom = checks[type]?.[kind] ?? {};
  const allCfg: CheckCustom = checks[type]?.[ALL] ?? {};

  function update(fn: (c: Required<CheckCustom>) => CheckCustom) {
    if (!canEdit) return;
    setOk(false);
    setErr(null);
    setChecks((prev) => {
      const t = { ...(prev[type] ?? {}) };
      const c = t[kind] ?? {};
      const next = fn({ add: [...(c.add ?? [])], hide: [...(c.hide ?? [])], fields: [...(c.fields ?? [])] });
      const clean: CheckCustom = {};
      if (next.add?.length) clean.add = next.add;
      if (next.hide?.length) clean.hide = next.hide;
      if (next.fields?.length) clean.fields = next.fields;
      if (clean.add || clean.hide || clean.fields) t[kind] = clean;
      else delete t[kind];
      const out = { ...prev };
      if (Object.keys(t).length) out[type] = t;
      else delete out[type];
      return out;
    });
  }

  async function save(force = false) {
    if (!canEdit || !dirty) return;
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      // Frisch lesen: Unbekanntes aus neueren App-Versionen bleibt erhalten, und eine Änderung aus der App
      // in der Zwischenzeit wird nicht stillschweigend überschrieben.
      const fresh = await ext.pruefpunkte.load(org.id);
      if (!force && !sameChecks(cleanChecks(fresh), saved)) {
        setConflict({ fresh });
        return;
      }
      const value = mergeChecks(fresh, checks);
      if (jsonBytes(value) > MAX_CHECKS_BYTES) {
        setErr(
          'Zu viele Einträge — die Listen sind zu groß zum Speichern. Bitte Punkte kürzen oder Einträge, die mehrere Anlagentypen gleich haben, unter „Alle Anlagen“ zusammenfassen.',
        );
        return;
      }
      await ext.pruefpunkte.save(org.id, value);
      const now = cleanChecks(value);
      setSaved(now);
      setChecks(now);
      setConflict(null);
      setOk(true);
    } catch (e) {
      setErr(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setChecks(saved);
    setErr(null);
    setOk(false);
  }

  const standard = kind === ALL ? [] : checklistFor(kind, type);
  const previewKind = kind === ALL ? previewPick : kind;
  const preview = checklistFor(previewKind, type, checks);
  const previewMeasures = measuresWithCustom(type, previewKind, checks);
  const kindCount = (k: string) => (checks[type]?.[k]?.add?.length ?? 0) + (checks[type]?.[k]?.hide?.length ?? 0) + (checks[type]?.[k]?.fields?.length ?? 0);
  const total = countCustom(checks);

  return (
    <>
      {!isOwner && <div className="info-box">Nur der Inhaber des Betriebs kann Prüfpunkte ändern — du siehst hier, was gilt.</div>}
      {isOwner && !pro && (
        <div className="info-box">
          <Lock className="pp-inline-i" aria-hidden /> Eigene Prüfpunkte ändern geht mit <b>Pro</b>. Bestehende Anpassungen
          bleiben erhalten und wirken weiter. <Link to={`${base}/abo`}>Zum Abo</Link>
        </div>
      )}

      <div className="pp-step">
        <span className="pp-step-n">1</span> Einsatzart
      </div>
      <div className="idx-tabs pp-types" role="tablist" aria-label="Einsatzart">
        {CHECK_TYPES.map((t) => {
          const c = countCustom(checks, t);
          const n = c.own + c.hidden + c.fields;
          return (
            <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
              {jobInfo(t).emoji} {jobInfo(t).label}
              {n > 0 && <span className="n">· {n}</span>}
            </button>
          );
        })}
      </div>

      <div className="pp-grid">
        <nav className="pp-kinds" aria-label="Anlagentyp">
          <div className="pp-step pp-step-in">
            <span className="pp-step-n">2</span> Anlagentyp
          </div>
          <div className="pp-kind-list" ref={kindListRef}>
            {[ALL, ...ITEM_KINDS.map((k) => k.id)].map((k) => {
              const n = kindCount(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`pp-kind${kind === k ? ' on' : ''}${k === ALL ? ' all' : ''}`}
                  aria-current={kind === k ? 'true' : undefined}
                  title={kindName(k)}
                  onClick={() => setKind(k)}
                >
                  <span className="pp-kind-emoji" aria-hidden>
                    {kindEmoji(k)}
                  </span>
                  <span className="pp-kind-label">{kindName(k)}</span>
                  {n > 0 && (
                    <span className="pp-kind-n" title={`${n} Anpassungen`}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <section className="card pp-edit" aria-label="Prüfpunkte bearbeiten">
          <div className="pp-edit-head">
            <span className="pp-edit-emoji" aria-hidden>
              {kindEmoji(kind)}
            </span>
            <div>
              <h2>{kind === ALL ? 'Für jede Anlage' : kindName(kind)}</h2>
              <p className="muted small">
                {kind === ALL
                  ? `Diese Punkte und Messwerte stehen bei jeder ${jobInfo(type).label} am Ende — egal welcher Anlagentyp.`
                  : `${jobInfo(type).label}: Standard-Punkte ein- oder ausschalten, eigene Punkte ergänzen.`}
              </p>
            </div>
          </div>

          {kind !== ALL && (
            <Block
              icon={<ListChecks className="i" aria-hidden />}
              title="Standard-Punkte"
              meta={`${standard.length - standard.filter((c) => cur.hide?.includes(c.id)).length} von ${standard.length} aktiv`}
            >
              <ul className="pp-rows">
                {standard.map((c) => {
                  const hidden = !!cur.hide?.includes(c.id);
                  return (
                    <li key={c.id} className={`pp-row std${hidden ? ' off' : ''}`}>
                      <div className="pp-row-text">
                        <span className="pp-row-label">{c.label}</span>
                        <span className="pp-row-hint">{c.hint}</span>
                      </div>
                      <Switch
                        on={!hidden}
                        disabled={!canEdit}
                        label={`${c.label}: ${hidden ? 'ausgeblendet' : 'aktiv'}`}
                        onChange={() =>
                          update((x) => ({ ...x, hide: hidden ? x.hide.filter((h) => h !== c.id) : [...x.hide, c.id] }))
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </Block>
          )}

          {/* key: beim Wechsel von Einsatzart/Anlagentyp Eingaben und Hinweise zurücksetzen */}
          <OwnChecks key={`c-${type}-${kind}`} cur={cur} canEdit={canEdit} kind={kind} update={update} />

          {kind !== ALL && (allCfg.add?.length ?? 0) > 0 && (
            <div className="pp-inherit">
              <span>
                Dazu kommen am Ende {plural(allCfg.add!.length, 'Punkt', 'Punkte')} für alle Anlagen:{' '}
                <span className="muted">{allCfg.add!.join(' · ')}</span>
              </span>
              <button type="button" className="btn ghost small" onClick={() => setKind(ALL)}>
                🏠 Alle Anlagen
              </button>
            </div>
          )}

          <OwnFields key={`f-${type}-${kind}`} cur={cur} canEdit={canEdit} update={update} />
        </section>

        <aside className="pp-preview" aria-label="Vorschau für den Monteur">
          <div className="pp-step pp-step-in">
            <Smartphone className="pp-inline-i" aria-hidden /> So sieht es der Monteur
          </div>
          {kind === ALL && (
            <label className="pp-preview-pick">
              Vorschau für
              <select value={previewPick} onChange={(e) => setPreviewPick(e.target.value)}>
                {ITEM_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.emoji} {k.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="pp-phone">
            <div className="pp-phone-bar">
              <span>
                {jobInfo(type).emoji} {jobInfo(type).short}
              </span>
              <span className="muted">
                {kindInfo(previewKind).emoji} {kindInfo(previewKind).label}
              </span>
            </div>
            <div className="pp-phone-body">
              <div className="pp-phone-h">Checkliste</div>
              {preview.length === 0 && <p className="muted small">Keine Prüfpunkte — alle Standard-Punkte sind ausgeblendet.</p>}
              <ol className="pp-phone-list">
                {preview.map((c) => (
                  <li key={c.id} className={c.own ? 'own' : ''}>
                    <div className="pp-phone-item">
                      <span className="pp-phone-label">
                        {c.label}
                        {c.own && <span className="pp-tag">eigener</span>}
                      </span>
                      {c.hint && <span className="pp-phone-hint">{c.hint}</span>}
                    </div>
                    <span className="pp-phone-pills" aria-hidden>
                      <span>OK</span>
                      <span>Mangel</span>
                      <span>–</span>
                    </span>
                  </li>
                ))}
              </ol>
              {previewMeasures.length > 0 && (
                <>
                  <div className="pp-phone-h">Messwerte</div>
                  <div className="pp-phone-measures">
                    {previewMeasures.map((m) => (
                      <div key={m.id} className={`pp-phone-measure${m.own ? ' own' : ''}`}>
                        <span className="pp-phone-mlabel">
                          {m.label}
                          {m.own && <span className="pp-tag">eigener</span>}
                        </span>
                        <span className="pp-phone-input">
                          <span className="muted">{m.text ? 'Text' : '0,0'}</span>
                          {m.unit && <b>{m.unit}</b>}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="pp-phone-foot">
              {plural(preview.length, 'Prüfpunkt', 'Prüfpunkte')} · {plural(previewMeasures.length, 'Messwert', 'Messwerte')}
            </div>
          </div>
        </aside>
      </div>

      <p className="muted small pp-summary">
        {total.own || total.hidden || total.fields
          ? `Insgesamt: ${plural(total.own, 'eigener Punkt', 'eigene Punkte')}${total.hidden ? ` · ${total.hidden} ausgeblendet` : ''}${
              total.fields ? ` · ${plural(total.fields, 'eigener Messwert', 'eigene Messwerte')}` : ''
            }. Bereits gespeicherte Protokolle bleiben unverändert.`
          : 'Noch keine Anpassungen — es gelten die Standard-Checklisten.'}
      </p>

      {canEdit && (
        <div className="idx-save-bar pp-save">
          <button type="button" className="btn" disabled={busy || !dirty} onClick={() => void save()}>
            <Check className="i" aria-hidden />
            {busy ? 'Speichern …' : 'Prüfpunkte speichern'}
          </button>
          {dirty && !busy && (
            <button type="button" className="btn ghost" onClick={discard}>
              <RotateCcw className="i" aria-hidden /> Verwerfen
            </button>
          )}
          {dirty && !busy && !err && !conflict && <span className="pp-dirty">Ungespeicherte Änderungen</span>}
          {ok && !dirty && <span className="idx-ok">✓ Gespeichert{demo ? ' (Beispieldaten — nur bis zum Neuladen)' : ' — gilt ab sofort fürs ganze Team'}</span>}
          {err && (
            <span className="error-box" style={{ margin: 0 }}>
              {err}
            </span>
          )}
        </div>
      )}
      {conflict && (
        <div className="error-box pp-conflict" role="alert">
          <b>In der App wurden die Prüfpunkte inzwischen geändert.</b> Speichern würde diese Änderung mit deinem Stand
          überschreiben.
          <div className="pp-conflict-actions">
            <button type="button" className="btn ghost small" onClick={onReload}>
              Neu laden (deine Änderungen verwerfen)
            </button>
            <button type="button" className="btn small" onClick={() => void save(true)}>
              Trotzdem meinen Stand speichern
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Block({ icon, title, meta, children }: { icon: ReactNode; title: string; meta?: string; children: ReactNode }) {
  return (
    <div className="pp-block">
      <div className="pp-block-head">
        <h3>
          {icon} {title}
        </h3>
        {meta && <span className="pp-meta">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={on ? 'Aktiv — klicken zum Ausblenden' : 'Ausgeblendet — klicken zum Einblenden'} className={`pp-switch${on ? ' on' : ''}`} disabled={disabled} onClick={onChange}>
      <span className="pp-switch-knob" />
    </button>
  );
}

type Update = (fn: (c: Required<CheckCustom>) => CheckCustom) => void;

function OwnChecks({ cur, canEdit, kind, update }: { cur: CheckCustom; canEdit: boolean; kind: string; update: Update }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const list = cur.add ?? [];

  function add(raw: string) {
    const label = cleanLabel(raw);
    if (label.length < 2) return setNote('Bitte mindestens 2 Zeichen eingeben.');
    if (list.some((l) => lower(l) === lower(label))) return setNote(`„${label}“ steht bereits in der Liste.`);
    if (list.length >= MAX_OWN) return setNote(`Höchstens ${MAX_OWN} eigene Punkte je Anlagentyp.`);
    update((c) => ({ ...c, add: [...c.add, label] }));
    setText('');
    setNote(null);
  }
  function rename(i: number, raw: string): boolean {
    const label = cleanLabel(raw);
    if (label.length < 2) {
      setNote('Bitte mindestens 2 Zeichen eingeben.');
      return false;
    }
    if (list.some((l, j) => j !== i && lower(l) === lower(label))) {
      setNote(`„${label}“ steht bereits in der Liste.`);
      return false;
    }
    if (label !== list[i]) update((c) => ({ ...c, add: c.add.map((l, j) => (j === i ? label : l)) }));
    setNote(null);
    return true;
  }
  const move = (i: number, d: -1 | 1) =>
    update((c) => {
      const a = [...c.add];
      const j = i + d;
      if (j < 0 || j >= a.length) return c;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...c, add: a };
    });
  const remove = (i: number) => update((c) => ({ ...c, add: c.add.filter((_, j) => j !== i) }));

  const suggestions = kind === ALL && canEdit ? SUGGEST_ALL.filter((s) => !list.some((l) => lower(l) === lower(s))) : [];

  return (
    <Block icon={<Plus className="i" aria-hidden />} title="Eigene Prüfpunkte" meta={`${list.length} / ${MAX_OWN}`}>
      {list.length === 0 && <p className="muted small pp-empty">Noch keine eigenen Punkte{kind === ALL ? ' für alle Anlagen' : ' für diesen Anlagentyp'}.</p>}
      <ul className="pp-rows">
        {list.map((label, i) =>
          editing === i ? (
            <li key={`e-${i}`} className="pp-row own editing">
              <InlineEdit
                initial={label}
                max={MAX_LABEL}
                aria="Prüfpunkt umbenennen"
                onDone={(v) => {
                  if (v === null || rename(i, v)) setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={label} className="pp-row own">
              <span className="pp-row-label">{label}</span>
              {canEdit && editing === null && (
                <span className="pp-actions">
                  <IconBtn label={`${label} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </IconBtn>
                  <IconBtn label={`${label} nach unten`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </IconBtn>
                  <IconBtn label={`${label} umbenennen`} onClick={() => setEditing(i)}>
                    <Pencil />
                  </IconBtn>
                  <IconBtn label={`${label} löschen`} danger onClick={() => remove(i)}>
                    <Trash2 />
                  </IconBtn>
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {canEdit && (
        <>
          <form
            className="pp-add"
            onSubmit={(e) => {
              e.preventDefault();
              add(text);
            }}
          >
            <input
              value={text}
              maxLength={MAX_LABEL}
              onChange={(e) => {
                setText(e.target.value);
                setNote(null);
              }}
              placeholder={kind === ALL ? 'z. B. Arbeitsplatz sauber hinterlassen' : 'Eigener Prüfpunkt, z. B. CO-Melder geprüft'}
              aria-label="Neuer Prüfpunkt"
            />
            <button type="submit" className="btn" disabled={cleanLabel(text).length < 2 || list.length >= MAX_OWN}>
              <Plus className="i" aria-hidden /> Hinzufügen
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="pp-suggest">
              <span className="muted small">Vorschläge:</span>
              {suggestions.map((s) => (
                <button key={s} type="button" className="badge" onClick={() => add(s)}>
                  + {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {note && <p className="pp-note">{note}</p>}
    </Block>
  );
}

function OwnFields({ cur, canEdit, update }: { cur: CheckCustom; canEdit: boolean; update: Update }) {
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [eLabel, setELabel] = useState('');
  const [eUnit, setEUnit] = useState('');
  const list = cur.fields ?? [];

  function check(l: string, skip: number): string | null {
    if (l.length < 2) return 'Bezeichnung: bitte mindestens 2 Zeichen.';
    if (list.some((f, j) => j !== skip && lower(f.label) === lower(l))) return `„${l}“ steht bereits in der Liste.`;
    return null;
  }
  function add() {
    const l = cleanFieldPart(label, MAX_FIELD_LABEL);
    const u = cleanFieldPart(unit, MAX_UNIT);
    const problem = check(l, -1) ?? (list.length >= MAX_FIELDS ? `Höchstens ${MAX_FIELDS} eigene Messwerte je Anlagentyp.` : null);
    if (problem) return setNote(problem);
    update((c) => ({ ...c, fields: [...c.fields, u ? { label: l, unit: u } : { label: l }] }));
    setLabel('');
    setUnit('');
    setNote(null);
  }
  function startEdit(i: number) {
    setEditing(i);
    setELabel(list[i].label);
    setEUnit(list[i].unit ?? '');
    setNote(null);
  }
  function commitEdit() {
    if (editing === null) return;
    const l = cleanFieldPart(eLabel, MAX_FIELD_LABEL);
    const u = cleanFieldPart(eUnit, MAX_UNIT);
    const problem = check(l, editing);
    if (problem) return setNote(problem);
    const i = editing;
    update((c) => ({ ...c, fields: c.fields.map((f, j) => (j === i ? (u ? { label: l, unit: u } : { label: l }) : f)) }));
    setEditing(null);
    setNote(null);
  }
  const editKeys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditing(null);
      setNote(null);
    }
  };
  const move = (i: number, d: -1 | 1) =>
    update((c) => {
      const a = [...c.fields];
      const j = i + d;
      if (j < 0 || j >= a.length) return c;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...c, fields: a };
    });

  return (
    <Block icon={<Ruler className="i" aria-hidden />} title="Eigene Messwerte" meta={`${list.length} / ${MAX_FIELDS}`}>
      <p className="muted small pp-block-hint">
        Zusätzliche Felder unter „Messwerte“, z. B. „Kesselwasser pH“ oder „Leitfähigkeit“ in µS/cm. <b>Mit Einheit</b> = Zahlenfeld,{' '}
        <b>ohne Einheit</b> = Textfeld.
      </p>
      <ul className="pp-rows">
        {list.map((f, i) =>
          editing === i ? (
            <li key={`e-${i}`} className="pp-row own editing">
              <div className="pp-field-edit">
                <input autoFocus value={eLabel} maxLength={MAX_FIELD_LABEL} onChange={(e) => setELabel(e.target.value)} onKeyDown={editKeys} aria-label="Bezeichnung" />
                <input className="pp-unit" value={eUnit} maxLength={MAX_UNIT} onChange={(e) => setEUnit(e.target.value)} onKeyDown={editKeys} placeholder="Einheit" aria-label="Einheit (leer = Textfeld)" />
                <IconBtn label="Übernehmen" onClick={commitEdit}>
                  <Check />
                </IconBtn>
                <IconBtn
                  label="Abbrechen"
                  onClick={() => {
                    setEditing(null);
                    setNote(null);
                  }}
                >
                  <X />
                </IconBtn>
              </div>
            </li>
          ) : (
            <li key={f.label} className="pp-row own">
              <span className="pp-row-label">{f.label}</span>
              <span className={`badge ${f.unit ? 'external' : ''}`}>{f.unit ? `Zahl · ${f.unit}` : 'Text'}</span>
              {canEdit && editing === null && (
                <span className="pp-actions">
                  <IconBtn label={`${f.label} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </IconBtn>
                  <IconBtn label={`${f.label} nach unten`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </IconBtn>
                  <IconBtn label={`${f.label} bearbeiten`} onClick={() => startEdit(i)}>
                    <Pencil />
                  </IconBtn>
                  <IconBtn label={`${f.label} löschen`} danger onClick={() => update((c) => ({ ...c, fields: c.fields.filter((_, j) => j !== i) }))}>
                    <Trash2 />
                  </IconBtn>
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {canEdit && (
        <form
          className="pp-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={label}
            maxLength={MAX_FIELD_LABEL}
            onChange={(e) => {
              setLabel(e.target.value);
              setNote(null);
            }}
            placeholder="Bezeichnung, z. B. Kesselwasser pH"
            aria-label="Bezeichnung des Messwerts"
          />
          <input
            className="pp-unit"
            value={unit}
            maxLength={MAX_UNIT}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Einheit"
            aria-label="Einheit (leer = Textfeld)"
          />
          <button type="submit" className="btn" disabled={cleanFieldPart(label, MAX_FIELD_LABEL).length < 2 || list.length >= MAX_FIELDS}>
            <Plus className="i" aria-hidden /> Hinzufügen
          </button>
        </form>
      )}
      {note && <p className="pp-note">{note}</p>}
    </Block>
  );
}

function InlineEdit({ initial, max, aria, onDone }: { initial: string; max: number; aria: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="pp-field-edit">
      <input
        ref={ref}
        value={v}
        maxLength={max}
        aria-label={aria}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onDone(v);
          } else if (e.key === 'Escape') onDone(null);
        }}
      />
      <IconBtn label="Übernehmen" onClick={() => onDone(v)}>
        <Check />
      </IconBtn>
      <IconBtn label="Abbrechen" onClick={() => onDone(null)}>
        <X />
      </IconBtn>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`pp-icon${danger ? ' danger' : ''}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
