// Prüfung dokumentieren im Browser — gleicher Ablauf wie in der App (PruefDex/mobile/src/screens/InspectionScreen.tsx):
// Gerät, GPS-Stempel (automatisch, Beginn + Ende), Sichtprüfung (jeder Punkt i. O. / n. i. O.), Messungen je
// Schutzklasse mit automatischer Grenzwert-Bewertung, Gesamtergebnis (Vorschlag folgt den Eingaben), Prüfer,
// Unterschrift; unter „Weitere Angaben“ Qualifikation, Bemerkungen und Fotos.
// Einmal gespeichert, nie mehr änderbar (nur Storno mit Grund) — deshalb fragt die Seite vor dem Speichern nach,
// wenn etwas nicht zusammenpasst, und sichert jeden Zwischenstand auf dem Gerät (Safari lädt nach der Kamera
// manchmal neu). Das Prüfdatum ist immer heute.
// Grenzwerte, Bewertung und Ergebnis-Regel kommen 1:1 aus der App (dguv.ts, abgesichert durch
// tests/pruefdex-vor-ort.test.mjs). Typenschild-Erkennung per KI und QR-Scan gibt es nur in der App.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, CloudOff, MapPin, TriangleAlert, X } from 'lucide-react';
import { Modal } from '../../components/form';
import { useUnsavedGuard } from '../../components/ui';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { getPrefs, newId, setPrefs } from '../../pruefen/data';
import { Unterschrift } from '../../pruefen/Unterschrift';
import { GPS_GOOD_M, GPS_WEAK_M, useGpsStamp } from '../../winterdex/einsatz/gps';
import { fileToPhoto } from '../../winterdex/einsatz/photo';
import { GATE_TEXT } from '../gate';
import type { Customer, Device } from '../types';
import { loadPd } from './backend';
import { usePd, usePendingSync, withPending } from './context';
import {
  MEASUREMENTS,
  VISUAL_CHECKS,
  anyMeasurementFail,
  anyVisualFail,
  dueStatus,
  evaluateMeasurement,
  followResult,
  formatDE,
  hasAnyMeasurement,
  notNeeded,
  protectionClassOf,
  todayISO,
  type MeasureEval,
  type MeasurementDef,
  type Result,
} from './dguv';
import { deviceInfo } from './geraet';
import { deleteDraft, getDraft, listPending, pendingKey, saveDraft, submit, type Draft, type DraftForm, type SubmitOutcome } from './queue';
import { buildInspectionRow, type GpsFix } from './rows';

const APP = 'pruefdex';

export function Pruefen() {
  const { id } = useParams();
  // key: „Weiter prüfen“ am nächsten Gerät beginnt mit einem frischen Formular.
  return id ? <Formular key={id} deviceId={id} /> : null;
}

type Phase = 'loading' | 'gate' | 'ask' | 'form' | 'done';
type Ask = null | 'gps' | 'name' | 'passed-anyway' | 'no-measure';

interface DoneInfo {
  outcome: SubmitOutcome;
  result: Result;
  nextDue: string;
  hadGps: boolean;
  /** Genauigkeit des Beginn-Stempels in Metern, wenn er schwach war (sonst null) */
  weakAcc: number | null;
}

function initialForm(name: string, qualification: string, signature: string): DraftForm {
  return {
    // Vorbelegung „in Ordnung“: abweichende Punkte werden aktiv umgestellt (wie in der App)
    visual: Object.fromEntries(VISUAL_CHECKS.map((c) => [c.key, true])),
    measurements: {},
    result: 'passed',
    userChoice: null,
    notes: '',
    inspectorName: name,
    qualification,
    signature,
  };
}

/** Macht aus der Grenzwert-Bewertung eine farbige Status-Zeile unterm Messwertfeld — Texte wie in der App. */
function measureStatus(e: MeasureEval): { tone: 'ok' | 'fail' | 'na'; text: string } | null {
  if (e === 'ok') return { tone: 'ok', text: '✓ im Grenzwert' };
  if (e === 'fail') return { tone: 'fail', text: '✗ Grenzwert nicht eingehalten' };
  if (e === 'na') return { tone: 'na', text: 'für diese Schutzklasse nicht erforderlich' };
  return null;
}

