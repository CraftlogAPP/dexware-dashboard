// Anlagenakte zum Drucken / als PDF — Aufbau nach InstallateurDex/mobile/src/pdf/report.ts
// (buildReportHtml), Ausgabe über openReportWindow (src/lib/print.ts) im Browser-Druckdialog.
// Für eine Anlage (Anlagenakte) oder ein ganzes Objekt (Objekt-Akte, alle Anlagen).
// Gratis-Betriebe bekommen wie in der App das Wasserzeichen; Pro nutzt Logo/Farbe des Betriebs.

import { fmtDateTime } from '../lib/format';
import { gpsProofHtml, gpsProofNote, proofStampHtml } from '../lib/gpsProof';
import {
  checkLabel,
  co2eTons,
  dueInfo,
  fmtDay,
  fmtMinutes,
  isProOrg,
  jobInfo,
  kindInfo,
  leakInfoFromJobs,
  leakCheckDuty,
  leakDue,
  makerModel,
  remoteServiceLabel,
  warrantyInfo,
  warrantyLabel,
  measureResult,
  measureRows,
  SEVERITY_LABELS,
  type Asset,
  type DefectWithPhotos,
  type InstOrg,
  type JobWithPhotos,
  type LeakInfo,
  type Site,
} from './types';

const DEFAULT_COLOR = '#B5651D'; // Kupfer wie im App-PDF
const DISCLAIMER =
  'Dieses Protokoll dokumentiert die durchgeführten Arbeiten. Es ersetzt keine vom Hersteller für die Garantie vorgeschriebenen Formulare. ' +
  'Die fachliche Bewertung liegt beim ausführenden Fachbetrieb.';

const SEVERITY_BADGE: Record<DefectWithPhotos['severity'], { fg: string; bg: string }> = {
  green: { fg: '#16A34A', bg: '#DCFCE7' },
  amber: { fg: '#EA580C', bg: '#FFEDD5' },
  red: { fg: '#DC2626', bg: '#FEE2E2' },
};
const RESULT_LABEL = { ok: 'in Ordnung', defect: 'Mangel', na: 'entfällt' } as const;
const RESULT_COLOR = { ok: '#16A34A', defect: '#DC2626', na: '#8A929C' } as const;

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Nur Bild-Daten-URIs und https-Links als Bildquelle zulassen. */
function imgSrc(u: string | null | undefined): string {
  if (!u) return '';
  return /^(data:image\/|https:\/\/)/.test(u) ? esc(u) : '';
}

function css(accent: string): string {
  return `
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #161B22; font-size: 12px; margin: 28px; }
  h1 { font-size: 20px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 20px 0 8px; color: ${accent}; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 3px solid ${accent}; padding-bottom: 10px; margin-bottom: 14px; }
  .logo { max-height: 58px; max-width: 180px; object-fit: contain; }
  .sub { color: #68717D; } .firm { font-size: 11px; color: #4A5560; margin-top: 4px; }
  .grid { display: flex; gap: 12px; margin-bottom: 12px; }
  .box { flex: 1; border: 1.5px solid #D5DBE2; border-radius: 8px; padding: 8px 12px; }
  .box b.t { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: ${accent}; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; } tr { page-break-inside: avoid; break-inside: avoid; }
  th { text-align: left; background: ${accent}1F; padding: 6px; font-size: 11px; border-bottom: 2px solid ${accent}; color: #1B2733; }
  td { padding: 6px; border-bottom: 1px solid #D5DBE2; vertical-align: top; }
  .note { font-size: 10px; color: #68717D; margin-top: 2px; }
  .mono { font-family: Consolas, monospace; font-size: 9.5px; color: #4A5F73; }
  .small { font-size: 10px; }
  .warn { color: #B45309; font-weight: 700; }
  .retired td { color: #8A929C; }
  .storno { color: #DC2626; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .open { color: #EA580C; font-size: 10px; font-weight: 800; margin-top: 2px; }
  .resolved { color: #16A34A; font-size: 10px; font-weight: 700; margin-top: 2px; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; white-space: nowrap; }
  .job { border: 1.5px solid #D5DBE2; border-left: 4px solid ${accent}; border-radius: 8px; padding: 9px 12px; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
  .job.repair { border-left-color: #DC2626; } .job.canceled { opacity: .55; }
  .job-head { display: flex; justify-content: space-between; gap: 10px; font-weight: 700; font-size: 12.5px; }
  .job-head span { font-weight: 400; color: #4A5560; font-size: 11px; }
  .lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #68717D; margin-top: 7px; }
  .text { white-space: pre-wrap; line-height: 1.45; }
  .chkgrid { display: flex; flex-wrap: wrap; column-gap: 16px; }
  .chk { width: calc(50% - 8px); display: flex; align-items: center; gap: 6px; padding: 2px 0; border-bottom: 1px solid #EEE9E3; font-size: 10.5px; }
  .chk .dot { width: 7px; height: 7px; border-radius: 4px; flex: none; } .chk .res { margin-left: auto; font-weight: 700; font-size: 9.5px; }
  .mv { display: inline-block; margin: 2px 10px 2px 0; } .mv b { font-weight: 700; }
  .reco { border-left: 3px solid #EA580C; background: #FFF7ED; padding: 5px 9px; border-radius: 5px; white-space: pre-wrap; margin-top: 3px; }
  .sigs { display: flex; gap: 24px; margin-top: 6px; } .sigs img { height: 40px; max-width: 200px; object-fit: contain; display: block; }
  .photo-block { margin-bottom: 12px; page-break-inside: avoid; } .photo-head { font-weight: 700; font-size: 11px; margin-bottom: 4px; }
  .photo-block img { max-width: 180px; max-height: 135px; margin: 0 6px 6px 0; border-radius: 6px; border: 1.5px solid #D5DBE2; }
  .footer { margin-top: 20px; font-size: 10px; color: #68717D; border-top: 1.5px solid #D5DBE2; padding-top: 8px; }
  .watermark { position: fixed; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-24deg);
    font-size: 44px; font-weight: 800; color: rgba(185, 28, 28, 0.10); pointer-events: none; }
  @media print { body { margin: 12mm; } }`;
}

