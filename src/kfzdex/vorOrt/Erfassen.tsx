// „Vor Ort“ (KfzDex) — die beiden Erfassungen, Ablauf und Texte wie in der App:
//   UVV-Prüfung (src/screens/UvvCheckScreen.tsx): Checkliste nach DGUV Vorschrift 70 (jeder Punkt „i. O.“ ja/nein),
//     Prüfer, bei offenen Punkten die festgestellten Mängel. Alle Punkte i. O. = bestanden → die Frist des Fahrzeugs
//     startet neu (12 Monate).
//   Führerscheinkontrolle (src/screens/LicenseCheckScreen.tsx): Sichtprüfung bestätigen, Kontrolleur eintragen → die
//     Frist des Fahrers startet neu. Das freiwillige Führerscheinfoto gibt es nur in der App (bleibt dort auf dem Gerät).
// Datum ist immer der heutige Tag. Gespeichert wird erst auf dem Gerät, dann zum Server (queue.ts) — ein Funkloch
// kostet nichts, und ein zweiter Versuch legt nichts doppelt an (feste ID je Erfassung).
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CloudOff, TriangleAlert } from 'lucide-react';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { newId } from '../../pruefen/data';
import { licenseDue } from '../due';
import { CHECK_ITEMS, VEHICLE_TYPE_LABEL, type Driver, type Vehicle } from '../types';
import { loadFleet } from './backend';
import { useKfz, useProofSync, withWaiting } from './context';
import { submitProof, type SubmitOutcome } from './queue';
import { UVV_INTERVAL_MONTHS, addMonths, allOk, buildLicenseRow, buildUvvRow, todayIso } from './rows';

const POINT_IDS = CHECK_ITEMS.map((c) => c.id);
const day = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// --- Name des Prüfers/Kontrolleurs: je Konto auf diesem Gerät gemerkt (nie der letzte Prüfer des Teams) ---------
const nameKey = (userId: string) => `dexware-kfzdex-pruefername:${userId}`;
function loadName(userId: string): string {
  try {
    return localStorage.getItem(nameKey(userId)) ?? '';
  } catch {
    return '';
  }
}
function saveName(userId: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  try {
    localStorage.setItem(nameKey(userId), n);
  } catch {
    /* nur Komfort */
  }
}

// --- Angefangene UVV-Prüfung: Zwischenstand auf dem Gerät (lädt der Browser die Seite neu, ist nichts weg) -------
interface UvvDraft {
  id: string;
  date: string;
  checked: Record<string, boolean>;
  defects: string;
  inspector: string;
}
const draftKey = (userId: string, vehicleId: string) => `dexware-kfzdex-uvv-entwurf:${userId}:${vehicleId}`;
function readDraft(userId: string, vehicleId: string): UvvDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(userId, vehicleId)) ?? 'null') as UvvDraft | null;
    // nur vom selben Tag — die Prüfung trägt das heutige Datum
    return d && d.date === todayIso() && typeof d.id === 'string' ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(userId: string, vehicleId: string, d: UvvDraft | null): void {
  try {
    if (d) localStorage.setItem(draftKey(userId, vehicleId), JSON.stringify(d));
    else localStorage.removeItem(draftKey(userId, vehicleId));
  } catch {
    /* nur Komfort */
  }
}

function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> {label}
    </Link>
  );
}

// ================================================================ UVV-Prüfung
export function UvvPruefen() {
  const { id } = useParams();
  const { be, userId, base } = useKfz();
  const state = useAsync(() => loadFleet(be, userId), [be, userId]);
  return (
    <div className="ez">
      <LoadGuard state={state}>
        {(fleet) => {
          const vehicle = fleet.vehicles.find((v) => v.id === id);
          if (!vehicle) {
            return (
              <>
                <Back to={base} label="Fahrzeuge" />
                <div className="error-box">Fahrzeug nicht gefunden — gelöscht oder aus einem anderen Betrieb?</div>
              </>
            );
          }
          return <UvvForm key={vehicle.id} vehicle={vehicle} />;
        }}
      </LoadGuard>
    </div>
  );
}