function Formular({ deviceId }: { deviceId: string }) {
  const { be, userId, orgId, base, orgInspector } = usePd();

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [found, setFound] = useState<Draft | null>(null);

  // Feste Prüf-ID je Formular: Ein wiederholter Versuch nutzt dieselbe ID und dieselben Foto-Pfade — nichts doppelt.
  const idRef = useRef(newId());
  const openedAtRef = useRef(new Date().toISOString());
  // Zeitpunkt des ERSTEN Speicher-Versuchs — bleibt bei Wiederholungen gleich.
  const firstAttemptRef = useRef<string | null>(null);
  const [restoredStart, setRestoredStart] = useState<GpsFix | null>(null);

  const [form, setForm] = useState<DraftForm>(() => {
    const p = getPrefs(APP, userId);
    // Zuletzt von DIESEM Konto verwendeter Name zuerst, sonst der Prüfer aus den Betriebsdaten (wie in der App)
    return initialForm(p.name || orgInspector, p.qualification, p.signature);
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const confirmedGpsRef = useRef(false);
  const confirmedNameRef = useRef(false);
  const confirmedPassedRef = useRef(false);
  const confirmedNoMeasureRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // --- Laden: Gerät, Kunde, Gratis-Grenze, angefangene Prüfung ----------------------------------
  const load = useCallback(() => {
    let alive = true;
    setLoadError(null);
    setPhase('loading');
    Promise.all([loadPd(be, userId), getDraft(userId, deviceId), listPending(userId)])
      .then(async ([data, draft, pending]) => {
        if (!alive) return;
        const d = data.devices.find((x) => x.id === deviceId) ?? null;
        if (!d) return setLoadError('Gerät nicht gefunden — gelöscht, ausgesondert oder aus einem anderen Betrieb?');
        setDevice(d);
        setCustomer(data.customers.find((c) => c.id === d.customer_id) ?? null);
        // Gratis-Grenze wie in der App: ohne Pro 5 Prüfungen (wartende zählen schon mit). Im Zweifel nicht sperren.
        const gate = data.offline ? { allowed: true } : await be.inspectionGate(pending.length).catch(() => ({ allowed: true }));
        if (!alive) return;
        if (!gate.allowed) return setPhase('gate');
        if (draft) {
          setFound(draft);
          setPhase('ask');
        } else {
          openedAtRef.current = new Date().toISOString();
          setPhase('form');
        }
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [be, userId, deviceId]);
  useEffect(() => load(), [load]);

  const resume = (d: Draft) => {
    idRef.current = d.inspectionId;
    const sameDay = d.day === todayISO();
    // Entwurf von einem früheren Tag: Eingaben bleiben, Beginn und GPS-Stempel gelten ab jetzt (die Prüfung trägt das heutige Datum)
    openedAtRef.current = sameDay ? d.openedAt : new Date().toISOString();
    setRestoredStart(sameDay ? d.start : null);
    setForm({ ...d.form, visual: Object.fromEntries(VISUAL_CHECKS.map((c) => [c.key, d.form.visual[c.key] !== false])) });
    setPhotos(d.photos);
    setMoreOpen(d.form.notes.trim() !== '' || d.photos.length > 0);
    setFound(null);
    setPhase('form');
  };
  const startFresh = () => {
    void deleteDraft(userId, deviceId);
    idRef.current = newId();
    openedAtRef.current = new Date().toISOString();
    setFound(null);
    setPhase('form');
  };

  // --- Bewertung und Ergebnis (Regeln der App) ---------------------------------------------------
  const sk = protectionClassOf(device?.protection_class);
  const visualFail = anyVisualFail(form.visual);
  const measFail = anyMeasurementFail(form.measurements, sk);
  const anyFail = visualFail || measFail;
  // Der Vorschlag folgt den Eingaben, solange du nicht selbst gewählt hast; ein neuer Mangel hebt „bestanden“ auf.
  useEffect(() => {
    setForm((f) => {
      const next = followResult(anyFail, f.userChoice);
      return next.result === f.result && next.userChoice === f.userChoice ? f : { ...f, ...next };
    });
  }, [anyFail]);
  const chooseResult = (r: Result) => {
    confirmedPassedRef.current = false;
    confirmedNoMeasureRef.current = false;
    setForm((f) => ({ ...f, result: r, userChoice: r }));
  };
  const set = (patch: Partial<DraftForm>) => setForm((f) => ({ ...f, ...patch }));
  const setVisual = (key: string, v: boolean) => {
    confirmedPassedRef.current = false;
    setForm((f) => ({ ...f, visual: { ...f.visual, [key]: v } }));
  };
  const setMeas = (key: string, v: string) => {
    confirmedPassedRef.current = false;
    confirmedNoMeasureRef.current = false;
    setForm((f) => ({ ...f, measurements: { ...f.measurements, [key]: v } }));
  };
  const okCount = VISUAL_CHECKS.filter((c) => form.visual[c.key]).length;
  const failed = form.result === 'failed';
  // Bei „Nicht bestanden“ gehören Bemerkung und Foto zum Mangel dazu → Bereich aufklappen.
  useEffect(() => {
    if (failed) setMoreOpen(true);
  }, [failed]);

  // --- GPS ------------------------------------------------------------------------------------
  const noop = useCallback(() => undefined, []);
  const { gps, lastFixRef, retry } = useGpsStamp(phase === 'form', restoredStart, noop);
  const gpsOk = gps.status === 'ok';
  const gpsAcc = gpsOk ? Math.round(gps.accuracy ?? 0) : null;
  const gpsWeak = !gpsOk || (gps.accuracy ?? 9999) > GPS_WEAK_M;
  const startFix: GpsFix | null = gpsOk ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, at: gps.at } : null;

  // --- Entwurf auf dem Gerät sichern ----------------------------------------------------------
  // wie in der App: ungespeichert = Sichtprüfung n. i. O., ein Messwert, eine Bemerkung oder ein Foto
  const dirty =
    visualFail || Object.values(form.measurements).some((v) => String(v ?? '').trim() !== '') || form.notes.trim() !== '' || photos.length > 0;
  // Kamera geöffnet: Entwurf auch ohne Eingaben sichern (Safari kann die Seite dabei neu laden)
  const [forceDraft, setForceDraft] = useState(false);
  const [draftOnDevice, setDraftOnDevice] = useState(true);
  const snapshot = useRef<Omit<Draft, 'key'> | null>(null);
  snapshot.current =
    phase === 'form'
      ? {
          userId,
          deviceId,
          inspectionId: idRef.current,
          openedAt: openedAtRef.current,
          day: todayISO(),
          start: startFix,
          form,
          photos,
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
  }, [keepDraft, form, photos, startKey, saveDraftNow]);
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
      if (c.phase === 'form' && c.forceDraft && !c.dirty) void deleteDraft(userId, deviceId);
    },
    [userId, deviceId],
  );
  // Ohne Gerätespeicher (privates Surfen) wäre beim Verlassen alles weg → dann nachfragen.
  useUnsavedGuard(
    phase === 'form' && dirty && !draftOnDevice,
    'Diese Prüfung ist noch nicht gespeichert. Seite trotzdem verlassen? Sichtprüfung, Messwerte und Fotos gehen dann verloren.',
  );

  // --- Fotos ----------------------------------------------------------------------------------
  const beforeCamera = () => {
    setForceDraft(true);
    saveDraftNow();
  };
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ''; // dasselbe Foto lässt sich danach erneut wählen
    if (!files.length) return;
    setPhotoError(null);
    setPhotoBusy((n) => n + files.length);
    for (const f of files) {
      try {
        const uri = await fileToPhoto(f);
        setPhotos((prev) => [...prev, uri]);
      } catch {
        setPhotoError('Ein Foto konnte nicht verarbeitet werden. Bitte noch einmal aufnehmen.');
      } finally {
        setPhotoBusy((n) => n - 1);
      }
    }
  };

  // --- Speichern ------------------------------------------------------------------------------
  const save = async () => {
    if (saving || !device) return;
    // Reihenfolge der Rückfragen wie in der App: GPS → Prüfer → „Bestanden“ trotz Mangel → „Bestanden“ ohne Messwert
    if (gpsWeak && !confirmedGpsRef.current) return setAsk('gps');
    // Ein DGUV-Protokoll ohne Prüfer ist als Nachweis wertlos → einmal nachfragen.
    if (!form.inspectorName.trim() && !confirmedNameRef.current) return setAsk('name');
    // „Bestanden“ trotz roter Messzeile / Sichtprüfung n. i. O. → bewusst bestätigen lassen.
    if (form.result === 'passed' && anyFail && !confirmedPassedRef.current) return setAsk('passed-anyway');
    // „Bestanden“ ganz ohne Messwert (Schutzklasse I/II bzw. unbekannt): nachfragen, nicht verbieten.
    if (form.result === 'passed' && sk !== 'III' && !hasAnyMeasurement(form.measurements) && !confirmedNoMeasureRef.current) return setAsk('no-measure');
    setSaving(true);
    setSaveError(null);
    try {
      const at = firstAttemptRef.current ?? new Date().toISOString();
      firstAttemptRef.current = at;
      const inspection = buildInspectionRow({
        id: idRef.current,
        orgId,
        deviceId: device.id,
        intervalMonths: device.interval_months,
        // Prüfungen sind unveränderlich: immer das heutige Datum (Korrektur nur per Storno)
        inspectedAt: todayISO(),
        at,
        inspectorName: form.inspectorName,
        qualification: form.qualification,
        signature: form.signature,
        visual: form.visual,
        measurements: form.measurements,
        result: form.result,
        notes: form.notes,
        start: startFix,
        end: lastFixRef.current,
      });
      finishedRef.current = true;
      const outcome = await submit(be, {
        key: pendingKey(userId, inspection.id),
        userId,
        deviceName: device.name,
        customerName: customer?.name ?? '',
        inspection,
        photos,
        createdAt: at,
      });
      setPrefs(APP, userId, { name: form.inspectorName.trim(), qualification: form.qualification.trim() });
      // Entwurf erst weg, wenn die fertige Fassung sicher ist (Server oder dauerhaft auf dem Gerät) — sonst bleibt er als letzte Sicherung.
      if (outcome.result === 'synced' || outcome.onDevice) await deleteDraft(userId, deviceId);
      setDone({
        outcome,
        result: inspection.result,
        nextDue: inspection.next_due_date,
        hadGps: gpsOk,
        weakAcc: gpsOk && gpsWeak ? gpsAcc : null,
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
  const confirmAnd = (ref: React.RefObject<boolean>) => {
    ref.current = true;
    setAsk(null);
    void save();
  };

  // --- Anzeige --------------------------------------------------------------------------------
  const backTo = customer ? `${base}/standort/${customer.id}` : base;
  const back = (
    <Link to={backTo} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> {customer ? customer.name : 'Geräte'}
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
  if (phase === 'loading' || !device) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  if (phase === 'gate') {
    return (
      <div className="ez">
        {back}
        <h1>Gratis-Grenze erreicht</h1>
        <div className="card" data-testid="pd-gate">
          <p style={{ marginTop: 0 }}>{GATE_TEXT.inspections}</p>
          <div className="ez-actions">
            <Link to={`${base}/abo`} className="btn ez-big">
              Abo &amp; Tarif ansehen
            </Link>
            <Link to={backTo} className="btn ghost ez-big">
              Zurück
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'done' && done) return <Fertig device={device} customer={customer} info={done} />;

  if (phase === 'ask' && found) {
    return (
      <div className="ez">
        {back}
        <h1>Angefangene Prüfung</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          {device.name}
          {customer ? ` · ${customer.name}` : ''}
        </p>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Auf diesem Gerät liegt eine angefangene Prüfung:
            <br />
            <b>Beginn {fmtDateTime(found.openedAt)}</b>
            {found.photos.length > 0 && ` · ${found.photos.length} ${found.photos.length === 1 ? 'Foto' : 'Fotos'}`}
          </p>
          {found.day !== todayISO() && (
            <p className="muted small">Sie ist von einem früheren Tag. Beim Fortsetzen bleiben deine Eingaben; Datum und GPS-Stempel sind die von heute.</p>
          )}
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
  const needed = MEASUREMENTS.filter((m) => !notNeeded(m.key, sk));
  const optional = MEASUREMENTS.filter((m) => notNeeded(m.key, sk));
  const optionalFilled = optional.filter((m) => String(form.measurements[m.key] ?? '').trim() !== '').length;
  const field = (m: MeasurementDef) => {
    const status = measureStatus(evaluateMeasurement(m.key, form.measurements[m.key], sk, form.measurements));
    return (
      <label className="field" key={m.key}>
        {m.label} ({m.unit})
        <input
          value={form.measurements[m.key] ?? ''}
          inputMode="decimal"
          autoComplete="off"
          maxLength={20}
          placeholder="Messwert"
          data-testid={`pd-m-${m.key}`}
          onChange={(e) => setMeas(m.key, e.target.value)}
        />
        <span className="muted small pd-hint">{m.hint}</span>
        {status && (
          <span className={`pd-eval ${status.tone}`} role="status" data-testid={`pd-eval-${m.key}`}>
            {status.text}
          </span>
        )}
      </label>
    );
  };
  const moreFilled = (form.notes.trim() ? 1 : 0) + photos.length;

  return (
    <div className="ez">
      {back}
      <h1>Prüfung dokumentieren</h1>
      <div className="card pv-unit">
        <span className="muted small">Gerät</span>
        <b>{device.name}</b>
        <span className="muted">{deviceInfo(device)}</span>
        {(customer || device.location_note) && <span className="muted">{[customer?.name, device.location_note].filter(Boolean).join(' · ')}</span>}
        <span className="muted small">
          DGUV V3 · VDE 0702 / VDE 0701 · Prüfdatum heute, {formatDE(todayISO())} · Prüfintervall {device.interval_months} Monate
        </span>
        <Link to={`${base}/geraete/${device.id}`} className="small">
          Gerät ansehen (Stammdaten, Prüf-Historie)
        </Link>
      </div>

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
                  : `Ort wird genauer … ±${gpsAcc} m (am besten am Fenster oder unter freiem Himmel)`
                : (gps.accuracy ?? 9999) <= GPS_GOOD_M
                  ? `✓ Ort genau erfasst (±${gpsAcc} m)`
                  : gpsWeak
                    ? `⚠ Ort ungenau (±${gpsAcc} m) — wird im Protokoll so vermerkt`
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
            <p className="ez-warn">⚠ Standort nicht erlaubt — Protokoll ohne Ortsangabe.</p>
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
            <p className="ez-warn">⚠ Position nicht verfügbar — Protokoll ohne Ortsangabe.</p>
            <button type="button" className="btn ghost small" onClick={retry}>
              Erneut versuchen
            </button>
          </>
        )}
        {gps.status === 'unsupported' && <p className="ez-warn">⚠ Dieser Browser kann keinen Standort ermitteln — Protokoll ohne Ortsangabe.</p>}
      </div>

      <h2 className="ez-section" aria-live="polite">
        Sichtprüfung{' '}
        <span className={okCount === VISUAL_CHECKS.length ? 'kf-ok' : 'pv-bad'} data-testid="pd-tally">
          · {okCount}/{VISUAL_CHECKS.length} i. O.
        </span>
      </h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Jeder Punkt steht auf „i. O.“. Was nicht in Ordnung ist, auf „n. i. O.“ stellen.
      </p>
      <ul className="pv-checks">
        {VISUAL_CHECKS.map((c) => {
          const ok = form.visual[c.key] !== false;
          return (
            <li key={c.key} className={`pv-check${ok ? '' : ' defect'}`}>
              <b className="pv-check-text">{c.label}</b>
              <div className="pv-seg" role="group" aria-label={`${c.label}: Ergebnis`}>
                <button type="button" className={`pv-seg-btn${ok ? ' on ok' : ''}`} aria-pressed={ok} onClick={() => setVisual(c.key, true)}>
                  i. O.
                </button>
                <button type="button" className={`pv-seg-btn${ok ? '' : ' on defect'}`} aria-pressed={!ok} onClick={() => setVisual(c.key, false)}>
                  n. i. O.
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="ez-section">Messungen</h2>
      {!sk && (
        <div className="error-box" role="alert">
          Schutzklasse fehlt – bitte am Gerät eintragen. Ohne sie werden die Messwerte nicht automatisch als „in Ordnung“ bewertet.
        </div>
      )}
      {needed.map(field)}
      {optional.length > 0 && (
        // Für diese Schutzklasse nicht erforderliche Messungen: eingeklappt, aber vollständig vorhanden
        // (Werte werden wie in der App gespeichert und bewertet).
        <details className="pv-more" open={optionalFilled > 0 ? true : undefined}>
          <summary>
            Für Schutzklasse {sk} nicht erforderlich
            <span className="muted small">
              {optional.map((m) => m.label).join(', ')}
              {optionalFilled > 0 ? ` · ${optionalFilled} ausgefüllt` : ''}
            </span>
          </summary>
          {optional.map(field)}
        </details>
      )}
      <p className="muted small">
        {sk
          ? `Bewertung automatisch gegen die Grenzwerte der Schutzklasse ${sk}.`
          : 'Keine automatische Bewertung: Schutzklasse am Gerät nicht eingetragen (Gerät bearbeiten → Schutzklasse).'}
      </p>

      <h2 className="ez-section">Gesamtergebnis</h2>
      <div className="pd-result" role="group" aria-label="Gesamtergebnis">
        <button type="button" className={`pd-result-btn passed${form.result === 'passed' ? ' on' : ''}`} aria-pressed={form.result === 'passed'} onClick={() => chooseResult('passed')}>
          BESTANDEN
        </button>
        <button type="button" className={`pd-result-btn failed${failed ? ' on' : ''}`} aria-pressed={failed} onClick={() => chooseResult('failed')}>
          NICHT BESTANDEN
        </button>
      </div>
      {anyFail && (
        <p className="pv-bad small" data-testid="pd-why">
          {[measFail ? 'Mindestens ein Messwert überschreitet den Grenzwert' : '', visualFail ? 'Die Sichtprüfung hat Punkte „nicht in Ordnung“' : '']
            .filter(Boolean)
            .join('. ')}
          .
        </p>
      )}

      <label className="field" style={{ marginTop: 14 }}>
        Prüfer
        <input
          ref={nameRef}
          value={form.inspectorName}
          maxLength={80}
          autoComplete="name"
          placeholder="Name des Prüfers"
          onChange={(e) => set({ inspectorName: e.target.value })}
        />
      </label>
      <Unterschrift
        value={form.signature}
        onChange={(sig) => {
          set({ signature: sig });
          setPrefs(APP, userId, { signature: sig });
        }}
      />

      <details className="pv-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary>
          Weitere Angaben
          <span className="muted small">
            {form.qualification.trim() ? `Qualifikation: ${form.qualification.trim()} · ` : 'Qualifikation, '}Bemerkungen, Fotos
            {moreFilled > 0 ? ` · ${moreFilled} ausgefüllt` : ''}
          </span>
        </summary>
        <label className="field">
          Qualifikation (optional, erscheint im Protokoll)
          <input value={form.qualification} maxLength={120} placeholder="z. B. Elektrofachkraft" onChange={(e) => set({ qualification: e.target.value })} />
        </label>
        <label className="field">
          Bemerkungen
          <textarea
            rows={3}
            value={form.notes}
            maxLength={2000}
            placeholder={failed ? 'Was ist am Gerät nicht in Ordnung?' : 'optional'}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
        <span className="pv-label">Fotos (Typenschild / Mangel)</span>
        <div className="ez-photos">
          {photos.map((uri, i) => (
            <div className="ez-photo" key={uri.slice(-32) + i}>
              <img src={uri} alt={`Foto ${i + 1}`} />
              <button type="button" aria-label={`Foto ${i + 1} entfernen`} onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
                <X className="i" aria-hidden />
              </button>
            </div>
          ))}
          {photoBusy > 0 && (
            <div className="ez-photo busy" aria-label="Foto wird verarbeitet">
              <span className="spinner" />
            </div>
          )}
          <label className="ez-photo-add" onClick={beforeCamera}>
            <Camera className="i" aria-hidden />
            <span>Foto</span>
            <input type="file" accept="image/*" multiple onChange={(e) => void onFiles(e)} aria-label="Foto hinzufügen" />
          </label>
        </div>
        {photoError && <div className="error-box">{photoError}</div>}
        <p className="muted small">Optional. Aufgenommene Fotos erscheinen im Prüfprotokoll.</p>
      </details>

      {saveError && <div className="error-box">Prüfung nicht gespeichert: {saveError}</div>}
      <p className="muted small pv-summary">
        Du speicherst: <b>{failed ? 'Nicht bestanden' : 'Bestanden'}</b> für <b>{device.name}</b>
        {customer ? ` (${customer.name})` : ''}.
      </p>
      <button type="button" className={`btn ez-save${failed ? ' ez-danger' : ''}`} onClick={() => void save()} disabled={saving || photoBusy > 0}>
        <Check className="i" aria-hidden /> {saving ? 'Wird gespeichert …' : 'Prüfung speichern'}
      </button>
      <p className="muted small">
        Nach dem Speichern ist die Prüfung nicht mehr änderbar (Beweiskette) — nur Stornieren mit Begründung ist möglich.
      </p>

      {ask === 'gps' && (
        <Modal
          title={gpsOk ? 'Ortung noch ungenau' : gps.status === 'loading' ? 'Noch kein GPS-Stempel' : 'Kein GPS-Stempel möglich'}
          onClose={() => setAsk(null)}
          dirty={false}
        >
          <p>
            {gpsOk
              ? `Der Ort ist erst auf ±${gpsAcc} m genau (kein Satellitenempfang?). Für einen prüffesten Nachweis kurz unter freiem Himmel bzw. am Fenster warten.`
              : gps.status === 'loading'
                ? 'Der Ort wird noch ermittelt. Für einen prüffesten Nachweis kurz unter freiem Himmel bzw. am Fenster warten.'
                : 'Der Standort ist nicht erlaubt oder nicht verfügbar (siehe Hinweis im Feld „GPS-Stempel“).'}
          </p>
          <p className="muted">Trotzdem speichern? Im Protokoll steht dann {gpsOk ? 'die ungenaue Ortung' : 'keine Ortsangabe'}.</p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => setAsk(null)}>
              Warten
            </button>
            <button type="button" className="btn ghost ez-big" onClick={() => confirmAnd(confirmedGpsRef)}>
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'name' && (
        <Modal title="Kein Prüfer eingetragen" onClose={() => setAsk(null)} dirty={false}>
          <p>Auf dem Protokoll fehlt dann der Name der prüfenden Person. Trotzdem speichern?</p>
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
            <button type="button" className="btn ghost ez-big" onClick={() => confirmAnd(confirmedNameRef)}>
              Trotzdem speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'passed-anyway' && (
        <Modal title="Trotzdem „Bestanden“?" onClose={() => setAsk(null)} dirty={false}>
          <p data-testid="pd-ask-passed">
            {[measFail ? 'Mindestens ein Messwert überschreitet den Grenzwert' : '', visualFail ? 'Die Sichtprüfung hat Punkte „nicht in Ordnung“' : '']
              .filter(Boolean)
              .join('. ')}
            . Trotzdem als BESTANDEN speichern?
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => setAsk(null)}>
              Zurück
            </button>
            <button type="button" className="btn ghost ez-big" onClick={() => confirmAnd(confirmedPassedRef)}>
              Bestanden speichern
            </button>
          </div>
        </Modal>
      )}
      {ask === 'no-measure' && (
        <Modal title="Ohne Messwerte „Bestanden“?" onClose={() => setAsk(null)} dirty={false}>
          <p data-testid="pd-ask-nomeasure">
            Es ist kein einziger Messwert eingetragen{sk ? ` (Schutzklasse ${sk})` : ' und am Gerät fehlt die Schutzklasse'}. Das Protokoll weist dann nur
            die Sichtprüfung nach. Trotzdem als BESTANDEN speichern?
          </p>
          <div className="ez-actions">
            <button type="button" className="btn ez-big" onClick={() => setAsk(null)}>
              Zurück
            </button>
            <button type="button" className="btn ghost ez-big" onClick={() => confirmAnd(confirmedNoMeasureRef)}>
              Ohne Messwerte speichern
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Nach dem Speichern: ehrliche Bestätigung (was ist wo gespeichert?) + das nächste fällige Gerät beim selben Kunden. */
function Fertig({ device, customer, info }: { device: Device; customer: Customer | null; info: DoneInfo }) {
  const { be, userId, base } = usePd();
  const { pending, loaded } = usePendingSync();
  const [next, setNext] = useState<{ device: Device; count: number } | null>(null);
  const { outcome } = info;
  const key = outcome.pending.key;
  const rejectedAtSave = typeof outcome.result === 'object' ? outcome.result.rejected : null;
  const queued = outcome.result !== 'synced';
  const waiting = pending.find((p) => p.key === key);
  // Inzwischen doch gesendet (Netz kam zurück, solange diese Seite offen ist)?
  const stillWaiting = queued && (!loaded || !!waiting);
  const rejected = stillWaiting ? (waiting ? (waiting.lastError ?? null) : rejectedAtSave) : null;
  const onServer = !stillWaiting;
  const state = waiting ?? outcome.pending;
  const passed = info.result === 'passed';

  // Serienprüfung: nach einer bestandenen Prüfung das nächste fällige Gerät beim selben Kunden anbieten.
  useEffect(() => {
    if (!passed) return;
    let alive = true;
    loadPd(be, userId).then(
      (data) => {
        // ohne Netz ist unbekannt, was inzwischen geprüft wurde → kein Vorschlag
        if (!alive || data.offline) return;
        const { devices } = withPending(data.devices, data.failed, pending);
        const due = devices
          .filter((d) => d.id !== device.id && (d.customer_id ?? null) === (device.customer_id ?? null))
          .filter((d) => dueStatus(d.next_due_date) !== 'ok' && !pending.some((p) => p.inspection.device_id === d.id))
          .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? '') || a.name.localeCompare(b.name, 'de', { numeric: true }));
        setNext(due.length ? { device: due[0], count: due.length } : null);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be, userId, device.id, passed, pending.length]);

  const listUrl = customer ? `${base}/standort/${customer.id}` : base;

  return (
    <div className="ez ez-done">
      <div className={`ez-done-icon${stillWaiting ? ' wait' : ''}`} aria-hidden>
        {rejected ? <TriangleAlert /> : stillWaiting ? <CloudOff /> : <Check />}
      </div>
      <h1 data-testid="pd-done">{rejected ? 'Noch nicht auf dem Server' : stillWaiting ? 'Auf dem Gerät gesichert' : 'Prüfung dokumentiert ✓'}</h1>
      <p className="muted">
        {device.name}
        {customer ? ` · ${customer.name}` : ''} · {passed ? 'Bestanden' : 'Nicht bestanden'}
      </p>

      {rejected ? (
        <div className="error-box" style={{ textAlign: 'left' }}>
          <TriangleAlert className="i" aria-hidden /> Vom Server nicht angenommen: {rejected}
          <br />
          Die Prüfung liegt mit Fotos und Unterschrift auf diesem Gerät und wird automatisch erneut gesendet. Bleibt es
          dabei, bitte support@dexware.app melden.
        </div>
      ) : stillWaiting ? (
        <div className="info-box" style={{ textAlign: 'left' }}>
          {outcome.onDevice ? (
            <>
              Kein Netz — die Prüfung ist auf dem Gerät gesichert und wird automatisch übertragen, sobald wieder Empfang da
              ist. Datum, Ort, Fotos und Unterschrift bleiben die vom Prüfort. Bitte diese Seite später noch einmal öffnen,
              bis unter „Geräte“ nichts mehr wartet.
            </>
          ) : (
            <>
              Gerade keine Verbindung — und dieser Browser erlaubt kein dauerhaftes Speichern (privates Surfen?).
              <b> Bitte diese Seite offen lassen</b>, bis die Prüfung übertragen ist.
            </>
          )}
        </div>
      ) : (
        <p>
          {state.gpsDropped
            ? 'Datum und Prüfer dokumentiert'
            : info.hadGps
              ? info.weakAcc !== null
                ? `Zeitstempel dokumentiert · Ort nur ungenau erfasst (±${info.weakAcc} m), so im Protokoll vermerkt`
                : 'GPS + Zeitstempel dokumentiert'
              : 'Zeitstempel dokumentiert — ohne GPS-Stempel'}
        </p>
      )}

      {(state.signatureDropped || state.gpsDropped) && (
        <div className="info-box" style={{ textAlign: 'left' }}>
          Hinweis: Die Datenbank konnte {state.signatureDropped && state.gpsDropped ? 'Unterschrift und GPS-Stempel' : state.signatureDropped ? 'die Unterschrift' : 'den GPS-Stempel'}{' '}
          noch nicht speichern — die Prüfung ist ohne gesichert.
        </div>
      )}
      {passed ? (
        <p className="muted">Gültig bis {formatDE(info.nextDue)} — dann erneut prüfen</p>
      ) : (
        <p className="pv-bad">Mangel erfasst — Nachprüfung fällig</p>
      )}

      {next ? (
        <div className="card ez-next">
          <span className="muted small">
            Als Nächstes fällig{customer ? ` bei ${customer.name}` : ''}
            {next.count > 1 ? ` — hier noch ${next.count} fällig` : ''}
          </span>
          <b>{next.device.name}</b>
          <div className="ez-actions">
            <Link to={`${base}/pruefen/${next.device.id}`} className="btn ez-big">
              Weiter prüfen
            </Link>
            <Link to={listUrl} className="btn ghost ez-big">
              Fertig
            </Link>
          </div>
        </div>
      ) : (
        <div className="ez-actions">
          <Link to={listUrl} className="btn ez-big">
            Fertig
          </Link>
          {onServer && (
            <Link to={`${base}/pruefungen/${outcome.pending.inspection.id}`} className="btn ghost ez-big">
              Prüfung ansehen (Protokoll)
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
