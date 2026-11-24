// ObjektDex — „Leistungen für mehrere Objekte auf einmal“ (Plan dexware-suite/docs/ganzjahr-2026-11-24.md, Punkt 5).
// Als eigene Seite (Objektliste → …/objekte/leistungen) und nach der Übernahme aus WinterDex (mit den neuen Objekten
// vorgewählt). Objekte wählen, Vorlagen-Chips mit Turnus (Vorlagen und Turnus-Modell wie die App: types.ts
// SERVICE_TEMPLATES, service.cadence/weekdays/month_day), anlegen. Läuft die Leistung am Objekt schon (gleiche Vorlage
// oder gleicher Name), wird sie übersprungen. Nur der Inhaber (RLS service_insert). Pausierte Objekte stehen nicht zur
// Wahl (eine Objekt-Pause beendet seine Leistungen).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Upload } from 'lucide-react';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { insertInChunks, type InsertFailure } from '../../lib/tableImport';
import { useOd } from '../context';
import { CADENCE_LABELS, cadenceText, formatDay, parseGermanDay, todayBerlin, WEEKDAY_SHORT, type Cadence } from '../turnus';
import { SERVICE_TEMPLATES, type OdProperty, type OdService } from '../types';
import { planLeistungen, vorlageFehler, type VorlageWahl } from '../uebernahme';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
const STRIP = /^[^:]+ konnten nicht angelegt werden: /;
/** „Sonstiges“ ohne eigenen Namen ergibt keine sinnvolle Leistung für viele Objekte */
const VORLAGEN = SERVICE_TEMPLATES.filter((t) => t.key !== 'other');

const vorlageAus = (key: string): VorlageWahl => {
  const t = VORLAGEN.find((x) => x.key === key)!;
  return { key: t.key, name: t.name, cadence: t.cadence, weekdays: [...t.weekdays], monthDay: t.cadence === 'monthly' ? (t.monthDay ?? 1) : null };
};

/** Seite …/objekte/leistungen */
export function LeistungenSeite() {
  const { base } = useOd();
  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to={`${base}/objekte`}>← Objekte</Link>
      </p>
      <h1>Leistungen für mehrere Objekte</h1>
      <LeistungenSammel />
    </>
  );
}

/**
 * Baustein (Seite und Übernahme): `vorauswahl` = ObjektDex-ids, die angehakt starten (z. B. gerade übernommene Objekte).
 */
export function LeistungenSammel({ vorauswahl }: { vorauswahl?: readonly string[] }) {
  const { data, role, base } = useOd();
  const state = useAsync(async () => {
    const [props, services] = await Promise.all([data.listProperties(), data.listServices()]);
    return { props: props.filter((p) => p.active), services };
  }, [data]);
  if (role !== 'owner') return <div className="info-box">Leistungen legt in ObjektDex nur der Inhaber an.</div>;
  return (
    <>
      <p className="muted" style={{ marginTop: -6 }}>
        Eine oder mehrere Leistungen mit Turnus für alle gewählten Objekte anlegen. Läuft die Leistung an einem Objekt schon, wird sie
        dort übersprungen.
      </p>
      <LoadGuard state={state}>
        {({ props, services }) =>
          props.length === 0 ? (
            <div className="card empty">
              Noch keine aktiven Objekte. <Link to={`${base}/objekte`}>Objekte anlegen</Link>
            </div>
          ) : (
            <Formular props={props} services={services} vorauswahl={vorauswahl} onSaved={state.refresh} />
          )
        }
      </LoadGuard>
    </>
  );
}

interface Ergebnis {
  angelegt: number;
  doppelt: number;
  failed: InsertFailure[];
}