function jobBlock(j: JobWithPhotos, asset: Asset | undefined, showAsset: boolean): string {
  const info = jobInfo(j.type);
  const ids = Object.keys(j.checklist ?? {});
  const okCount = ids.filter((id) => j.checklist[id] === 'ok').length;
  const checklist = ids.length
    ? `<div class="lbl">Checkliste (${okCount} von ${ids.length} in Ordnung)</div><div class="chkgrid">${ids
        .map((id) => {
          const r = j.checklist[id];
          return `<div class="chk"><span class="dot" style="background:${RESULT_COLOR[r] ?? '#8A929C'}"></span>${esc(checkLabel(id))}<span class="res" style="color:${RESULT_COLOR[r] ?? '#8A929C'}">${RESULT_LABEL[r] ?? esc(String(r))}</span></div>`;
        })
        .join('')}</div>`
    : '';
  const rows = measureRows(j.type, asset?.kind, j.measurements);
  const mr = measureResult(asset?.kind, j.measurements, j.type);
  const measures = rows.length
    ? `<div class="lbl">Messwerte</div><div>${rows
        .map((m) => `<span class="mv ${m.odd ? 'warn' : ''}">${esc(m.label)}: <b>${esc(m.value)}${m.unit ? ` ${esc(m.unit)}` : ''}</b>${m.odd ? ' ⚠︎' : ''}</span>`)
        .join('')}</div>${mr ? `<div class="note ${mr.red ? 'warn' : ''}">${esc(mr.text)}</div>` : ''}`
    : '';
  const materials = (j.materials ?? []).filter((m) => m?.name?.trim());
  const sigs = [
    j.signature && imgSrc(j.signature) ? `<div><img src="${imgSrc(j.signature)}" alt="Unterschrift Monteur"/><div class="note">${esc(j.inspector_name || 'Monteur')}</div></div>` : '',
    j.customer_signature && imgSrc(j.customer_signature)
      ? `<div><img src="${imgSrc(j.customer_signature)}" alt="Unterschrift Kunde"/><div class="note">${esc(j.customer_signer_name || 'Kunde')}</div></div>`
      : '',
  ].filter(Boolean);
  return `<div class="job ${j.type === 'repair' ? 'repair' : ''} ${j.canceled ? 'canceled' : ''}">
    <div class="job-head"><div>${esc(info.emoji)} ${esc(info.label)}${showAsset && asset ? ` · ${esc(asset.name)}` : ''}</div>
      <span>${fmtDateTime(j.started_at)}${j.inspector_name ? ` · ${esc(j.inspector_name)}` : ''}</span></div>
    ${j.canceled ? `<div class="storno">STORNIERT: ${esc(j.cancel_reason)}${j.canceled_at ? ` (${fmtDateTime(j.canceled_at)})` : ''}</div>` : ''}
    ${j.work_done ? `<div class="lbl">Durchgeführte Arbeiten</div><div class="text">${esc(j.work_done)}</div>` : ''}
    ${checklist}
    ${measures}
    ${materials.length ? `<div class="lbl">Material</div><div>${materials.map((m) => `${esc(m.qty)}${m.unit ? ` ${esc(m.unit)}` : ''} × ${esc(m.name)}`).join(' · ')}</div>` : ''}
    ${j.work_minutes ? `<div class="lbl">Arbeitszeit</div><div>${esc(fmtMinutes(j.work_minutes))}</div>` : ''}
    ${j.follow_up ? `<div class="lbl">Folgeeinsatz vorgesehen</div><div class="reco">${esc(j.follow_up)}</div>` : ''}
    ${j.recommendations ? `<div class="lbl">Empfehlung</div><div class="reco">${esc(j.recommendations)}</div>` : ''}
    ${j.notes ? `<div class="lbl">Notiz</div><div class="text">${esc(j.notes)}</div>` : ''}
    ${j.lat != null || j.end_lat != null ? `<div class="lbl">GPS-Stempel</div><div class="small">${gpsProofHtml(j, 'Objekt')}</div>` : ''}
    ${j.entry_hash ? `<div class="small">${proofStampHtml(j, fmtDateTime)}</div>` : ''}
    ${sigs.length ? `<div class="lbl">Unterschriften</div><div class="sigs">${sigs.join('')}</div>` : j.customer_signer_name ? `<div class="note">Unterschrieben von ${esc(j.customer_signer_name)} (Kunde)</div>` : ''}
  </div>`;
}

