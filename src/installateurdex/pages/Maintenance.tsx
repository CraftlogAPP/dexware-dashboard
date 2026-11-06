import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Download } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { toInputDate } from '../../lib/format';
import { DueCell, LeakLine, WarrantyRiskBadge } from '../badges';
import { downloadCsv, toCsv } from '../csv';
import { useInst } from '../context';
import { buildDueRows, byDue, onlyDemo, type DueRow } from '../portfolio';
import { DUE_BUCKET_LABELS, ITEM_KINDS, fmtDay, fmtEur, hasContractPrice, kindInfo, makerModel } from '../types';

type Filter = 'due' | 'overdue' | 'd30' | 'd90' | 'never' | 'all';
type Sort = 'due' | 'customer' | 'site' | 'kind' | 'price';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'due', label: 'Fällig (bis 90 Tage)' },
  { id: 'overdue', label: 'Überfällig' },
  { id: 'd30', label: 'In 30 Tagen' },
  { id: 'd90', label: 'In 90 Tagen' },
  { id: 'never', label: 'Ohne Datum' },
  { id: 'all', label: 'Alle' },
];

// Fälligkeits-Filter nach dem dringenderen von Wartung und Pflicht-Dichtheitskontrolle (wie der Radar der App);
// „Ohne Datum" meint die Wartung.
function matches(r: DueRow, f: Filter): boolean {
  switch (f) {
    case 'due':
      return r.worst === 'overdue' || r.worst === 'd30' || r.worst === 'd90';
    case 'overdue':
      return r.worst === 'overdue';
    case 'd30':
      return r.worst === 'd30';
    case 'd90':
      return r.worst === 'd30' || r.worst === 'd90';
    case 'never':
      return r.bucket === 'never';
    default:
      return true;
  }
}

const cmp = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').localeCompare(b ?? '', 'de', { numeric: true, sensitivity: 'base' });

const SORTS: Record<Sort, (a: DueRow, b: DueRow) => number> = {
  due: byDue,
  customer: (a, b) => cmp(a.site?.operator_name, b.site?.operator_name) || cmp(a.site?.name, b.site?.name) || byDue(a, b),
  site: (a, b) => cmp(a.site?.name, b.site?.name) || byDue(a, b),
  kind: (a, b) => cmp(kindInfo(a.asset.kind).label, kindInfo(b.asset.kind).label) || byDue(a, b),
  price: (a, b) => (b.price ?? -1) - (a.price ?? -1) || byDue(a, b),
};

