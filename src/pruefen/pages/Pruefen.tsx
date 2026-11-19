// Prüfung dokumentieren im Browser — gleicher Ablauf wie in der App (mobile/src/screens/InspectionScreen.tsx):
// Einheit, Prüfart, GPS-Stempel (automatisch, Beginn + Ende), Checkliste (OK / Mangel / n. z.), Mängel mit
// Ampel-Einstufung und Fotos, Beweisfotos, „Geprüft von“ + Qualifikation, Unterschrift, Notiz.
// Einmal gespeichert, nie mehr änderbar (nur Storno mit Vermerk) — deshalb fragt die Seite vor dem Speichern nach,
// wenn etwas fehlt, und sichert jeden Zwischenstand auf dem Gerät (Safari lädt nach der Kamera manchmal neu).
//
// Zwei Familien, EIN Formular (cfg.mode):
//   'unit' — geprüft wird eine Einheit (LeiterDex, FeuerDex, ToreDex, GurtDex); die Adresse nennt die Einheit.
//   'site' — geprüft wird der ganze Ort (GerüstDex, RegalDex, SpielDex; dort mobile/src/screens/InspectionScreen.tsx
//            mit warehouseId/siteId/playgroundId); die Adresse nennt den Ort. Mängel/Schäden wählen die betroffene
//            Einheit des Orts aus einer Liste — oder „… allgemein“. Keine Serienprüfung, kein Einheiten-Hinweis.
// Die Wörter (Prüfung/Inspektion/Kontrolle, Mangel/Schaden, „Geprüft von“) kommen aus wordsOf(cfg).
//
// HebeDex (Einheiten-Modus, alles über optionale Angaben der Konfiguration): Checkliste und Prüfarten hängen vom
// Teil-Typ ab (checklistOf/kindsOf), dazu die Karte „Ablegereife-Rechner“ (measureOf) — Messwerte als Text wie in der
// App, rotes Ergebnis stellt den passenden Checklisten-Punkt auf „Mangel“ und fragt beim Speichern nach dem Rot-Mangel.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, CloudOff, MapPin, Plus, TriangleAlert, X } from 'lucide-react';
import { useUnsavedGuard } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { GPS_GOOD_M, GPS_WEAK_M, useGpsStamp } from '../../winterdex/einsatz/gps';
import { fileToPhoto } from '../../winterdex/einsatz/photo';
import type { Site, Unit } from '../backend';
import {
  blockWords,
  canBlock,
  checklistOf,
  countWord,
  dueFkOf,
  isSiteMode,
  kindOf,
  kindsOf,
  measureOf,
  severityOf,
  unitAlertOf,
  wordsOf,
  type CheckResult,
  type MeasureOutcome,
  type MeasureSpec,
  type PruefConfig,
} from '../config';
import { usePruef, usePendingSync } from '../context';
import { getPrefs, loadLastMeasurements, loadPruefData, newId, setPrefs, withPendingMeta, type InspectorPrefs } from '../data';
import { dueInfo, fmtDay, lastDueByUnit, nextDueAfter } from '../due';
import { buildDefectRow, buildInspectionRow, measurementsForRow, type GpsFix } from '../rows';
import { defectsMissing, submit, type SubmitOutcome } from '../send';
import {
  deleteDraft,
  draftKey,
  getDraft,
  listPending,
  pendingKey,
  saveDraft,
  type DefectDraft,
  type Draft,
  type FormValues,
} from '../store';
import { Unterschrift } from '../Unterschrift';

const RESULTS: CheckResult[] = ['ok', 'defect', 'na'];

export function Pruefen() {
  const { unitId } = useParams();
  // key: „Weiter prüfen“ an der nächsten Einheit beginnt mit einem frischen Formular.
  // Im Orts-Modus steht an dieser Stelle der Adresse die ID des Orts (Baustelle, Lager, Spielplatz).
  return unitId ? <Formular key={unitId} unitId={unitId} /> : null;
}

/** @param unit Die Einheit, sobald sie geladen ist — bei HebeDex hängen Prüfarten und Checkliste von ihr ab. */
function initialForm(cfg: PruefConfig, prefs: InspectorPrefs, unit: Unit | null = null): FormValues {
  return {
    type: kindsOf(cfg, unit)[0].id,
    // Vorbelegung OK: abweichende Punkte werden aktiv auf „Mangel“ oder „n. z.“ gestellt (wie in der App).
    checklist: Object.fromEntries(checklistOf(cfg, unit).map((c) => [c.id, 'ok' as CheckResult])),
    notes: '',
    inspectorName: prefs.name,
    qualification: prefs.qualification,
    signature: prefs.signature,
  };
}

/** Checklisten-Vorbelegung aus der Einheiten-Warnung (cfg.unitAlert) — nur Punkte, die es in der Checkliste gibt. */
function alertPrefill(cfg: PruefConfig, unit: Unit): Record<string, CheckResult> {
  const pre = unitAlertOf(cfg, unit)?.checklist ?? {};
  return Object.fromEntries(checklistOf(cfg, unit).filter((c) => RESULTS.includes(pre[c.id])).map((c) => [c.id, pre[c.id]]));
}

type Phase = 'loading' | 'ask' | 'form' | 'done';
type Ask = null | 'defect' | 'gps' | 'name' | 'measure-missing' | 'measure-red';

interface DoneInfo {
  outcome: SubmitOutcome;
  hadGps: boolean;
  /** Genauigkeit des Beginn-Stempels in Metern, wenn er schwach war (sonst null) */
  weakAcc: number | null;
  type: string;
  at: string;
  blocked: boolean;
  serious: boolean;
  /** Einheiten-Warnung (z. B. „Ablegereif — …“): ersetzt „Wieder fällig am …“, keine Serienprüfung. */
  alertDone: string | null;
  /** Eigene Zeile der Prüfart (HebeDex Rissprüfung: „Nächste Rissprüfung in 3 Jahren.“) — sonst null. */
  kindDone: string | null;
}

/** Was geprüft wird: die Einheit — im Orts-Modus der Ort selbst (dann ist siteId = id). */
interface Subject {
  id: string;
  name: string;
  siteId: string;
}

