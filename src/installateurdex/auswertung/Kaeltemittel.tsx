// Kältemittel-Jahresbericht — wie App lib/fgasYear.ts + pdf/fgasYear.ts: über alle Kunden eines Jahres je Kältemittel
// eingefüllt/zurückgewonnen (kg, t CO₂e), Dichtheitskontrollen + Funde, alle Einträge mit Prüfcode. Druckbar.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadGuard, useAsync } from '../../components/ui';
import { useInst } from '../context';
import { PrintButton } from '../parts';
import { fmtDay, isLeakFound } from '../types';
import { buildFgasYearHtml, fmtKg, fmtT } from './fgasReport';
import { fgasYear } from './logic';

const day = (iso: string) => fmtDay(new Date(iso));

export function Kaeltemittel() {
  const { data, ext, org, base } = useInst();
  const thisYear = new Date().getFullYear();
  // App fragt „dieses oder letztes Jahr“; am PC dazu die Vorjahre (Aufzeichnungen sind 5 Jahre aufzubewahren)
  const years = [0, 1, 2, 3, 4].map((n) => thisYear - n);
  const [year, setYear] = useState(thisYear);

  const state = useAsync(async () => {
    const [sites, assets, jobs] = await Promise.all([data.sites(), data.assets(), ext.auswertung.fgasJobs(year)]);
    return { report: fgasYear(year, jobs, assets, sites) };
  }, [data, ext, year]);

  return (
    <>
      <div className="aw-toolbar">
        <label className="field aw-year">
          Jahr
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {state.data && !state.loading && (
          <PrintButton label="Drucken / PDF" build={async () => buildFgasYearHtml(org, state.data!.report)} />
        )}
      </div>

      <LoadGuard state={state}>
        {({ report: r }) => {
          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Einträge</div>
                  <div className="kpi-value">{r.entries.length}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Dichtheitskontrollen</div>
                  <div className="kpi-value">{r.leakChecks}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">davon undicht</div>
                  <div className="kpi-value" style={r.leaksFound ? { color: '#fca5a5' } : undefined}>
                    {r.leaksFound}
                  </div>
                </div>
              </div>

              <h3 className="aw-h">Je Kältemittel</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kältemittel</th>
                      <th className="idx-num">Eingefüllt</th>
                      <th className="idx-num">CO₂e</th>
                      <th className="idx-num">Zurückgewonnen</th>
                      <th className="idx-num">CO₂e</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byRefrigerant.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Keine Einträge in diesem Jahr.
                        </td>
                      </tr>
                    ) : (
                      r.byRefrigerant.map((x) => (
                        <tr key={x.refrigerant}>
                          <td>
                            <b>{x.refrigerant}</b>
                            {x.gwp ? <span className="idx-sub">GWP {x.gwp}</span> : null}
                          </td>
                          <td className="idx-num">{fmtKg(x.added)}</td>
                          <td className="idx-num">{fmtT(x.co2eAdded)}</td>
                          <td className="idx-num">{fmtKg(x.recovered)}</td>
                          <td className="idx-num">{fmtT(x.co2eRecovered)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <h3 className="aw-h">Alle Einträge</h3>
              {r.entries.length === 0 ? (
                <div className="card muted">
                  {year} gibt es keine Einsätze mit Kältemittel-Angaben oder Dichtheitskontrolle. Die Einträge entstehen in der App
                  beim Einsatz „Kältemittel / Dichtheit“ bzw. mit den Kältemittel-Feldern bei der Wartung.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Kunde · Anlage</th>
                        <th>Kältemittel</th>
                        <th className="idx-num">Eingefüllt</th>
                        <th className="idx-num">Zurück</th>
                        <th>Dichtheit</th>
                        <th className="idx-hide-sm">Monteur</th>
                        <th className="idx-hide-sm">Prüfcode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.entries.map((e, i) => (
                        <tr key={`${e.date}-${i}`}>
                          <td>{day(e.date)}</td>
                          <td className="wrap">
                            {e.siteName}
                            <span className="idx-sub">{e.assetName}</span>
                          </td>
                          <td>{e.refrigerant}</td>
                          <td className="idx-num">{fmtKg(e.added)}</td>
                          <td className="idx-num">{fmtKg(e.recovered)}</td>
                          <td className="wrap">
                            {e.leakResult ? (
                              <span className={isLeakFound(e.leakResult) ?'aw-leak-bad' : undefined}>{e.leakResult}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="muted idx-hide-sm">{e.inspector ?? '—'}</td>
                          <td className="mono idx-hide-sm" title={e.hash}>
                            {e.hash ? e.hash.slice(0, 10) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted small">
                Eigene Aufzeichnung des Fachbetriebs über Arbeiten an Anlagen mit Kältemitteln (Verordnung (EU) 2024/573) — aus den
                unveränderlich dokumentierten Einsätzen (Prüfcode je Eintrag), stornierte Einträge nicht enthalten. CO₂e aus Füllmenge ×
                GWP (Richtwert). Fristen je Anlage stehen unter <Link to={`${base}/wartung`}>Fällige Wartungen</Link>.
              </p>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
