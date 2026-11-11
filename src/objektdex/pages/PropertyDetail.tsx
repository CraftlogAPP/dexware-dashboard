// Objekt im Detail: Stammdaten, Leistungen mit Turnus (anlegen, ändern, beenden — nie löschen), Soll/Ist dieser Monat,
// offene Mängel, letzte Einsätze. Ändern darf nur der Inhaber (RLS prüft zusätzlich).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FormDialog, Modal, orNull, s, type FormValues } from '../../components/form';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import { DayBadge, fmtDateTimeB, SollIstBadge } from '../parts';
import {
  addDays,
  CADENCE_LABELS,
  cadenceText,
  firstOfMonth,
  formatDay,
  isDue,
  isoDow,
  nextDue,
  parseGermanDay,
  todayBerlin,
  WEEKDAY_SHORT,
  type Cadence,
} from '../turnus';
import { SERVICE_TEMPLATES, type OdProperty, type OdService } from '../types';

export function PropertyDetail() {
  const { id = '' } = useParams();
  const { data, role, base } = useOd();
  const today = todayBerlin();
  const [editing, setEditing] = useState(false);
  const [svcEdit, setSvcEdit] = useState<OdService | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useAsync(async () => {
    const [props, services, defects, ops, si, t] = await Promise.all([
      data.listProperties(),
      data.listServices(),
      data.listDefects(),
      data.listOperations({ from: addDays(today, -60), to: today, propertyId: id }),
      data.sollIst(id, firstOfMonth(today), today),
      data.todayOverview(today),
    ]);
    return {
      p: props.find((x) => x.id === id) ?? null,
      services: services.filter((x) => x.property_id === id),
      defects: defects.filter((x) => x.property_id === id && x.status === 'open'),
      ops: ops.slice(0, 10),
      si: new Map(si.map((r) => [r.service_id, r])),
      status: t.find((x) => x.property_id === id)?.status ?? 'none',
    };
  }, [data, id, today]);
  const owner = role === 'owner';

  async function toggle(fn: () => Promise<void>, ask: string) {
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      await fn();
      state.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoadGuard state={state}>
      {({ p, services, defects, ops, si, status }) =>
        !p ? (
          <div className="info-box">Objekt nicht gefunden.</div>
        ) : (
          <>
            <p className="small">
              <Link to={`${base}/objekte`}>← Objekte</Link>
            </p>
            <div className="section-head">
              <h1 style={{ margin: 0 }}>{p.name}</h1>
              <div className="spacer" />
              {p.active ? <DayBadge status={status} /> : <span className="badge">pausiert</span>}
            </div>
            <p className="muted" style={{ marginTop: -4 }}>
              {p.address || 'ohne Adresse'}
              {p.customer_name ? ` · für ${p.customer_name}` : ''}
            </p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Link className="btn small" to={`${base}/nachweis?objekt=${p.id}`}>
                Nachweis-PDF
              </Link>
              <Link className="btn ghost small" to={`${base}/soll-ist?objekt=${p.id}`}>
                Soll/Ist
              </Link>
              {owner && (
                <>
                  <Link className="btn ghost small" to={`${base}/links?objekt=${p.id}`}>
                    Auftraggeber-Link
                  </Link>
                  <button className="btn ghost small" onClick={() => setEditing(true)}>
                    Objekt bearbeiten
                  </button>
                  <button
                    className="btn ghost small"
                    disabled={busy}
                    onClick={() =>
                      void toggle(
                        () => data.setPropertyActive(p.id, !p.active),
                        p.active ? 'Objekt pausieren? Es erscheint dann nicht mehr unter „Heute“. Nachweise bleiben erhalten.' : 'Objekt wieder aktivieren?',
                      )
                    }
                  >
                    {p.active ? 'Pausieren' : 'Wieder aktivieren'}
                  </button>
                </>
              )}
            </div>

            <div className="section-head">
              <h2>Leistungen · Soll/Ist {monthName(today)}</h2>
              <div className="spacer" />
              {owner && (
                <button className="btn small" onClick={() => setSvcEdit('new')}>
                  ＋ Leistung
                </button>
              )}
            </div>
            {services.length === 0 ? (
              <div className="card empty">Noch keine Leistungen. Ohne Leistungen ist das Objekt nie „fällig“.</div>
            ) : (
              <div className="table-wrap">
                <table className="od-ops">
                  <thead>
                    <tr>
                      <th>Leistung</th>
                      <th>Turnus</th>
                      <th>Nächster Termin</th>
                      <th>Soll/Ist</th>
                      {owner && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[...services]
                      .sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort)
                      .map((sv) => {
                        const spec = { cadence: sv.cadence, weekdays: sv.weekdays, monthDay: sv.month_day, startOn: sv.start_on, endOn: sv.end_on };
                        const nd = sv.active ? nextDue(spec, today) : null;
                        const r = si.get(sv.id);
                        return (
                          <tr key={sv.id} className={sv.active ? undefined : 'od-ended'}>
                            <td className="wrap">
                              <b>{sv.name}</b>
                              {!sv.active && <div className="muted small">beendet {sv.end_on ? `am ${formatDay(sv.end_on)}` : ''}</div>}
                            </td>
                            <td className="wrap muted">{cadenceText(spec)}</td>
                            <td className="muted">{nd ? formatDay(nd) : '—'}</td>
                            <td>{r ? <SollIstBadge soll={r.soll} ist={r.ist} /> : '—'}</td>
                            {owner && (
                              <td className="od-actions">
                                {sv.active ? (
                                  <>
                                    <button className="btn ghost small" onClick={() => setSvcEdit(sv)}>
                                      Ändern
                                    </button>
                                    <button
                                      className="btn ghost small"
                                      disabled={busy}
                                      onClick={() =>
                                        void toggle(
                                          () => data.setServiceActive(sv.id, false),
                                          `„${sv.name}“ beenden? Ab heute nicht mehr fällig. Alte Nachweise behalten die Leistung.`,
                                        )
                                      }
                                    >
                                      Beenden
                                    </button>
                                  </>
                                ) : (
                                  <button className="btn ghost small" disabled={busy} onClick={() => void toggle(() => data.setServiceActive(sv.id, true), `„${sv.name}“ wieder aufnehmen?`)}>
                                    Wieder aufnehmen
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="od-two">
              <div>
                <div className="section-head">
                  <h2>Offene Mängel</h2>
                  <Link className="small" to={`${base}/maengel`}>
                    Alle →
                  </Link>
                </div>
                {defects.length === 0 ? (
                  <div className="card empty">Keine offenen Mängel.</div>
                ) : (
                  <div className="card">
                    {defects.map((d) => (
                      <div key={d.id} className="od-line">
                        <b>{d.text}</b>
                        <div className="muted small">
                          {fmtDateTimeB(d.created_at)} · {d.reporter_name ?? '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="section-head">
                  <h2>Objektdaten</h2>
                </div>
                <div className="card od-facts">
                  <Fact k="Auftraggeber" v={p.customer_name} />
                  <Fact k="Kontakt" v={p.customer_contact} />
                  <Fact k="Ansprechpartner vor Ort" v={p.contact_person} />
                  <Fact k="Notiz" v={p.notes} />
                </div>
              </div>
            </div>

            <div className="section-head">
              <h2>Letzte Einsätze</h2>
              <Link className="small" to={`${base}/einsaetze?objekt=${p.id}`}>
                Alle →
              </Link>
            </div>
            {ops.length === 0 ? (
              <div className="card empty">In den letzten 60 Tagen keine Einsätze.</div>
            ) : (
              <div className="table-wrap">
                <table className="od-ops">
                  <tbody>
                    {ops.map((o) => (
                      <tr key={o.id} className={o.canceled ? 'od-canceled' : undefined}>
                        <td>{fmtDateTimeB(o.started_at)}</td>
                        <td className="wrap">{o.canceled ? <span className="badge red">Storniert</span> : o.services.map((x) => x.name).join(' · ') || 'Kontrolle vor Ort'}</td>
                        <td className="muted">{o.performer_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editing && <PropertyDialog property={p} onClose={() => setEditing(false)} onSaved={state.reload} />}
            {svcEdit && (
              <ServiceDialog
                propertyId={p.id}
                service={svcEdit === 'new' ? null : svcEdit}
                existing={services.filter((x) => x.active).map((x) => x.template_key ?? '')}
                onClose={() => setSvcEdit(null)}
                onSaved={state.reload}
              />
            )}
          </>
        )
      }
    </LoadGuard>
  );
}

const monthName = (d: string) => new Date(`${d.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', timeZone: 'Europe/Berlin' });

function Fact({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="od-fact">
      <span className="muted small">{k}</span>
      <span>{v || '—'}</span>
    </div>
  );
}

/** Objekt anlegen/bearbeiten (Inhaber) */
export function PropertyDialog({ property, onClose, onSaved }: { property?: OdProperty; onClose: () => void; onSaved: () => void }) {
  const { data } = useOd();
  async function onSave(v: FormValues) {
    await data.saveProperty({
      id: property?.id,
      name: s(v.name),
      address: s(v.address),
      customer_name: orNull(v.customer_name),
      customer_contact: orNull(v.customer_contact),
      contact_person: orNull(v.contact_person),
      notes: orNull(v.notes),
    });
    onSaved();
  }
  return (
    <FormDialog
      title={property ? 'Objekt bearbeiten' : 'Objekt anlegen'}
      submitLabel="Speichern"
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'z. B. WEG Lindenstraße 12' },
        { key: 'address', label: 'Adresse', placeholder: 'Straße, PLZ Ort' },
        { key: 'customer_name', label: 'Auftraggeber / Hausverwaltung' },
        { key: 'customer_contact', label: 'Kontakt Auftraggeber', placeholder: 'Telefon oder E-Mail' },
        { key: 'contact_person', label: 'Ansprechpartner vor Ort' },
        { key: 'notes', label: 'Notiz', kind: 'textarea' },
      ]}
      initial={{
        name: property?.name ?? '',
        address: property?.address ?? '',
        customer_name: property?.customer_name ?? '',
        customer_contact: property?.customer_contact ?? '',
        contact_person: property?.contact_person ?? '',
        notes: property?.notes ?? '',
      }}
    />
  );
}

/** Leistung anlegen/ändern: Vorlage, Name, Turnus mit Wochentagen/Monatstag, gilt ab — mit Vorschau der nächsten Termine. */
function ServiceDialog({
  propertyId,
  service,
  existing,
  onClose,
  onSaved,
}: {
  propertyId: string;
  service: OdService | null;
  existing: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data } = useOd();
  const today = todayBerlin();
  const [template, setTemplate] = useState<string>(service?.template_key ?? '');
  const [name, setName] = useState(service?.name ?? '');
  const [cadence, setCadence] = useState<Cadence>(service?.cadence ?? 'weekly');
  const [weekdays, setWeekdays] = useState<number[]>(service?.weekdays ?? [1]);
  const [monthDay, setMonthDay] = useState<number>(service?.month_day ?? 1);
  const [start, setStart] = useState(formatDay(service?.start_on ?? today));
  const [notes, setNotes] = useState(service?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startDay = parseGermanDay(start);

  const preview = useMemo(() => {
    if (cadence === 'on_demand' || !startDay) return [];
    const spec = { cadence, weekdays, monthDay, startOn: startDay, endOn: null };
    const out: string[] = [];
    for (let i = 0; i < 400 && out.length < 5; i++) {
      const d = addDays(today, i);
      if (isDue(spec, d)) out.push(`${WEEKDAY_SHORT[isoDow(d)]} ${formatDay(d).slice(0, 6)}`);
    }
    return out;
  }, [cadence, weekdays, monthDay, startDay, today]);

  function pickTemplate(key: string) {
    setTemplate(key);
    const t = SERVICE_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setName(t.name);
    setCadence(t.cadence);
    if (t.weekdays.length) setWeekdays(t.weekdays);
    if (t.monthDay) setMonthDay(t.monthDay);
  }

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr('Bitte einen Namen eingeben.');
    if (!startDay) return setErr('„Gilt ab“ bitte als TT.MM.JJJJ eingeben.');
    if ((cadence === 'weekly' || cadence === 'biweekly') && weekdays.length === 0) return setErr('Bitte mindestens einen Wochentag wählen.');
    if (cadence === 'monthly' && (monthDay < 1 || monthDay > 31)) return setErr('Monatstag bitte zwischen 1 und 31.');
    setBusy(true);
    try {
      await data.saveService({
        id: service?.id,
        property_id: propertyId,
        template_key: template || null,
        name: name.trim(),
        cadence,
        weekdays: [...weekdays].sort((a, b) => a - b),
        month_day: cadence === 'monthly' ? monthDay : null,
        start_on: startDay,
        notes: notes.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={service ? 'Leistung ändern' : 'Leistung anlegen'} onClose={onClose}>
      {!service && (
        <div className="od-chips" style={{ marginBottom: 12 }}>
          {SERVICE_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`od-chip ${template === t.key ? 'on' : ''}`}
              disabled={existing.includes(t.key) && t.key !== 'other' && t.key !== 'special'}
              onClick={() => pickTemplate(t.key)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        Leistung
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Treppenhausreinigung" maxLength={80} />
      </label>
      <div className="field">
        Wie oft?
        <div className="od-chips">
          {(Object.keys(CADENCE_LABELS) as Cadence[]).map((c) => (
            <button key={c} type="button" className={`od-chip ${cadence === c ? 'on' : ''}`} onClick={() => setCadence(c)}>
              {CADENCE_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      {(cadence === 'weekly' || cadence === 'biweekly') && (
        <div className="field">
          An welchen Tagen?
          <div className="od-chips">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                className={`od-chip od-day ${weekdays.includes(d) ? 'on' : ''}`}
                onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
            <button type="button" className="od-chip" onClick={() => setWeekdays([1, 2, 3, 4, 5])}>
              Mo–Fr
            </button>
          </div>
        </div>
      )}
      {cadence === 'monthly' && (
        <div className="field">
          Am wievielten?
          <div className="od-chips">
            {[1, 15].map((d) => (
              <button key={d} type="button" className={`od-chip ${monthDay === d ? 'on' : ''}`} onClick={() => setMonthDay(d)}>
                {d}.
              </button>
            ))}
            <button type="button" className={`od-chip ${monthDay === 31 ? 'on' : ''}`} onClick={() => setMonthDay(31)}>
              Monatsletzter
            </button>
            <input
              type="number"
              min={1}
              max={31}
              value={monthDay}
              onChange={(e) => setMonthDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
              style={{ width: 80 }}
              aria-label="Monatstag"
            />
          </div>
        </div>
      )}
      <div className="od-preview">
        <b>{cadenceText({ cadence, weekdays, monthDay })}</b>
        <div className="muted small">{cadence === 'on_demand' ? 'Nie fällig — zählt nur, wenn erledigt.' : preview.length ? `Nächste Termine: ${preview.join(', ')}` : 'Kein Termin in Sicht.'}</div>
      </div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
          Gilt ab
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="TT.MM.JJJJ" />
        </label>
        <label className="field" style={{ flex: 2 }}>
          Notiz
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button className="btn" disabled={busy} onClick={() => void save()}>
          {busy ? 'Speichern …' : 'Speichern'}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Soll/Ist zählt ab „Gilt ab“. Endet die Leistung, bleibt sie in alten Nachweisen erhalten.
      </p>
    </Modal>
  );
}