function Formular({ unitId }: { unitId: string }) {
  const { be, cfg, userId, orgId, base } = usePruef();
  const app = cfg.appId;
  const U = cfg.labels.unit;
  const S = cfg.labels.site;
  const W = wordsOf(cfg);
  const I = W.insp;
  const D = W.defect;
  // Orts-Modus: „unitId“ (aus der Adresse) ist die ID des Orts; die Einheiten des Orts stehen im Mangel zur Auswahl.
  const siteMode = isSiteMode(cfg);
  const [siteUnits, setSiteUnits] = useState<Unit[]>([]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [blockedBefore, setBlockedBefore] = useState(false);
  const [found, setFound] = useState<Draft | null>(null);

  // Feste Prüf-ID je Formular: Ein wiederholter Versuch nutzt dieselbe ID und dieselben Foto-Pfade — nichts doppelt.
  const idRef = useRef(newId());
  const openedAtRef = useRef(new Date().toISOString());
  // Zeitstempel des ERSTEN Speicher-Versuchs — er ist Teil des Nachweises und bleibt bei Wiederholungen gleich.
  const firstAttemptRef = useRef<string | null>(null);
  const [restoredStart, setRestoredStart] = useState<GpsFix | null>(null);
  const [form, setForm] = useState<FormValues>(() => initialForm(cfg, getPrefs(app, userId)));
  // Vorbelegung aus einer Einheiten-Warnung (z. B. GurtDex: ablegereif → Punkt „Ablegereife“ auf Mangel) — je Formular einmal.
  const [prefill, setPrefill] = useState<Record<string, CheckResult>>({});
  const prefilledRef = useRef(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [defects, setDefects] = useState<DefectDraft[]>([]);
  const [editing, setEditing] = useState<DefectDraft | null>(null);
  const [askBlock, setAskBlock] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const confirmedDefectRef = useRef(false);
  const confirmedGpsRef = useRef(false);
  const confirmedNameRef = useRef(false);
  const confirmedMissingRef = useRef(false);
  const confirmedRedRef = useRef(false);
  // Aus einem Entwurf fortgesetzt? Dann überschreibt die Vorbelegung der Messwerte nur noch leere Felder.
  const resumedRef = useRef(false);
  const calcRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Je Einheit (HebeDex: je Teil-Typ) — bei allen anderen Apps die Checkliste und die Prüfarten der App.
  const perUnit = !!(cfg.checklistFor || cfg.kindsFor || cfg.measure);
  const checks = useMemo(() => checklistOf(cfg, unit), [cfg, unit]);
  const kinds = useMemo(() => kindsOf(cfg, unit), [cfg, unit]);
  const spec = useMemo(() => measureOf(cfg, unit), [cfg, unit]);

  // --- Laden: Einheit, Standort, offene Sperre, angefangene Prüfung ---------------------------
  const load = useCallback(() => {
    let alive = true;
    setLoadError(null);
    setPhase('loading');
    Promise.all([loadPruefData(be, app, userId), getDraft(app, userId, unitId)]).then(
      ([data, draft]) => {
        if (!alive) return;
        let pre: Record<string, CheckResult> = {};
        let loaded: Unit | null = null;
        if (siteMode) {
          const s = data.sites.find((x) => x.id === unitId) ?? null;
          if (!s) return setLoadError(`${S.one} nicht gefunden — gelöscht oder aus einem anderen Betrieb?`);
          if (!s.active) {
            return setLoadError(
              `„${s.name}“ ist nicht mehr aktiv — hier lässt sich keine ${I.one} dokumentieren. Wieder aktivieren geht unter „Mehr“ → „${S.many} verwalten“.`,
            );
          }
          setSite(s);
          setSiteUnits(
            data.units
              .filter((x) => x.siteId === s.id && !x.retired)
              .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })),
          );
          // Schon vorher offene Sperre irgendwo an diesem Ort (mit oder ohne Einheit) — wie in der App
          setBlockedBefore(data.openDefects.some((d) => d.blocked && d.siteId === s.id));
        } else {
          const u = data.units.find((x) => x.id === unitId) ?? null;
          if (!u) return setLoadError(`${U.one} nicht gefunden — gelöscht oder aus einem anderen Betrieb?`);
          if (u.retired) return setLoadError(`„${u.name}“ ist außer Betrieb genommen und kann nicht geprüft werden.`);
          // Ohne Stammdaten wäre die Checkliste die falsche (und nach dem Speichern nicht mehr änderbar) — wie in der App.
          if (perUnit && !u.row) {
            return setLoadError(`Die Stammdaten von „${u.name}“ fehlen auf diesem Gerät. Bitte mit Empfang erneut versuchen.`);
          }
          loaded = u;
          setUnit(u);
          setSite(data.sites.find((s) => s.id === u.siteId) ?? null);
          setBlockedBefore(data.openDefects.some((d) => d.blocked && d.unitId === unitId));
          pre = alertPrefill(cfg, u);
        }
        setPrefill(pre);
        if (draft) {
          setFound(draft);
          setPhase('ask');
        } else {
          if (!prefilledRef.current) {
            prefilledRef.current = true;
            if (perUnit) {
              // Prüfarten, Checkliste und Rechner dieses Teils (Nenndicke/Seilart aus den Stammdaten)
              const fresh = initialForm(cfg, getPrefs(app, userId), loaded);
              const measure = measureOf(cfg, loaded)?.prefill({});
              setForm((f) => ({ ...f, type: fresh.type, checklist: { ...fresh.checklist, ...pre }, ...(measure ? { measure } : {}) }));
            } else {
              setForm((f) => ({ ...f, checklist: { ...f.checklist, ...pre } }));
            }
          }
          openedAtRef.current = new Date().toISOString();
          setPhase('form');
        }
      },
      (e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [be, app, userId, unitId, U.one, S.one, S.many, I.one, siteMode, cfg, perUnit]);
  useEffect(() => load(), [load]);

  const resume = (d: Draft) => {
    idRef.current = d.inspectionId;
    openedAtRef.current = d.openedAt;
    setRestoredStart(d.start);
    // nur Punkte der heutigen Checkliste übernehmen; fehlende stehen auf OK
    const base0 = initialForm(cfg, getPrefs(app, userId), unit);
    const checklist = { ...base0.checklist };
    for (const c of checks) if (RESULTS.includes(d.form.checklist[c.id])) checklist[c.id] = d.form.checklist[c.id];
    // Entwurf von vor der Warnung (z. B. inzwischen ablegereif): Vorbelegung einmal nachholen
    if (!d.prefilled && !prefilledRef.current) Object.assign(checklist, prefill);
    prefilledRef.current = true;
    resumedRef.current = true;
    const measure = spec ? (d.form.measure ?? spec.prefill({})) : undefined;
    setForm({
      ...d.form,
      // Prüfart nur, wenn es sie für diese Einheit gibt (HebeDex: Rissprüfung nur bei Ketten)
      type: kinds.some((k) => k.id === d.form.type) ? d.form.type : kinds[0].id,
      checklist,
      ...(measure ? { measure } : {}),
    });
    setPhotos(d.photos);
    setDefects(d.defects);
    setEditing(d.editing);
    setMoreOpen(d.form.notes.trim() !== '');
    setFound(null);
    setPhase('form');
  };
  const startFresh = () => {
    void deleteDraft(app, userId, unitId);
    idRef.current = newId();
    openedAtRef.current = new Date().toISOString();
    prefilledRef.current = true;
    const fresh = initialForm(cfg, getPrefs(app, userId), unit);
    const measure = spec?.prefill({});
    setForm((f) => ({ ...f, type: fresh.type, checklist: { ...fresh.checklist, ...prefill }, ...(measure ? { measure } : {}) }));
    setFound(null);
    setPhase('form');
  };

  // --- Messwerte (nur Apps mit Rechner): Vorbelegung aus der letzten Prüfung dieser Einheit ---------------------
  // Wie in der App: Neumaße, Nenndicke und Seilart kommen aus der jüngsten gültigen Prüfung; schon Getipptes bleibt.
  const formOpen = phase === 'form';
  useEffect(() => {
    if (!formOpen || !spec) return;
    let alive = true;
    void listPending(app, userId)
      .then((p) => loadLastMeasurements(be, app, userId, unitId, cfg.cols.unitFk, p))
      .then((previous) => {
        if (!alive) return;
        const base0 = spec.prefill({});
        const keep = spec.prefill(previous);
        setForm((f) => {
          const cur = f.measure ?? {};
          const next = { ...cur };
          let changed = false;
          for (const [k, v] of Object.entries(keep)) {
            if (!v || v === cur[k]) continue;
            const empty = !String(cur[k] ?? '').trim();
            // Steht noch der Wert aus den Stammdaten da, gewinnt der aus der letzten Prüfung — nicht bei einem Entwurf.
            if (empty || (!resumedRef.current && cur[k] === base0[k])) {
              next[k] = v;
              changed = true;
            }
          }
          return changed ? { ...f, measure: next } : f;
        });
      });
    return () => {
      alive = false;
    };
  }, [formOpen, spec, be, app, userId, unitId, cfg.cols.unitFk]);
  const measure = useMemo(() => form.measure ?? {}, [form.measure]);
  const outcome = useMemo(() => (spec ? spec.evaluate(measure) : undefined), [spec, measure]);
  const setM = (key: string, value: string) => {
    confirmedMissingRef.current = false;
    confirmedRedRef.current = false;
    setForm((f) => ({ ...f, measure: { ...f.measure, [key]: value } }));
  };
  // Rechner rot → passenden Checklisten-Punkt von selbst auf „Mangel“ (bleibt änderbar) — wie in der App.
  const redNow = outcome?.red === true;
  const checkId = spec?.checkId;
  useEffect(() => {
    if (!redNow || !checkId) return;
    setForm((f) => (f.checklist[checkId] !== undefined && f.checklist[checkId] !== 'defect' ? { ...f, checklist: { ...f.checklist, [checkId]: 'defect' } } : f));
  }, [redNow, checkId]);

  const subject: Subject | null = siteMode
    ? site
      ? { id: site.id, name: site.name, siteId: site.id }
      : null
    : unit
      ? { id: unit.id, name: unit.name, siteId: unit.siteId }
      : null;
  /** Worauf sich ein Mangel bezieht (für Karte und Dialog). */
  const defectTarget = (d: DefectDraft): string =>
    siteMode
      ? d.unitId
        ? (siteUnits.find((u) => u.id === d.unitId)?.name ?? U.one)
        : (cfg.labels.general ?? `${S.one} allgemein`)
      : (subject?.name ?? '');
  /** Sperr-Texte zu einem Mangel — im Orts-Modus ohne gewählte Einheit ggf. die „allgemein“-Fassung. */
  const blockOf = (d: DefectDraft) => blockWords(cfg, severityOf(cfg, d.severity), siteMode ? !!d.unitId : true);

  // --- GPS ------------------------------------------------------------------------------------
  const noop = useCallback(() => undefined, []);
  const { gps, lastFixRef, retry } = useGpsStamp(phase === 'form', restoredStart, noop);
  const gpsOk = gps.status === 'ok';
  const gpsAcc = gpsOk ? Math.round(gps.accuracy ?? 0) : null;
  const gpsWeak = !gpsOk || (gps.accuracy ?? 9999) > GPS_WEAK_M;

  // --- Entwurf auf dem Gerät sichern ----------------------------------------------------------
  const firstKind = kinds[0].id;
  const dirty =
    photos.length > 0 ||
    defects.length > 0 ||
    editing !== null ||
    form.notes.trim() !== '' ||
    form.type !== firstKind ||
    // geändert gegenüber dem Anfangszustand (alles OK bzw. die Vorbelegung aus einer Einheiten-Warnung)
    checks.some((c) => (form.checklist[c.id] ?? 'ok') !== (prefill[c.id] ?? 'ok')) ||
    // ein Messwert eingetragen (die Vorbelegung wie Nenndicke oder Seilart zählt nicht)
    (spec ? spec.measuredKeys.some((k) => String(measure[k] ?? '').trim() !== '') : false);
  // Kamera geöffnet: Entwurf auch ohne Eingaben sichern (Safari kann die Seite dabei neu laden)
  const [forceDraft, setForceDraft] = useState(false);
  const [draftOnDevice, setDraftOnDevice] = useState(true);
  const snapshot = useRef<Draft | null>(null);
  const startFix: GpsFix | null = gpsOk ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, at: gps.at } : null;
  snapshot.current =
    phase === 'form' && subject
      ? {
          key: draftKey(app, userId, unitId),
          kind: 'draft',
          app,
          userId,
          siteId: subject.siteId,
          unitId,
          inspectionId: idRef.current,
          openedAt: openedAtRef.current,
          start: startFix,
          form,
          photos,
          defects,
          editing,
          ...(Object.keys(prefill).length > 0 ? { prefilled: true } : {}),
          updatedAt: new Date().toISOString(),
        }
      : null;
  const keepDraft = phase === 'form' && (dirty || forceDraft);
  const keepDraftRef = useRef(keepDraft);
  keepDraftRef.current = keepDraft;
  // Ab dem Senden wird kein Entwurf mehr geschrieben (sonst bliebe ein Entwurf einer schon gesendeten Prüfung zurück)
  const finishedRef = useRef(false);
  const saveDraftNow = useCallback(() => {
    const d = snapshot.current;
    if (!d || finishedRef.current) return;
    void saveDraft(d).then(setDraftOnDevice);
  }, []);
  const startKey = startFix ? `${startFix.lat},${startFix.lng},${startFix.accuracy}` : '';
  useEffect(() => {
    if (!keepDraft) return;
    const t = setTimeout(saveDraftNow, 400);
    return () => clearTimeout(t);
  }, [keepDraft, form, photos, defects, editing, startKey, saveDraftNow]);
  useEffect(() => {
    // Tab wird verlassen/geschlossen: letzten Stand sofort sichern (nicht erst nach 400 ms)
    const flush = () => {
      if (keepDraftRef.current) saveDraftNow();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [saveDraftNow]);
  // Nur wegen der Kamera gesichert, aber nichts eingegeben → beim Verlassen wieder aufräumen
  const cleanupRef = useRef({ forceDraft, dirty, phase });
  cleanupRef.current = { forceDraft, dirty, phase };
  useEffect(
    () => () => {
      const c = cleanupRef.current;
      if (c.phase === 'form' && c.forceDraft && !c.dirty) void deleteDraft(app, userId, unitId);
    },
    [app, userId, unitId],
  );
  // Ohne Gerätespeicher (privates Surfen) wäre beim Verlassen alles weg → dann nachfragen.
  useUnsavedGuard(
    phase === 'form' && dirty && !draftOnDevice,
    `Diese ${I.one} ist noch nicht gespeichert. Seite trotzdem verlassen? Checkliste, ${D.many} und Fotos gehen dann verloren.`,
  );

  // --- Fotos ----------------------------------------------------------------------------------
  const beforeCamera = () => {
    setForceDraft(true);
    saveDraftNow();
  };
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>, target: 'pruefung' | 'mangel') => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ''; // dasselbe Foto lässt sich danach erneut wählen
    if (!files.length) return;
    setPhotoError(null);
    setPhotoBusy((n) => n + files.length);
    for (const f of files) {
      try {
        const uri = await fileToPhoto(f);
        if (target === 'pruefung') setPhotos((prev) => [...prev, uri]);
        else setEditing((prev) => (prev ? { ...prev, photos: [...prev.photos, uri] } : prev));
      } catch {
        setPhotoError('Ein Foto konnte nicht verarbeitet werden. Bitte noch einmal aufnehmen.');
      } finally {
        setPhotoBusy((n) => n - 1);
      }
    }
  };

  // --- Checkliste + Mängel --------------------------------------------------------------------
  const set = (patch: Partial<FormValues>) => setForm((f) => ({ ...f, ...patch }));
  const setResult = (id: string, r: CheckResult) => {
    confirmedDefectRef.current = false;
    setForm((f) => ({ ...f, checklist: { ...f.checklist, [id]: r } }));
  };
  const defectPoints = checks.filter((c) => form.checklist[c.id] === 'defect');

  /** @param title Vorgabe für den Titel (HebeDex: „Ablegereif: …“ aus dem Rechner) — sonst der erste offene Checklisten-Punkt. */
  const openEditor = (title?: string, severity: string = cfg.defaultSeverity) => {
    // Steht schon ein Punkt auf „Mangel“, ist der Titel mit dem ersten noch nicht beschriebenen Punkt vorbelegt.
    const used = new Set(defects.map((d) => d.title));
    const prefill = title ?? defectPoints.find((c) => !used.has(c.label))?.label ?? '';
    setAskBlock(false);
    setEditing({
      key: newId(),
      title: prefill,
      description: '',
      severity,
      // Stufe mit gesetztem Sperr-Vermerk von Anfang an (HebeDex Rot) — sonst wie bisher ohne
      blocked: severityOf(cfg, severity).autoBlock === true,
      photos: [],
    });
  };
  const commitDefect = (draft: DefectDraft) => {
    confirmedDefectRef.current = false;
    const next = { ...draft, title: draft.title.trim() };
    setDefects((prev) => (prev.some((d) => d.key === next.key) ? prev.map((d) => (d.key === next.key ? next : d)) : [...prev, next]));
    setEditing(null);
    setAskBlock(false);
  };
  const [editorError, setEditorError] = useState<string | null>(null);
  const acceptDefect = () => {
    if (!editing) return;
    if (!editing.title.trim()) return setEditorError(`Bitte den ${D.one} kurz benennen.`);
    setEditorError(null);
    // Stufe verlangt eine Sperre, der Vermerk fehlt → einmal nachfragen, damit der Nachweis zur Einstufung passt.
    if (blockOf(editing).question && !editing.blocked) return setAskBlock(true);
    commitDefect(editing);
  };
  const closeEditor = () => {
    const d = editing;
    if (!d) return;
    const saved = defects.find((x) => x.key === d.key);
    const unsaved = saved
      ? JSON.stringify(saved) !== JSON.stringify({ ...d, title: d.title.trim() })
      : !!(d.title.trim() || d.description.trim() || d.photos.length);
    if (unsaved && !window.confirm(`${D.one} verwerfen? Die Eingaben in diesem ${D.one} (Text und Fotos) gehen verloren.`)) return;
    setEditing(null);
    setAskBlock(false);
    setEditorError(null);
  };
  const removeDefect = (d: DefectDraft) => {
    if (!window.confirm(`${D.one} „${d.title}“ entfernen?`)) return;
    confirmedDefectRef.current = false;
    setDefects((prev) => prev.filter((x) => x.key !== d.key));
  };

  // --- Speichern ------------------------------------------------------------------------------
  const save = async () => {
    if (saving || !subject) return;
    if (spec && outcome) {
      // Messwert ohne Bezugswert (z. B. Nenndicke fehlt): Der Rechner kann nicht bewerten — einmal nachfragen.
      if (outcome.missing && !confirmedMissingRef.current) return setAsk('measure-missing');
      // Grenzwert erreicht, aber kein Mangel dieser Stufe erfasst — einmal nachfragen (wie in der App).
      if (outcome.red && !defects.some((d) => d.severity === spec.redSeverity) && !confirmedRedRef.current) return setAsk('measure-red');
    }
    // Punkt auf „Mangel“, aber kein Mangel beschrieben → nachfragen (das Prüfprotokoll soll aussagekräftig sein).
    if (defectPoints.length > 0 && defects.length === 0 && !confirmedDefectRef.current) return setAsk('defect');
    // Ungenaue oder fehlende Ortung: einmal nachfragen statt still einen schwachen Stempel zu speichern.
    if (gpsWeak && !confirmedGpsRef.current) return setAsk('gps');
    // Ohne „Geprüft von“ ist der Nachweis schwach und nach dem Speichern nicht mehr änderbar.
    if (!form.inspectorName.trim() && !confirmedNameRef.current) return setAsk('name');
    setSaving(true);
    setSaveError(null);
    try {
      const at = firstAttemptRef.current ?? new Date().toISOString();
      firstAttemptRef.current = at;
      const inspection = buildInspectionRow(cfg, {
        id: idRef.current,
        orgId,
        userId,
        siteId: subject.siteId,
        // Orts-Modus: die Prüfung hängt nur am Ort
        ...(siteMode ? {} : { unitId }),
        type: form.type,
        at,
        start: startFix,
        end: lastFixRef.current,
        // genau die Punkte dieser Checkliste (bei HebeDex die des Teil-Typs), in ihrer Reihenfolge
        checklist: Object.fromEntries(checks.map((c) => [c.id, form.checklist[c.id] ?? 'ok'])),
        notes: form.notes,
        inspectorName: form.inspectorName,
        qualification: form.qualification,
        signature: form.signature,
        // Apps mit Messwerten: ausgefüllte Felder als Text, ohne Messung {} — alle anderen Apps haben die Spalte nicht
        ...(cfg.measure ? { measurements: spec ? measurementsForRow(measure, spec.measuredKeys) : {} } : {}),
      });
      finishedRef.current = true;
      const outcome = await submit(be, cfg, {
        key: pendingKey(app, inspection.id),
        kind: 'pending',
        app,
        userId,
        siteName: site?.name ?? '',
        // Orts-Modus: statt einer Einheit steht in der Warteliste die Prüfart
        unitName: unit ? unit.name : kindOf(cfg, form.type).short,
        inspection,
        photos,
        defects: defects.map((d) => ({
          row: buildDefectRow(cfg, {
            id: d.key,
            orgId,
            userId,
            siteId: subject.siteId,
            // Orts-Modus: die im Mangel gewählte Einheit — oder keine („… allgemein“)
            unitId: siteMode ? (d.unitId ?? null) : unitId,
            inspectionId: inspection.id,
            at,
            title: d.title,
            description: d.description,
            severity: d.severity,
            blocked: d.blocked,
            inspectorName: form.inspectorName,
          }),
          photos: d.photos,
        })),
        sent: { inspection: false, defects: [] },
      });
      setPrefs(app, userId, { name: form.inspectorName.trim(), qualification: form.qualification.trim() });
      await deleteDraft(app, userId, unitId);
      setDone({
        outcome,
        hadGps: gpsOk,
        weakAcc: gpsOk && gpsWeak ? gpsAcc : null,
        type: form.type,
        at,
        blocked: blockedBefore || defects.some((d) => d.blocked),
        serious: defects.some((d) => severityOf(cfg, d.severity).tone !== 'green'),
        alertDone: unit ? (unitAlertOf(cfg, unit)?.doneText ?? null) : null,
        kindDone: kindOf(cfg, form.type).doneText ?? null,
      });
      setPhase('done');
      window.scrollTo({ top: 0 });
    } catch (e) {
      finishedRef.current = false;
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // --- Anzeige --------------------------------------------------------------------------------
  const backTo = subject ? `${base}/ort/${subject.siteId}` : base;
  const back = (
    <Link to={backTo} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> {subject ? (site?.name ?? cfg.labels.site.one) : cfg.labels.site.many}
    </Link>
  );

  if (loadError) {
    return (
      <div className="ez">
        {back}
        <div className="error-box">{loadError}</div>
        <button type="button" className="btn ghost" onClick={load}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (phase === 'loading' || !subject) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  if (phase === 'done' && done) return <Done subject={subject} info={done} />;

  if (phase === 'ask' && found) {
    const n = found.photos.length + found.defects.reduce((s, d) => s + d.photos.length, 0);
    return (
      <div className="ez">
        {back}
        <h1>Angefangene {I.one}</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          {subject.name}
          {!siteMode && site ? ` · ${site.name}` : ''}
        </p>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Auf diesem Gerät liegt eine angefangene {I.one}:
            <br />
            <b>Beginn {fmtDateTime(found.openedAt)}</b>
            {found.defects.length > 0 && ` · ${countWord(found.defects.length, D)}`}
            {n > 0 && ` · ${n} ${n === 1 ? 'Foto' : 'Fotos'}`}
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => resume(found)}>
              Fortsetzen
            </button>
            <button type="button" className="btn ghost ez-big" onClick={startFresh}>
              Verwerfen und neu beginnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const gpsTone = gps.status === 'denied' || gps.status === 'unsupported' ? 'red' : gpsWeak ? 'amber' : 'green';
  const kind = kindOf(cfg, form.type);
  const editingSeverity = editing ? severityOf(cfg, editing.severity) : null;
  const editingBlock = editing ? blockOf(editing) : null;
  const alert = unit ? unitAlertOf(cfg, unit) : null;

  return (
    <div className="ez">
      {back}
      <h1>{I.one} dokumentieren</h1>

      {unit ? (
        <div className="card pv-unit">
          <span className="muted small">{U.full}</span>
          <b>{unit.name}</b>
          {unit.info && <span className="muted">{unit.info}</span>}
          <Link to={backTo} className="small">
            Andere wählen
          </Link>
        </div>
      ) : (
        // Orts-Modus: geprüft wird der ganze Ort
        <div className="card pv-unit" data-testid="pv-site">
          <span className="muted small">{S.one}</span>
          <b>{subject.name}</b>
          {site?.address && <span className="muted">{site.address}</span>}
          <span className="muted small">
            {siteUnits.length > 0 ? countWord(siteUnits.length, U) : `Noch keine ${U.many} erfasst`}
          </span>
          <Link to={base} className="small">
            Wechseln
          </Link>
        </div>
      )}
      {alert && (
        <div className="info-box pv-blocked" role="alert" data-testid="unit-alert">
          <TriangleAlert className="i" aria-hidden /> {/* Beginnt der Text schon mit dem Kurzwort („Ablegereif seit …“), wird es nicht doppelt gezeigt */}
          {!alert.text.startsWith(alert.badge) && <b>{alert.badge}: </b>}
          {alert.text}
          {alert.formHint ? ` ${alert.formHint}` : ''}
        </div>
      )}
      {blockedBefore && (
        <div className="info-box pv-blocked">
          <TriangleAlert className="i" aria-hidden />{' '}
          {siteMode
            ? `Gesperrt: Hier gibt es einen offenen ${D.one} mit Sperre. Erst nach der Behebung wieder freigeben.`
            : `${cfg.labels.blockedShort}: Es gibt einen offenen ${D.one} mit Sperre. Erst nach der Behebung wieder benutzen.`}
        </div>
      )}

      <h2 className="ez-section">{I.kind}</h2>
      <div className="ez-chips" role="group" aria-label={I.kind}>
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`ez-chip${form.type === k.id ? ' on' : ''}`}
            aria-pressed={form.type === k.id}
            onClick={() => set({ type: k.id })}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind.hint && <p className="muted small pv-hint">{kind.hint}</p>}

      <div className="card ez-gps" style={{ marginTop: 18 }}>
        <div className="ez-gps-head">
          <span className={`ez-dot ${gpsTone}${gps.status === 'loading' || gpsOk ? ' pulse' : ''}`} aria-hidden />
          <MapPin className="i" aria-hidden />
          <b>GPS-Stempel</b>
          <span className="muted small">Beginn {fmtTime(openedAtRef.current)}</span>
        </div>
        {gps.status === 'loading' && <p className="muted">Ort wird ermittelt …</p>}
        {gpsOk && (
          <>
            <p className={gpsWeak && !gps.refining ? 'ez-warn' : 'muted'}>
              {gps.refining
                ? gps.slow && (gps.accuracy ?? 9999) > 100
                  ? `Kein Satellitenempfang (±${gpsAcc} m, nur Ortung über Mobilfunk/WLAN) — am Fenster oder draußen wird der Ort weiter verbessert.`
                  : `Ort wird genauer … ±${gpsAcc} m (am besten unter freiem Himmel)`
                : (gps.accuracy ?? 9999) <= GPS_GOOD_M
                  ? `✓ Ort genau erfasst (±${gpsAcc} m)`
                  : gpsWeak
                    ? `⚠ Ort ungenau (±${gpsAcc} m) — wird im Nachweis so vermerkt`
                    : `✓ Ort erfasst (±${gpsAcc} m)`}
            </p>
            <p className="muted small">
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} · beim Speichern wird noch einmal gestempelt
            </p>
            {gpsWeak && gps.slow && (gps.accuracy ?? 0) > 500 && (
              <p className="muted small">
                Bleibt es so ungenau? Am iPhone: Einstellungen → Datenschutz &amp; Sicherheit → Ortungsdienste →
                Safari-Websites → „Genauer Standort“ einschalten.
              </p>
            )}
          </>
        )}
        {gps.status === 'denied' && (
          <>
            <p className="ez-warn">⚠ Standort nicht erlaubt — die {I.one} wird ohne GPS-Stempel gespeichert.</p>
            <p className="muted small">
              So erlaubst du ihn: am iPhone unter Einstellungen → Datenschutz &amp; Sicherheit → Ortungsdienste →
              Safari-Websites „Beim Verwenden“ und „Genauer Standort“ wählen. In anderen Browsern auf das Schloss bzw.
              Symbol in der Adresszeile tippen → Standort erlauben. Danach:
            </p>
            <button type="button" className="btn ghost small" onClick={retry}>
              Erneut versuchen
            </button>
          </>
        )}
        {gps.status === 'error' && (
          <>
            <p className="ez-warn">⚠ Ort nicht verfügbar — die {I.one} wird ohne GPS-Stempel gespeichert.</p>
            <button type="button" className="btn ghost small" onClick={retry}>
              Erneut versuchen
            </button>
          </>
        )}
        {gps.status === 'unsupported' && (
          <p className="ez-warn">⚠ Dieser Browser kann keinen Standort ermitteln — gespeichert wird ohne GPS-Stempel.</p>
        )}
      </div>

      {spec && (
        <MeasureCard
          spec={spec}
          values={measure}
          outcome={outcome}
          cardRef={calcRef}
          onChange={setM}
          onDefect={(text) => openEditor(spec.texts.defectTitle(text), spec.redSeverity)}
        />
      )}

      <h2 className="ez-section">
        {cfg.labels.checklistFor && unit?.row ? cfg.labels.checklistFor(unit.row) : cfg.labels.checklist}
        <span className={defectPoints.length > 0 ? 'pv-bad' : 'muted'}>
          {defectPoints.length > 0 ? ` · ${countWord(defectPoints.length, D)}` : ' · alles OK'}
        </span>
      </h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Alles steht auf OK. Weicht etwas ab, beim Punkt „{W.results.defect}“ oder „n. z.“ (nicht zutreffend
        {cfg.labels.naExample ? `, z. B. ${cfg.labels.naExample}` : ''}) antippen.
      </p>
      <button type="button" className="btn ghost small pv-tap" onClick={() => setShowHints((v) => !v)}>
        {showHints ? 'Prüfhinweise ausblenden' : 'Prüfhinweise zu jedem Punkt anzeigen'}
      </button>
      <ul className="pv-checks">
        {checks.map((item) => {
          const result = form.checklist[item.id] ?? 'ok';
          return (
            <li key={item.id} className={`pv-check${result === 'defect' ? ' defect' : ''}`}>
              <b className="pv-check-text">{item.label}</b>
              <div className="pv-seg" role="group" aria-label={`${item.label}: Ergebnis`}>
                {RESULTS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`pv-seg-btn ${r}${result === r ? ' on' : ''}`}
                    aria-pressed={result === r}
                    onClick={() => setResult(item.id, r)}
                  >
                    {W.results[r]}
                  </button>
                ))}
              </div>
              {/* Hinweis immer bei „Mangel“ (hilft beim Beschreiben), sonst nur auf Wunsch. */}
              {item.hint && (showHints || result === 'defect') && <span className="muted small pv-check-hint">{item.hint}</span>}
            </li>
          );
        })}
      </ul>

      <h2 className="ez-section">
        {D.many} ({defects.length})
      </h2>
      {defects.map((d) => {
        const sev = severityOf(cfg, d.severity);
        return (
          <div key={d.key} className={`card pv-defect ${sev.tone}`}>
            <b>{d.title}</b>
            <span className="muted small">
              {defectTarget(d)}
              {d.blocked ? ` · ${blockOf(d).short}` : ''}
              {d.photos.length > 0 ? ` · ${d.photos.length} ${d.photos.length === 1 ? 'Foto' : 'Fotos'}` : ''}
            </span>
            <span>
              <span className={`badge ${sev.tone}`}>{sev.label}</span>
            </span>
            <div className="pv-defect-actions">
              <button
                type="button"
                className="btn ghost small pv-tap"
                onClick={() => {
                  setAskBlock(false);
                  setEditing(d);
                }}
              >
                Bearbeiten
              </button>
              <button type="button" className="btn ghost small pv-tap" onClick={() => removeDefect(d)}>
                Entfernen
              </button>
            </div>
          </div>
        );
      })}
      {defectPoints.length > 0 && defects.length === 0 && (
        <p className="pv-bad">
          {defectPoints.length === 1 ? '1 Punkt steht' : `${defectPoints.length} Punkte stehen`} auf „{W.results.defect}“ — bitte
          kurz beschreiben und einstufen.
        </p>
      )}
      <button type="button" className="btn ghost ez-big" onClick={() => openEditor()}>
        <Plus className="i" aria-hidden /> {D.one} erfassen
      </button>

      <h2 className="ez-section">{kind.photosTitle ?? 'Beweisfotos'}</h2>
      <PhotoRow
        photos={photos}
        busy={photoBusy > 0 && !editing}
        label="Beweisfoto"
        onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))}
        onOpen={beforeCamera}
        onFiles={(e) => void onFiles(e, 'pruefung')}
      />
      {photoError && !editing && <div className="error-box">{photoError}</div>}

      <label className="field">
        {W.by}
        <input
          ref={nameRef}
          value={form.inspectorName}
          maxLength={80}
          autoComplete="name"
          placeholder="Name fürs Protokoll"
          onChange={(e) => set({ inspectorName: e.target.value })}
        />
      </label>
      <Unterschrift
        value={form.signature}
        onChange={(sig) => {
          set({ signature: sig });
          setPrefs(app, userId, { signature: sig });
        }}
      />
      <details className="pv-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary>
          Weitere Angaben
          <span className="muted small">
            {form.qualification.trim() ? `Qualifikation: ${form.qualification.trim()}` : 'Qualifikation'} · Notiz
          </span>
        </summary>
        <label className="field">
          Qualifikation (optional, erscheint im Bericht)
          <input
            value={form.qualification}
            maxLength={120}
            placeholder={cfg.labels.qualificationExample}
            onChange={(e) => set({ qualification: e.target.value })}
          />
        </label>
        <label className="field">
          Notiz (optional)
          <textarea
            rows={3}
            value={form.notes}
            maxLength={2000}
            placeholder={kind.notesExample ?? cfg.labels.notesExample}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      </details>

      {saveError && (
        <div className="error-box">
          {I.one} nicht gespeichert: {saveError}
        </div>
      )}
      <p className="muted small pv-summary">
        Du speicherst: <b>{kind.short}</b> für <b>{subject.name}</b>
        {!siteMode && site ? ` (${site.name})` : ''}
        {defects.length > 0 ? ` mit ${defects.length} ${defects.length === 1 ? D.one : D.manyDative}` : ''}.
      </p>
      <button type="button" className="btn ez-save" onClick={() => void save()} disabled={saving || photoBusy > 0}>
        <Check className="i" aria-hidden /> {saving ? 'Speichern …' : `${I.one} speichern`}
      </button>
      <p className="muted small">
        Nach dem Speichern ist die {I.one} nicht mehr änderbar (Beweiskette) — nur Stornieren mit Begründung ist möglich.
      </p>

      {editing && editingSeverity && editingBlock && (
        <Modal title={askBlock ? editingBlock.askTitle : `${D.one} erfassen`} onClose={closeEditor} dirty={false}>
          {askBlock ? (
            <>
              <p>{editingBlock.question}</p>
              <div className="ez-actions">
                <button type="button" className="btn ez-big" onClick={() => commitDefect({ ...editing, blocked: true })}>
                  {cfg.labels.blockedYes}
                </button>
                <button type="button" className="btn ghost ez-big" onClick={() => commitDefect(editing)}>
                  Noch nicht
                </button>
              </div>
            </>
          ) : (
            <div className="ez">
              {siteMode ? (
                // Orts-Modus: betroffene Einheit des Orts aus der Liste wählen — oder den Ort allgemein (wie in der App)
                <label className="field">
                  {cfg.labels.affected ?? `Betroffene Einheit (${U.one})`}
                  <select
                    value={editing.unitId ?? ''}
                    data-testid="pv-defect-unit"
                    onChange={(e) => setEditing({ ...editing, unitId: e.target.value || undefined })}
                  >
                    <option value="">{cfg.labels.general ?? `${S.one} allgemein`}</option>
                    {siteUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.info ? ` — ${u.info}` : ''}
                      </option>
                    ))}
                    {/* aus einem älteren Entwurf: Einheit inzwischen außer Betrieb — die Auswahl bleibt sichtbar */}
                    {editing.unitId && !siteUnits.some((u) => u.id === editing.unitId) && (
                      <option value={editing.unitId}>{U.one} (nicht mehr im Bestand)</option>
                    )}
                  </select>
                </label>
              ) : (
                <p className="muted small" style={{ marginTop: 0 }}>
                  Betrifft: {subject.name}
                </p>
              )}
              <label className="field">
                {D.one} *
                <input
                  value={editing.title}
                  maxLength={160}
                  placeholder={cfg.labels.defectTitleExample}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </label>
              <span className="pv-label">{cfg.labels.severityTitle ?? 'Einstufung (Ampel)'}</span>
              <div className="ez-chips" role="group" aria-label="Einstufung">
                {cfg.severities.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`ez-chip pv-sev ${s.tone}${editing.severity === s.id ? ' on' : ''}`}
                    aria-pressed={editing.severity === s.id}
                    onClick={() =>
                      // Stufe ohne Sperre (z. B. Grün): ein früher gesetzter Sperr-Vermerk darf nicht unsichtbar mitgehen
                      // Stufe mit Sperre von Anfang an (HebeDex Rot): Vermerk setzen, er bleibt abwählbar
                      setEditing({ ...editing, severity: s.id, blocked: s.autoBlock ? true : canBlock(s) ? editing.blocked : false })
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {editingSeverity.hint && <p className="muted small pv-hint">{editingSeverity.hint}</p>}
              {canBlock(editingSeverity) && (
                <button
                  type="button"
                  className={`ez-chip pv-block${editing.blocked ? ' on' : ''}`}
                  aria-pressed={editing.blocked}
                  onClick={() => setEditing({ ...editing, blocked: !editing.blocked })}
                >
                  {editing.blocked ? `✓ ${editingBlock.toggle}` : `${editingBlock.toggle}?`}
                </button>
              )}
              <label className="field" style={{ marginTop: 14 }}>
                Beschreibung (optional)
                <textarea
                  rows={3}
                  value={editing.description}
                  maxLength={2000}
                  placeholder={cfg.labels.defectDescriptionExample ?? 'Details für die Instandsetzung (Position, Ersatzteil …)'}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </label>
              <span className="pv-label">Fotos</span>
              <PhotoRow
                photos={editing.photos}
                busy={photoBusy > 0}
                label={`Foto zum ${D.one}`}
                onRemove={(i) => setEditing({ ...editing, photos: editing.photos.filter((_, j) => j !== i) })}
                onOpen={beforeCamera}
                onFiles={(e) => void onFiles(e, 'mangel')}
              />
              {photoError && <div className="error-box">{photoError}</div>}
              {editorError && <div className="error-box">{editorError}</div>}
              <div className="ez-actions">
                <button type="button" className="btn ez-big" onClick={acceptDefect} disabled={photoBusy > 0}>
                  {D.one} übernehmen
                </button>
                <button type="button" className="btn ghost ez-big" onClick={closeEditor}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {ask === 'defect' && (
        <Modal title={`${D.one} erfassen?`} onClose={() => setAsk(null)} dirty={false}>
          <p>
            Du hast {defectPoints.length === 1 ? 'einen Punkt' : `${defectPoints.length} Punkte`} auf „{W.results.defect}“
            gestellt, aber noch keinen {D.one} beschrieben. Ohne Beschreibung und{' '}
            {cfg.severities.some((s) => s.id === 'amber') ? 'Ampel-Einstufung' : 'Einstufung'} ist der Nachweis lückenhaft.
          </p>
          <div className="ez-actions">
            <button
              type="button"
              className="btn ez-big"
              onClick={() => {
                setAsk(null);
                openEditor();
              }}
            >
              {D.one} erfassen
            </button>
            <button
              type="button"
              className="btn ghost ez-big"
              onClick={() => {
                confirmedDefectRef.current = true;
                setAsk(null);
                void save();
              }}
            >
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'measure-missing' && spec && outcome?.missing && (
        <Modal title="Keine Bewertung möglich" onClose={() => setAsk(null)} dirty={false}>
          <p>
            Der {spec.title} kann die Messwerte nicht bewerten — {outcome.missing} fehlt. Bezugswert nachtragen oder trotzdem
            speichern?
          </p>
          <div className="ez-actions">
            <button
              type="button"
              className="btn ez-big"
              onClick={() => {
                setAsk(null);
                setTimeout(() => calcRef.current?.scrollIntoView({ block: 'center' }), 60);
              }}
            >
              Nachtragen
            </button>
            <button
              type="button"
              className="btn ghost ez-big"
              onClick={() => {
                confirmedMissingRef.current = true;
                setAsk(null);
                void save();
              }}
            >
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'measure-red' && spec && outcome && (
        <Modal title={spec.texts.redAskTitle} onClose={() => setAsk(null)} dirty={false}>
          <p>{spec.texts.redAsk(outcome.text)}</p>
          <div className="ez-actions">
            <button
              type="button"
              className="btn ez-big"
              onClick={() => {
                setAsk(null);
                openEditor(spec.texts.defectTitle(outcome.text), spec.redSeverity);
              }}
            >
              {D.one} erfassen
            </button>
            <button
              type="button"
              className="btn ghost ez-big"
              onClick={() => {
                // wie in der App: „Trotzdem speichern“ fragt danach nicht noch einmal nach dem fehlenden Mangel
                confirmedRedRef.current = true;
                confirmedDefectRef.current = true;
                setAsk(null);
                void save();
              }}
            >
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'gps' && (
        <Modal
          title={gpsOk ? 'Ortung noch ungenau' : gps.status === 'loading' ? 'Noch kein GPS-Stempel' : 'Kein GPS-Stempel möglich'}
          onClose={() => setAsk(null)}
          dirty={false}
        >
          <p>
            {gpsOk
              ? `Der Ort ist erst auf ±${gpsAcc} m genau (kein Satellitenempfang?). Für einen genauen Ortsnachweis kurz unter freiem Himmel bzw. am Fenster warten.`
              : gps.status === 'loading'
                ? 'Der Ort wird noch ermittelt. Für einen genauen Ortsnachweis kurz unter freiem Himmel bzw. am Fenster warten.'
                : 'Der Standort ist nicht erlaubt oder nicht verfügbar (siehe Hinweis im Feld „GPS-Stempel“).'}
          </p>
          <p className="muted">
            Trotzdem speichern? Im Nachweis steht dann {gpsOk ? 'die ungenaue Ortung' : '„kein GPS“'}.
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => setAsk(null)}>
              Warten
            </button>
            <button
              type="button"
              className="btn ghost ez-big"
              onClick={() => {
                confirmedGpsRef.current = true;
                setAsk(null);
                void save();
              }}
            >
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'name' && (
        <Modal title={cfg.labels.noNameTitle ?? 'Ohne Prüfernamen speichern?'} onClose={() => setAsk(null)} dirty={false}>
          <p>
            Im Feld „{W.by}“ steht kein Name. Die {I.one} lässt sich nach dem Speichern nicht mehr ändern.
          </p>
          <div className="ez-actions">
            <button
              type="button"
              className="btn ez-big"
              onClick={() => {
                setAsk(null);
                // erst nach dem Schließen des Dialogs fokussieren (der gibt den Fokus sonst zurück an den Knopf)
                setTimeout(() => {
                  nameRef.current?.scrollIntoView({ block: 'center' });
                  nameRef.current?.focus();
                }, 60);
              }}
            >
              Namen eintragen
            </button>
            <button
              type="button"
              className="btn ghost ez-big"
              onClick={() => {
                confirmedNameRef.current = true;
                setAsk(null);
                void save();
              }}
            >
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Karte „Messwerte mit Rechner“ (HebeDex: Ablegereife-Rechner) — Felder, Grenzen und Rechenregeln kommen aus der
 * Konfiguration der App (cfg.measure), hier steht nur die Darstellung.
 */
function MeasureCard({
  spec,
  values,
  outcome,
  cardRef,
  onChange,
  onDefect,
}: {
  spec: MeasureSpec;
  values: Record<string, string>;
  outcome: MeasureOutcome | undefined;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onChange: (key: string, value: string) => void;
  onDefect: (text: string) => void;
}) {
  const choice = spec.choice;
  const ratio = outcome?.ratio ?? 0;
  return (
    <div ref={cardRef} className={`card pv-calc${outcome?.red ? ' red' : ''}`} style={{ marginTop: 18 }} data-testid="pv-calc">
      <b>{spec.title}</b>
      <p className="muted small">{spec.hint(values)}</p>
      {choice && (
        <div className="ez-chips" role="group" aria-label={choice.label}>
          {choice.options.map((o) => {
            const on = (values[choice.key] || choice.fallback) === o.id;
            return (
              <button key={o.id} type="button" className={`ez-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(choice.key, o.id)}>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
      {spec.rows.map((row) => (
        <div className="pv-calc-row" key={row.map((f) => f.key).join('-')}>
          {row.map((f) => (
            <label className="field" key={f.key}>
              {f.unit ? `${f.label} (${f.unit})` : f.label}
              <input
                value={values[f.key] ?? ''}
                inputMode={f.integer ? 'numeric' : 'decimal'}
                maxLength={12}
                autoComplete="off"
                placeholder={f.placeholder?.(values) ?? ''}
                data-testid={`pv-m-${f.key}`}
                // nur Ziffern (und Komma/Punkt) — wie das Zahlenfeld der App
                onChange={(e) => onChange(f.key, e.target.value.replace(f.integer ? /[^0-9]/g : /[^0-9.,]/g, ''))}
              />
            </label>
          ))}
        </div>
      ))}
      {outcome?.missing && (
        <div className="pv-calc-result red" role="status">
          <b>Keine Bewertung möglich ({outcome.missing} fehlt)</b>
          <span>Ohne Bezugswert kann der Rechner die Messung nicht gegen die Grenze prüfen — bitte nachtragen.</span>
        </div>
      )}
      {outcome?.complete && (
        <div className={`pv-calc-result ${outcome.red ? 'red' : 'green'}`} role="status" data-testid="pv-calc-result">
          <b>{outcome.red ? spec.texts.red : spec.texts.ok}</b>
          <span>{outcome.text}</span>
          {outcome.ratio !== undefined && (
            <>
              <span className="pv-calc-bar" aria-hidden>
                <span
                  className={outcome.red ? 'red' : ratio >= 0.7 ? 'amber' : 'green'}
                  style={{ width: `${Math.max(3, Math.min(1, ratio) * 100)}%` }}
                />
              </span>
              {outcome.ratioLabel && <span className="muted small">{outcome.ratioLabel}</span>}
            </>
          )}
          {outcome.red && (
            <button type="button" className="btn ez-danger ez-big" onClick={() => onDefect(outcome.text)}>
              {spec.texts.redAction}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoRow({
  photos,
  busy,
  label,
  onRemove,
  onOpen,
  onFiles,
}: {
  photos: string[];
  busy: boolean;
  label: string;
  onRemove: (index: number) => void;
  onOpen: () => void;
  onFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="ez-photos">
      {photos.map((uri, i) => (
        <div className="ez-photo" key={uri.slice(-32) + i}>
          <img src={uri} alt={`${label} ${i + 1}`} />
          <button type="button" aria-label={`${label} ${i + 1} entfernen`} onClick={() => onRemove(i)}>
            <X className="i" aria-hidden />
          </button>
        </div>
      ))}
      {busy && (
        <div className="ez-photo busy" aria-label="Foto wird verarbeitet">
          <span className="spinner" />
        </div>
      )}
      <label className="ez-photo-add" onClick={onOpen}>
        <Camera className="i" aria-hidden />
        <span>Foto</span>
        <input type="file" accept="image/*" multiple onChange={onFiles} aria-label={`${label} hinzufügen`} />
      </label>
    </div>
  );
}

/**
 * Nach dem Speichern: ehrliche Bestätigung (was ist wo gespeichert?) + die nächste fällige Einheit am Standort.
 * Im Orts-Modus gibt es keine Serienprüfung — dort steht, bis wann die Prüfung des Orts gilt.
 */
function Done({ subject, info }: { subject: Subject; info: DoneInfo }) {
  const { be, cfg, userId, base, intervalDays, dueDate } = usePruef();
  const siteMode = isSiteMode(cfg);
  const { insp: I, defect: D } = wordsOf(cfg);
  const { pending, loaded } = usePendingSync();
  const [next, setNext] = useState<{ unit: Unit; count: number } | null>(null);
  const { outcome } = info;
  const key = outcome.pending.key;
  const rejectedAtSave = typeof outcome.result === 'object' ? outcome.result.rejected : null;
  const queued = outcome.result !== 'synced';
  const waiting = pending.find((p) => p.key === key);
  // Inzwischen doch gesendet (Netz kam zurück, solange diese Seite offen ist)?
  const stillWaiting = queued && (!loaded || !!waiting);
  const sentLater = queued && !stillWaiting;
  // Ablehnung gilt nur, solange sie noch besteht (ein späterer Versuch kann geklappt haben)
  const rejected = stillWaiting ? (waiting ? (waiting.lastError ?? null) : rejectedAtSave) : null;
  const state = waiting ?? outcome.pending;
  const inspectionOnServer = !queued || sentLater || state.sent.inspection;
  const missing = stillWaiting ? defectsMissing(state) : 0;
  const waitIcon = stillWaiting && !inspectionOnServer;

  // Serienprüfung wie in der App: nach einer Prüfung der Fälligkeits-Art ohne ernsten Mangel die nächste fällige anbieten.
  useEffect(() => {
    if (siteMode || info.type !== cfg.dueKind || info.serious || info.alertDone) return;
    let alive = true;
    loadPruefData(be, cfg.appId, userId).then(
      (data) => {
        // ohne Netz ist unbekannt, was inzwischen geprüft wurde → kein Vorschlag
        if (!alive || data.offline) return;
        const here = data.units.filter((u) => u.siteId === subject.siteId);
        const last = lastDueByUnit(withPendingMeta(data.meta, pending, dueFkOf(cfg)), cfg.dueKind);
        const blocked = new Set<string>();
        for (const d of data.openDefects) if (d.blocked && d.unitId) blocked.add(d.unitId);
        // Einheiten mit Warnung aus den Stammdaten (z. B. ablegereif) nicht als „nächste fällige“ anbieten
        for (const u of here) if (unitAlertOf(cfg, u)) blocked.add(u.id);
        const exclude = new Set([subject.id, ...pending.map((p) => String(p.inspection[cfg.cols.unitFk]))]);
        const res = nextDueAfter(here, last, intervalDays, exclude, blocked, dueDate);
        setNext(res ? { unit: res.next, count: res.count } : null);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be, cfg, userId, subject.id, subject.siteId, pending.length]);

  const dueAt = info.type === cfg.dueKind && !info.blocked ? dueInfo(info.at, intervalDays, undefined, dueDate).dueAt : null;
  // Zweite Frist (SpielDex: operative Kontrolle) — nur im Orts-Modus und nach genau dieser Prüfart
  const extra = siteMode && cfg.extraDue && info.type === cfg.extraDue.doneKind && !info.blocked ? cfg.extraDue : null;
  const extraAt = extra ? dueInfo(info.at, extra.intervalDays).dueAt : null;
  const siteUrl = `${base}/ort/${subject.siteId}`;

  return (
    <div className="ez ez-done">
      <div className={`ez-done-icon${waitIcon || rejected ? ' wait' : ''}`} aria-hidden>
        {waitIcon ? <CloudOff /> : rejected ? <TriangleAlert /> : <Check />}
      </div>
      <h1>{waitIcon ? 'Auf dem Gerät gesichert' : rejected && !inspectionOnServer ? 'Noch nicht auf dem Server' : `${I.one} gesichert`}</h1>
      <p className="muted">
        {subject.name} · {kindOf(cfg, info.type).short}
      </p>

      {rejected ? (
        <div className="error-box" style={{ textAlign: 'left' }}>
          <TriangleAlert className="i" aria-hidden />{' '}
          {inspectionOnServer
            ? `Die ${I.one} ist gespeichert, aber ${missing === 1 ? `1 ${D.one} wurde` : `${missing} ${D.many} wurden`} vom Server nicht angenommen: ${rejected}`
            : `Vom Server nicht angenommen: ${rejected}`}
          <br />
          Alles liegt mit Fotos auf diesem Gerät und wird automatisch erneut gesendet. Bleibt es dabei, bitte
          support@dexware.app melden.
        </div>
      ) : stillWaiting ? (
        <div className="info-box" style={{ textAlign: 'left' }}>
          {inspectionOnServer ? (
            <>
              Die {I.one} ist übertragen — {missing === 1 ? `1 ${D.one} wartet` : `${missing} ${D.many} warten`} noch auf
              Empfang und {missing === 1 ? 'wird' : 'werden'} automatisch nachgesendet (nichts doppelt).
            </>
          ) : outcome.onDevice ? (
            <>
              Gerade keine Verbindung. Die {I.one} liegt sicher auf diesem Gerät und wird automatisch übertragen, sobald
              wieder Empfang da ist — Zeit, Ort und Fotos bleiben die vom Prüfort. Bitte diese Seite später noch einmal
              öffnen, bis unter „{cfg.labels.site.many}“ nichts mehr wartet.
            </>
          ) : (
            <>
              Gerade keine Verbindung — und dieser Browser erlaubt kein dauerhaftes Speichern (privates Surfen?).
              <b> Bitte diese Seite offen lassen</b>, bis die {I.one} übertragen ist.
            </>
          )}
        </div>
      ) : (
        <p>
          {info.hadGps
            ? info.weakAcc !== null
              ? `Zeitstempel dokumentiert · Ort nur ungenau erfasst (±${info.weakAcc} m), so im Nachweis vermerkt`
              : 'GPS + Zeitstempel dokumentiert'
            : 'Zeitstempel dokumentiert — ohne GPS-Stempel'}
        </p>
      )}

      {state.signatureDropped && (
        <div className="info-box" style={{ textAlign: 'left' }}>
          Hinweis: Die Datenbank konnte die Unterschrift noch nicht speichern — die {I.one} ist ohne Unterschriftsbild
          gesichert.
        </div>
      )}
      {info.alertDone ? (
        <p className="pv-bad">{info.alertDone}</p>
      ) : info.blocked ? (
        <p className="pv-bad">
          {siteMode
            ? 'Gesperrt — erst nach der Behebung wieder freigeben.'
            : `${cfg.labels.blockedShort} — erst nach Mängelbehebung wieder benutzen.`}
        </p>
      ) : siteMode ? (
        <>
          {dueAt && <p className="muted">Gültig bis {fmtDay(dueAt)} — dann erneut prüfen.</p>}
          {extra && extraAt && (
            <p className="muted">
              {extra.doneText} {fmtDay(extraAt)}.
            </p>
          )}
        </>
      ) : dueAt ? (
        <p className="muted">Wieder fällig am {fmtDay(dueAt)}.</p>
      ) : (
        info.kindDone && <p className="muted">{info.kindDone}</p>
      )}

      {next ? (
        <div className="card ez-next">
          <span className="muted small">
            Als Nächstes fällig{next.count > 1 ? ` — hier noch ${next.count} fällig` : ''}
          </span>
          <b>{next.unit.name}</b>
          <div className="ez-actions">
            <Link to={`${base}/pruefen/${next.unit.id}`} className="btn ez-big">
              Weiter prüfen
            </Link>
            <Link to={siteUrl} className="btn ghost ez-big">
              Fertig
            </Link>
          </div>
        </div>
      ) : (
        <div className="ez-actions">
          <Link to={siteUrl} className="btn ez-big">
            Fertig
          </Link>
        </div>
      )}
    </div>
  );
}