export function Maintenance() {
  const { data, org, base, isOwner } = useInst();
  // Preise und Summen wie die Umsatzzahlen auf dem Start nur für den Inhaber.
  const showPrices = isOwner;
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.some((f) => f.id === params.get('f')) ? params.get('f') : 'due') as Filter;
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [sortPick, setSort] = useState<Sort>('due');
  const sort: Sort = !showPrices && sortPick === 'price' ? 'due' : sortPick;
  const [archived, setArchived] = useState(false);
  const [demoRows, setDemoRows] = useState(false);

  const state = useAsync(async () => {
    const [sites, assets, lastService, lastLeak] = await Promise.all([
      data.sites(),
      data.assets(),
      data.lastService(),
      data.lastLeakCheck(),
    ]);
    return { sites, assets, lastService, lastLeak };
  }, [data]);

  const rows = useMemo(
    () =>
      state.data ? buildDueRows(org, state.data.sites, state.data.assets, state.data.lastService, state.data.lastLeak) : [],
    [org, state.data],
  );

  function setFilter(f: Filter) {
    const next = new URLSearchParams(params);
    if (f === 'due') next.delete('f');
    else next.set('f', f);
    setParams(next, { replace: true });
  }

  // „Nur Vertragsanlagen" steht in der URL (Link von der Startseite: ?f=all&vertrag=1).
  const onlyContract = params.get('vertrag') === '1';
  function setOnlyContract(on: boolean) {
    const next = new URLSearchParams(params);
    if (on) next.set('vertrag', '1');
    else next.delete('vertrag');
    setParams(next, { replace: true });
  }

  const hasDemo = rows.some((r) => r.asset.is_demo);
  // Gibt es nur Beispiel-Anlagen, rechnet der Start mit ihnen — dann hier auch zeigen (sonst führt die Kachel ins Leere).
  const allDemo = onlyDemo(rows);
  const showDemo = demoRows || allDemo;
  const base0 = rows.filter(
    (r) => (archived || !r.archived) && (showDemo || !r.asset.is_demo) && (!onlyContract || r.asset.contract),
  );
  const q = query.trim().toLowerCase();
  const searched = base0.filter((r) => {
    if (kind && r.asset.kind !== kind) return false;
    if (!q) return true;
    return [r.asset.name, r.asset.manufacturer, r.asset.model, r.asset.serial_no, r.site?.name, r.site?.operator_name, r.site?.address]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
  const list = searched.filter((r) => matches(r, filter)).sort(SORTS[sort]);
  const sum = list.reduce((s, r) => s + (r.price ?? 0), 0);
  const unpriced = list.filter((r) => r.price === undefined && !r.archived).length;

  function exportCsv() {
    const header = [
      'Kunde',
      'Objekt',
      'Adresse',
      'Anlage',
      'Typ',
      'Hersteller/Modell',
      'fällig am',
      'Preis',
      'Vertrag',
      'Status',
      'Dichtheitskontrolle (F-Gas) fällig am',
    ];
    const body = list.map((r) => [
      r.site?.operator_name ?? '',
      r.site?.name ?? '',
      r.site?.address ?? '',
      r.asset.name,
      kindInfo(r.asset.kind).label,
      makerModel(r.asset),
      r.due.dueAt && !r.asset.retired ? fmtDay(r.due.dueAt) : '',
      r.price ?? null,
      r.asset.contract ? 'ja' : 'nein',
      r.archived ? 'archiviert' : DUE_BUCKET_LABELS[r.bucket],
      r.leak ? (r.leak.dueAt ? fmtDay(r.leak.dueAt) : 'noch keine dokumentiert') : '',
    ]);
    // Monteure: ohne Preisspalte (wie in der Liste)
    const priceCol = header.indexOf('Preis');
    const keep = <T,>(row: T[]) => (showPrices ? row : row.filter((_, i) => i !== priceCol));
    downloadCsv(`Wartungsliste_${toInputDate(new Date())}.csv`, toCsv(keep(header), body.map(keep)));
  }

  return (
    <>
      <div className="idx-head">
        <h1>Wartungsliste</h1>
        <button type="button" className="btn small" onClick={exportCsv} disabled={!state.data || list.length === 0}>
          <Download className="i" aria-hidden /> CSV exportieren
        </button>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Alle Anlagen mit nächster Wartung — berechnet wie in der App aus der letzten Wartung bzw. Inbetriebnahme und dem
        Wartungsintervall. Bei Anlagen mit Pflicht-Dichtheitskontrolle (F-Gas-VO Art. 5) steht deren Frist darunter und
        zählt in den Filtern mit. Der Export enthält genau die gefilterte Liste.
      </p>

      <LoadGuard state={state}>
        {() => {
          const countOf = (f: Filter) => searched.filter((r) => matches(r, f)).length;
          return (
            <>
              <div className="idx-tabs" role="tablist" aria-label="Fälligkeit">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    className={filter === f.id ? 'on' : ''}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label} <span className="n">{countOf(f.id)}</span>
                  </button>
                ))}
              </div>
              <div className="filter-bar">
                <label className="field" style={{ minWidth: 200, flex: '1 1 220px' }}>
                  Suche
                  <input
                    type="search"
                    value={query}
                    placeholder="Kunde, Objekt, Adresse, Anlage …"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>
                  Anlagentyp
                  <select value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="">Alle Typen</option>
                    {ITEM_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.emoji} {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ minWidth: 170, flex: '1 1 170px' }}>
                  Sortieren nach
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="due">Fälligkeit</option>
                    <option value="customer">Kunde</option>
                    <option value="site">Objekt</option>
                    <option value="kind">Anlagentyp</option>
                    {showPrices && <option value="price">Preis (höchster zuerst)</option>}
                  </select>
                </label>
                <label className="idx-check">
                  <input type="checkbox" checked={onlyContract} onChange={(e) => setOnlyContract(e.target.checked)} />
                  Nur Wartungsverträge
                </label>
                <label className="idx-check">
                  <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                  Archivierte zeigen
                </label>
                {hasDemo && (
                  <label className="idx-check">
                    <input
                      type="checkbox"
                      checked={showDemo}
                      disabled={allDemo}
                      title={allDemo ? 'Es gibt noch keine echten Anlagen — deshalb stehen die Beispiel-Anlagen hier.' : undefined}
                      onChange={(e) => setDemoRows(e.target.checked)}
                    />
                    Beispieldaten zeigen
                  </label>
                )}
              </div>

              {list.length === 0 ? (
                <div className="card empty">
                  {rows.length === 0
                    ? 'Noch keine Anlagen. Anlagen legt dein Team in der App an — sie erscheinen hier sofort.'
                    : 'Keine Anlagen mit diesen Filtern.'}
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fällig am</th>
                          <th>Anlage</th>
                          <th>Kunde · Objekt</th>
                          <th className="idx-hide-sm">Hersteller / Modell</th>
                          <th className="idx-hide-sm">Letzte Wartung</th>
                          <th>Vertrag</th>
                          {showPrices && <th className="idx-num">Preis</th>}
                          <th aria-label="Termin einplanen" />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.asset.id}>
                            <td>
                              <DueCell info={r.due} retired={r.asset.retired} />
                              <LeakLine leak={r.leak} compact />
                            </td>
                            <td className="wrap">
                              <Link to={`${base}/anlagen/${r.asset.id}`}>{r.asset.name}</Link>
                              {r.asset.is_demo && (
                                <span className="badge" style={{ marginLeft: 6 }}>
                                  Beispiel
                                </span>
                              )}
                              {!r.asset.retired && (
                                <span style={{ marginLeft: 6 }}>
                                  <WarrantyRiskBadge asset={r.asset} due={r.due} />
                                </span>
                              )}
                              <span className="idx-sub">
                                {kindInfo(r.asset.kind).emoji} {kindInfo(r.asset.kind).label}
                              </span>
                            </td>
                            <td className="wrap">
                              {r.site ? (
                                <>
                                  <Link to={`${base}/kunden/${r.site.id}`}>{r.site.operator_name || r.site.name}</Link>
                                  {!r.site.active && (
                                    <span className="badge" style={{ marginLeft: 6 }}>
                                      archiviert
                                    </span>
                                  )}
                                  <span className="idx-sub">
                                    {r.site.operator_name ? r.site.name : ''}
                                    {r.site.address && (
                                      <span className="idx-hide-sm">
                                        {r.site.operator_name ? ' · ' : ''}
                                        {r.site.address}
                                      </span>
                                    )}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="muted wrap idx-hide-sm">{makerModel(r.asset) || '—'}</td>
                            <td className="muted idx-hide-sm">{r.last ? fmtDay(new Date(r.last)) : '—'}</td>
                            <td>{r.asset.contract ? <span className="badge green">🤝 Vertrag</span> : <span className="muted">—</span>}</td>
                            {showPrices && (
                              <td className="idx-num">
                                {r.price !== undefined ? fmtEur(r.price) : <span className="muted">—</span>}
                                {hasContractPrice(r.asset) && <span className="idx-sub">laut Vertrag</span>}
                              </td>
                            )}
                            <td>
                              {!r.asset.retired && (
                                <Link
                                  className="btn ghost small"
                                  title="Wartungstermin in der Plantafel einplanen"
                                  aria-label={`Wartung ${r.asset.name} einplanen`}
                                  to={`${base}/plantafel?neu=1${r.site ? `&objekt=${encodeURIComponent(r.site.id)}` : ''}&anlage=${encodeURIComponent(r.asset.id)}&titel=${encodeURIComponent('Wartung')}`}
                                >
                                  <CalendarPlus className="i" aria-hidden />
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="idx-sum">
                    <b>{list.length}</b> {list.length === 1 ? 'Anlage' : 'Anlagen'}
                    {showPrices && (
                      <>
                        {' '}
                        · Summe der Preise <b>{fmtEur(sum)}</b>
                      </>
                    )}
                    {showPrices && unpriced > 0 && (
                      <>
                        {' '}
                        · {unpriced} ohne Preis — <Link to={`${base}/einstellungen#preise`}>Preise eintragen</Link>
                      </>
                    )}
                  </p>
                </>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
