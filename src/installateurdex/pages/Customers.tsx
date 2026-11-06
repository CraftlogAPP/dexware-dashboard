import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadGuard, useAsync } from '../../components/ui';
import { useInst } from '../context';
import { buildDueRows } from '../portfolio';
import { reminderState, type Site } from '../types';
import { ReminderBadge } from '../badges';

type Sort = 'customer' | 'site' | 'due';

const cmp = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').localeCompare(b ?? '', 'de', { numeric: true, sensitivity: 'base' });

export function Customers() {
  const { data, org, base } = useInst();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('customer');
  const [archived, setArchived] = useState(false);

  const state = useAsync(async () => {
    const [sites, assets, lastService, lastLeak, openDefects, newRequests] = await Promise.all([
      data.sites(),
      data.assets(),
      data.lastService(),
      data.lastLeakCheck(),
      data.defects({ status: 'open' }),
      data.requests({ status: 'new' }),
    ]);
    return { sites, assets, lastService, lastLeak, openDefects, newRequests };
  }, [data]);

  return (
    <>
      <h1>Kunden &amp; Objekte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Jedes Objekt mit seinen Anlagen, fälligen Wartungen und offenen Empfehlungen. Objekte und Anlagen legt dein Team in
        der App an.
      </p>

      <LoadGuard state={state}>
        {({ sites, assets, lastService, lastLeak, openDefects, newRequests }) => {
          const rows = buildDueRows(org, sites, assets, lastService, lastLeak);
          const stats = (s: Site) => {
            const mine = rows.filter((r) => r.asset.site_id === s.id && !r.asset.retired);
            return {
              assets: mine.length,
              // Wartung oder Pflicht-Dichtheitskontrolle (F-Gas), wie die Kacheln der App
              overdue: mine.filter((r) => r.worst === 'overdue').length,
              soon: mine.filter((r) => r.worst === 'd30').length,
              recos: openDefects.filter((d) => d.site_id === s.id).length,
              red: openDefects.some((d) => d.site_id === s.id && d.severity === 'red'),
              requests: newRequests.filter((r) => r.site_id === s.id).length,
              contracts: mine.filter((r) => r.asset.contract).length,
            };
          };
          const q = query.trim().toLowerCase();
          const list = sites
            .filter((s) => archived || s.active)
            .filter(
              (s) =>
                !q ||
                [s.name, s.operator_name, s.address, s.operator_contact, s.customer_email]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(q)),
            )
            .map((s) => ({ s, st: stats(s) }))
            .sort((a, b) =>
              sort === 'due'
                ? b.st.overdue + b.st.soon - (a.st.overdue + a.st.soon) || cmp(a.s.name, b.s.name)
                : sort === 'site'
                  ? cmp(a.s.name, b.s.name)
                  : cmp(a.s.operator_name || a.s.name, b.s.operator_name || b.s.name) || cmp(a.s.name, b.s.name),
            );
          const archivedCount = sites.filter((s) => !s.active).length;

          return (
            <>
              <div className="filter-bar">
                <label className="field" style={{ minWidth: 200, flex: '1 1 240px' }}>
                  Suche
                  <input
                    type="search"
                    value={query}
                    placeholder="Kunde, Objekt, Adresse, Telefon …"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="field" style={{ minWidth: 170, flex: '1 1 170px' }}>
                  Sortieren nach
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="customer">Kunde</option>
                    <option value="site">Objekt</option>
                    <option value="due">Meiste fällige Wartungen</option>
                  </select>
                </label>
                {archivedCount > 0 && (
                  <label className="idx-check">
                    <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                    Archivierte zeigen ({archivedCount})
                  </label>
                )}
              </div>

              {list.length === 0 ? (
                <div className="card empty">
                  {sites.length === 0
                    ? 'Noch keine Objekte. Lege in der App das erste Objekt mit seinen Anlagen an.'
                    : 'Keine Objekte mit diesen Filtern.'}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Kunde · Objekt</th>
                        <th className="idx-hide-sm">Adresse</th>
                        <th className="idx-num">Anlagen</th>
                        <th>Wartung</th>
                        <th className="idx-hide-sm">Empfehlungen</th>
                        <th className="idx-hide-sm">Erinnerung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(({ s, st }) => (
                        <tr key={s.id}>
                          <td className="wrap">
                            <Link to={`${base}/kunden/${s.id}`}>{s.operator_name || s.name}</Link>
                            {!s.active && (
                              <span className="badge" style={{ marginLeft: 6 }}>
                                archiviert
                              </span>
                            )}
                            {s.is_demo && (
                              <span className="badge" style={{ marginLeft: 6 }}>
                                Beispiel
                              </span>
                            )}
                            {st.contracts > 0 && (
                              <span className="badge green" style={{ marginLeft: 6 }} title={`${st.contracts} Anlage(n) mit Wartungsvertrag`}>
                                🤝 Vertragskunde
                              </span>
                            )}
                            {st.requests > 0 && (
                              <span className="badge amber" style={{ marginLeft: 6 }}>
                                {st.requests} neue Anfrage{st.requests === 1 ? '' : 'n'}
                              </span>
                            )}
                            <span className="idx-sub">{s.operator_name ? s.name : ''}</span>
                          </td>
                          <td className="wrap muted idx-hide-sm">{s.address || '—'}</td>
                          <td className="idx-num">{st.assets}</td>
                          <td>
                            {st.overdue > 0 && <span className="badge red">{st.overdue} überfällig</span>}{' '}
                            {st.soon > 0 && <span className="badge amber">{st.soon} in 30 Tagen</span>}
                            {st.overdue === 0 && st.soon === 0 && <span className="muted">—</span>}
                          </td>
                          <td className="idx-hide-sm">
                            {st.recos > 0 ? (
                              <span className={`badge ${st.red ? 'red' : 'amber'}`}>
                                {st.recos} offen{st.red ? ' · Rot' : ''}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="idx-hide-sm">
                            {reminderState(s) !== 'none' ? (
                              <ReminderBadge state={reminderState(s)} />
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