function photoAppendix(jobs: JobWithPhotos[], defects: DefectWithPhotos[], assets: Asset[]): string {
  const name = (id: string) => assets.find((a) => a.id === id)?.name ?? 'Anlage';
  const blocks: string[] = [];
  for (const j of jobs) {
    const photos = (j.photo_urls ?? []).map(imgSrc).filter(Boolean);
    if (!photos.length) continue;
    blocks.push(`<div class="photo-block"><div class="photo-head">${fmtDateTime(j.started_at)} — ${esc(name(j.item_id))}, ${esc(jobInfo(j.type).label)}${j.canceled ? ' (storniert)' : ''}</div>
      ${photos.map((u) => `<img src="${u}" alt=""/>`).join('')}</div>`);
  }
  for (const d of defects) {
    const photos = [...(d.photo_urls ?? []), ...(d.resolution_photo_urls ?? [])].map(imgSrc).filter(Boolean);
    if (!photos.length) continue;
    blocks.push(`<div class="photo-block"><div class="photo-head">Empfehlung/Mangel: ${esc(d.title)} (${fmtDateTime(d.created_at)})</div>
      ${photos.map((u) => `<img src="${u}" alt=""/>`).join('')}</div>`);
  }
  return blocks.length ? `<h2>Anhang: Fotos</h2>${blocks.join('')}` : '';
}

/** Pflicht-Dichtheitskontrolle (F-Gas-VO Art. 5) wie im F-Gas-Logbuch der App; ohne Pflicht die Begründung. */
function leakNote(a: Asset, last: LeakInfo | undefined): string {
  const duty = leakCheckDuty(a);
  if (!duty) return '';
  if (duty.months === null) return `<div class="note">${esc(duty.reason)}</div>`;
  const lk = a.retired ? null : leakDue(a, last);
  return (
    `<div class="note"><b>Dichtheitskontrolle alle ${duty.months} Monate</b> (Art. 5 F-Gas-VO; ${esc(duty.basis)}` +
    `${a.fgas_hermetic ? ', hermetisch geschlossen' : ''}${a.fgas_leak_detection ? ', mit Leckage-Erkennungssystem' : ''})` +
    (a.retired
      ? ''
      : lk?.dueAt
        ? ` · ${lk.followUp ? 'Nachkontrolle nach „undicht“' : 'nächste'} bis <b>${fmtDay(lk.dueAt)}</b>${
            lk.state === 'overdue' ? ' <span class="storno">— überfällig</span>' : ''
          }`
        : ' · noch keine Kontrolle dokumentiert') +
    '</div>'
  );
}

