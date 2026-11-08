// Zeiten = Zeitbuch (Arbeitszeitbuch) je Monteur und Monat — wie App mobile/src/screens/ZeitbuchScreen.tsx (Daten:
// data/time.ts, Rechnen: lib/timeclock.ts; Regeln fürs Portal in ./zeitbuch.ts). Je Block: Kunde oder Ort
// (Werkstatt/Lager, Büro, Heimarbeit, Sonstiges), Tätigkeit, Pause. Arbeitszeit = Dauer ohne Pausen; Fahrt gehört zur
// Kundenzeit (alte Fahrt-/Pausen-Einträge bleiben lesbar). Inhaber sieht alle, Monteure nur sich (RLS time_select in
// zeit.sql). Korrigieren: der Inhaber (jede fremde Korrektur vermerkt die Datenbank); Monteure stempeln in der App.

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Clock, Download, Pencil } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { Modal } from '../../components/form';
import { downloadCsv, toCsv } from '../csv';
import { useInst } from '../context';
import { PrintButton } from '../parts';
import { TIME_NOT_DELETED } from './data';
import type { Site } from '../types';
import {
  KIND_ICON,
  KIND_LABEL,
  MAX_ENTRY_MS,
  MONTHS,
  OWN_DELETE_HOURS,
  OWN_RUNNING_DISCARD_DAYS,
  WD,
  atLocal,
  dayKey,
  dayOf,
  deDate,
  hhmm,
  hm,
  parseDay,
  parseHm,
  planMembers,
  type PlanMember,
  type TimeEntry,
  type TimeKind,
  type TimePatch,
} from './logic';
import {
  NOTE_MAX,
  PLACES,
  ZEITBUCH_CSV_HEADER,
  holidays,
  lawLandOf,
  lawName,
  activityOf,
  buildNote,
  byWhere,
  lawHintsByDay,
  netMinutes,
  parseNote,
  pauseOf,
  MAX_WEEK_MINUTES,
  parseWeekHours,
  sollUntilToday,
  targetLabel,
  targetOf,
  type WorkTarget,
  whereLabel,
  zTotals,
  zeitbuchCsvRows,
  type Place,
} from './zeitbuch';
import { buildArbeitszeitbuchHtml, buildStundenzettelHtml } from './zeitbuchDruck';
import './planung.css';

interface Edit {
  entry: TimeEntry;
  kind: TimeKind;
  day: string;
  start: string;
  end: string;
  /** '' = ohne Zuordnung, 'site:<id>', 'place:<ort>' */
  where: string;
  text: string;
  pause: string;
}

const whereOf = (e: TimeEntry) => (e.site_id ? `site:${e.site_id}` : parseNote(e.note).place ? `place:${parseNote(e.note).place}` : '');

