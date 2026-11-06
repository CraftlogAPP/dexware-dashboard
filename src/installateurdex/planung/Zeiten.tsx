// Zeiten: Arbeitszeiten je Monteur und Monat — wie App mobile/src/screens/TimesScreen.tsx (Daten: data/time.ts,
// Rechnen: lib/timeclock.ts). Arbeitszeit = Arbeit + Fahrt, ohne Pausen. Inhaber sieht alle, Monteure nur sich
// (RLS time_select in zeit.sql). Korrigieren: der Inhaber (jede fremde Korrektur vermerkt die Datenbank);
// Monteure stempeln und korrigieren in der App, weil ihre eigene Liste dort auf dem Handy liegt.

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { Modal } from '../../components/form';
import { downloadCsv, toCsv } from '../csv';
import { useInst } from '../context';
import type { Site } from '../types';
import {
  KIND_ICON,
  KIND_LABEL,
  MAX_ENTRY_MS,
  MONTHS,
  OWN_DELETE_HOURS,
  TIME_CSV_HEADER,
  WD,
  atLocal,
  breakHint,
  dayKey,
  dayOf,
  deDate,
  hhmm,
  hm,
  minutesOf,
  parseDay,
  parseHm,
  planMembers,
  timeCsvRows,
  totalsOf,
  type PlanMember,
  type TimeEntry,
  type TimeKind,
  type TimePatch,
} from './logic';
import './planung.css';

const NOTE_MAX = 300; // zeit.sql

interface Edit {
  entry: TimeEntry;
  kind: TimeKind;
  day: string;
  start: string;
  end: string;
  note: string;
}

