// Cockpit für den Inhaber: Umsatz je Monat, Wartungsumsatz-Vorschau, offene Posten nach Alter, Auslastung je Monteur.
// Eigene schlichte SVG-Diagramme (keine Chart-Bibliothek): x-Lagen in Prozent, damit Schrift nie verzerrt; Tooltips per
// <title>, alle Zahlen zusätzlich als Tabelle für Bildschirmleser. Rechnen in ./kennzahlen.ts (nutzt geld/, portfolio, zeitbuch).

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useInst } from '../context';
import type { StoredInvoice } from '../geld/api';
import { addDays, planMembers, type Appt, type TimeEntry, type TimeTarget } from '../planung/logic';
import { holidays, lawLandOf } from '../planung/zeitbuch';
import { buildDueRows, contractStatsOf, counts, onlyDemo } from '../portfolio';
import { fmtDay } from '../types';
import {
  agingOf,
  compactEuro,
  euroOf,
  euroWhole,
  hours,
  lastMonths,
  loadByMember,
  maintenanceForecast,
  monthsRange,
  nextMonths,
  niceMax,
  revenueByMonth,
  type Load,
} from './kennzahlen';
import './cockpitAnsicht.css';

const LOAD_DAYS = 28;

// ---------------------------------------------------------------------------
// Diagramm-Bausteine
// ---------------------------------------------------------------------------
interface BarPart {
  value: number;
  cls: string;
  name: string;
}
interface BarItem {
  key: string;
  label: string;
  title: string;
  parts: BarPart[];
  /** Beschriftung über dem Balken (leer = keine) */
  top?: string;
  /** Hervorhebung (z. B. laufender Monat) */
  current?: boolean;
}