function Formular({
  props,
  services,
  vorauswahl,
  onSaved,
}: {
  props: OdProperty[];
  services: OdService[];
  vorauswahl?: readonly string[];
  onSaved: () => void;
}) {
  const { data, base } = useOd();
  const today = todayBerlin();
  const [objekte, setObjekte] = useState<Set<string>>(() => new Set((vorauswahl ?? []).filter((id) => props.some((p) => p.id === id))));
  const [vorlagen, setVorlagen] = useState<VorlageWahl[]>([]);
  const [start, setStart] = useState(formatDay(today));
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  useUnsavedGuard(!!busy, 'Die Leistungen werden noch angelegt. Trotzdem verlassen? Schon Angelegtes bleibt — beim nächsten Mal wird es übersprungen.');
  const startDay = parseGermanDay(start);
  const fehlerVorlage = vorlagen.map(vorlageFehler).find(Boolean) ?? null;
  const vorschau = useMemo(
    () => planLeistungen({ objektIds: [...objekte], vorlagen, vorhandene: services, startOn: startDay ?? today, neueId: () => '' }),
    [objekte, vorlagen, services, startDay, today],
  );
  const zahl = (pid: string) => services.filter((s) => s.property_id === pid && s.active).length;
  const alle = props.length > 0 && props.every((p) => objekte.has(p.id));

  function chip(key: string) {
    setErgebnis(null);
    setVorlagen((v) => (v.some((x) => x.key === key) ? v.filter((x) => x.key !== key) : [...v, vorlageAus(key)]));
  }
  const aendern = (key: string | null, patch: Partial<VorlageWahl>) => setVorlagen((v) => v.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function anlegen() {
    setFehler(null);
    setErgebnis(null);
    if (!startDay) return setFehler('„Gilt ab“ bitte als TT.MM.JJJJ eingeben.');
    if (fehlerVorlage) return setFehler(fehlerVorlage);
    setBusy({ done: 0, total: 0 });
    try {
      // frisch: inzwischen angelegte Leistungen (anderer Tab, App) nicht doppelt
      const frisch = await data.listServices();
      const plan = planLeistungen({ objektIds: [...objekte], vorlagen, vorhandene: frisch, startOn: startDay, neueId: () => crypto.randomUUID() });
      const res = await insertInChunks(
        plan.zeilen,
        (part) => data.createServices(part),
        (z) => ({ line: 0, name: `${z.name} · ${props.find((p) => p.id === z.property_id)?.name ?? ''}` }),
        { strip: STRIP, progress: (done) => setBusy({ done, total: plan.zeilen.length }) },
      );
      setErgebnis({ angelegt: res.ok.length, doppelt: plan.doppelt, failed: res.failed });
      if (res.ok.length) {
        setVorlagen([]);
        onSaved();
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wd-imp">
      <div className="section-head">
        <h2>1. Objekte</h2>
      </div>
      <div className="table-wrap wd-imp-table">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Alle Objekte anhaken"
                  title="Alle Objekte anhaken"
                  checked={alle}
                  disabled={!!busy}
                  onChange={(e) => setObjekte(e.target.checked ? new Set(props.map((p) => p.id)) : new Set())}
                />
              </th>
              <th>Objekt</th>
              <th>Leistungen</th>
            </tr>
          </thead>
          <tbody>
            {props.map((p) => {
              const an = objekte.has(p.id);
              const n = zahl(p.id);
              return (
                <tr key={p.id} className={an ? undefined : 'wd-imp-off'}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${p.name} wählen`}
                      checked={an}
                      disabled={!!busy}
                      onChange={(e) =>
                        setObjekte((s) => {
                          const x = new Set(s);
                          if (e.target.checked) x.add(p.id);
                          else x.delete(p.id);
                          return x;
                        })
                      }
                    />
                  </td>
                  <td className="wrap">
                    <b>{p.name}</b>
                    <span className="wd-imp-sub">{p.address || 'ohne Adresse'}</span>
                  </td>
                  <td>{n ? n : <span className="badge amber">keine</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <h2>2. Leistungen</h2>
      </div>
      <div className="card">
        <div className="od-chips" style={{ marginTop: 0 }}>
          {VORLAGEN.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`od-chip ${vorlagen.some((v) => v.key === t.key) ? 'on' : ''}`}
              aria-pressed={vorlagen.some((v) => v.key === t.key)}
              disabled={!!busy}
              onClick={() => chip(t.key)}
            >
              {t.name}
            </button>
          ))}
        </div>
        {vorlagen.length === 0 && <p className="muted small" style={{ marginBottom: 0 }}>Vorlagen antippen — der Turnus lässt sich danach je Leistung anpassen.</p>}
        {vorlagen.map((v) => (
          <TurnusZeile key={v.key ?? v.name} v={v} onChange={(patch) => aendern(v.key, patch)} />
        ))}
        <label className="field" style={{ maxWidth: 220, marginTop: 14, marginBottom: 0 }}>
          Gilt ab
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="TT.MM.JJJJ" inputMode="numeric" />
        </label>
      </div>

      <div className="section-head">
        <h2>3. Anlegen</h2>
      </div>
      <div className="card">
        {objekte.size > 0 && vorlagen.length > 0 && (
          <p style={{ marginTop: 0 }}>
            {plural(vorschau.zeilen.length, 'Leistung wird', 'Leistungen werden')} angelegt
            {vorschau.doppelt > 0 && ` — ${plural(vorschau.doppelt, 'läuft', 'laufen')} schon und ${vorschau.doppelt === 1 ? 'wird' : 'werden'} übersprungen`}.
          </p>
        )}
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!!busy || vorschau.zeilen.length === 0 || !startDay || !!fehlerVorlage}
            onClick={() => void anlegen()}
          >
            <Upload className="i" aria-hidden /> {plural(vorschau.zeilen.length, 'Leistung', 'Leistungen')} anlegen
          </button>
          {!busy && (objekte.size === 0 || vorlagen.length === 0) && (
            <span className="small muted">{objekte.size === 0 ? 'Bitte Objekte anhaken.' : 'Bitte Leistungen wählen.'}</span>
          )}
        </div>
        {!startDay && <div className="error-box">„Gilt ab“ bitte als TT.MM.JJJJ eingeben.</div>}
        {fehlerVorlage && <div className="error-box">{fehlerVorlage}</div>}
        {busy && busy.total > 0 && (
          <div className="wd-imp-progress" role="status">
            <div className="wd-imp-bar">
              <span style={{ width: `${Math.round((Math.min(busy.done, busy.total) / busy.total) * 100)}%` }} />
            </div>
            <span className="small">
              Leistungen werden angelegt … {Math.min(busy.done, busy.total)} von {busy.total}
            </span>
          </div>
        )}
        {fehler && <div className="error-box">{fehler}</div>}
        {ergebnis && (
          <div className="wd-imp-result" role="status">
            <p className="wd-imp-result-head">
              {ergebnis.angelegt > 0 && <CheckCircle2 className="i" aria-hidden />}
              {plural(ergebnis.angelegt, 'Leistung', 'Leistungen')} angelegt
              {ergebnis.failed.length > 0 && `, ${ergebnis.failed.length} nicht`}.
            </p>
            {ergebnis.doppelt > 0 && <p className="small muted">{plural(ergebnis.doppelt, 'Leistung lief', 'Leistungen liefen')} schon und {ergebnis.doppelt === 1 ? 'wurde' : 'wurden'} übersprungen.</p>}
            {ergebnis.failed.length > 0 && (
              <ul className="small">
                {ergebnis.failed.slice(0, 10).map((f, k) => (
                  <li key={k}>
                    {f.name}: {f.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <Link className="btn small" to={`${base}/objekte`}>
                Zu den Objekten
              </Link>
              <Link className="btn ghost small" to={base}>
                Zu „Heute“
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Turnus einer gewählten Vorlage — dieselben Chips wie im Formular „Leistung anlegen“. */
function TurnusZeile({ v, onChange }: { v: VorlageWahl; onChange: (patch: Partial<VorlageWahl>) => void }) {
  const woche = v.cadence === 'weekly' || v.cadence === 'biweekly';
  return (
    <div className="od-preview" style={{ marginTop: 14, marginBottom: 0 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <b>{v.name}</b>
        <span className="muted small">{cadenceText({ cadence: v.cadence, weekdays: v.weekdays, monthDay: v.monthDay })}</span>
      </div>
      <div className="od-chips">
        {(Object.keys(CADENCE_LABELS) as Cadence[]).map((c) => (
          <button
            key={c}
            type="button"
            className={`od-chip ${v.cadence === c ? 'on' : ''}`}
            onClick={() =>
              onChange({
                cadence: c,
                weekdays: (c === 'weekly' || c === 'biweekly') && v.weekdays.length === 0 ? [1] : v.weekdays,
                monthDay: c === 'monthly' ? (v.monthDay ?? 1) : null,
              })
            }
          >
            {CADENCE_LABELS[c]}
          </button>
        ))}
      </div>
      {woche && (
        <div className="od-chips">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              className={`od-chip od-day ${v.weekdays.includes(d) ? 'on' : ''}`}
              aria-pressed={v.weekdays.includes(d)}
              onClick={() => onChange({ weekdays: v.weekdays.includes(d) ? v.weekdays.filter((x) => x !== d) : [...v.weekdays, d] })}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          ))}
        </div>
      )}
      {v.cadence === 'monthly' && (
        <div className="od-chips">
          {[1, 15].map((d) => (
            <button key={d} type="button" className={`od-chip ${v.monthDay === d ? 'on' : ''}`} onClick={() => onChange({ monthDay: d })}>
              {d}.
            </button>
          ))}
          <button type="button" className={`od-chip ${v.monthDay === 31 ? 'on' : ''}`} onClick={() => onChange({ monthDay: 31 })}>
            Monatsletzter
          </button>
        </div>
      )}
    </div>
  );
}

