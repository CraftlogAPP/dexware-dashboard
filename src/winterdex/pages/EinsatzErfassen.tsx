// Einsatz dokumentieren im Browser — gleicher Ablauf wie in der App (mobile/src/screens/OperationScreen.tsx):
// GPS-Stempel (automatisch, Beginn + Ende), Wetter, Maßnahme, Streumittel, Beweisfotos, „Dokumentiert von“, Notiz.
// Einmal gespeichert, nie mehr änderbar (nur Storno mit Vermerk durch den Inhaber).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, CloudOff, MapPin, TriangleAlert, X } from 'lucide-react';
import { useUnsavedGuard } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { weatherLabel } from '../labels';
import { ACTION_LABELS, type Property, type WeatherSnapshot } from '../types';
import {
  ACTIONS,
  GRIT_MATERIALS,
  GRIT_UNITS,
  UNIT_LABEL,
  cleanAmount,
  defaultUnitFor,
  finishAmount,
  formToRecord,
  initialForm,
  isToday,
  needsGrit,
} from '../einsatz/amount';
import type { OperationRow } from '../einsatz/backend';
import { useEinsatz, usePendingSync } from '../einsatz/context';
import { getPerformerName, loadEinsatzData, newId, setPerformerName } from '../einsatz/data';
import { GPS_GOOD_M, GPS_WEAK_M, useGpsStamp } from '../einsatz/gps';
import { fileToPhoto } from '../einsatz/photo';
import { submit, type SubmitResult } from '../einsatz/send';
import {
  deleteDraft,
  draftKey,
  getDraft,
  pendingKey,
  saveDraft,
  type Draft,
  type FormValues,
  type GpsFix,
} from '../einsatz/store';

export function EinsatzErfassen() {
  const { id } = useParams();
  // key: „Weiter dokumentieren“ am nächsten Objekt beginnt mit einem frischen Formular
  return id ? <Erfassen key={id} propertyId={id} /> : null;
}

type Phase = 'loading' | 'ask' | 'form' | 'done';
type Ask = null | 'gps' | 'name';