export function Zeiten() {
  const { data, ext, org, isOwner, role } = useInst();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [person, setPerson] = useState<string>('all');
  const [edit, setEdit] = useState<Edit | null>(null);

  const monthEnd = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 1), [month]);
  const now0 = new Date();
  const thisMonth = month.getFullYear() === now0.getFullYear() && month.getMonth() === now0.getMonth();
  const land: 'AT' | 'DE' = (org as { land?: string | null }).land === 'DE' ? 'DE' : 'AT';

  const fixed = useAsync(async () => {
    const [members, me, sites] = await Promise.all([data.members(), ext.planung.myUserId(role), data.sites().catch(() => [] as Site[])]);
    return { me, team: planMembers(members, me), sites };
  }, [data, ext, role]);

  const entries = useAsync(() => ext.planung.timeEntries(month, monthEnd), [ext, month.getTime()]);
  // laufende Einträge zählen mit — still jede Minute neu laden
  useLiveRefresh([entries.refresh], 60000);

  function shiftMonth(n: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  }

  return (
    <>
      <div className="idx-head">
        <h1>Zeiten</h1>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Arbeitszeiten aus der Stempeluhr der App. Arbeitszeit = Arbeit + Fahrt, ohne Pausen.{' '}
        {isOwner
          ? 'Du siehst alle im Betrieb und kannst Einträge korrigieren — jede Korrektur wird vermerkt.'
          : 'Du siehst deine eigenen Zeiten. Stempeln und korrigieren (bis 7 Tage) geht in der App; ältere Einträge korrigiert der Inhaber.'}
      </p>

      <LoadGuard state={fixed}>
        {({ me, team, sites }) => {
          const all = entries.data ?? [];
          // Monteur: nur eigene (RLS liefert ohnehin nur diese — hier zusätzlich, auch für die Beispieldaten)
          const visible = isOwner ? all : all.filter((e) => e.user_id === me);
          const memberOf = (id: string) => team.find((m) => m.userId === id);
          const nameOf = (e: TimeEntry) => e.user_name?.trim() || memberOf(e.user_id)?.name || 'Ohne Namen';
          // Personen im Monat: Team-Reihenfolge, dann ehemalige mit Einträgen
          const people: { id: string; name: string; color?: string; m?: PlanMember }[] = [];
          // Name wie App-Teamansicht: in der App hinterlegter Name (user_name), sonst aus der E-Mail
          const appName = (id: string) => visible.find((e) => e.user_id === id && e.user_name?.trim())?.user_name?.trim();
          for (const m of team)
            if (isOwner || m.userId === me) people.push({ id: m.userId, name: appName(m.userId) ?? m.name, color: m.color, m });
          for (const e of visible)
            if (!people.some((p) => p.id === e.user_id)) people.push({ id: e.user_id, name: `${nameOf(e)} (ehemalig)` });
          const shown = person === 'all' ? visible : visible.filter((e) => e.user_id === person);
          const now = new Date();
          const sum = totalsOf(shown, now);
          const running = shown.filter((e) => !e.ended_at);
          const siteName = (id: string | null) => (id ? sites.find((s) => s.id === id)?.name : undefined);

          // Tage × Person (neueste Tage zuerst, wie App totalsByDay)
          const groups = new Map<string, { day: string; userId: string; entries: TimeEntry[] }>();
          for (const e of shown) {
            const k = `${dayOf(e.started_at)}|${e.user_id}`;
            const g = groups.get(k) ?? { day: dayOf(e.started_at), userId: e.user_id, entries: [] };
            g.entries.push(e);
            groups.set(k, g);
          }
          const order = (id: string) => {
            const i = people.findIndex((p) => p.id === id);
            return i < 0 ? 999 : i;
          };
          const dayGroups = [...groups.values()]
            .map((g) => ({ ...g, entries: g.entries.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)), t: totalsOf(g.entries, now) }))
            .sort((a, b) => b.day.localeCompare(a.day) || order(a.userId) - order(b.userId));

          const perPerson = people
            .map((p) => {
              const list = visible.filter((e) => e.user_id === p.id);
              const days = dayGroups.filter((g) => g.userId === p.id);
              return {
                ...p,
                t: totalsOf(list, now),
                days: new Set(list.map((e) => dayOf(e.started_at))).size,
                hints: days.filter((g) => breakHint(g.t, land)).length,
                running: list.some((e) => !e.ended_at),
                count: list.length,
              };
            })
            .filter((p) => p.count > 0 || isOwner);

          const label = `${String(month.getMonth() + 1).padStart(2, '0')}-${month.getFullYear()}`;
          function exportCsv() {
            const who = person === 'all' ? '' : `_${(people.find((p) => p.id === person)?.name ?? 'Person').replace(/[^\wäöüÄÖÜß-]+/g, '-')}`;
            downloadCsv(`Zeiten_${label}${who}.csv`, toCsv(TIME_CSV_HEADER, timeCsvRows(shown, nameOf, now)));
          }

          const canEdit = () => isOwner;
          const canDelete = (e: TimeEntry) =>
            !!me && e.user_id === me && Date.now() - Date.parse(e.created_at) < OWN_DELETE_HOURS * 3600_000;

          return (
            <>
              <div className="pt-toolbar">
                <div className="pt-weeknav">
                  <button type="button" className="btn ghost small" onClick={() => shiftMonth(-1)} aria-label="Voriger Monat">
                    <ChevronLeft className="i" aria-hidden />
                  </button>
                  <div className="pt-weeklabel">
                    <b>
                      {MONTHS[month.getMonth()]} {month.getFullYear()}
                    </b>
                    <span className="muted">{thisMonth ? 'dieser Monat' : `${deDate(month)} – ${deDate(new Date(monthEnd.getTime() - 86_400_000))}`}</span>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => shiftMonth(1)} disabled={thisMonth} aria-label="Nächster Monat">
                    <ChevronRight className="i" aria-hidden />
                  </button>
                  {!thisMonth && (
                    <button type="button" className="btn ghost small" onClick={() => setMonth(new Date(now0.getFullYear(), now0.getMonth(), 1))}>
                      Dieser Monat
                    </button>
                  )}
                  {entries.loading && <span className="spinner pt-spin" aria-label="Lädt" />}
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn small" onClick={exportCsv} disabled={entries.loading || shown.length === 0}>
                    <Download className="i" aria-hidden /> CSV (Excel)
                  </button>
                </div>
                {isOwner && people.length > 1 && (
                  <div className="idx-tabs pt-filter" role="tablist" aria-label="Person">
                    <button type="button" role="tab" aria-selected={person === 'all'} className={person === 'all' ? 'on' : ''} onClick={() => setPerson('all')}>
                      Alle
                    </button>
                    {people.map((p) => (
                      <button key={p.id} type="button" role="tab" aria-selected={person === p.id} className={person === p.id ? 'on' : ''} onClick={() => setPerson(p.id)}>
                        {p.color && <span className="pt-dot" style={{ background: p.color }} aria-hidden />}
                        {p.name}
                        {p.id === me ? ' (ich)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {entries.error && (
                <div>
                  <div className="error-box">{entries.error}</div>
                  <button className="btn ghost small" onClick={entries.reload}>
                    Erneut versuchen
                  </button>
                </div>
              )}

              <div className="kpi-grid">
                <div className="kpi idx-kpi-accent">
                  <div className="kpi-label">Arbeitszeit</div>
                  <div className="kpi-value">{hm(sum.paid)}</div>
                  <div className="kpi-sub">Arbeit {hm(sum.work)}</div>
                </div>
                <div className="kpi idx-kpi-amber">
                  <div className="kpi-label">davon Fahrt</div>
                  <div className="kpi-value">{hm(sum.travel)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Pausen</div>
                  <div className="kpi-value">{hm(sum.break)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Einträge</div>
                  <div className="kpi-value">{shown.length}</div>
                  <div className="kpi-sub">
                    {running.length ? `🟢 läuft gerade: ${[...new Set(running.map(nameOf))].join(', ')}` : 'nichts läuft gerade'}
                  </div>
                </div>
              </div>

              {isOwner && person === 'all' && perPerson.length > 0 && (
                <>
                  <h3 className="pt-h3">Je Person</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th className="pt-num">Tage</th>
                          <th className="pt-num">Arbeit</th>
                          <th className="pt-num">Fahrt</th>
                          <th className="pt-num">Pausen</th>
                          <th className="pt-num">Arbeitszeit</th>
                          <th>Hinweise</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perPerson.map((p) => (
                          <tr key={p.id} className="pt-click" onClick={() => setPerson(p.id)} title="Nur diese Person anzeigen">
                            <td>
                              {p.color && <span className="pt-dot" style={{ background: p.color }} aria-hidden />}
                              {p.running ? '🟢 ' : ''}
                              {p.name}
                              {p.id === me ? ' (ich)' : ''}
                            </td>
                            <td className="pt-num">{p.days}</td>
                            <td className="pt-num">{hm(p.t.work)}</td>
                            <td className="pt-num">{hm(p.t.travel)}</td>
                            <td className="pt-num">{hm(p.t.break)}</td>
                            <td className="pt-num">
                              <b>{hm(p.t.paid)}</b>
                            </td>
                            <td>{p.hints ? <span className="badge amber">☕ {p.hints}× Pause zu kurz</span> : <span className="muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <h3 className="pt-h3">Einträge</h3>
              {!entries.loading && dayGroups.length === 0 ? (
                <div className="empty">
                  {thisMonth ? 'In diesem Monat noch keine Zeiten. Die Stempeluhr ist in der App auf der Übersicht.' : 'In diesem Monat keine Zeiten.'}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="pt-times">
                    <thead>
                      <tr>
                        <th>Art</th>
                        <th>Beginn</th>
                        <th>Ende</th>
                        <th className="pt-num">Dauer</th>
                        <th>Notiz</th>
                        {isOwner && <th aria-label="Aktion" />}
                      </tr>
                    </thead>
                    <tbody>
                      {dayGroups.map((g) => {
                        const d = parseDay(g.day);
                        const hint = breakHint(g.t, land);
                        const p = people.find((x) => x.id === g.userId);
                        return (
                          <DayRows
                            key={`${g.day}|${g.userId}`}
                            title={`${WD[d.getDay()]} ${deDate(d)}${person === 'all' && isOwner ? ` · ${p?.name ?? nameOf(g.entries[0])}` : ''}`}
                            color={person === 'all' ? p?.color : undefined}
                            total={hm(g.t.paid)}
                            sub={`Fahrt ${hm(g.t.travel)} · Pausen ${hm(g.t.break)}`}
                            hint={hint}
                            cols={isOwner ? 6 : 5}
                          >
                            {g.entries.map((e) => (
                              <tr key={e.id}>
                                <td>
                                  {KIND_ICON[e.kind]} {KIND_LABEL[e.kind]}
                                </td>
                                <td>{hhmm(e.started_at)}</td>
                                <td>{e.ended_at ? (dayOf(e.ended_at) !== g.day ? `${hhmm(e.ended_at)} (+1 Tag)` : hhmm(e.ended_at)) : <span className="badge green">läuft</span>}</td>
                                <td className="pt-num">{hm(minutesOf(e, now))}</td>
                                <td className="wrap">
                                  {[e.note, siteName(e.site_id)].filter(Boolean).join(' · ') || <span className="muted">—</span>}
                                  {e.edited_at && (
                                    <span className="badge amber pt-badge" title={`Korrigiert am ${deDate(new Date(e.edited_at))} ${hhmm(e.edited_at)}`}>
                                      korrigiert
                                    </span>
                                  )}
                                </td>
                                {isOwner && (
                                  <td className="pt-num">
                                    {canEdit() && (
                                      <button
                                        type="button"
                                        className="btn ghost small"
                                        onClick={() =>
                                          setEdit({
                                            entry: e,
                                            kind: e.kind,
                                            day: dayOf(e.started_at),
                                            start: hhmm(e.started_at),
                                            end: e.ended_at ? hhmm(e.ended_at) : '',
                                            note: e.note ?? '',
                                          })
                                        }
                                        aria-label={`${KIND_LABEL[e.kind]} ${hhmm(e.started_at)} von ${nameOf(e)} korrigieren`}
                                      >
                                        <Pencil className="i" aria-hidden /> <span className="hide-sm">Korrigieren</span>
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </DayRows>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted small" style={{ marginTop: 10 }}>
                Pausen-Hinweis nach {land === 'DE' ? '§ 4 ArbZG' : '§ 11 AZG'} (Land aus den Einstellungen). Die CSV enthält genau die
                angezeigten Einträge — Spalten wie der Monatsbericht der App.
              </p>

              {edit && (
                <EditDialog
                  edit={edit}
                  setEdit={setEdit}
                  who={nameOf(edit.entry)}
                  foreign={edit.entry.user_id !== me}
                  canDelete={canDelete(edit.entry)}
                  onSave={async (patch) => {
                    await ext.planung.updateTimeEntry(edit.entry.id, patch);
                    setEdit(null);
                    entries.reload();
                  }}
                  onDelete={async () => {
                    await ext.planung.deleteTimeEntry(edit.entry.id);
                    setEdit(null);
                    entries.reload();
                  }}
                />
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}

function DayRows({
  title,
  color,
  total,
  sub,
  hint,
  cols,
  children,
}: {
  title: string;
  color?: string;
  total: string;
  sub: string;
  hint: string | null;
  cols: number;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="pt-dayrow">
        <td colSpan={cols}>
          <span className="pt-dayrow-in">
            <b>
              {color && <span className="pt-dot" style={{ background: color }} aria-hidden />}
              {title}
            </b>
            <span className="muted small">{sub}</span>
            <b className="pt-daytotal">{total}</b>
          </span>
          {hint && <span className="pt-hint">☕ {hint}</span>}
        </td>
      </tr>
      {children}
    </>
  );
}

function EditDialog({
  edit,
  setEdit,
  who,
  foreign,
  canDelete,
  onSave,
  onDelete,
}: {
  edit: Edit;
  setEdit: (fn: Edit | null | ((e: Edit | null) => Edit | null)) => void;
  who: string;
  foreign: boolean;
  canDelete: boolean;
  onSave: (patch: TimePatch) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<Edit>) => setEdit((x) => (x ? { ...x, ...p } : x));
  const running = !edit.entry.ended_at;
  const close = () => {
    if (!busy) setEdit(null);
  };

  async function save() {
    setError(null);
    // wie App TimesScreen saveEdit
    const s = parseHm(edit.start);
    const en = edit.end.trim() ? parseHm(edit.end) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.day) || !s || (edit.end.trim() && !en)) return setError('Bitte prüfen: Tag auswählen, Zeiten als HH:MM.');
    const start = atLocal(edit.day, s);
    let end = en ? atLocal(edit.day, en) : null;
    if (end && end <= start) {
      // über Mitternacht (lokal, Sommerzeit-sicher)
      const next = parseDay(edit.day);
      next.setDate(next.getDate() + 1);
      end = atLocal(dayKey(next), en!);
    }
    if (!end && !running) return setError('Bitte das Ende eintragen.');
    if (end && end.getTime() - start.getTime() > MAX_ENTRY_MS) return setError('Ein Eintrag darf höchstens 24 Stunden dauern.');
    if (!end && Date.now() - start.getTime() > MAX_ENTRY_MS) return setError('Läuft seit über 24 Stunden — bitte das Ende eintragen.');
    if (start.getTime() > Date.now()) return setError('Der Beginn liegt in der Zukunft.');
    if (edit.note.length > NOTE_MAX) return setError(`Die Notiz darf höchstens ${NOTE_MAX} Zeichen lang sein.`);
    setBusy(true);
    try {
      await onSave({ kind: edit.kind, started_at: start.toISOString(), ended_at: end ? end.toISOString() : null, note: edit.note.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setConfirmDel(false);
    }
  }

  return (
    <Modal title={`Zeit korrigieren · ${who}`} onClose={close}>
      <form
        className="pt-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!busy) void save();
        }}
      >
        {error && <div className="error-box">{error}</div>}
        <fieldset disabled={busy}>
          <div className="pt-chips" style={{ marginBottom: 12 }}>
            {(['work', 'travel', 'break'] as TimeKind[]).map((k) => (
              <button key={k} type="button" className={`pt-chip ${edit.kind === k ? 'on' : ''}`} onClick={() => set({ kind: k })}>
                {KIND_ICON[k]} {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="pt-when">
            <label className="field">
              Tag
              <input type="date" value={edit.day} onChange={(e) => set({ day: e.target.value })} required />
            </label>
            <label className="field">
              Beginn
              <input type="time" value={edit.start} onChange={(e) => set({ start: e.target.value })} required />
            </label>
            <label className="field">
              Ende
              <input type="time" value={edit.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>
          {running && <p className="muted small" style={{ marginTop: -6 }}>Der Eintrag läuft noch. Mit einem Ende wird er abgeschlossen.</p>}
          <label className="field">
            Notiz (optional)
            <input value={edit.note} maxLength={NOTE_MAX} placeholder="z. B. Baustelle Huber" onChange={(e) => set({ note: e.target.value })} />
          </label>
        </fieldset>
        <div className="info-box small">
          {foreign
            ? `Die Korrektur wird mit Zeitpunkt vermerkt und erscheint beim nächsten Öffnen der Zeiten auch auf dem Handy von ${who} (ab der App-Version mit Zeiten-Abgleich). Ändern kann ${who} den Eintrag danach nicht mehr.`
            : 'Gilt hier, in der Team-Ansicht und — beim nächsten Öffnen der Zeiten — auch in deiner Liste auf dem Handy (ab der App-Version mit Zeiten-Abgleich).'}
        </div>
        <div className="row pt-actions">
          {canDelete &&
            (confirmDel ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="small">Wirklich löschen?</span>
                <button type="button" className="btn small pt-danger" onClick={() => void remove()} disabled={busy}>
                  Ja, löschen
                </button>
                <button type="button" className="btn ghost small" onClick={() => setConfirmDel(false)} disabled={busy}>
                  Nein
                </button>
              </span>
            ) : (
              <button type="button" className="btn ghost small pt-danger-text" onClick={() => setConfirmDel(true)} disabled={busy}>
                Löschen
              </button>
            ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>
            Abbrechen
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
