import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { DueCell, JobBadge, LeakLine, LegalLine, ReminderBadge, SeverityBadge, WarrantyRiskBadge } from '../badges';
import { useInst } from '../context';
import { ContactValue, PrintButton, RequestCard } from '../parts';
import { buildDueRows, byDue } from '../portfolio';
import { buildAkteHtml } from '../report';
import { AkteLimitHinweis } from '../AkteLimitHinweis';
import { akteLimitNote } from '../akteLimitNote';
import { fmtEur, kindInfo, makerModel, reminderState, type Site } from '../types';
import { AnlagenSchema } from '../anlage/AnlagenSchema';

/**
 * Kundenportal „Mein Zuhause“ (zuhause.sql) je Objekt freigeben — wie die App (SiteFormScreen): nur mit E-Mail des
 * Kunden, nicht für Beispieldaten, nur der Inhaber (RLS site_update). Eine neue E-Mail setzt die Freigabe in der App
 * zurück; hier wird die E-Mail nicht geändert.
 */
function PortalSwitch({ site, onChanged }: { site: Site; onChanged: () => void }) {
  const { data, can } = useInst();
  const isOwner = can('kunden'); // RLS site_update: Inhaber oder Recht „Kunden & Anlagen“
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = site.portal_enabled === true;
  const email = (site.customer_email ?? '').trim();
  if (!email) return <span className="muted">erst mit E-Mail des Kunden möglich (in der App beim Objekt)</span>;
  if (site.is_demo) return <span className="muted">nicht bei Beispieldaten</span>;
  if (!isOwner) return <span className={on ? '' : 'muted'}>{on ? `🏠 freigegeben für ${email}` : 'nicht freigegeben'}</span>;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await data.setSitePortal(site.id, !on);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="row" style={{ gap: 8, alignItems: 'flex-start', cursor: busy ? 'wait' : 'pointer' }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={() => void toggle()} style={{ marginTop: 3 }} />
        <span>
          {on ? <>🏠 freigegeben für <b>{email}</b></> : 'Kundenportal freigeben'}
          <span className="small muted" style={{ display: 'block' }}>
            Der Kunde meldet sich mit genau dieser E-Mail an (Code per Mail) und sieht Anlagen, Fristen, Einsätze und
            Anfragen — ohne Unterschriften und Fotos. Den Zugang schickst du in der App beim Objekt.
          </span>
        </span>
      </label>
      {error && <div className="error-box small" style={{ marginTop: 6 }}>{error}</div>}
    </>
  );
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, org, base, isOwner } = useInst();

  const state = useAsync(async () => {
    const [site, assets, lastService, lastLeak, lastLegal, jobs, defects, requests] = await Promise.all([
      data.site(id!),
      data.assets({ siteId: id }),
      data.lastService(),
      data.lastLeakCheck(),
      data.lastLegalCheck(),
      data.jobs({ siteId: id, limit: 30 }),
      data.defects({ siteId: id }),
      data.requests({ siteId: id }),
    ]);
    return { site, assets, lastService, lastLeak, lastLegal, jobs, defects, requests };
  }, [data, id]);

  return (
    <>
      <Link className="idx-back" to={`${base}/kunden`}>
        ← Kunden &amp; Anlagen
      </Link>
      <LoadGuard state={state}>
        {({ site, assets, lastService, lastLeak, lastLegal, jobs, defects, requests }) => {
          if (!site) return <div className="error-box">Objekt nicht gefunden.</div>;
          const rows = buildDueRows(org, [site], assets, lastService, lastLeak, lastLegal).sort(
            (a, b) => Number(a.asset.retired) - Number(b.asset.retired) || byDue(a, b),
          );
          const assetById = new Map(assets.map((a) => [a.id, a]));
          const open = defects.filter((d) => d.status === 'open');
          const openRequests = requests.filter((r) => r.status === 'new' || r.status === 'scheduled');

          return (
            <>
              <div className="idx-head">
                <h1>{site.name}</h1>
                <div className="row">
                {isOwner && assets.some((a) => !a.retired) && (
                  <Link className="btn ghost small" to={`${base}/kunden/${site.id}/wartungsvertrag`}>
                    🤝 Wartungsvertrag erstellen
                  </Link>
                )}
                <PrintButton
                  label="Objekt-Akte drucken / PDF"
                  build={async () => {
                    const [repJobs, repDefects, counts] = await Promise.all([
                      data.jobsForReport({ siteId: site.id }),
                      data.defectsForReport({ siteId: site.id }),
                      data.reportCounts({ siteId: site.id }),
                    ]);
                    return buildAkteHtml({ org, site, assets, jobs: repJobs, defects: repDefects, lastService, limitNote: akteLimitNote(counts) });
                  }}
                />
                </div>
              </div>
              <AkteLimitHinweis siteId={site.id} />
              <p className="muted" style={{ marginTop: 4 }}>
                {site.operator_name ? `${site.operator_name} · ` : ''}
                {site.address}
                {!site.active && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    archiviert
                  </span>
                )}
              </p>

              <div className="idx-cols" style={{ marginTop: 14 }}>
                <div className="idx-stack">
                  <div>
                    <div className="section-head" style={{ marginTop: 0 }}>
                      <h2>Anlagen ({assets.filter((a) => !a.retired).length})</h2>
                    </div>
                    {rows.length === 0 ? (
                      <div className="card empty">An diesem Objekt ist noch keine Anlage erfasst.</div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th className="idx-hide-sm" aria-label="Schaubild" />
                              <th>Anlage</th>
                              <th>Nächste Wartung</th>
                              <th className="idx-num">Preis</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const blocked = open.some((d) => d.item_id === r.asset.id && d.item_blocked);
                              return (
                                <tr key={r.asset.id}>
                                  {/* ruhiges Schaubild wie in der App (still, ohne Beschriftung) — groß auf der Anlagenseite */}
                                  <td className="idx-hide-sm idx-schema-cell">
                                    <Link to={`${base}/anlagen/${r.asset.id}`} tabIndex={-1}>
                                      <AnlagenSchema
                                        asset={r.asset}
                                        stand={{ lastService: r.last, leak: lastLeak.get(r.asset.id), defects: open }}
                                        size="small"
                                      />
                                    </Link>
                                  </td>
                                  <td className="wrap">
                                    <Link to={`${base}/anlagen/${r.asset.id}`}>
                                      {kindInfo(r.asset.kind).emoji} {r.asset.name}
                                    </Link>
                                    {blocked && (
                                      <span className="badge red" style={{ marginLeft: 6 }}>
                                        außer Betrieb
                                      </span>
                                    )}
                                    {r.asset.contract && (
                                      <span className="badge green" style={{ marginLeft: 6 }}>
                                        🤝 Vertrag
                                      </span>
                                    )}
                                    {!r.asset.retired && (
                                      <span style={{ marginLeft: 6 }}>
                                        <WarrantyRiskBadge asset={r.asset} due={r.due} />
                                      </span>
                                    )}
                                    <span className="idx-sub">
                                      {kindInfo(r.asset.kind).label}
                                      {makerModel(r.asset) ? ` · ${makerModel(r.asset)}` : ''}
                                    </span>
                                  </td>
                                  <td>
                                    <DueCell info={r.due} retired={r.asset.retired} />
                                    <LeakLine leak={r.leak} />
                                    <LegalLine legal={r.legal} own={r.legalOwn} />
                                  </td>
                                  <td className="idx-num">
                                    {r.price !== undefined && !r.asset.retired ? fmtEur(r.price) : <span className="muted">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="section-head" style={{ marginTop: 8 }}>
                      <h2>Letzte Einsätze</h2>
                    </div>
                    {jobs.length === 0 ? (
                      <div className="card empty">Noch kein Einsatz dokumentiert.</div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Datum</th>
                              <th>Einsatz</th>
                              <th>Anlage</th>
                              <th className="idx-hide-sm">Monteur</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobs.slice(0, 15).map((j) => (
                              <tr key={j.id}>
                                <td>{fmtDate(j.started_at)}</td>
                                <td>
                                  <JobBadge type={j.type} canceled={j.canceled} />
                                </td>
                                <td>
                                  <Link to={`${base}/anlagen/${j.item_id}`}>{assetById.get(j.item_id)?.name ?? 'Anlage'}</Link>
                                </td>
                                <td className="muted idx-hide-sm">{j.inspector_name ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="idx-stack">
                  <div className="card">
                    <h3 className="idx-card-title">Kunde</h3>
                    <dl className="idx-dl">
                      <dt>Name</dt>
                      <dd>{site.operator_name || '—'}</dd>
                      <dt>Kontakt</dt>
                      <dd>
                        <ContactValue value={site.operator_contact} />
                      </dd>
                      <dt>Adresse</dt>
                      <dd>
                        {site.address ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {site.address}
                          </a>
                        ) : (
                          '—'
                        )}
                      </dd>
                      <dt>Erinnerungsmail</dt>
                      <dd>
                        {site.customer_email ? (
                          <>
                            <ContactValue value={site.customer_email} />{' '}
                            <ReminderBadge state={reminderState(site)} />
                          </>
                        ) : (
                          <span className="muted">keine E-Mail hinterlegt</span>
                        )}
                      </dd>
                      {site.portal_enabled !== undefined && (
                        <>
                          <dt>Mein Zuhause</dt>
                          <dd>
                            <PortalSwitch site={site} onChanged={state.refresh} />
                          </dd>
                        </>
                      )}
                      {site.notes && (
                        <>
                          <dt>Notizen</dt>
                          <dd className="idx-text">{site.notes}</dd>
                        </>
                      )}
                    </dl>
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      Kundendaten und die Zustimmung zur Erinnerungsmail werden in der App beim Objekt gepflegt.
                    </p>
                  </div>

                  <div className="card">
                    <h3 className="idx-card-title">Offene Empfehlungen ({open.length})</h3>
                    {open.length === 0 ? (
                      <span className="muted">Keine offenen Empfehlungen.</span>
                    ) : (
                      <div className="idx-reco-list">
                        {open.map((d) => (
                          <div key={d.id} className="idx-reco-item">
                            <div className="row" style={{ gap: 8 }}>
                              <SeverityBadge severity={d.severity} />
                              <Link to={`${base}/anlagen/${d.item_id}`} className="small">
                                {assetById.get(d.item_id)?.name ?? 'Anlage'}
                              </Link>
                            </div>
                            <b>{d.title}</b>
                            {d.description && <span className="small muted">{d.description}</span>}
                            <span className="small muted">seit {fmtDateTime(d.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {openRequests.length > 0 && (
                    <div>
                      <h3 className="section-head" style={{ margin: '0 0 10px', fontSize: 15 }}>
                        Offene Anfragen
                      </h3>
                      <div className="idx-req-list">
                        {openRequests.map((r) => (
                          <RequestCard
                            key={r.id}
                            r={r}
                            asset={r.asset_id ? assetById.get(r.asset_id) : undefined}
                            site={site}
                            base={base}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