/** Senkrechte, gestapelte Balken. Werte ≥ 0 (negative Teile werden nicht gezeichnet, stehen aber im Tooltip). */
function StackedBars({ items, format, height = 190 }: { items: BarItem[]; format: (v: number) => string; height?: number }) {
  const max = niceMax(Math.max(0, ...items.map((i) => i.parts.reduce((s, p) => s + Math.max(0, p.value), 0))));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const band = 100 / items.length;
  const bw = band * 0.62;
  const y = (v: number) => height - (v / max) * height;
  return (
    <div className="ck-chart" style={{ height: height + 26 }}>
      <div className="ck-axis" aria-hidden>
        {ticks.map((t) => (
          <span key={t} style={{ top: y(t) }}>
            {format(t)}
          </span>
        ))}
      </div>
      <svg className="ck-svg" height={height + 26} aria-hidden focusable="false">
        {ticks.map((t) => (
          <line key={t} x1="0" x2="100%" y1={y(t) + 0.5} y2={y(t) + 0.5} className={t === 0 ? 'ck-base' : 'ck-grid'} />
        ))}
        {items.map((it, i) => {
          let acc = 0;
          const x = `${i * band + (band - bw) / 2}%`;
          return (
            <g key={it.key} className={`ck-bar${it.current ? ' current' : ''}`}>
              <title>{it.title}</title>
              {/* unsichtbare Trefferfläche über die ganze Spalte — Tooltip auch bei kleinen Balken */}
              <rect x={`${i * band}%`} y={0} width={`${band}%`} height={height} className="ck-hit" />
              {it.parts.map((p) => {
                const v = Math.max(0, p.value);
                if (!v) return null;
                const y0 = y(acc + v);
                const h = y(acc) - y0;
                acc += v;
                return <rect key={p.name} x={x} width={`${bw}%`} y={y0} height={Math.max(h, 1)} rx={2} className={p.cls} />;
              })}
              {it.top && acc > 0 && (
                <text x={`${i * band + band / 2}%`} y={y(acc) - 5} textAnchor="middle" className="ck-top">
                  {it.top}
                </text>
              )}
              <text x={`${i * band + band / 2}%`} y={height + 17} textAnchor="middle" className="ck-xlabel">
                {it.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <div className="ck-legend" aria-hidden>
      {items.map((l) => (
        <span key={l.label}>
          <i className={l.cls} /> {l.label}
        </span>
      ))}
    </div>
  );
}

/** Tabelle nur für Bildschirmleser (die Diagramme selbst sind aria-hidden). */
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="ck-sr">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, sub, children, aside }: { title: string; sub?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card ck-card" aria-label={title}>
      <div className="ck-head">
        <div>
          <h3 className="ck-title">{title}</h3>
          {sub && <p className="ck-sub">{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Seite
// ---------------------------------------------------------------------------
export function Cockpit() {
  const { data, ext, org, base } = useInst();
  const land = lawLandOf((org as { land?: string | null }).land);

  const state = useAsync(async () => {
    const now = new Date();
    const months = lastMonths(12, now);
    const range = monthsRange(months);
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const loadFrom = addDays(today0, -(LOAD_DAYS - 1));
    const loadTo = addDays(today0, 1);
    const soft = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
    const [sites, assets, lastService, lastLeak, members, invoices, openInv, entries, targets, appts] = await Promise.all([
      data.sites(),
      data.assets(),
      data.lastService(),
      data.lastLeakCheck(),
      data.members(),
      // Rechnungen: alle mit Rechnungsdatum in den 12 Monaten (seitenweise) + ALLE offenen (für die Altersstruktur)
      soft(ext.geld.invoices(range)),
      soft(ext.geld.tileInvoices(now.toISOString())),
      // Zeitbuch / Sollzeit / Plantafel — fehlt eine Tabelle, bleibt der Teil leer statt Fehlerseite
      soft(ext.planung.timeEntries(loadFrom, loadTo)),
      soft(ext.planung.timeTargets()),
      soft(ext.planung.appointments(loadFrom, loadTo)),
    ]);
    return { now, months, sites, assets, lastService, lastLeak, members, invoices, openInv, entries, targets, appts, loadFrom, loadTo };
  }, [data, ext]);
  useLiveRefresh([state.refresh], 120000);

  return (
    <LoadGuard state={state}>
      {(d) => {
        const allRows = buildDueRows(org, d.sites, d.assets, d.lastService, d.lastLeak);
        // wie Start: gibt es nur Beispiel-Anlagen, rechnen die Zahlen mit diesen
        const demoOnly = onlyDemo(allRows);
        const rows = allRows.filter((r) => counts(r, demoOnly));
        const overdueAssets = rows.filter((r) => r.worst === 'overdue').length;
        const contracts = contractStatsOf(allRows, demoOnly);

        const revenue = d.invoices ? revenueByMonth(d.invoices, d.months, land) : null;
        const yearKey = String(d.now.getFullYear());
        const ytd = revenue ? revenue.filter((m) => m.key.startsWith(yearKey)).reduce((s, m) => s + m.net, 0) : null;
        const sum12 = revenue ? revenue.reduce((s, m) => s + m.net, 0) : 0;
        const aging = d.openInv ? agingOf(d.openInv as StoredInvoice[]) : null;

        const forecast = maintenanceForecast(allRows, nextMonths(12, d.now), demoOnly, d.now);
        const fcSum = forecast.reduce((s, m) => s + m.sum, 0);
        const fcUnpriced = forecast.reduce((s, m) => s + m.unpriced, 0);

        const team = planMembers(d.members, null);
        const hol = new Map([...holidays(d.loadFrom.getFullYear(), land, org.region), ...holidays(d.now.getFullYear(), land, org.region)]);
        const loads = loadByMember(team, d.entries as TimeEntry[] | null, d.targets as TimeTarget[] | null, d.appts as Appt[] | null, { from: d.loadFrom, to: d.loadTo }, hol, d.now);
        const lastDay = addDays(d.loadTo, -1);

        return (
          <div className="ck">
            {/* ---------- Kopfzeile ---------- */}
            <div className="kpi-grid ck-kpis">
              <div className="kpi idx-kpi-accent">
                <div className="kpi-label">Umsatz {yearKey}</div>
                <div className="kpi-value">{ytd === null ? '—' : euroWhole(ytd)}</div>
                <div className="kpi-sub">netto, ausgestellte Rechnungen abzüglich Stornos</div>
              </div>
              <Link className="kpi idx-kpi-link idx-kpi-amber" to={`${base}/rechnungen`}>
                <div className="kpi-label">Offen gesamt</div>
                <div className="kpi-value">{aging ? euroWhole(aging.total.cents) : '—'}</div>
                <div className="kpi-sub">
                  {aging ? `${aging.total.count} ${aging.total.count === 1 ? 'Rechnung' : 'Rechnungen'}, davon ${euroWhole(aging.overdue.cents)} überfällig` : 'Rechnungen nicht geladen'}
                </div>
              </Link>
              <div className="kpi">
                <div className="kpi-label">Wartungsverträge</div>
                <div className="kpi-value">{contracts.count}</div>
                <div className="kpi-sub">
                  {contracts.yearly > 0 ? `${euroOf(contracts.yearly)} im Jahr` : 'noch kein Jahreswert'}
                  {contracts.withoutPrice > 0 ? ` · ${contracts.withoutPrice} ohne Preis` : ''}
                </div>
              </div>
              <Link className="kpi idx-kpi-link idx-kpi-red" to={`${base}/wartung?f=overdue`}>
                <div className="kpi-label">Anlagen überfällig</div>
                <div className="kpi-value">{overdueAssets}</div>
                <div className="kpi-sub">Wartung oder Dichtheitskontrolle — wie auf Start</div>
              </Link>
            </div>

            <div className="ck-cols">
              {/* ---------- 1. Umsatz je Monat ---------- */}
              <Section
                title="Umsatz je Monat"
                sub={revenue ? <>Letzte 12 Monate, netto nach Rechnungsdatum · zusammen <b>{euroWhole(sum12)}</b></> : undefined}
              >
                {!revenue ? (
                  <div className="info-box">Rechnungen konnten nicht geladen werden (Rechnungen in der Datenbank eingerichtet?).</div>
                ) : (
                  <>
                    <Legend items={[{ cls: 'ck-paid', label: 'bezahlt' }, { cls: 'ck-open', label: 'offen' }]} />
                    <StackedBars
                      items={revenue.map((m, i) => ({
                        key: m.key,
                        label: m.label,
                        current: i === revenue.length - 1,
                        top: m.net > 0 ? compactEuro(m.net) : '',
                        title:
                          `${m.long}: ${euroWhole(m.net)} netto\nbezahlt ${euroWhole(m.paid)} · offen ${euroWhole(m.open)}` +
                          (m.storno ? `\nStornos ${m.storno < 0 ? '−' : '+'}${euroWhole(Math.abs(m.storno))}` : ''),
                        parts: [
                          // Storno einer bezahlten/offenen Rechnung im selben Monat hebt sich in „storno“ auf; ein Storno aus
                          // einem früheren Monat senkt diesen Monat (Balken = bezahlt + offen, Summe im Tooltip)
                          { value: m.paid, cls: 'ck-paid', name: 'bezahlt' },
                          { value: m.open, cls: 'ck-open', name: 'offen' },
                        ],
                      }))}
                      format={compactEuro}
                    />
                    {revenue.some((m) => m.storno !== 0) && (
                      <p className="ck-note">
                        Stornos sind abgezogen (Stornorechnung im Monat ihres Datums); Schlussrechnungen zählen nur den Rest nach Abzug der
                        Abschläge — wie im Rechnungsausgangsbuch für den Steuerberater.
                      </p>
                    )}
                    <SrTable
                      caption="Umsatz je Monat, netto"
                      head={['Monat', 'bezahlt', 'offen', 'Stornos', 'Umsatz']}
                      rows={revenue.map((m) => [m.long, euroWhole(m.paid), euroWhole(m.open), euroWhole(m.storno), euroWhole(m.net)])}
                    />
                  </>
                )}
              </Section>

              {/* ---------- 2. Wartungsumsatz-Vorschau ---------- */}
              <Section
                title="Wartungsumsatz – Vorschau"
                sub={
                  <>
                    Nächste 12 Monate: fällige Wartungen × Preis je Wartung (Vertragspreis vor Typpreis) · zusammen <b>{euroOf(fcSum)}</b>
                  </>
                }
              >
                <Legend items={[{ cls: 'ck-fc', label: 'fällig' }, { cls: 'ck-fc-over', label: 'schon überfällig (diesen Monat)' }]} />
                <StackedBars
                  items={forecast.map((m, i) => ({
                    key: m.key,
                    label: m.label,
                    current: i === 0,
                    title:
                      `${m.long}: ${euroOf(m.sum)} aus ${m.count} ${m.count === 1 ? 'Wartung' : 'Wartungen'}` +
                      (m.overdueCount ? `\ndavon überfällig: ${euroOf(m.overdueSum)} (${m.overdueCount})` : '') +
                      (m.unpriced ? `\n${m.unpriced} ohne Preis (nicht in der Summe)` : ''),
                    parts: [
                      { value: m.overdueSum * 100, cls: 'ck-fc-over', name: 'überfällig' },
                      { value: (m.sum - m.overdueSum) * 100, cls: 'ck-fc', name: 'fällig' },
                    ],
                  }))}
                  format={compactEuro}
                />
                {fcUnpriced > 0 && (
                  <p className="ck-note">
                    ⚠️ {fcUnpriced} {fcUnpriced === 1 ? 'fällige Wartung hat' : 'fällige Wartungen haben'} keinen Preis und {fcUnpriced === 1 ? 'fehlt' : 'fehlen'} in der Summe —{' '}
                    <Link to={`${base}/einstellungen#preise`}>Preis je Wartung eintragen</Link>.
                  </p>
                )}
                <SrTable
                  caption="Wartungsumsatz-Vorschau je Monat"
                  head={['Monat', 'Summe', 'Wartungen mit Preis', 'davon überfällig', 'ohne Preis']}
                  rows={forecast.map((m) => [m.long, euroOf(m.sum), m.count, m.overdueCount, m.unpriced])}
                />
              </Section>

              {/* ---------- 3. Offene Posten nach Alter ---------- */}
              <Section
                title="Offene Posten nach Alter"
                sub={aging ? <>Tage über dem Zahlungsziel, Beträge brutto · überfällig <b>{euroWhole(aging.overdue.cents)}</b></> : undefined}
              >
                {!aging ? (
                  <div className="info-box">Offene Rechnungen konnten nicht geladen werden.</div>
                ) : (
                  <AgingBars aging={aging} to={`${base}/rechnungen?f=overdue`} openTo={`${base}/rechnungen`} />
                )}
              </Section>

              {/* ---------- 4. Auslastung ---------- */}
              <Section
                title="Auslastung je Monteur"
                sub={
                  <>
                    Letzte 4 Wochen ({fmtDay(d.loadFrom)} – {fmtDay(lastDay)}): Arbeitszeit laut Zeitbuch, Sollzeit bis heute, verplant auf der
                    Plantafel
                  </>
                }
              >
                {d.entries === null && d.appts === null ? (
                  <div className="info-box">Zeitbuch und Plantafel sind in der Datenbank noch nicht eingerichtet.</div>
                ) : (
                  <LoadBars loads={loads} hasTargets={d.targets !== null} base={base} />
                )}
              </Section>
            </div>
            <p className="muted small ck-foot">
              Stand {fmtDay(d.now)} · Zahlen aus Rechnungen, Wartungsbestand, Zeitbuch und Plantafel — dieselben Regeln wie Start, Rechnungen und
              Zeiten. Alle Beträge ohne Gewähr, maßgeblich ist die Buchhaltung.
            </p>
          </div>
        );
      }}
    </LoadGuard>
  );
}

function AgingBars({ aging, to, openTo }: { aging: ReturnType<typeof agingOf>; to: string; openTo: string }) {
  const max = Math.max(1, ...aging.buckets.map((b) => b.cents), aging.notDue.cents);
  const row = (key: string, label: string, cents: number, count: number, cls: string, href: string) => (
    <Link key={key} to={href} className="ck-hrow" title={`${label}: ${euroWhole(cents)} in ${count} ${count === 1 ? 'Rechnung' : 'Rechnungen'}`}>
      <span className="ck-hlabel">{label}</span>
      <span className="ck-htrack" aria-hidden>
        <svg width="100%" height="14" focusable="false">
          {cents > 0 && <rect x="0" y="1" width={`${Math.max(1.5, (cents / max) * 100)}%`} height="12" rx="3" className={cls} />}
        </svg>
      </span>
      <span className="ck-hval">
        <b>{euroWhole(cents)}</b> <span className="muted">· {count}</span>
      </span>
    </Link>
  );
  return (
    <>
      <div className="ck-hbars">
        {aging.buckets.map((b, i) => row(b.id, `${b.label} überfällig`, b.cents, b.count, `ck-age${i}`, `${to}&alter=${encodeURIComponent(b.id)}`))}
        {row('notdue', 'noch nicht fällig', aging.notDue.cents, aging.notDue.count, 'ck-age-ok', openTo)}
      </div>
      <p className="ck-note">Klick öffnet die Rechnungsliste, gefiltert auf genau diese Stufe (bzw. alle offenen). Bei Schlussrechnungen zählt nur der Rest nach Abzug.</p>
      <SrTable
        caption="Offene Posten nach Alter"
        head={['Alter', 'Betrag', 'Rechnungen']}
        rows={[...aging.buckets.map((b) => [`${b.label} überfällig`, euroWhole(b.cents), b.count]), ['noch nicht fällig', euroWhole(aging.notDue.cents), aging.notDue.count]]}
      />
    </>
  );
}

function LoadBars({ loads, hasTargets, base }: { loads: Load[]; hasTargets: boolean; base: string }) {
  const max = niceMax(Math.max(60, ...loads.flatMap((l) => [l.ist, l.planned, l.soll ?? 0])));
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  if (!loads.length) return <div className="empty">Kein Team geladen.</div>;
  return (
    <>
      <Legend
        items={[
          { cls: 'ck-ist', label: 'Ist (Zeitbuch)' },
          { cls: 'ck-plan', label: 'verplant (Plantafel)' },
          ...(hasTargets ? [{ cls: 'ck-soll', label: 'Soll bis heute' }] : []),
        ]}
      />
      <div className="ck-loads">
        {loads.map((l) => {
          const q = l.soll ? Math.round((l.ist / l.soll) * 100) : null;
          const title = `${l.name}: Ist ${hours(l.ist)}${l.soll !== null ? ` · Soll ${hours(l.soll)} (${q} %)` : ''} · verplant ${hours(l.planned)}`;
          return (
            <div key={l.userId} className="ck-load" title={title}>
              <div className="ck-load-name">
                <span className="pt-dot" style={{ background: l.color }} aria-hidden />
                <b>{l.name}</b>
                <span className="muted small">
                  {hours(l.ist)}
                  {l.soll !== null && <> von {hours(l.soll)} Soll{q !== null && <> · {q} %</>}</>} · verplant {hours(l.planned)}
                </span>
              </div>
              <svg className="ck-load-svg" width="100%" height="26" aria-hidden focusable="false">
                <rect x="0" y="2" width="100%" height="10" rx="3" className="ck-track" />
                {l.ist > 0 && <rect x="0" y="2" width={pct(l.ist)} height="10" rx="3" className="ck-ist" />}
                <rect x="0" y="16" width="100%" height="6" rx="3" className="ck-track" />
                {l.planned > 0 && <rect x="0" y="16" width={pct(l.planned)} height="6" rx="3" className="ck-plan" />}
                {l.soll !== null && l.soll > 0 && (
                  <line x1={pct(l.soll)} x2={pct(l.soll)} y1="0" y2="24" className="ck-soll-line" />
                )}
              </svg>
            </div>
          );
        })}
      </div>
      {!hasTargets && (
        <p className="ck-note">
          Sollzeiten gibt es erst mit der Zeitbuch-SQL vom 07.11.; danach unter <Link to={`${base}/zeiten`}>Zeiten</Link> → „Je Person“ eintragen.
        </p>
      )}
      <SrTable
        caption="Auslastung je Monteur, letzte 4 Wochen"
        head={['Person', 'Ist', 'Soll bis heute', 'verplant']}
        rows={loads.map((l) => [l.name, hours(l.ist), l.soll === null ? 'keine Sollzeit' : hours(l.soll), hours(l.planned)])}
      />
    </>
  );
}