export function Zeiten() {
  const { data, ext, org, can, role } = useInst();
  // „Zeiten aller“: Inhaber, Stellvertreter oder Recht „zeiten“ (NACHTRAG-TEAMRECHTE) — sonst nur die eigenen
  const allTimes = can('zeiten');
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [person, setPerson] = useState<string>('all');
  const [edit, setEdit] = useState<Edit | null>(null);
  // Sollzeit setzen (Inhaber, Tabelle „Je Person“)
  const [sollFor, setSollFor] = useState<{ id: string; name: string } | null>(null);

  const monthEnd = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 1), [month]);
  const now0 = new Date();
  const thisMonth = month.getFullYear() === now0.getFullYear() && month.getMonth() === now0.getMonth();
  const land = lawLandOf((org as { land?: string | null }).land);
  const hol = useMemo(() => holidays(month.getFullYear(), land, org.region), [month, land, org.region]);
  const monthTitle = `${land === 'AT' && month.getMonth() === 0 ? 'Jänner' : MONTHS[month.getMonth()]} ${month.getFullYear()}`;

  const fixed = useAsync(async () => {
    const [members, me, sites] = await Promise.all([data.members(), ext.planung.myUserId(role), data.sites().catch(() => [] as Site[])]);
    return { me, team: planMembers(members, me), sites };
  }, [data, ext, role]);

  const entries = useAsync(() => ext.planung.timeEntries(month, monthEnd), [ext, month.getTime()]);
  // Sollzeiten (SQL vom 07.11.) — fehlt die Tabelle noch oder schlägt das Laden fehl, bleibt Soll/Saldo einfach weg
  const targets = useAsync(() => ext.planung.timeTargets().catch(() => null), [ext]);
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
        Das Zeitbuch aus der App: je Block Kunde oder Ort, Tätigkeit und Pause. Arbeitszeit = Dauer ohne Pausen, die Fahrt zum Kunden zählt mit.{' '}
        {allTimes
          ? 'Du siehst alle im Betrieb und kannst Einträge korrigieren — jede Korrektur wird vermerkt.'
          : 'Du siehst deine eigenen Zeiten. Stempeln und korrigieren (bis 7 Tage zurück) geht in der App; ältere Einträge korrigiert der Inhaber.'}
      </p>

      <LoadGuard state={fixed}>
        {({ me, team, sites }) => {
          const all = entries.data ?? [];
          // Monteur: nur eigene (RLS liefert ohnehin nur diese — hier zusätzlich, auch für die Beispieldaten)
          const visible = allTimes ? all : all.filter((e) => e.user_id === me);
          const memberOf = (id: string) => team.find((m) => m.userId === id);
          // Wer es war, kommt aus der Mitgliederliste (user_id → Konto). Der Freitext user_name stammt vom Handy und ist
          // frei wählbar — nur Rückfall für ehemalige Mitglieder, sonst könnte jemand Zeiten unter fremdem Namen führen.
          const nameOf = (e: TimeEntry) => memberOf(e.user_id)?.name || e.user_name?.trim() || 'Ohne Namen';
          const siteName = (id: string) => sites.find((s) => s.id === id)?.name;
          // Personen im Monat: Team-Reihenfolge, dann ehemalige mit Einträgen
          const people: { id: string; name: string; color?: string; m?: PlanMember }[] = [];
          for (const m of team)
            if (allTimes || m.userId === me) people.push({ id: m.userId, name: m.name, color: m.color, m });
          for (const e of visible)
            if (!people.some((p) => p.id === e.user_id)) people.push({ id: e.user_id, name: `${nameOf(e)} (ehemalig)` });
          const shown = person === 'all' ? visible : visible.filter((e) => e.user_id === person);
          const now = new Date();
          const sum = zTotals(shown, now);
          const running = shown.filter((e) => !e.ended_at);
          const groupsWhere = byWhere(shown, nameOf, now);
          const atCustomers = groupsWhere.filter((g) => g.siteId).reduce((s, g) => s + g.minutes, 0);

          // Hinweise je Person und Tag (Pause, Höchstgrenze, Ruhezeit)
          const hintsByPerson = new Map<string, Map<string, string[]>>();
          for (const p of people) hintsByPerson.set(p.id, lawHintsByDay(visible.filter((e) => e.user_id === p.id), land, now));

          // Tage × Person (neueste Tage zuerst, wie App)
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
            .map((g) => ({ ...g, entries: g.entries.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)), t: zTotals(g.entries, now) }))
            .sort((a, b) => b.day.localeCompare(a.day) || order(a.userId) - order(b.userId));

          const targetList = targets.data ?? null;
          const hasTargets = !!targetList?.some((t) => targetOf(t));
          // Sollzeit setzen: nur Inhaber und nur, wenn die Tabelle time_target schon da ist (SQL vom 07.11.)
          const canSetTargets = allTimes && targetList !== null;
          // „In Rechnung übernommen“ kennt der Server erst mit der SQL vom 07.11. — vorher keine Spalte
          const billedKnown = all.some((e) => e.billed_at !== undefined);
          const perPerson = people
            .map((p) => {
              const list = visible.filter((e) => e.user_id === p.id);
              const tgt = targetOf(targetList?.find((t) => t.user_id === p.id));
              const t = zTotals(list, now);
              const soll = tgt ? sollUntilToday(tgt, month, monthEnd, list, hol, now) : null;
              return {
                ...p,
                t,
                soll,
                saldo: soll === null ? null : t.paid - soll,
                // Arbeitstage = Tage mit Arbeitszeit > 0 (wie App)
                days: new Set(list.filter((e) => netMinutes(e, now) > 0).map((e) => dayOf(e.started_at))).size,
                hints: hintsByPerson.get(p.id)?.size ?? 0,
                running: list.some((e) => !e.ended_at),
                count: list.length,
              };
            })
            .filter((p) => p.count > 0 || allTimes);

          const label = `${String(month.getMonth() + 1).padStart(2, '0')}-${month.getFullYear()}`;
          function exportCsv() {
            const who = person === 'all' ? '' : `_${(people.find((p) => p.id === person)?.name ?? 'Person').replace(/[^\wäöüÄÖÜß-]+/g, '-')}`;
            downloadCsv(`Zeitbuch_${label}${who}.csv`, toCsv(ZEITBUCH_CSV_HEADER, zeitbuchCsvRows(shown, nameOf, siteName, now)));
          }
          const bookPeople = () =>
            people
              .filter((p) => person === 'all' || p.id === person)
              .map((p) => ({ name: p.name, entries: visible.filter((e) => e.user_id === p.id) }))
              .filter((p) => p.entries.length > 0);

          const canEdit = () => allTimes;
          // Wie RLS time_delete (NACHTRAG-TEAMRECHTE): nie abgerechnete; mit „Zeiten aller“ jede; eigene bis 24 h nach dem
          // Anlegen oder solange der Block noch läuft (bis 8 Tage) — nicht, wenn der Inhaber sie korrigiert hat.
          const canDelete = (e: TimeEntry) =>
            !e.billed_at &&
            (allTimes ||
              (!!me && e.user_id === me &&
                (Date.now() - Date.parse(e.created_at) < OWN_DELETE_HOURS * 3600_000 || (!e.ended_at && Date.now() - Date.parse(e.started_at) < OWN_RUNNING_DISCARD_DAYS * 86_400_000)) &&
                (!e.edited_by || e.edited_by === e.user_id)));
          // Server lehnt ab → genauer Grund statt der allgemeinen Meldung
          const deleteRefused = (e: TimeEntry) =>
            e.billed_at
              ? 'Diese Zeit ist schon in eine Rechnung übernommen — sie bleibt als Nachweis stehen und lässt sich nur noch korrigieren.'
              : e.user_id !== me
                ? 'Zeiten anderer verwerfen geht mit dem nächsten Server-Update (Team-Rechte). Bis dahin bitte den Eintrag korrigieren.'
                : e.edited_by && e.edited_by !== e.user_id
                  ? 'Diesen Eintrag hat der Inhaber korrigiert — er bleibt als Nachweis stehen.'
                  : !e.ended_at
                    ? 'Ein laufender Block lässt sich nach 24 Stunden erst mit dem nächsten Server-Update verwerfen. Bis dahin bitte ein Ende eintragen und korrigieren.'
                    : 'Löschen geht nur bis 24 Stunden nach dem Anlegen. Bitte den Eintrag stattdessen korrigieren.';
          const discard = async (e: TimeEntry) => {
            try {
              await ext.planung.deleteTimeEntry(e.id);
            } catch (err) {
              if (err instanceof Error && err.message === TIME_NOT_DELETED) throw new Error(`Zeit nicht gelöscht: ${deleteRefused(e)}`);
              throw err;
            }
          };
          // Mitarbeiter ohne „Zeiten aller“: nur ihr eigener laufender Block bekommt hier einen Knopf (verwerfen)
          const actionCol = allTimes || shown.some((e) => !e.ended_at && e.user_id === me && canDelete(e));
          const openEdit = (e: TimeEntry) => {
            const n = parseNote(e.note);
            setEdit({
              entry: e,
              kind: e.kind,
              day: dayOf(e.started_at),
              start: hhmm(e.started_at),
              end: e.ended_at ? hhmm(e.ended_at) : '',
              where: whereOf(e),
              text: n.text,
              pause: n.pauseMin ? String(n.pauseMin) : '',
            });
          };

          return (
            <>
              <div className="pt-toolbar">
                <div className="pt-weeknav">
                  <button type="button" className="btn ghost small" onClick={() => shiftMonth(-1)} aria-label="Voriger Monat">
                    <ChevronLeft className="i" aria-hidden />
                  </button>
                  <div className="pt-weeklabel">
                    <b>{monthTitle}</b>
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
                  <PrintButton
                    label={person === 'all' && allTimes ? 'Arbeitszeitbuch (alle) drucken / PDF' : 'Arbeitszeitbuch drucken / PDF'}
                    build={async () => {
                      const ppl = bookPeople();
                      if (!ppl.length) throw new Error('In diesem Monat gibt es noch keine Zeiten.');
                      return buildArbeitszeitbuchHtml({ org, month, people: ppl, land, siteName });
                    }}
                  />
                  <button type="button" className="btn ghost small" onClick={exportCsv} disabled={entries.loading || shown.length === 0}>
                    <Download className="i" aria-hidden /> CSV (Excel)
                  </button>
                </div>
                {allTimes && people.length > 1 && (
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
                  <div className="kpi-sub">ohne Pausen</div>
                </div>
                <div className="kpi idx-kpi-amber">
                  <div className="kpi-label">bei Kunden</div>
                  <div className="kpi-value">{hm(atCustomers)}</div>
                  <div className="kpi-sub">{groupsWhere.filter((g) => g.siteId).length} Kunden</div>
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

              {allTimes && person === 'all' && perPerson.length > 0 && (
                <>
                  <h3 className="pt-h3">Je Person</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th className="pt-num">Tage</th>
                          <th className="pt-num">Pausen</th>
                          <th className="pt-num">Arbeitszeit</th>
                          {hasTargets && <th className="pt-num" title="Sollzeit bis heute (heute erst nach Feierabend voll), ohne Feiertage">Soll</th>}
                          {hasTargets && <th className="pt-num">Saldo</th>}
                          <th>Hinweise</th>
                          {canSetTargets && <th>Sollzeit</th>}
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
                            <td className="pt-num">{hm(p.t.break)}</td>
                            <td className="pt-num">
                              <b>{hm(p.t.paid)}</b>
                            </td>
                            {hasTargets && <td className="pt-num">{p.soll === null ? <span className="muted">—</span> : hm(p.soll)}</td>}
                            {hasTargets && (
                              <td className="pt-num">
                                {p.saldo === null ? (
                                  <span className="muted">—</span>
                                ) : (
                                  <span style={{ color: p.saldo < 0 ? '#fca5a5' : p.saldo > 0 ? '#86efac' : undefined }}>
                                    {p.saldo < 0 ? '−' : p.saldo > 0 ? '+' : '±'}
                                    {hm(Math.abs(p.saldo))}
                                  </span>
                                )}
                              </td>
                            )}
                            <td>{p.hints ? <span className="badge amber">⚠ an {p.hints} {p.hints === 1 ? 'Tag' : 'Tagen'}</span> : <span className="muted">—</span>}</td>
                            {canSetTargets && (
                              <td className="pt-soll-cell">
                                {/* nur aktuelle Mitglieder — für ehemalige lehnt der Server ab (time_target_guard) */}
                                {p.m ? (
                                  <span className="pt-soll">
                                    <span className="muted small">{targetLabel(targetOf(targetList?.find((t) => t.user_id === p.id)))}</span>
                                    <button
                                      type="button"
                                      className="btn ghost small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSollFor({ id: p.id, name: p.name });
                                      }}
                                      aria-label={`Sollzeit für ${p.name} festlegen`}
                                    >
                                      <Clock className="i" aria-hidden /> Sollzeit
                                    </button>
                                  </span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {groupsWhere.length > 0 && (
                <>
                  <h3 className="pt-h3">Je Kunde / Ort</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Kunde / Ort</th>
                          <th className="pt-num">Tage</th>
                          <th>Wer</th>
                          <th className="pt-num">Stunden</th>
                          {billedKnown && <th title="In der App in eine Rechnung übernommen">Abgerechnet</th>}
                          <th aria-label="Stundenzettel" />
                        </tr>
                      </thead>
                      <tbody>
                        {groupsWhere.map((g) => {
                          const w = whereLabel(g.entries[0], siteName);
                          const site = g.siteId ? sites.find((s) => s.id === g.siteId) : undefined;
                          return (
                            <tr key={g.key}>
                              <td>
                                {w.icon} {w.label}
                                {site?.address ? <div className="muted small">{site.address}</div> : null}
                              </td>
                              <td className="pt-num">{g.days.size}</td>
                              <td className="wrap">{[...g.people].join(', ')}</td>
                              <td className="pt-num">
                                <b>{hm(g.minutes)}</b>
                              </td>
                              {billedKnown && (
                                <td>
                                  {(() => {
                                    const done = g.entries.filter((e) => e.kind !== 'break' && e.ended_at);
                                    const n = done.filter((e) => e.billed_at).length;
                                    if (!g.siteId || !done.length) return <span className="muted">—</span>;
                                    if (n === 0) return <span className="muted">offen</span>;
                                    if (n === done.length) return <span className="badge green">✓ alle</span>;
                                    return <span className="badge amber">{n} von {done.length}</span>;
                                  })()}
                                </td>
                              )}
                              <td className="pt-num">
                                <PrintButton
                                  label="Stundenzettel"
                                  build={async () => buildStundenzettelHtml({ org, label: w.label, address: site?.address, entries: g.entries, nameOf })}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <h3 className="pt-h3">Einträge</h3>
              {!entries.loading && dayGroups.length === 0 ? (
                <div className="empty">
                  {thisMonth ? 'In diesem Monat noch keine Zeiten. Gestempelt wird in der App (Tab „Zeit“ oder oben auf „Heute“).' : 'In diesem Monat keine Zeiten.'}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="pt-times">
                    <thead>
                      <tr>
                        <th>Beginn</th>
                        <th>Ende</th>
                        <th className="pt-num">Pause</th>
                        <th className="pt-num">Zeit</th>
                        <th>Kunde / Ort</th>
                        <th>Tätigkeit</th>
                        {actionCol && <th aria-label="Aktion" />}
                      </tr>
                    </thead>
                    <tbody>
                      {dayGroups.map((g) => {
                        const d = parseDay(g.day);
                        const hints = hintsByPerson.get(g.userId)?.get(g.day) ?? null;
                        const p = people.find((x) => x.id === g.userId);
                        return (
                          <DayRows
                            key={`${g.day}|${g.userId}`}
                            title={`${WD[d.getDay()]} ${deDate(d)}${hol.get(g.day) ? ` · ★ ${hol.get(g.day)}` : ''}${person === 'all' && allTimes ? ` · ${p?.name ?? nameOf(g.entries[0])}` : ''}`}
                            color={person === 'all' ? p?.color : undefined}
                            total={hm(g.t.paid)}
                            sub={`Pausen ${hm(g.t.break)}`}
                            hints={hints}
                            cols={actionCol ? 7 : 6}
                          >
                            {g.entries.map((e) => {
                              const w = whereLabel(e, siteName);
                              const pz = pauseOf(e, now);
                              return (
                                <tr key={e.id}>
                                  <td>{hhmm(e.started_at)}</td>
                                  <td>{e.ended_at ? (dayOf(e.ended_at) !== g.day ? `${hhmm(e.ended_at)} (+1 Tag)` : hhmm(e.ended_at)) : <span className="badge green">läuft</span>}</td>
                                  <td className="pt-num">{e.kind === 'break' ? `${KIND_ICON.break} Pause` : pz ? `${pz} min` : <span className="muted">—</span>}</td>
                                  <td className="pt-num">{e.kind === 'break' ? '' : hm(netMinutes(e, now))}</td>
                                  <td>
                                    {e.kind === 'travel' ? `${KIND_ICON.travel} ` : ''}
                                    {w.icon} {w.label}
                                  </td>
                                  <td className="wrap">
                                    {activityOf(e) || <span className="muted">—</span>}
                                    {e.edited_at && (
                                      <span className="badge amber pt-badge" title={`Korrigiert am ${deDate(new Date(e.edited_at))} ${hhmm(e.edited_at)}`}>
                                        korrigiert
                                      </span>
                                    )}
                                  </td>
                                  {actionCol && (
                                    <td className="pt-num">
                                      {canEdit() ? (
                                        <button
                                          type="button"
                                          className="btn ghost small"
                                          onClick={() => openEdit(e)}
                                          aria-label={`${hhmm(e.started_at)} von ${nameOf(e)} korrigieren`}
                                        >
                                          <Pencil className="i" aria-hidden /> <span className="hide-sm">Korrigieren</span>
                                        </button>
                                      ) : !e.ended_at && e.user_id === me && canDelete(e) ? (
                                        <button
                                          type="button"
                                          className="btn ghost small pt-danger-text"
                                          onClick={() => {
                                            if (!window.confirm(`Laufenden Block seit ${hhmm(e.started_at)} verwerfen? Er wird gelöscht und zählt nicht als Arbeitszeit.`)) return;
                                            discard(e).then(entries.reload, (err) => alert(err instanceof Error ? err.message : String(err)));
                                          }}
                                        >
                                          Zeit verwerfen
                                        </button>
                                      ) : null}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </DayRows>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted small" style={{ marginTop: 10 }}>
                Hinweise nach {land === 'DE' ? 'ArbZG (§ 4 Pause, § 3 Höchstarbeitszeit, § 5 Ruhezeit)' : land === 'CH' ? 'ArG (Art. 15 Pause, Art. 15a Ruhezeit)' : 'AZG (§ 11 Pause, § 9 Höchstarbeitszeit, § 12 Ruhezeit)'} — Land{land === 'DE' && org.region ? ' und Bundesland (Feiertage)' : ''} aus den Einstellungen,
                ohne Gewähr ({lawName(land)}). Arbeitszeitbuch und CSV enthalten genau die angezeigten Personen — Spalten wie in der App.
              </p>

              {edit && (
                <EditDialog
                  edit={edit}
                  setEdit={setEdit}
                  who={nameOf(edit.entry)}
                  foreign={edit.entry.user_id !== me}
                  canDelete={canDelete(edit.entry)}
                  sites={sites}
                  onSave={async (patch) => {
                    await ext.planung.updateTimeEntry(edit.entry.id, patch);
                    setEdit(null);
                    entries.reload();
                  }}
                  onDelete={async () => {
                    await discard(edit.entry);
                    setEdit(null);
                    entries.reload();
                  }}
                />
              )}

              {sollFor && (
                <SollDialog
                  name={sollFor.name}
                  target={targetOf(targetList?.find((t) => t.user_id === sollFor.id))}
                  onClose={() => setSollFor(null)}
                  onSave={async (t) => {
                    await ext.planung.setTimeTarget(org.id, sollFor.id, t);
                    setSollFor(null);
                    targets.reload();
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
  hints,
  cols,
  children,
}: {
  title: string;
  color?: string;
  total: string;
  sub: string;
  hints: string[] | null;
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
          {hints?.map((h) => (
            <span key={h} className="pt-hint">
              ⚠ {h}
            </span>
          ))}
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
  sites,
  onSave,
  onDelete,
}: {
  edit: Edit;
  setEdit: (fn: Edit | null | ((e: Edit | null) => Edit | null)) => void;
  who: string;
  foreign: boolean;
  canDelete: boolean;
  sites: Site[];
  onSave: (patch: TimePatch) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<Edit>) => setEdit((x) => (x ? { ...x, ...p } : x));
  const running = !edit.entry.ended_at;
  const e0 = edit.entry;
  const n0 = parseNote(e0.note);
  // Geändert gegenüber dem Eintrag? (Art-Chips sind keine Eingabe-Ereignisse — deshalb ausdrücklich vergleichen)
  const changed =
    edit.kind !== e0.kind ||
    edit.day !== dayOf(e0.started_at) ||
    edit.start !== hhmm(e0.started_at) ||
    edit.end !== (e0.ended_at ? hhmm(e0.ended_at) : '') ||
    edit.where !== whereOf(e0) ||
    edit.text !== n0.text ||
    edit.pause !== (n0.pauseMin ? String(n0.pauseMin) : '');
  const close = () => {
    if (!busy) setEdit(null);
  };
  // Archivierte Kunden nur zeigen, wenn der Eintrag schon dort hängt
  const siteOptions = sites.filter((s) => s.active || `site:${s.id}` === edit.where).sort((a, b) => a.name.localeCompare(b.name));
  const isBreak = edit.kind === 'break';

  async function save() {
    setError(null);
    // wie App EntrySheet / lib/timeclock.ts checkEntry
    const s = parseHm(edit.start);
    const en = edit.end.trim() ? parseHm(edit.end) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.day) || !s || (edit.end.trim() && !en)) return setError('Bitte prüfen: Tag auswählen, Zeiten als HH:MM.');
    if (en && en[0] === s[0] && en[1] === s[1]) return setError('Beginn und Ende sind gleich — bitte das Ende prüfen.');
    const start = atLocal(edit.day, s);
    let end = en ? atLocal(edit.day, en) : null;
    if (end && end <= start) {
      // über Mitternacht (lokal, Sommerzeit-sicher) — nur nach Rückfrage, sonst würde ein Tippfehler (08:05–07:35)
      // still als 23,5-Stunden-Eintrag gespeichert
      const next = parseDay(edit.day);
      next.setDate(next.getDate() + 1);
      end = atLocal(dayKey(next), en!);
      if (!window.confirm(`Das Ende (${edit.end}) liegt vor dem Beginn (${edit.start}). Als Eintrag über Mitternacht speichern (${hm(Math.round((end.getTime() - start.getTime()) / 60000))})?`)) return;
    }
    if (!end && !running) return setError('Bitte das Ende eintragen.');
    if (end && end.getTime() - start.getTime() > MAX_ENTRY_MS) return setError('Ein Eintrag darf höchstens 24 Stunden dauern.');
    if (!end && Date.now() - start.getTime() > MAX_ENTRY_MS) return setError('Läuft seit über 24 Stunden — bitte das Ende eintragen.');
    if (start.getTime() > Date.now()) return setError('Der Beginn liegt in der Zukunft.');
    const pause = edit.pause.trim() ? Number(edit.pause.trim()) : 0;
    if (!Number.isInteger(pause) || pause < 0 || pause > 999) return setError('Pause bitte als ganze Minuten (0–999).');
    const dur = Math.round(((end ?? new Date()).getTime() - start.getTime()) / 60000);
    if (pause > 0 && end && pause >= dur) return setError('Die Pause ist länger als die ganze Zeit.');
    const place = edit.where.startsWith('place:') ? (edit.where.slice(6) as Place) : undefined;
    const site_id = edit.where.startsWith('site:') ? edit.where.slice(5) : null;
    const note = buildNote({ place: site_id ? undefined : place, pauseMin: isBreak ? 0 : pause, text: edit.text });
    if ((note ?? '').length > NOTE_MAX) return setError(`Tätigkeit zu lang (höchstens ${NOTE_MAX} Zeichen).`);
    setBusy(true);
    try {
      await onSave({ kind: edit.kind, started_at: start.toISOString(), ended_at: end ? end.toISOString() : null, note, site_id: isBreak ? e0.site_id : site_id });
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
    <Modal title={`Zeit korrigieren · ${who}`} onClose={close} dirty={changed}>
      <form
        className="pt-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!busy) void save();
        }}
      >
        {error && <div className="error-box">{error}</div>}
        <fieldset disabled={busy}>
          {e0.kind !== 'work' && (
            // Alte Einträge (Fahrt/Pause) — neue Zeitbuch-Einträge sind immer „Arbeit“ mit Pause im Eintrag
            <div className="pt-chips" style={{ marginBottom: 12 }}>
              {(['work', 'travel', 'break'] as TimeKind[]).map((k) => (
                <button key={k} type="button" className={`pt-chip ${edit.kind === k ? 'on' : ''}`} onClick={() => set({ kind: k })}>
                  {KIND_ICON[k]} {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
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
          {!isBreak && (
            <>
              <label className="field">
                Kunde / Ort
                <select value={edit.where} onChange={(e) => set({ where: e.target.value })}>
                  <option value="">— ohne Zuordnung —</option>
                  <optgroup label="Ort">
                    {PLACES.map((p) => (
                      <option key={p.id} value={`place:${p.id}`}>
                        {p.icon} {p.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Kunde">
                    {siteOptions.map((s) => (
                      <option key={s.id} value={`site:${s.id}`}>
                        {s.name}
                        {s.active ? '' : ' (archiviert)'}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="field">
                Pause (Minuten, wird abgezogen)
                <input type="number" min={0} max={999} step={5} value={edit.pause} placeholder="0" onChange={(e) => set({ pause: e.target.value })} />
              </label>
            </>
          )}
          <label className="field">
            {isBreak ? 'Notiz (optional)' : 'Tätigkeit'}
            <input value={edit.text} maxLength={260} placeholder={isBreak ? '' : 'z. B. Therme gewartet'} onChange={(e) => set({ text: e.target.value })} />
          </label>
        </fieldset>
        <div className="info-box small">
          {foreign
            ? `Die Korrektur wird mit Zeitpunkt vermerkt und erscheint beim nächsten Öffnen des Zeitbuchs auch auf dem Handy von ${who}. Ändern kann ${who} den Eintrag danach nicht mehr.`
            : 'Gilt hier, in der Team-Ansicht und — beim nächsten Öffnen des Zeitbuchs — auch in deiner Liste auf dem Handy.'}
        </div>
        <div className="row pt-actions">
          {canDelete &&
            (confirmDel ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="small">{running ? 'Laufenden Block wirklich verwerfen? Er zählt dann nicht als Arbeitszeit.' : 'Wirklich löschen?'}</span>
                <button type="button" className="btn small pt-danger" onClick={() => void remove()} disabled={busy}>
                  {running ? 'Ja, verwerfen' : 'Ja, löschen'}
                </button>
                <button type="button" className="btn ghost small" onClick={() => setConfirmDel(false)} disabled={busy}>
                  Nein
                </button>
              </span>
            ) : (
              <button type="button" className="btn ghost small pt-danger-text" onClick={() => setConfirmDel(true)} disabled={busy}>
                {running ? 'Zeit verwerfen' : 'Löschen'}
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

/** Wochentage für die Auswahl: Mo … So (Werte wie getDay()) */
const SOLL_DAYS: { d: number; label: string }[] = [
  { d: 1, label: 'Mo' },
  { d: 2, label: 'Di' },
  { d: 3, label: 'Mi' },
  { d: 4, label: 'Do' },
  { d: 5, label: 'Fr' },
  { d: 6, label: 'Sa' },
  { d: 0, label: 'So' },
];

/** 2310 → „38,5“, 2295 → „38,25“; krumme Minuten als „38:10“ (beides versteht parseWeekHours) */
const hoursText = (min: number) =>
  Number.isInteger(min * 100 / 60) ? String(min / 60).replace('.', ',') : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/**
 * Sollzeit einer Person (Inhaber): Wochenstunden + Arbeitstage — gleiche Bedeutung wie in der App (Blatt „Sollzeit“,
 * teamSoll.ts targetToRow): Soll verteilt sich gleichmäßig auf die Arbeitstage, Feiertage zählen nicht, höchstens 80 h.
 */
function SollDialog({
  name,
  target,
  onClose,
  onSave,
}: {
  name: string;
  target: WorkTarget | null;
  onClose: () => void;
  onSave: (t: WorkTarget | null) => Promise<void>;
}) {
  const [hours, setHours] = useState(() => (target ? hoursText(target.weekMinutes) : '40'));
  const [days, setDays] = useState<number[]>(() => (target ? [...target.days] : [1, 2, 3, 4, 5]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = parseWeekHours(hours);
  const perDay = min && days.length ? Math.round(min / days.length) : null;
  const dirty = !target
    ? true
    : min !== target.weekMinutes || [...days].sort().join() !== [...target.days].sort().join();

  const toggle = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const close = () => {
    if (!busy) onClose();
  };

  async function run(t: WorkTarget | null) {
    setError(null);
    setBusy(true);
    try {
      await onSave(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function save() {
    if (min === null) return setError(`Wochenstunden prüfen: z. B. 40 oder 38,5 (höchstens ${MAX_WEEK_MINUTES / 60} h).`);
    if (!days.length) return setError('Bitte mindestens einen Arbeitstag wählen.');
    void run({ weekMinutes: min, days });
  }

  return (
    <Modal title={`Sollzeit · ${name}`} onClose={close} dirty={dirty}>
      <form
        className="pt-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!busy) save();
        }}
      >
        {error && <div className="error-box">{error}</div>}
        <fieldset disabled={busy}>
          <label className="field">
            Wochenstunden
            <input
              value={hours}
              inputMode="decimal"
              onChange={(e) => setHours(e.target.value)}
              placeholder="z. B. 38,5"
              aria-describedby="soll-hint"
            />
          </label>
          <div className="field-like">
            <span className="pt-label">Arbeitstage</span>
            <div className="pt-chips" role="group" aria-label="Arbeitstage">
              {SOLL_DAYS.map(({ d, label }) => (
                <button key={d} type="button" className={`pt-chip ${days.includes(d) ? 'on' : ''}`} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p id="soll-hint" className="muted small">
            {perDay ? `Das sind ${hm(perDay)} je Arbeitstag. ` : ''}Das Soll verteilt sich gleichmäßig auf die Arbeitstage, Feiertage zählen nicht —
            wie in der App. Das Saldo in „Je Person“ rechnet bis heute.
          </p>
        </fieldset>
        <div className="row pt-actions">
          {target && (
            <button type="button" className="btn ghost small pt-danger-text" onClick={() => void run(null)} disabled={busy}>
              Keine Sollzeit
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>
            Abbrechen
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Speichert …' : 'Sollzeit speichern'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