function UvvForm({ vehicle }: { vehicle: Vehicle }) {
  const { be, userId, orgId, base } = useKfz();
  const [draft] = useState(() => readDraft(userId, vehicle.id));
  // Feste ID je Erfassung: Ein wiederholter Versuch trifft dieselbe Zeile — nichts doppelt.
  const idRef = useRef(draft?.id ?? newId());
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => draft?.checked ?? Object.fromEntries(POINT_IDS.map((p) => [p, false])),
  );
  const [inspector, setInspector] = useState(() => draft?.inspector || loadName(userId));
  const [defects, setDefects] = useState(draft?.defects ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<{ outcome: SubmitOutcome; passed: boolean; date: string } | null>(null);

  const ok = allOk(POINT_IDS, checked);
  const count = POINT_IDS.filter((p) => checked[p]).length;
  const dirty = !done && (count > 0 || defects.trim() !== '');
  const [onDevice, setOnDevice] = useState(true);
  useEffect(() => {
    if (done || !dirty) return;
    const t = setTimeout(() => {
      writeDraft(userId, vehicle.id, { id: idRef.current, date: todayIso(), checked, defects, inspector });
      // Kontrolle: Liegt der Zwischenstand wirklich auf dem Gerät? Sonst beim Verlassen nachfragen.
      setOnDevice(readDraft(userId, vehicle.id) !== null);
    }, 300);
    return () => clearTimeout(t);
  }, [done, dirty, checked, defects, inspector, userId, vehicle.id]);
  useUnsavedGuard(dirty && !onDevice, 'Die Eingaben dieser UVV-Prüfung sind noch nicht gespeichert. Seite trotzdem verlassen?');

  const canSave = inspector.trim().length > 0;
  const save = async () => {
    if (saving || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const date = todayIso();
      const row = buildUvvRow({ id: idRef.current, orgId, vehicleId: vehicle.id, date, inspector, pointIds: POINT_IDS, checked, defects });
      const outcome = await submitProof(be, { key: row.id, kind: 'uvv', userId, label: vehicle.plate, row, createdAt: new Date().toISOString(), sent: false });
      saveName(userId, inspector);
      // Entwurf erst weg, wenn die fertige Fassung sicher ist (Server oder dauerhaft auf dem Gerät) — sonst bleibt er als letzte Sicherung.
      if (outcome.result === 'synced' || outcome.onDevice || outcome.proofOnServer) writeDraft(userId, vehicle.id, null);
      setDone({ outcome, passed: row.result === 'bestanden', date });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Fertig
        proofKey={idRef.current}
        outcome={done.outcome}
        title={done.passed ? 'UVV bestanden!' : 'Prüfung dokumentiert'}
        subtitle={
          done.passed
            ? `${vehicle.plate} · gültig bis ${day(addMonths(done.date, UVV_INTERVAL_MONTHS))}`
            : `${vehicle.plate} · Mängel erfasst — Nachweis gespeichert`
        }
        what="UVV-Prüfung"
        backTo={base}
      />
    );
  }

  return (
    <>
      <Back to={base} label="Fahrzeuge" />
      <h1>UVV-Prüfung</h1>
      <div className="card pv-unit">
        <span className="muted small">Fahrzeug</span>
        <b>{vehicle.plate}</b>
        <span className="muted">{[vehicle.name, VEHICLE_TYPE_LABEL[vehicle.type]].filter(Boolean).join(' · ')}</span>
        <span className="muted small">Sicht- und Funktionsprüfung nach DGUV Vorschrift 70 · Prüfdatum heute, {fmtDate(todayIso())}</span>
      </div>
      {draft && (
        <div className="info-box" style={{ marginTop: 12 }}>
          Angefangene Prüfung von heute wiederhergestellt.{' '}
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              writeDraft(userId, vehicle.id, null);
              window.location.reload();
            }}
          >
            Verwerfen und neu beginnen
          </button>
        </div>
      )}

      <h2 className="ez-section" aria-live="polite">
        Checkliste{' '}
        <span className={ok ? 'kf-ok' : 'muted'} data-testid="kf-tally">
          · {count} von {POINT_IDS.length} Punkten i. O.{ok ? ' ✓' : ''}
        </span>
      </h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Jeden geprüften Punkt antippen, wenn er in Ordnung ist. Was offen bleibt, zählt als Mangel.
      </p>
      <ul className="pv-checks">
        {CHECK_ITEMS.map((item) => {
          const on = checked[item.id] === true;
          return (
            <li key={item.id}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                className={`kf-check${on ? ' on' : ''}`}
                onClick={() => setChecked((prev) => ({ ...prev, [item.id]: !on }))}
              >
                <span className="kf-check-text">{item.label}</span>
                <span className="kf-check-state">{on ? '✓ i. O.' : 'offen'}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="field" style={{ marginTop: 18 }}>
        Geprüft von (befähigte Person) *
        <input value={inspector} maxLength={80} autoComplete="name" placeholder="z. B. Max Huber" onChange={(e) => setInspector(e.target.value)} />
      </label>
      {!ok && (
        <label className="field">
          Festgestellte Mängel
          <textarea rows={3} value={defects} maxLength={2000} placeholder="z. B. Reifen vorne links unter 3 mm" onChange={(e) => setDefects(e.target.value)} />
        </label>
      )}

      {saveError && <div className="error-box">Prüfung nicht gespeichert: {saveError}</div>}
      {!canSave && <p className="muted small">Bitte oben eintragen, wer geprüft hat — dann lässt sich die Prüfung speichern.</p>}
      <button type="button" className={`btn ez-save${ok ? '' : ' ez-danger'}`} onClick={() => void save()} disabled={saving || !canSave}>
        <Check className="i" aria-hidden /> {saving ? 'Speichern …' : ok ? 'Prüfung abschließen — bestanden' : 'Prüfung mit Mängeln speichern'}
      </button>
      <p className="muted small">
        {ok
          ? 'Bestanden: Die UVV-Frist des Fahrzeugs startet heute neu (12 Monate).'
          : defects.trim()
            ? 'Ergebnis: „Mängel festgestellt“ — die UVV-Frist des Fahrzeugs bleibt, wie sie ist.'
            : 'Ergebnis: „Nicht bestanden“ — die UVV-Frist des Fahrzeugs bleibt, wie sie ist. Mit Mängeltext heißt das Ergebnis „Mängel festgestellt“.'}{' '}
        Ein gespeicherter Nachweis lässt sich nicht mehr ändern.
      </p>
    </>
  );
}

// ================================================================ Führerscheinkontrolle
export function Kontrolle() {
  const { id } = useParams();
  const { be, userId, base } = useKfz();
  const { waiting } = useProofSync();
  const state = useAsync(() => loadFleet(be, userId), [be, userId]);
  const back = `${base}/kontrollen`;
  return (
    <div className="ez">
      <LoadGuard state={state}>
        {(fleet) => {
          const driver = withWaiting(fleet, waiting).drivers.find((d) => d.id === id);
          if (!driver) {
            return (
              <>
                <Back to={back} label="Fahrer" />
                <div className="error-box">Fahrer nicht gefunden — gelöscht oder aus einem anderen Betrieb?</div>
              </>
            );
          }
          return <KontrolleForm key={driver.id} driver={driver} back={back} />;
        }}
      </LoadGuard>
    </div>
  );
}

function KontrolleForm({ driver, back }: { driver: Driver; back: string }) {
  const { be, userId, orgId } = useKfz();
  const idRef = useRef(newId());
  const [checkedBy, setCheckedBy] = useState(() => loadName(userId));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<{ outcome: SubmitOutcome; date: string } | null>(null);
  // Stand beim Öffnen — nach dem Speichern zählt die neue Kontrolle schon mit, die Zeile soll aber die vorherige nennen.
  const [before] = useState(() => ({ last: driver.last_check, due: licenseDue(driver) }));

  const canSave = checkedBy.trim().length > 0;
  const confirm = async () => {
    if (saving || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const date = todayIso();
      const row = buildLicenseRow({ id: idRef.current, orgId, driverId: driver.id, date, checkedBy });
      const outcome = await submitProof(be, { key: row.id, kind: 'license', userId, label: driver.name, row, createdAt: new Date().toISOString(), sent: false });
      saveName(userId, checkedBy);
      setDone({ outcome, date });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Fertig
        proofKey={idRef.current}
        outcome={done.outcome}
        title="Kontrolle dokumentiert!"
        subtitle={`${driver.name} · gültig bis ${day(addMonths(done.date, driver.check_interval_months))}`}
        what="Kontrolle"
        backTo={back}
      />
    );
  }

  return (
    <>
      <Back to={back} label="Fahrer" />
      <h1>Führerscheinkontrolle</h1>
      <div className="card pv-unit">
        <span className="muted small">Fahrer</span>
        <b>{driver.name}</b>
        <span className="muted">
          {driver.license_classes ? `Führerscheinklassen ${driver.license_classes} · ` : ''}Kontrolle alle {driver.check_interval_months} Monate
        </span>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <b>Sichtprüfung</b>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Lass dir den Original-Führerschein zeigen und prüfe: Lichtbild passt zur Person, Klassen decken die gefahrenen
          Fahrzeuge ab, Karte ist unbeschädigt und gültig.
        </p>
        <p className="muted small" style={{ margin: '10px 0 0', fontWeight: 600 }}>
          {before.last
            ? `Letzte Kontrolle: ${fmtDate(before.last)}${before.due.dueDate ? ` · fällig: ${day(before.due.dueDate)}` : ''}`
            : 'Noch keine Kontrolle dokumentiert.'}
        </p>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Kontrolldatum ist heute, {fmtDate(todayIso())}. Ein Foto vom Führerschein lässt sich nur in der KfzDex-App
        beilegen — es bleibt dort auf dem Gerät und wird nicht hochgeladen.
      </p>

      <label className="field" style={{ marginTop: 14 }}>
        Kontrolliert von *
        <input value={checkedBy} maxLength={80} autoComplete="name" placeholder="z. B. Max Mustermann" onChange={(e) => setCheckedBy(e.target.value)} />
      </label>
      {saveError && <div className="error-box">Kontrolle nicht gespeichert: {saveError}</div>}
      <button type="button" className="btn ez-save" onClick={() => void confirm()} disabled={saving || !canSave}>
        <Check className="i" aria-hidden /> {saving ? 'Speichern …' : 'Führerschein gesehen — Kontrolle bestätigen'}
      </button>
      <p className="muted small">Die Frist des Fahrers startet heute neu. Ein gespeicherter Nachweis lässt sich nicht mehr ändern.</p>
    </>
  );
}

// ================================================================ Nach dem Speichern
/** Ehrliche Bestätigung: Was ist wo gespeichert? Aktualisiert sich, wenn das Netz zurückkommt. */
function Fertig({
  proofKey,
  outcome,
  title,
  subtitle,
  what,
  backTo,
}: {
  proofKey: string;
  outcome: SubmitOutcome;
  title: string;
  subtitle: string;
  what: string;
  backTo: string;
}) {
  const { waiting } = useProofSync();
  const queued = outcome.result !== 'synced';
  const still = waiting.find((p) => p.key === proofKey);
  const stillWaiting = queued && !!still;
  const rejected = stillWaiting ? (still.lastError ?? null) : null;
  const proofOnServer = !stillWaiting || still.sent;
  const waitIcon = stillWaiting && !proofOnServer;

  return (
    <div className="ez ez-done">
      <div className={`ez-done-icon${waitIcon || rejected ? ' wait' : ''}`} aria-hidden>
        {waitIcon ? <CloudOff /> : rejected ? <TriangleAlert /> : <Check />}
      </div>
      <h1>{waitIcon ? 'Auf dem Gerät gesichert' : rejected && !proofOnServer ? 'Noch nicht auf dem Server' : title}</h1>
      <p className="muted">{subtitle}</p>

      {rejected ? (
        <div className="error-box" style={{ textAlign: 'left' }}>
          <TriangleAlert className="i" aria-hidden />{' '}
          {proofOnServer
            ? `Die ${what} ist gespeichert, aber die neue Frist wurde vom Server nicht angenommen: ${rejected}`
            : `Vom Server nicht angenommen: ${rejected}`}
          <br />
          Alles liegt auf diesem Gerät und wird automatisch erneut gesendet. Bleibt es dabei, bitte support@dexware.app melden.
        </div>
      ) : stillWaiting ? (
        <div className="info-box" style={{ textAlign: 'left' }}>
          {proofOnServer ? (
            <>Die {what} ist übertragen — nur die neue Frist fehlt noch und wird automatisch nachgezogen.</>
          ) : outcome.onDevice ? (
            <>
              Gerade keine Verbindung. Die {what} liegt sicher auf diesem Gerät und wird automatisch übertragen, sobald
              wieder Empfang da ist — das Datum bleibt das von heute. Bitte diese Seite später noch einmal öffnen, bis
              nichts mehr wartet.
            </>
          ) : (
            <>
              Gerade keine Verbindung — und dieser Browser erlaubt kein dauerhaftes Speichern (privates Surfen?).
              <b> Bitte diese Seite offen lassen</b>, bis die {what} übertragen ist.
            </>
          )}
        </div>
      ) : (
        <p>Nachweis gespeichert — mit Datum und Namen, nicht mehr änderbar.</p>
      )}

      <div className="ez-actions">
        <Link to={backTo} className="btn ez-big">
          Fertig
        </Link>
      </div>
    </div>
  );
}
