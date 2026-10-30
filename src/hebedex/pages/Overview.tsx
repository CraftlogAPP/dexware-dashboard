import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchItems,
  fetchInspectionMeta,
  fetchInspections,
  fetchSites,
  type InspMeta,
} from '../api';
import { InspectionBadge } from '../badges';
import {
  checklistSummary,
  itemNameMap,
  lastInspectionByType,
  siteNameMap,
} from '../labels';
import {
  crackDue,
  dueLabel,
  expertDue,
  type Defect,
  type DueInfo,
  type LiftingItem,
  type Inspection,
  type Site,
} from '../types';

const DUE_BADGE: Record<DueInfo['state'], { cls: string; text: string } | null> = {
  never: { cls: 'badge red', text: 'fällig' },
  overdue: { cls: 'badge red', text: 'überfällig' },
  soon: { cls: 'badge amber', text: 'bald fällig' },
  ok: null,
};

function DueCell({ info }: { info: DueInfo | undefined }) {
  if (!info) return <span className="muted">—</span>;
  const b = DUE_BADGE[info.state];
  return (
    <>
      {dueLabel(info)} {b && <span className={b.cls}>{b.text}</span>}
    </>
  );
}

interface OverviewData {
  sites: Site[];
  items: LiftingItem[];
  /** schmale Metadaten (bis 2000 jüngste Prüfungen) für KPIs + Fälligkeit */
  meta: InspMeta[];
  /** die 10 jüngsten Prüfungen in voller Breite für die Tabelle */
  recentInspections: Inspection[];
  openDefects: Defect[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [sites, items, meta, recentInspections, openDefects] =
      await Promise.all([
        fetchSites(client),
        fetchItems(client),
        fetchInspectionMeta(client, { limit: 2000 }),
        fetchInspections(client, { limit: 10 }),
        fetchDefects(client, { status: 'open' }),
      ]);
    return { sites, items, meta, recentInspections, openDefects };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Prüfpflichten im Blick — live aus der HebeDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ sites, items, meta, recentInspections, openDefects }) => {
          const activeSites = sites.filter((s) => s.active);
          const activeSiteIds = new Set(activeSites.map((s) => s.id));
          const activeItems = items.filter(
            (e) => !e.retired && activeSiteIds.has(e.site_id),
          );
          const siteNames = siteNameMap(sites);
          const itemNames = itemNameMap(items);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const valid = meta.filter((i) => !i.canceled);
          const insp30 = valid.filter(
            (i) => now - new Date(i.started_at).getTime() <= 30 * dayMs,
          );
          const redCount = openDefects.filter((d) => d.severity === 'red').length;

          const lastByType = lastInspectionByType(meta);
          // Fristen wie in der App: DE 12 Monate, AT Kalenderjahr/15 Monate; Ketten + Rissprüfung 3 J.
          const land = orgCtx?.org.land;
          const dueOf = (e: LiftingItem) => ({
            expert: expertDue(lastByType.get(`${e.id}:expert`)?.started_at, land),
            crack: crackDue(e, lastByType.get(`${e.id}:crack`)?.started_at),
          });
          const urgent = (d: DueInfo | undefined) => !!d && d.state !== 'ok';
          const isDue = (d: DueInfo | undefined) => !!d && (d.state === 'overdue' || d.state === 'never');
          const dueItems = activeItems
            .map((e) => ({ e, d: dueOf(e) }))
            .filter(({ d }) => urgent(d.expert) || urgent(d.crack));
          const dueNow = dueItems.filter(({ d }) => isDue(d.expert) || isDue(d.crack)).length;
          // Gesperrt: offener Mangel, der das Teil der Benutzung entzieht.
          const blockedIds = new Set(
            openDefects.filter((d) => d.item_blocked).map((d) => d.item_id),
          );
          const blockedItems = activeItems.filter((e) => blockedIds.has(e.id));

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Standorte</div>
                  <div className="kpi-value">{activeSites.length}</div>
                  <div className="kpi-sub">{sites.length} insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfungen 30 Tage</div>
                  <div className="kpi-value">{insp30.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Mängel</div>
                  <div className="kpi-value">{openDefects.length}</div>
                  <div className="kpi-sub">
                    {redCount > 0
                      ? `davon ${redCount}× Rot — Benutzung entziehen!`
                      : 'keine roten Mängel'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfung fällig</div>
                  <div className="kpi-value">{dueNow}</div>
                  <div className="kpi-sub">
                    {dueItems.length - dueNow > 0
                      ? `+ ${dueItems.length - dueNow} in 30 Tagen · `
                      : ''}
                    von {activeItems.length} aktiven Teilen
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Gesperrt</div>
                  <div className="kpi-value">{blockedItems.length}</div>
                  <div className="kpi-sub">
                    {blockedItems.length > 0
                      ? 'nicht benutzen — instand setzen oder aussondern'
                      : 'kein Teil gesperrt'}
                  </div>
                </div>
              </div>

              {dueItems.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Prüfungen</h2>
                    <Link to="standorte" className="small">
                      Alle Standorte →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Teil</th>
                          <th>Standort</th>
                          <th>Wiederkehrende Prüfung ({land === 'AT' ? 'jedes Kalenderjahr, max. 15 Monate' : 'alle 12 Monate'})</th>
                          <th>Rissprüfung (Ketten, alle 3 Jahre)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dueItems.slice(0, 8).map(({ e, d }) => (
                          <tr key={e.id}>
                            <td>
                              <Link to={`standorte/${e.site_id}`}>{e.name}</Link>
                            </td>
                            <td className="wrap muted">
                              {siteNames.get(e.site_id) ?? '—'}
                            </td>
                            <td className="wrap">
                              <DueCell info={d.expert} />
                            </td>
                            <td className="wrap">
                              <DueCell info={d.crack} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="section-head">
                <h2>Letzte Prüfungen</h2>
                <Link to="pruefungen" className="small">
                  Alle Prüfungen →
                </Link>
              </div>
              {recentInspections.length === 0 ? (
                <div className="card empty">
                  Noch keine Prüfungen dokumentiert. Sobald dein Team in der App
                  dokumentiert, erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Standort</th>
                        <th>Teil</th>
                        <th>Prüfart</th>
                        <th>Ergebnis</th>
                        <th>Geprüft von</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInspections.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link to={`pruefungen/${i.id}`}>
                              {fmtDateTime(i.started_at)}
                            </Link>
                          </td>
                          <td className="wrap">{siteNames.get(i.site_id) ?? '—'}</td>
                          <td className="wrap muted">
                            {itemNames.get(i.item_id) ?? '—'}
                          </td>
                          <td>
                            <InspectionBadge type={i.type} canceled={i.canceled} />
                          </td>
                          <td className="muted wrap">{checklistSummary(i.checklist)}</td>
                          <td className="muted">{i.inspector_name ?? '—'}</td>
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