function Erfassen({ propertyId }: { propertyId: string }) {
  const { be, userId, orgId, base } = useEinsatz();

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [found, setFound] = useState<Draft | null>(null);

  // Feste Einsatz-ID je Formular: scheitert das Senden nach dem Foto-Upload, nutzt der nächste
  // Versuch dieselben Foto-Pfade (keine verwaisten Fotos im Speicher).
  const opIdRef = useRef(newId());
  const openedAtRef = useRef(new Date().toISOString());
  const [restoredStart, setRestoredStart] = useState<GpsFix | null>(null);
  const [form, setForm] = useState<FormValues>(() => initialForm(getPerformerName(userId)));
  const [photos, setPhotos] = useState<string[]>([]);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const weatherRef = useRef<WeatherSnapshot | null>(null);
  const weatherPromiseRef = useRef<Promise<unknown> | null>(null);

  const [photoBusy, setPhotoBusy] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const confirmedGpsRef = useRef(false);
  const confirmedNameRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ result: SubmitResult; onDevice: boolean; hadGps: boolean } | null>(null);
  const performerRef = useRef<HTMLInputElement>(null);

  // --- Laden: Objekt + angefangener Einsatz ---------------------------------------------------
  const load = useCallback(() => {
    let alive = true;
    setLoadError(null);
    setPhase('loading');
    Promise.all([loadEinsatzData(be, userId, orgId), getDraft(userId, propertyId)]).then(
      ([data, draft]) => {
        if (!alive) return;
        const p = data.properties.find((x) => x.id === propertyId) ?? null;
        if (!p) {
          setLoadError('Dieses Objekt gibt es nicht (mehr) in deinem Betrieb.');
          return;
        }
        setProperty(p);
        if (draft) {
          setFound(draft);
          setPhase('ask');
        } else {
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
  }, [be, userId, orgId, propertyId]);
  useEffect(() => load(), [load]);

  const resume = (d: Draft) => {
    opIdRef.current = d.opId;
    openedAtRef.current = d.openedAt;
    setRestoredStart(d.start);
    setForm(d.form);
    setPhotos(d.photos);
    setWeather(d.weather);
    weatherRef.current = d.weather;
    setFound(null);
    setPhase('form');
  };
  const startFresh = () => {
    void deleteDraft(userId, propertyId);
    opIdRef.current = newId();
    openedAtRef.current = new Date().toISOString();
    setFound(null);
    setPhase('form');
  };

  // --- GPS + Wetter ---------------------------------------------------------------------------
  const onFirstFix = useCallback(
    (fix: GpsFix) => {
      if (weatherRef.current) return;
      // Wetterlage zur Position archivieren (Beweiskraft) — blockiert nichts.
      weatherPromiseRef.current = be.weather(fix.lat, fix.lng).then(
        (r) => {
          if (r.weather) {
            weatherRef.current = r.weather;
            setWeather(r.weather);
          }
        },
        () => undefined,
      );
    },
    [be],
  );
  const { gps, lastFixRef, retry } = useGpsStamp(phase === 'form', restoredStart, onFirstFix);
  const gpsOk = gps.status === 'ok';
  const gpsAcc = gpsOk ? Math.round(gps.accuracy ?? 0) : null;
  const gpsWeak = !gpsOk || (gps.accuracy ?? 9999) > GPS_WEAK_M;

  // --- Entwurf auf dem Gerät sichern ----------------------------------------------------------
  const dirty = photos.length > 0 || form.notes.trim() !== '' || form.gritAmount !== '';
  // Kamera geöffnet: Entwurf auch ohne Eingaben sichern (Safari kann die Seite dabei neu laden)
  const [forceDraft, setForceDraft] = useState(false);
  const [draftOnDevice, setDraftOnDevice] = useState(true);
  const snapshot = useRef<Draft | null>(null);
  const startFix: GpsFix | null = gpsOk ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, at: gps.at } : null;
  snapshot.current =
    phase === 'form'
      ? {
          key: draftKey(userId, propertyId),
          kind: 'draft',
          userId,
          propertyId,
          opId: opIdRef.current,
          openedAt: openedAtRef.current,
          start: startFix,
          weather,
          form,
          photos,
          updatedAt: new Date().toISOString(),
        }
      : null;
  const keepDraft = phase === 'form' && (dirty || forceDraft);
  const keepDraftRef = useRef(keepDraft);
  keepDraftRef.current = keepDraft;
  // Ab dem Senden wird kein Entwurf mehr geschrieben (sonst bliebe ein Entwurf eines schon gesendeten Einsatzes zurück)
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
  }, [keepDraft, form, photos, weather, startKey, saveDraftNow]);
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
      if (c.phase === 'form' && c.forceDraft && !c.dirty) void deleteDraft(userId, propertyId);
    },
    [userId, propertyId],
  );
  // Ohne Gerätespeicher (privates Surfen) wäre beim Verlassen alles weg → dann nachfragen.
  useUnsavedGuard(
    phase === 'form' && dirty && !draftOnDevice,
    'Dieser Einsatz ist noch nicht gespeichert. Seite trotzdem verlassen? Fotos und Eingaben gehen dann verloren.',
  );

  // --- Fotos ----------------------------------------------------------------------------------
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
  const set = (patch: Partial<FormValues>) => setForm((f) => ({ ...f, ...patch }));
  const grit = needsGrit(form.action);

  const save = async () => {
    if (saving || !property) return;
    // Ungenaue oder fehlende Ortung: einmal nachfragen statt still einen schwachen Nachweis zu speichern.
    if (gpsWeak && !confirmedGpsRef.current) return setAsk('gps');
    // Ohne „Dokumentiert von“ ist der Nachweis schwach und nach dem Speichern nicht mehr änderbar.
    if (!form.performerName.trim() && !confirmedNameRef.current) return setAsk('name');
    setSaving(true);
    setSaveError(null);
    try {
      // Läuft die Wetter-Abfrage noch, kurz darauf warten (höchstens 4 s) — sonst fehlte das Wetter im Nachweis.
      if (!weatherRef.current && weatherPromiseRef.current) {
        await Promise.race([weatherPromiseRef.current, new Promise((r) => setTimeout(r, 4000))]);
      }
      const now = new Date().toISOString();
      // End-Stempel nur aus einer FRISCHEN Position (höchstens 2 Minuten alt): War das Handy während der Arbeit gesperrt,
      // stand sonst die Position vom Beginn als „Ende“ im Nachweis (20.11.2026). Ohne frische Position: kein End-Stempel.
      const letzte = lastFixRef.current;
      const end = letzte && Date.now() - Date.parse(letzte.at) <= 120000 ? letzte : null;
      const rec = formToRecord(form);
      const row: OperationRow = {
        id: opIdRef.current,
        org_id: orgId,
        property_id: propertyId,
        started_at: openedAtRef.current,
        ended_at: now,
        lat: gpsOk ? gps.lat : null,
        lng: gpsOk ? gps.lng : null,
        gps_accuracy_m: gpsOk ? (gps.accuracy ?? null) : null,
        gps_at: gpsOk ? gps.at : null,
        gps_mocked: null, // der Browser meldet kein Fake-GPS
        end_lat: end?.lat ?? null,
        end_lng: end?.lng ?? null,
        end_accuracy_m: end?.accuracy ?? null,
        end_gps_at: end?.at ?? null,
        end_mocked: null,
        ...rec,
        weather: weatherRef.current,
        performed_by: userId,
        created_at: now,
      };
      finishedRef.current = true;
      const res = await submit(be, {
        key: pendingKey(row.id),
        kind: 'pending',
        userId,
        propertyName: property.name,
        row,
        photos,
      });
      setPerformerName(userId, form.performerName.trim());
      // Entwurf erst weg, wenn die fertige Fassung sicher ist (Server oder dauerhaft auf dem Gerät) — sonst bleibt er als letzte Sicherung.
      if (res.result === 'synced' || res.onDevice) await deleteDraft(userId, propertyId);
      setResult({ ...res, hadGps: gpsOk });
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
  const back = (
    <Link to={base} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> Objekte
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
  if (phase === 'loading' || !property) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  if (phase === 'done' && result) {
    return <Done propertyId={propertyId} propertyName={property.name} {...result} />;
  }

  if (phase === 'ask' && found) {
    return (
      <div className="ez">
        {back}
        <h1>Angefangener Einsatz</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          {property.name} · {property.address}
        </p>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Für dieses Objekt liegt ein angefangener Einsatz auf diesem Gerät:
            <br />
            <b>Beginn {fmtDateTime(found.openedAt)}</b>
            {found.photos.length > 0 && ` · ${found.photos.length} ${found.photos.length === 1 ? 'Foto' : 'Fotos'}`}
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

  return (
    <div className="ez">
      {back}
      <h1>Einsatz dokumentieren</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {property.name} · {property.address}
      </p>

      <div className="card ez-gps">
        <div className="ez-gps-head">
          <span className={`ez-dot ${gpsTone}${gps.status === 'loading' || gpsOk ? ' pulse' : ''}`} aria-hidden />
          <MapPin className="i" aria-hidden />
          <b>GPS-Stempel</b>
          <span className="muted small">Beginn {fmtTime(openedAtRef.current)}</span>
        </div>
        {gps.status === 'loading' && <p className="muted">Position wird ermittelt …</p>}
        {gpsOk && (
          <>
            <p className={gpsWeak && !gps.refining ? 'ez-warn' : 'muted'}>
              {gps.refining
                ? gps.slow && (gps.accuracy ?? 9999) > 100
                  ? `Kein Satellitenempfang (±${gpsAcc} m, nur Ortung über Mobilfunk/WLAN) — unter freiem Himmel wird die Position weiter verbessert.`
                  : `Ortung wird verfeinert … ±${gpsAcc} m (kurz warten, am besten unter freiem Himmel)`
                : (gps.accuracy ?? 9999) <= GPS_GOOD_M
                  ? `✓ Genaue Position erfasst (±${gpsAcc} m)`
                  : gpsWeak
                    ? `⚠ Position ungenau (±${gpsAcc} m) — wird im Nachweis so vermerkt`
                    : `✓ Position erfasst (±${gpsAcc} m)`}
            </p>
            <p className="muted small">
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} · Ende wird beim Speichern zusätzlich gestempelt
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
            <p className="ez-warn">⚠ Standort nicht erlaubt — der Nachweis wird ohne GPS-Stempel gespeichert.</p>
            <p className="muted small">
              So erlaubst du ihn: am iPhone unter Einstellungen → Datenschutz &amp; Sicherheit → Ortungsdienste →
              Safari-Websites „Beim Verwenden“ und „Genauer Standort“ wählen. In anderen Browsern auf das Schloss
              bzw. Symbol in der Adresszeile tippen → Standort erlauben. Danach:
            </p>
            <button type="button" className="btn ghost small" onClick={retry}>
              Erneut versuchen
            </button>
          </>
        )}
        {gps.status === 'error' && (
          <>
            <p className="ez-warn">⚠ Position nicht verfügbar — der Nachweis wird ohne GPS-Stempel gespeichert.</p>
            <button type="button" className="btn ghost small" onClick={retry}>
              Erneut versuchen
            </button>
          </>
        )}
        {gps.status === 'unsupported' && (
          <p className="ez-warn">⚠ Dieser Browser kann keinen Standort ermitteln — gespeichert wird ohne GPS-Stempel.</p>
        )}
        {weather && weatherLabel(weather) !== '—' && (
          <p className="muted small">Wetterlage wird archiviert: {weatherLabel(weather)}</p>
        )}
      </div>

      <h2 className="ez-section">Maßnahme</h2>
      <div className="ez-chips" role="group" aria-label="Maßnahme">
        {ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            className={`ez-chip${form.action === a ? ' on' : ''}`}
            aria-pressed={form.action === a}
            onClick={() => set({ action: a })}
          >
            {ACTION_LABELS[a]}
          </button>
        ))}
      </div>

      {grit && (
        <>
          <h2 className="ez-section">Streumittel</h2>
          <div className="ez-chips" role="group" aria-label="Streumittel">
            {GRIT_MATERIALS.map((m) => (
              <button
                key={m}
                type="button"
                className={`ez-chip${form.gritMaterial === m ? ' on' : ''}`}
                aria-pressed={form.gritMaterial === m}
                onClick={() => set({ gritMaterial: m, gritUnit: form.unitTouched ? form.gritUnit : defaultUnitFor(m) })}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="ez-amount">
            <label className="field">
              Menge (optional)
              <input
                inputMode="decimal"
                autoComplete="off"
                maxLength={8}
                value={form.gritAmount}
                placeholder="z. B. 12,5"
                aria-label={`Streumenge in ${UNIT_LABEL[form.gritUnit]}`}
                onChange={(e) => set({ gritAmount: cleanAmount(e.target.value) })}
                onBlur={() => set({ gritAmount: finishAmount(form.gritAmount) })}
              />
            </label>
            <div className="ez-chips ez-units" role="group" aria-label="Einheit">
              {GRIT_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`ez-chip${form.gritUnit === u ? ' on' : ''}`}
                  aria-pressed={form.gritUnit === u}
                  onClick={() => set({ gritUnit: u, unitTouched: true })}
                >
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <h2 className="ez-section">Beweisfotos</h2>
      <div className="ez-photos">
        {photos.map((uri, i) => (
          <div className="ez-photo" key={uri.slice(-32) + i}>
            <img src={uri} alt={`Beweisfoto ${i + 1}`} />
            <button
              type="button"
              aria-label={`Beweisfoto ${i + 1} entfernen`}
              onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
            >
              <X className="i" aria-hidden />
            </button>
          </div>
        ))}
        {photoBusy > 0 && (
          <div className="ez-photo busy" aria-label="Foto wird verarbeitet">
            <span className="spinner" />
          </div>
        )}
        <label className="ez-photo-add" onClick={() => { setForceDraft(true); saveDraftNow(); }}>
          <Camera className="i" aria-hidden />
          <span>Foto</span>
          <input type="file" accept="image/*" multiple onChange={(e) => void onFiles(e)} aria-label="Beweisfoto hinzufügen" />
        </label>
      </div>
      {photoError && <div className="error-box">{photoError}</div>}

      <label className="field">
        Dokumentiert von
        <input
          ref={performerRef}
          value={form.performerName}
          maxLength={80}
          autoComplete="name"
          placeholder="Name fürs Protokoll"
          onChange={(e) => set({ performerName: e.target.value })}
        />
      </label>
      <label className="field">
        Notiz (optional)
        <textarea
          rows={3}
          value={form.notes}
          maxLength={2000}
          placeholder="z. B. starke Verwehung an der Zufahrt"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>

      {saveError && <div className="error-box">Einsatz nicht gespeichert: {saveError}</div>}
      <button type="button" className="btn ez-save" onClick={() => void save()} disabled={saving || photoBusy > 0}>
        <Check className="i" aria-hidden /> {saving ? 'Speichern …' : 'Einsatz speichern'}
      </button>
      <p className="muted small">
        Hinweis: Einsätze sind nach dem Speichern nicht mehr änderbar (Beweiskette) — nur Storno mit Begründung ist
        möglich.
      </p>

      {ask === 'gps' && (
        <Modal
          title={gpsOk ? 'Ortung noch ungenau' : gps.status === 'loading' ? 'Noch kein GPS-Stempel' : 'Kein GPS-Stempel möglich'}
          onClose={() => setAsk(null)}
          dirty={false}
        >
          <p>
            {gpsOk
              ? `Die Position ist erst auf ±${gpsAcc} m genau (kein Satellitenempfang?). Für einen prüffesten Nachweis kurz unter freiem Himmel warten.`
              : gps.status === 'loading'
                ? 'Die Position wird noch ermittelt. Für einen prüffesten Nachweis kurz unter freiem Himmel warten.'
                : 'Der Standort ist nicht erlaubt oder nicht verfügbar (siehe Hinweis im Feld „GPS-Stempel“).'}
          </p>
          <p className="muted">
            Trotzdem speichern? Im Nachweis steht dann {gpsOk ? '„Ortung ungenau“' : '„kein GPS“'}.
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
        <Modal title="Ohne Namen speichern?" onClose={() => setAsk(null)} dirty={false}>
          <p>
            Im Feld „Dokumentiert von“ steht kein Name. Der Einsatz lässt sich nach dem Speichern nicht mehr ändern.
          </p>
          <div className="ez-actions">
            <button
              type="button"
              className="btn ez-big"
              onClick={() => {
                setAsk(null);
                // erst nach dem Schließen des Dialogs fokussieren (der gibt den Fokus sonst zurück an den Knopf)
                setTimeout(() => {
                  performerRef.current?.scrollIntoView({ block: 'center' });
                  performerRef.current?.focus();
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

/** Nach dem Speichern: Bestätigung + das nächste heute noch offene Objekt (wie die Morgen-Runde der App). */
function Done({
  propertyId,
  propertyName,
  result,
  onDevice,
  hadGps,
}: {
  propertyId: string;
  propertyName: string;
  result: SubmitResult;
  onDevice: boolean;
  hadGps: boolean;
}) {
  const { be, userId, orgId, base } = useEinsatz();
  const { pending, loaded } = usePendingSync();
  const [next, setNext] = useState<{ open: Property[]; known: boolean } | null>(null);
  const rejected = typeof result === 'object' ? result.rejected : null;
  const queued = result !== 'synced';

  useEffect(() => {
    let alive = true;
    loadEinsatzData(be, userId, orgId).then(
      ({ properties, todayOps, offline }) => {
        if (!alive) return;
        // ohne Netz ist unbekannt, was heute schon erledigt wurde → kein Vorschlag
        if (offline) return setNext({ open: [], known: false });
        const done = new Set(todayOps.filter((o) => !o.canceled && isToday(o.started_at)).map((o) => o.property_id));
        done.add(propertyId);
        const open = properties
          .filter((p) => p.active && !done.has(p.id))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'));
        setNext({ open, known: true });
      },
      () => {
        if (alive) setNext({ open: [], known: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [be, userId, orgId, propertyId]);

  // Inzwischen doch gesendet (Netz kam zurück, solange diese Seite offen ist)?
  const stillWaiting = queued && (!loaded || pending.some((p) => p.row.property_id === propertyId));
  const sentLater = queued && !stillWaiting && !rejected;
  // Was noch auf die Übertragung wartet, ist heute ebenfalls erledigt
  const waitingIds = new Set(pending.filter((p) => isToday(p.row.started_at)).map((p) => p.row.property_id));
  const open = (next?.open ?? []).filter((p) => !waitingIds.has(p.id));

  return (
    <div className="ez ez-done">
      <div className={`ez-done-icon${queued && !sentLater ? ' wait' : ''}`} aria-hidden>
        {queued && !sentLater ? <CloudOff /> : <Check />}
      </div>
      <h1>{queued && !sentLater ? 'Auf dem Gerät gesichert' : 'Einsatz gesichert'}</h1>
      <p className="muted">{propertyName}</p>
      {rejected ? (
        <div className="error-box" style={{ textAlign: 'left' }}>
          <TriangleAlert className="i" aria-hidden /> Vom Server nicht angenommen: {rejected}
          <br />
          Der Einsatz ist mit Fotos auf diesem Gerät gespeichert und wird später automatisch erneut gesendet (mit
          wachsenden Abständen; „Jetzt senden“ unter „Objekte“ versucht es sofort). Bleibt es dabei, bitte
          support@dexware.app melden.
        </div>
      ) : queued && !sentLater ? (
        <div className="info-box" style={{ textAlign: 'left' }}>
          {onDevice ? (
            <>
              Gerade keine Verbindung. Der Einsatz liegt sicher auf diesem Gerät und wird automatisch übertragen,
              sobald wieder Empfang da ist — Zeit, Standort und Fotos bleiben die vom Einsatzort. Bitte diese Seite
              später noch einmal öffnen, bis unter „Einsatz erfassen“ nichts mehr wartet.
            </>
          ) : (
            <>
              Gerade keine Verbindung — und dieser Browser erlaubt kein dauerhaftes Speichern (privates Surfen?).
              <b> Bitte diese Seite offen lassen</b>, bis der Einsatz übertragen ist.
            </>
          )}
        </div>
      ) : (
        <p>{hadGps ? 'GPS + Zeitstempel dokumentiert' : 'Zeitstempel dokumentiert'}</p>
      )}

      {open.length > 0 ? (
        <div className="card ez-next">
          <span className="muted small">
            Nächstes offenes Objekt{open.length > 1 ? ` — heute noch ${open.length} offen` : ''}
          </span>
          <b>{open[0].name}</b>
          <div className="ez-actions">
            <Link to={`${base}/objekt/${open[0].id}`} className="btn ez-big">
              Weiter dokumentieren
            </Link>
            <Link to={base} className="btn ghost ez-big">
              Fertig
            </Link>
          </div>
        </div>
      ) : (
        <div className="ez-actions">
          <Link to={base} className="btn ez-big">
            {next?.known && !queued ? 'Fertig — alle Objekte erledigt' : 'Fertig'}
          </Link>
        </div>
      )}
    </div>
  );
}