export function buildAkteHtml(opts: {
  org: InstOrg;
  site: Site;
  /** Eine Anlage = Anlagenakte; mehrere = Objekt-Akte */
  assets: Asset[];
  jobs: JobWithPhotos[];
  defects: DefectWithPhotos[];
  lastService: Map<string, string>;
  /** Zusatzhinweis (z. B. Fotos gekürzt) */
  extraNote?: string;
  /** Akte gekappt (nur die neuesten Einsätze/Empfehlungen) — steht gut sichtbar oben (akteLimitNote.ts) */
  limitNote?: string | null;
}): string {
  const { org, site, assets, lastService } = opts;
  const lastLeak = leakInfoFromJobs(opts.jobs);
  const pro = isProOrg(org);
  const accent = pro && org.brand_color && /^#[0-9A-Fa-f]{6}$/.test(org.brand_color) ? org.brand_color : DEFAULT_COLOR;
  const logo = pro && imgSrc(org.logo_url) ? `<img class="logo" src="${imgSrc(org.logo_url)}" alt="Logo" />` : '';
  const watermark = pro ? '' : '<div class="watermark">Erstellt mit InstallateurDex Free</div>';
  const single = assets.length === 1;
  const title = single ? `Anlagenakte ${assets[0].name}` : 'Objekt-Akte';
  const jobs = [...opts.jobs].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const defects = [...opts.defects].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const active = jobs.filter((j) => !j.canceled).length;
  const openCount = defects.filter((d) => d.status === 'open').length;
  const blocked = new Set(defects.filter((d) => d.status === 'open' && d.item_blocked).map((d) => d.item_id));

  const sorted = [...assets].sort((a, b) => Number(a.retired) - Number(b.retired) || a.name.localeCompare(b.name, 'de', { numeric: true }));
  const inventory = sorted
    .map((a) => {
      const last = lastService.get(a.id);
      const due = dueInfo(last, a);
      let status = '<span class="badge" style="color:#16A34A;background:#DCFCE7;">in Ordnung</span>';
      if (a.retired) status = '<span class="badge" style="color:#555;background:#EEE;">außer Betrieb</span>';
      else if (blocked.has(a.id)) status = '<span class="badge" style="color:#DC2626;background:#FEE2E2;">außer Betrieb (Mangel)</span>';
      else if (due.state === 'overdue') status = '<span class="badge" style="color:#EA580C;background:#FFEDD5;">Wartung fällig</span>';
      else if (due.state === 'soon') status = '<span class="badge" style="color:#B45309;background:#FEF3C7;">bald fällig</span>';
      else if (due.state === 'never') status = '<span class="badge" style="color:#555;background:#EEE;">keine Wartung erfasst</span>';
      const co2e = co2eTons(a.refrigerant, a.refrigerant_kg);
      const detail = [
        a.serial_no ? `Seriennr. ${esc(a.serial_no)}` : '',
        a.build_year ? `Bj. ${esc(a.build_year)}` : '',
        a.install_date ? `in Betrieb seit ${esc(fmtDay(new Date(`${a.install_date.slice(0, 10)}T12:00:00`)))}` : '',
        a.power_kw ? `${esc(a.power_kw)} kW` : '',
        a.refrigerant ? `${esc(a.refrigerant)}${a.refrigerant_kg ? ` · ${esc(a.refrigerant_kg)} kg` : ''}${co2e !== undefined ? ` · ${co2e < 0.01 ? '< 0,01' : co2e.toLocaleString('de-DE')} t CO₂e` : ''}` : '',
        a.location ? esc(a.location) : '',
      ].filter(Boolean);
      // Wie im App-PDF: „Wartungsvertrag ✓" und „Garantie bis … — Bedingung" im Anlage-Kasten.
      const w = warrantyInfo(a, a.retired ? undefined : due);
      const remote = remoteServiceLabel(a.remote_service);
      const contractNote =
        (a.contract ? '<div class="note"><b>Wartungsvertrag ✓</b></div>' : '') +
        (w.until
          ? `<div class="note">${esc(warrantyLabel(w))}${a.warranty_note ? ` — ${esc(a.warranty_note)}` : ''}${
              w.atRisk ? ' <span class="storno">Wartung überfällig — Garantie gefährdet</span>' : ''
            }</div>`
          : '') +
        (remote ? `<div class="note">Fernbetreuung: ${esc(remote)}</div>` : '') +
        leakNote(a, lastLeak.get(a.id));
      return `<tr class="${a.retired ? 'retired' : ''}">
        <td><b>${esc(a.name)}</b></td>
        <td>${esc(kindInfo(a.kind).label)}${makerModel(a) ? ` · ${esc(makerModel(a))}` : ''}${detail.length ? `<div class="note">${detail.join(' · ')}</div>` : ''}${contractNote}</td>
        <td>${last ? fmtDay(new Date(last)) : '—'}</td>
        <td>${a.retired ? '—' : due.dueAt ? fmtDay(due.dueAt) : '—'}</td>
        <td>${status}</td>
      </tr>`;
    })
    .join('');

  const defectRows = defects
    .map((d) => {
      const b = SEVERITY_BADGE[d.severity];
      const resolution =
        d.status === 'resolved'
          ? `<div class="resolved">✓ Erledigt ${d.resolved_at ? fmtDateTime(d.resolved_at) : ''}${d.resolver_name ? ` von ${esc(d.resolver_name)}` : ''}${d.resolution_note ? ` — ${esc(d.resolution_note)}` : ''}</div>`
          : '<div class="open">OFFEN</div>';
      return `<tr><td>${fmtDateTime(d.created_at)}</td>
        <td>${esc(d.title)}${d.description ? `<div class="note">${esc(d.description)}</div>` : ''}${resolution}</td>
        ${single ? '' : `<td>${esc(assets.find((a) => a.id === d.item_id)?.name ?? 'Anlage')}${d.item_blocked ? '<div class="storno">außer Betrieb</div>' : ''}</td>`}
        <td><span class="badge" style="color:${b.fg};background:${b.bg};">${esc(SEVERITY_LABELS[d.severity])}</span></td></tr>`;
    })
    .join('');

  const assetById = new Map(assets.map((a) => [a.id, a]));
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(site.name)}</title><style>${css(accent)}</style></head><body>
  ${watermark}
  <div class="head">
    <div>
      <h1>${esc(title)}</h1>
      <div class="sub">Stand ${fmtDay(new Date())}</div>
      <div class="firm">${esc(org.name)}${org.address ? ` · ${esc(org.address)}` : ''}${org.public_phone ? ` · ${esc(org.public_phone)}` : ''}${org.public_email ? ` · ${esc(org.public_email)}` : ''}</div>
    </div>
    ${logo}
  </div>
  <div class="grid">
    <div class="box"><b class="t">Kunde / Objekt</b>
      ${site.operator_name ? `<div><b>${esc(site.operator_name)}</b></div>` : ''}
      <div>${esc(site.name)}</div>
      ${site.address ? `<div>${esc(site.address)}</div>` : ''}
    </div>
    <div class="box"><b class="t">Einsätze</b>
      <div>${active} dokumentiert${jobs.length !== active ? ` (+ ${jobs.length - active} storniert, gekennzeichnet)` : ''}</div>
      ${openCount ? `<div class="note">${openCount} offene Empfehlung${openCount === 1 ? '' : 'en'}</div>` : ''}
    </div>
  </div>
  ${opts.limitNote ? `<p class="warn">ℹ ${esc(opts.limitNote)}</p>` : ''}

  <h2>${single ? 'Anlage' : `Anlagen (${assets.filter((a) => !a.retired).length})`}</h2>
  <table><thead><tr><th>Nr.</th><th>Anlage</th><th>Letzte Wartung</th><th>Nächste Wartung</th><th>Status</th></tr></thead>
    <tbody>${inventory || '<tr><td colspan="5">Keine Anlagen.</td></tr>'}</tbody></table>

  ${defects.length ? `<h2>Empfehlungen & Mängel (${defects.length}${openCount ? `, davon ${openCount} offen` : ', alle erledigt'})</h2>
  <table><thead><tr><th>Gemeldet</th><th>Empfehlung / Maßnahme</th>${single ? '' : '<th>Anlage</th>'}<th>Einstufung</th></tr></thead><tbody>${defectRows}</tbody></table>` : ''}

  <h2>Einsätze (neueste zuerst)</h2>
  ${jobs.length ? jobs.map((j) => jobBlock(j, assetById.get(j.item_id), !single)).join('') : '<div class="note">Noch keine Einsätze dokumentiert.</div>'}

  ${photoAppendix(jobs, defects, assets)}
  ${gpsProofNote(jobs, 'Objekt')}
  ${opts.extraNote ? `<div class="note">${esc(opts.extraNote)}</div>` : ''}
  <div class="footer">
    Einsätze sind fortlaufend und unveränderlich dokumentiert; Korrekturen erfolgen ausschließlich als gekennzeichnete
    Stornierungen mit Begründung. ${DISCLAIMER}<br />
    Erstellt am ${fmtDateTime(new Date().toISOString())} mit InstallateurDex — installateurdex.dexware.app
  </div>
</body></html>`;
}
