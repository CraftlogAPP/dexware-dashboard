import { Link, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { DueBadge, JobBadge, SeverityBadge } from '../badges';
import { useInst } from '../context';
import { PrintButton, RequestCard } from '../parts';
import { buildAkteHtml } from '../report';
import { AkteLimitHinweis } from '../AkteLimitHinweis';
import { akteLimitNote } from '../akteLimitNote';
import { Fehlerverlauf } from '../auswertung/Fehlerverlauf';
import { AnlagenSchema } from '../anlage/AnlagenSchema';
import {
  PASS_BASE,
  checkLabel,
  checklistSummary,
  co2eTons,
  dueInfo,
  dueText,
  fmtDay,
  fmtEur,
  fmtMinutes,
  intervalOf,
  kindInfo,
  makerModel,
  measureResult,
  measureRows,
  passUrl,
  assetPrice,
  hasContractPrice,
  leakCheckDuty,
  leakDue,
  remoteServiceLabel,
  warrantyInfo,
  warrantyLabel,
  type Asset,
  type Job,
  type LeakDueInfo,
} from '../types';

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, org, base } = useInst();

  const state = useAsync(async () => {
    const asset = await data.asset(id!);
    if (!asset) return null;
    const [site, jobs, defects, requests, status, photo] = await Promise.all([
      data.site(asset.site_id),
      data.jobs({ itemId: asset.id, limit: 300 }),
      data.defects({ itemId: asset.id }),
      data.requests({ assetId: asset.id }),
      // Wartungsstand, Dichtheit und Einsatz-Zahl vollständig vom Server (die Liste oben zeigt nur die neuesten 300)
      data.assetStatus(asset.id),
      data.assetPhoto(asset.id).catch(() => null),
    ]);
    return { asset, site, jobs, defects, requests, status, photo };
  }, [data, id]);

  return (
    <LoadGuard
      state={state}
      empty={
        <>
          <Link className="idx-back" to={`${base}/kunden`}>
            ← Kunden &amp; Anlagen
          </Link>
          <div className="error-box">Anlage nicht gefunden — sie wurde gelöscht oder der Link ist alt.</div>
        </>
      }
    >
      {(d) => {
        if (!d) return null; // zeigt LoadGuard über `empty`
        const { asset, site, jobs, defects, requests, status, photo } = d;
        const k = kindInfo(asset.kind);
        const last = status.lastService;
        const lastService = new Map<string, string>(last ? [[asset.id, last]] : []);
        const due = dueInfo(last, asset);
        const price = assetPrice(org, asset);
        const fromContract = hasContractPrice(asset);
        // Stillgelegte Anlagen gelten nie als „gefährdet" (keine Wartung mehr fällig).
        const warranty = warrantyInfo(asset, asset.retired ? undefined : due);
        // Pflicht-Dichtheitskontrolle (F-Gas-VO Art. 5): letzte Kontrolle aus den Einsätzen dieser Anlage
        // („undicht" bei der letzten Kontrolle → Nachkontrolle nach einem Monat, wie die App)
        const leak = asset.retired ? null : leakDue(asset, status.leak);
        const open = defects.filter((x) => x.status === 'open');
        const blocked = open.some((x) => x.item_blocked);
        const pass = data.demo ? `${PASS_BASE}demo` : passUrl(asset);
        const validJobs = status.validJobs;

        return (
          <>
            {site ? (
              <Link className="idx-back" to={`${base}/kunden/${site.id}`}>
                ← {site.name}
              </Link>
            ) : (
              <Link className="idx-back" to={`${base}/kunden`}>
                ← Kunden &amp; Anlagen
              </Link>
            )}
            <div className="idx-head">
              <h1>
                {k.emoji} {asset.name}
              </h1>
              {site && (
                <PrintButton
                  label="Anlagenakte drucken / PDF"
                  build={async () => {
                    const [repJobs, repDefects, counts] = await Promise.all([
                      data.jobsForReport({ itemId: asset.id }),
                      data.defectsForReport({ itemId: asset.id }),
                      data.reportCounts({ itemId: asset.id }),
                    ]);
                    return buildAkteHtml({ org, site, assets: [asset], jobs: repJobs, defects: repDefects, lastService, limitNote: akteLimitNote(counts) });
                  }}
                />
              )}
            </div>
            <AkteLimitHinweis itemId={asset.id} />
            <p className="muted" style={{ marginTop: 4 }}>
              {k.label}
              {makerModel(asset) ? ` · ${makerModel(asset)}` : ''}
              {site ? ` · ${site.operator_name ? `${site.operator_name}, ` : ''}${site.name}` : ''}{' '}
              {asset.contract && <span className="badge green">🤝 Wartungsvertrag</span>}{' '}
              {leak && (leak.state === 'overdue' || leak.state === 'soon') && (
                <span className={`badge ${leak.state === 'overdue' ? 'red' : 'amber'}`}>
                  ❄️ {leak.followUp ? 'Nachkontrolle Dichtheit' : 'Dichtheitskontrolle'} {leak.state === 'overdue' ? 'überfällig' : 'bald fällig'}
                </span>
              )}{' '}
              {warranty.atRisk ? (
                <span className="badge red">⚠️ Garantie gefährdet</span>
              ) : (
                warranty.active && <span className="badge external">🛡️ {warrantyLabel(warranty)}</span>
              )}{' '}
              {asset.retired && <span className="badge">außer Betrieb</span>}{' '}
              {blocked && <span className="badge red">außer Betrieb (roter Mangel)</span>}{' '}
              {asset.is_demo && <span className="badge">Beispiel</span>}
            </p>
            {warranty.atRisk && warranty.until && (
              <div className="error-box">
                ⚠️ <b>Garantie gefährdet:</b> Die Garantie läuft bis {fmtDay(warranty.until)}, die Wartung ist{' '}
                {due.daysLeft !== null && due.daysLeft < 0 ? `seit ${-due.daysLeft} ${due.daysLeft === -1 ? 'Tag' : 'Tagen'} ` : ''}
                überfällig.{asset.warranty_note ? ` Bedingung laut Eintrag: ${asset.warranty_note}.` : ''} Viele Hersteller knüpfen
                die Garantie an regelmäßige Wartung — was genau gilt, regelt der Hersteller.
              </div>
            )}

            {/* Schaubild wie in der App: Quelle → Gerät → Verbraucher, fließende Leitungen, Status-Licht, Kennzahlen */}
            <div className="idx-schema-wrap">
              <AnlagenSchema asset={asset} stand={{ lastService: last, leak: status.leak, defects: open }} />
            </div>

            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Nächste Wartung</div>
                <div className="kpi-value" style={{ fontSize: 22 }}>
                  {asset.retired ? '—' : due.dueAt ? fmtDay(due.dueAt) : 'kein Datum'}
                </div>
                <div className="kpi-sub">
                  {asset.retired ? (
                    'außer Betrieb'
                  ) : (
                    <>
                      <DueBadge info={due} /> {due.dueAt ? dueText(due) : 'keine Wartung erfasst'}
                    </>
                  )}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Letzte Wartung</div>
                <div className="kpi-value" style={{ fontSize: 22 }}>
                  {last ? fmtDay(new Date(last)) : '—'}
                </div>
                <div className="kpi-sub">Intervall {intervalOf(asset)} Monate</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Preis je Wartung</div>
                <div className="kpi-value" style={{ fontSize: 22 }}>
                  {price !== undefined ? fmtEur(price) : '—'}
                </div>
                <div className="kpi-sub">
                  {price === undefined ? (
                    fromContract ? (
                      'laut Wartungsvertrag ohne Preis'
                    ) : (
                      <Link to={`${base}/einstellungen#preise`}>Preis eintragen</Link>
                    )
                  ) : asset.contract ? (
                    `${fromContract ? 'laut Wartungsvertrag' : 'Vertrag zum Typpreis'} · ${fmtEur(
                      Math.round(price * (12 / intervalOf(asset)) * 100) / 100,
                    )} im Jahr`
                  ) : (
                    k.label
                  )}
                </div>
              </div>
              {leak && (
                <div className="kpi" title={leak.duty.reason}>
                  <div className="kpi-label">❄️ Dichtheitskontrolle (F-Gas)</div>
                  <div className="kpi-value" style={{ fontSize: 22 }}>
                    {leak.dueAt ? fmtDay(leak.dueAt) : 'keine erfasst'}
                  </div>
                  <div className="kpi-sub">
                    {leak.dueAt && <DueBadge info={leak} />}{' '}
                    {leak.followUp ? 'Nachkontrolle nach „undicht“' : `alle ${leak.duty.months} Monate`}
                  </div>
                </div>
              )}
              <div className="kpi">
                <div className="kpi-label">Einsätze</div>
                <div className="kpi-value" style={{ fontSize: 22 }}>
                  {validJobs}
                </div>
                <div className="kpi-sub">
                  {open.length > 0 ? `${open.length} offene Empfehlung${open.length === 1 ? '' : 'en'}` : 'keine offenen Empfehlungen'}
                </div>
              </div>
            </div>

            <div className="idx-cols">
              <div>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2>Zeitstrahl der Einsätze</h2>
                </div>
                {jobs.length === 0 ? (
                  <div className="card empty">Für diese Anlage ist noch kein Einsatz dokumentiert.</div>
                ) : (
                  <ol className="idx-timeline">
                    {jobs.map((j) => (
                      <TimelineItem key={j.id} j={j} asset={asset} />
                    ))}
                  </ol>
                )}
              </div>

              <div className="idx-stack">
                <div className="card">
                  <h3 className="idx-card-title">Stammdaten</h3>
                  <MasterData asset={asset} leak={leak} />
                  {photo && (
                    <div style={{ marginTop: 14 }}>
                      <h3 className="idx-card-title">Typenschild</h3>
                      <a href={photo} target="_blank" rel="noreferrer" title="Foto in voller Größe öffnen">
                        <img src={photo} alt={`Typenschild ${asset.name}`} style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} loading="lazy" />
                      </a>
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3 className="idx-card-title">Offene Empfehlungen ({open.length})</h3>
                  {open.length === 0 ? (
                    <span className="muted">Keine offenen Empfehlungen.</span>
                  ) : (
                    <div className="idx-reco-list">
                      {open.map((x) => (
                        <div key={x.id} className="idx-reco-item">
                          <div className="row" style={{ gap: 8 }}>
                            <SeverityBadge severity={x.severity} />
                            {x.item_blocked && <span className="badge red">außer Betrieb</span>}
                          </div>
                          <b>{x.title}</b>
                          {x.description && <span className="small muted">{x.description}</span>}
                          <span className="small muted">
                            seit {fmtDateTime(x.created_at)}
                            {x.reporter_name ? ` · ${x.reporter_name}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {defects.length > open.length && (
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      {defects.length - open.length} erledigte Empfehlung{defects.length - open.length === 1 ? '' : 'en'} stehen in
                      der gedruckten Akte.
                    </p>
                  )}
                </div>

                {/* Fehlercode-Verlauf wie in der App (nur aus Einsätzen, ohne KI) */}
                {!asset.retired && <Fehlerverlauf asset={asset} />}

                <div className="card">
                  <h3 className="idx-card-title">QR-Anlagenpass</h3>
                  {pass ? (
                    <>
                      <p className="small" style={{ marginTop: 0 }}>
                        Diese Seite sieht der Kunde, wenn er den QR-Aufkleber an der Anlage scannt: Anlage, dein Betrieb,
                        Wartungsstand — ohne Namen und Adresse.
                      </p>
                      <a className="btn ghost small" href={pass} target="_blank" rel="noreferrer">
                        <ExternalLink className="i" aria-hidden /> Anlagenpass öffnen
                      </a>
                    </>
                  ) : (
                    <span className="muted small">
                      {asset.retired || asset.is_demo
                        ? 'Für außer Betrieb genommene Anlagen und Beispieldaten gibt es keinen Anlagenpass.'
                        : 'Noch kein Anlagenpass-Schlüssel vorhanden.'}
                    </span>
                  )}
                </div>

                {requests.length > 0 && (
                  <div>
                    <h3 className="section-head" style={{ margin: '0 0 10px', fontSize: 15 }}>
                      Anfragen zu dieser Anlage
                    </h3>
                    <div className="idx-req-list">
                      {requests.slice(0, 5).map((r) => (
                        <RequestCard key={r.id} r={r} asset={asset} site={site ?? undefined} base={base} />
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
  );
}

function MasterData({ asset, leak }: { asset: Asset; leak: LeakDueInfo | null }) {
  const k = kindInfo(asset.kind);
  const co2e = co2eTons(asset.refrigerant, asset.refrigerant_kg);
  const w = warrantyInfo(asset);
  // Mit Pflicht: Intervall + Grundlage + nächste Frist; ohne Pflicht: die Begründung (wie im App-Formular).
  const duty = leakCheckDuty(asset);
  const leakText = !duty
    ? null
    : duty.months === null
      ? duty.reason
      : `alle ${duty.months} Monate (${duty.basis}${asset.fgas_hermetic ? ', hermetisch geschlossen' : ''}${
          asset.fgas_leak_detection ? ', mit Leckage-Erkennungssystem' : ''
        })${
          // Wortlaut wie im F-Gas-Logbuch der App
          leak?.dueAt
            ? ` · ${leak.followUp ? 'Nachkontrolle nach „undicht“' : 'nächste'} bis ${fmtDay(leak.dueAt)}${leak.state === 'overdue' ? ' — überfällig' : ''}`
            : asset.retired
              ? ''
              : ' · noch keine Kontrolle dokumentiert'
        }`;
  const rows: [string, string | null][] = [
    ['Typ', `${k.emoji} ${k.label}`],
    ['Hersteller', asset.manufacturer],
    ['Modell', asset.model],
    ['Seriennummer', asset.serial_no],
    ['Baujahr', asset.build_year],
    ['In Betrieb seit', asset.install_date ? fmtDay(new Date(`${asset.install_date.slice(0, 10)}T12:00:00`)) : null],
    ['Leistung', asset.power_kw ? `${asset.power_kw} kW` : null],
    [
      'Kältemittel',
      asset.refrigerant
        ? `${asset.refrigerant}${asset.refrigerant_kg ? ` · ${asset.refrigerant_kg} kg` : ''}${
            co2e !== undefined ? ` · ${co2e < 0.01 ? '< 0,01' : co2e.toLocaleString('de-DE')} t CO₂e` : ''
          }`
        : null,
    ],
    ['Einbauort', asset.location],
    ['Wartungsintervall', `${intervalOf(asset)} Monate${asset.interval_months ? '' : ' (Standard für den Typ)'}`],
    [
      'Wartungsvertrag',
      asset.contract
        ? `ja${asset.contract_price != null ? ` · ${fmtEur(asset.contract_price)} je Wartung laut Vertrag` : ' · Preis wie beim Anlagentyp'}`
        : 'nein',
    ],
    [
      'Garantie',
      w.until
        ? `${w.active ? 'bis' : 'abgelaufen am'} ${fmtDay(w.until)}${asset.warranty_note ? ` — ${asset.warranty_note}` : ''}`
        : null,
    ],
    ['Fernbetreuung', remoteServiceLabel(asset.remote_service)],
    ['Dichtheitskontrolle', leakText],
    ['Notizen', asset.notes],
    [
      'Außer Betrieb',
      asset.retired ? `${asset.retired_at ? fmtDay(new Date(asset.retired_at)) : 'ja'}${asset.retire_reason ? ` — ${asset.retire_reason}` : ''}` : null,
    ],
  ];
  return (
    <dl className="idx-dl">
      {rows
        .filter(([, v]) => v)
        .map(([label, v]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd className={label === 'Notizen' ? 'idx-text' : undefined}>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function TimelineItem({ j, asset }: { j: Job; asset: Asset }) {
  const measures = measureRows(j.type, asset.kind, j.measurements);
  const mr = measureResult(asset.kind, j.measurements, j.type);
  const summary = checklistSummary(j.checklist);
  const defectsInList = Object.entries(j.checklist ?? {}).filter(([, v]) => v === 'defect');
  const materials = (j.materials ?? []).filter((m) => m?.name?.trim());
  const { can, base } = useInst(); // Rechnung aus Einsatz (geld/Beleg.tsx) — wie App „🧾 Rechnung“ beim Einsatz, Portal-Rechnungen mit Recht „Rechnungen“
  const isOwner = can('rechnungen');

  return (
    <li className={`idx-tl-item ${j.type === 'repair' ? 'repair' : ''} ${j.canceled ? 'canceled' : ''}`}>
      <span className="idx-tl-dot" aria-hidden />
      <div className="idx-tl-card">
        <div className="idx-tl-head">
          <span className="idx-tl-date">{fmtDateTime(j.started_at)}</span>
          <JobBadge type={j.type} />
          {j.canceled && <span className="badge red">Storniert</span>}
          {isOwner && !j.canceled && (
            <Link className="badge" to={`${base}/rechnungen/neu?einsatz=${encodeURIComponent(j.id)}`} title="Rechnung zu diesem Einsatz — Arbeitszeit, Anfahrt und Material sind schon drin">
              🧾 Rechnung
            </Link>
          )}
          <span className="idx-tl-who">{j.inspector_name ? `Monteur: ${j.inspector_name}` : ''}</span>
        </div>
        {j.canceled && (
          <div className="idx-storno">
            Storniert{j.canceled_at ? ` am ${fmtDateTime(j.canceled_at)}` : ''}: {j.cancel_reason || '—'}
          </div>
        )}
        {j.work_done && (
          <div className="idx-tl-section">
            <span className="lbl">Arbeiten</span>
            <div className="idx-text">{j.work_done}</div>
          </div>
        )}
        {summary && (
          <div className="idx-tl-section">
            <span className="lbl">Checkliste</span>
            {defectsInList.length > 0 ? (
              <span style={{ color: '#fca5a5' }}>Mangel bei: {defectsInList.map(([id]) => checkLabel(id)).join(', ')}</span>
            ) : (
              <span className="muted">{summary}</span>
            )}
          </div>
        )}
        {measures.length > 0 && (
          <div className="idx-tl-section">
            <span className="lbl">Messwerte</span>
            <div className="idx-chips">
              {measures.map((m) => (
                <span key={m.id} className={`idx-chip ${m.odd ? 'odd' : ''}`} title={m.odd ? 'außerhalb des üblichen Bereichs' : undefined}>
                  <span className="k">{m.label}</span>
                  <span className="v">
                    {m.value}
                    {m.unit ? ` ${m.unit}` : ''}
                    {m.odd ? ' ⚠︎' : ''}
                  </span>
                </span>
              ))}
            </div>
            {mr && (
              <div className="small" style={{ marginTop: 5, color: mr.red ? '#fcd34d' : 'var(--muted)' }}>
                {mr.text}
              </div>
            )}
          </div>
        )}
        {materials.length > 0 && (
          <div className="idx-tl-section">
            <span className="lbl">Material</span>
            <ul className="idx-list">
              {materials.map((m, i) => (
                <li key={i}>
                  {m.qty}
                  {m.unit ? ` ${m.unit}` : ''} × {m.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {j.work_minutes ? (
          <div className="idx-tl-section">
            <span className="lbl">Arbeitszeit</span>
            {fmtMinutes(j.work_minutes)}
          </div>
        ) : null}
        {j.follow_up && (
          <div className="idx-tl-section">
            <span className="lbl">🔁 Folgeeinsatz vorgesehen</span>
            <div className="idx-reco">{j.follow_up}</div>
          </div>
        )}
        {j.recommendations && (
          <div className="idx-tl-section">
            <span className="lbl">Empfehlung an den Kunden</span>
            <div className="idx-reco">{j.recommendations}</div>
          </div>
        )}
        {j.notes && (
          <div className="idx-tl-section">
            <span className="lbl">Notiz</span>
            <div className="idx-text">{j.notes}</div>
          </div>
        )}
        {j.customer_signer_name && (
          <div className="idx-tl-section small muted">Unterschrieben von {j.customer_signer_name} (Kunde)</div>
        )}
      </div>
    </li>
  );
}
