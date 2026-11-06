// Reine Auswertungs-Logik des Betriebsportals — 1:1 portiert aus InstallateurDex/mobile/src/lib (gleiche Regeln,
// gleiche Texte, gleiche Ergebnisse wie in der App). Nur die Schreibweise der Felder ist die der Datenbank (snake_case).
// Fälligkeit/Garantie/Dichtheit kommen aus ../types (dort schon wie lib/due.ts, lib/warranty.ts, lib/fgas.ts).

import {
  assetPrice,
  co2eTons,
  dueInfo,
  fmtDay,
  isLeakFound,
  kindInfo,
  leakDue,
  warrantyInfo,
  type Asset,
  type DueInfo,
  type InstOrg,
  type LeakInfo,
  type OpenFollowUp,
  type Site,
} from '../types';

type Land = 'DE' | 'AT' | 'CH';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 'yyyy-mm-dd' (Garantie-Ende) als lokales Datum — wie `new Date(`${d}T00:00:00`)` in der App. */
const localDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`);

// ---------------------------------------------------------------------------
// Garantie-Wächter — wie App lib/warrantyWatch.ts
// ---------------------------------------------------------------------------

/** Spätestens so viele Tage vor Garantie-Ende den Anschluss (Wartungsvertrag) ansprechen. */
export const ENDING_DAYS = 90;

export type WatchKind = 'risk' | 'soon' | 'ending' | 'noContract';

export interface WatchEntry {
  asset: Asset;
  site?: Site;
  kind: WatchKind;
  /** Tage bis Garantie-Ende */
  warrantyDays: number;
  due: DueInfo;
  /** Ein Satz: warum die Anlage auf der Liste steht */
  reason: string;
}

export interface WatchResult {
  entries: WatchEntry[];
  /** Anlagen mit laufender Garantie */
  active: number;
  /** davon mit Wartungsvertrag, also abgesichert */
  covered: number;
  counts: Record<WatchKind, number>;
}

/** Steht in der Bedingung, dass die Garantie an Wartung/Service/Inspektion gebunden ist? */
export function needsService(note?: string | null): boolean {
  return /wartung|service|inspektion|überprüfung|ueberpruefung/i.test(note ?? '');
}

export const WATCH_LABELS: Record<WatchKind, { title: string; short: string; emoji: string }> = {
  risk: { title: 'Garantie gefährdet', short: 'gefährdet', emoji: '🚨' },
  soon: { title: 'Wartung bald fällig, Garantie hängt dran', short: 'Wartung bald', emoji: '⏳' },
  ending: { title: 'Garantie endet bald', short: 'endet bald', emoji: '📅' },
  noContract: { title: 'Ohne Wartungsvertrag', short: 'ohne Vertrag', emoji: '🤝' },
};

export const WATCH_ORDER: WatchKind[] = ['risk', 'soon', 'ending', 'noContract'];

/**
 * Eine Zeile je Anlage, die wichtigste Lage gewinnt (wie App warrantyWatch):
 *  1. gefährdet: Garantie läuft, Wartung überfällig (bzw. nie gewartet, obwohl die Garantie daran hängt)
 *  2. Wartung bald fällig (≤ 30 Tage) bei Garantie, die an Wartung gebunden ist
 *  3. Garantie endet in ≤ 90 Tagen, noch ohne Wartungsvertrag: Anschluss anbieten
 *  4. Garantie an Wartung gebunden, aber kein Wartungsvertrag
 * Außer Betrieb, inaktive Objekte und abgelaufene Garantien fallen raus.
 * lastService = letzte gültige Wartung/Inbetriebnahme je Anlage (App: lastServiceByItem, Portal: data.lastService()).
 */
export function warrantyWatch(assets: Asset[], lastService: Map<string, string>, sites: Site[]): WatchResult {
  const siteBy = new Map(sites.map((s) => [s.id, s]));
  const entries: WatchEntry[] = [];
  let active = 0;
  let covered = 0;
  for (const a of assets) {
    if (a.retired) continue;
    const site = siteBy.get(a.site_id);
    if (site && site.active === false) continue;
    const due = dueInfo(lastService.get(a.id), a);
    const w = warrantyInfo(a, due);
    if (!w.active || w.daysLeft === null || !a.warranty_until) continue;
    active++;
    if (a.contract) covered++;
    const bound = needsService(a.warranty_note);
    const until = fmtDay(localDay(a.warranty_until));
    let kind: WatchKind | null = null;
    let reason = '';
    if (due.state === 'overdue') {
      kind = 'risk';
      const d = Math.abs(due.daysLeft ?? 0);
      reason = d === 0 ? `Wartung heute fällig, Garantie bis ${until}` : `Wartung seit ${plural(d, 'Tag', 'Tagen')} überfällig, Garantie bis ${until}`;
    } else if (due.state === 'never' && bound) {
      kind = 'risk';
      reason = `Noch keine Wartung erfasst, die Garantie (bis ${until}) setzt Wartung voraus`;
    } else if (bound && due.state === 'soon') {
      kind = 'soon';
      reason = `Wartung in ${plural(due.daysLeft ?? 0, 'Tag', 'Tagen')} fällig, sonst ist die Garantie (bis ${until}) in Gefahr`;
    } else if (!a.contract && w.daysLeft <= ENDING_DAYS) {
      kind = 'ending';
      reason =
        w.daysLeft === 0
          ? 'Garantie endet heute: Wartungsvertrag als Anschluss anbieten'
          : `Garantie endet in ${plural(w.daysLeft, 'Tag', 'Tagen')} (${until}): Wartungsvertrag als Anschluss anbieten`;
    } else if (bound && !a.contract) {
      kind = 'noContract';
      reason = `Garantie bis ${until} nur mit Wartung, noch kein Wartungsvertrag`;
    }
    if (kind) entries.push({ asset: a, site, kind, warrantyDays: w.daysLeft, due, reason });
  }
  entries.sort(
    (x, y) =>
      WATCH_ORDER.indexOf(x.kind) - WATCH_ORDER.indexOf(y.kind) ||
      (x.due.daysLeft ?? 0) - (y.due.daysLeft ?? 0) ||
      x.warrantyDays - y.warrantyDays,
  );
  const counts: Record<WatchKind, number> = { risk: 0, soon: 0, ending: 0, noContract: 0 };
  for (const e of entries) counts[e.kind]++;
  return { entries, active, covered, counts };
}

/** Sachliche Kundennachricht je Lage: ohne Drohung, ohne Rechtsversprechen (wie App warrantyMessage). */
export function warrantyMessage(
  kind: WatchKind,
  c: { customer?: string | null; firm?: string; assetLabel?: string; until?: string; manufacturer?: string | null },
): string {
  const hello = c.customer?.trim() ? `Guten Tag ${c.customer.trim()},` : 'Guten Tag,';
  const what = c.assetLabel ? `Ihre Anlage (${c.assetLabel})` : 'Ihre Anlage';
  const by = c.manufacturer?.trim() ? ` von ${c.manufacturer.trim()}` : '';
  const until = c.until ? ` bis ${c.until}` : '';
  const sign = `Freundliche Grüße${c.firm ? `\n${c.firm}` : ''}`;
  switch (kind) {
    case 'risk':
      return `${hello}\n\nfür ${what} läuft die Garantie${by}${until}. Laut den Garantiebedingungen gehört dazu die regelmäßige Wartung, und die ist jetzt fällig.\nDamit Ihre Garantie erhalten bleibt, schlagen wir einen Termin in den nächsten Tagen vor. Wann passt es Ihnen?\n\n${sign}`;
    case 'soon':
      return `${hello}\n\nbald steht die Wartung für ${what} an. Die Garantie${by}${until} setzt die regelmäßige Wartung voraus, deshalb melden wir uns rechtzeitig.\nWann dürfen wir vorbeikommen?\n\n${sign}`;
    case 'ending':
      return `${hello}\n\ndie Garantie für ${what}${until} läuft bald aus. Mit einem Wartungsvertrag kümmern wir uns danach jedes Jahr automatisch um Ihre Anlage: Sie müssen an nichts denken, kleine Probleme fallen früh auf und die Anlage läuft sparsam.\nSollen wir Ihnen ein Angebot schicken?\n\n${sign}`;
    case 'noContract':
      return `${hello}\n\nfür ${what} gilt die Garantie${by}${until} nur mit regelmäßiger Wartung durch einen Fachbetrieb. Mit einem Wartungsvertrag erinnern wir Sie rechtzeitig und dokumentieren jede Wartung, damit Ihre Garantie gesichert ist.\nSollen wir Ihnen ein Angebot schicken?\n\n${sign}`;
  }
}

/** Kundentext für einen Eintrag — Aufruf wie in der App (WarrantyWatchScreen inform). */
export function warrantyMessageFor(e: WatchEntry, firm: string): string {
  const until = e.asset.warranty_until ? fmtDay(localDay(e.asset.warranty_until)) : undefined;
  return warrantyMessage(e.kind, {
    customer: e.site?.operator_name,
    firm,
    assetLabel: [kindInfo(e.asset.kind).label, e.asset.model].filter(Boolean).join(' '),
    until,
    manufacturer: e.asset.manufacturer,
  });
}

// ---------------------------------------------------------------------------
// Heizungstausch-Radar — wie App lib/replacement.ts
// ---------------------------------------------------------------------------

export interface Candidate {
  asset: Asset;
  ageYears: number;
  priority: 1 | 2 | 3; // 1 = Öl, 2 = Gas, 3 = sonstige Wärmeerzeuger
  reason: string;
}

const HEATERS = new Set(['oil', 'gas', 'pellet', 'hp_air', 'hp_brine', 'district']);

/** Alter in ganzen Jahren aus Inbetriebnahme (YYYY-MM-DD) oder Baujahr (YYYY) */
export function ageYears(a: Pick<Asset, 'install_date' | 'build_year'>, now = new Date()): number | null {
  let y: number | null = null;
  let m = 0;
  let d = 1;
  const inst = a.install_date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (inst) {
    y = +inst[1];
    m = +inst[2] - 1;
    d = +inst[3];
  } else {
    const by = a.build_year?.match(/(19|20)\d{2}/);
    if (by) y = +by[0];
  }
  if (y === null || y < 1950 || y > now.getFullYear()) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() < m || (now.getMonth() === m && now.getDate() < d)) age--;
  return Math.max(0, age);
}

/** Tausch-Kandidaten. Aufrufer filtert wie die App inaktive Objekte vorher heraus. */
export function candidates(assets: Asset[], now = new Date()): Candidate[] {
  const out: Candidate[] = [];
  for (const a of assets) {
    if (a.retired) continue; // Beispieldaten zählen mit — so sieht man den Radar auch im Demo-Modus
    if (!HEATERS.has(a.kind)) continue;
    const age = ageYears(a, now);
    if (age === null) continue;
    if (a.kind === 'oil' && age >= 15)
      out.push({ asset: a, ageYears: age, priority: 1, reason: `Ölheizung, ${age} Jahre — Umstieg auf erneuerbare Wärme ansprechen` });
    else if (a.kind === 'gas' && age >= 15)
      out.push({ asset: a, ageYears: age, priority: 2, reason: `Gasgerät, ${age} Jahre — Tausch bzw. Wärmepumpe/Hybrid ansprechen` });
    else if (a.kind !== 'oil' && a.kind !== 'gas' && age >= 20)
      out.push({ asset: a, ageYears: age, priority: 3, reason: `${age} Jahre in Betrieb — Erneuerung ansprechen` });
  }
  return out.sort((x, y) => x.priority - y.priority || y.ageYears - x.ageYears);
}

/** Sachliche Kundennachricht — ohne Beträge, mit Hinweis auf aktuelle Förderungen (wie App replacementMessage). */
export function replacementMessage(c: { ageYears: number; kind: string; customer?: string | null; firm?: string; land?: Land }): string {
  const hello = c.customer?.trim() ? `Guten Tag ${c.customer.trim()},` : 'Guten Tag,';
  const what = c.kind === 'oil' ? 'Ihre Ölheizung' : c.kind === 'gas' ? 'Ihr Gasgerät' : 'Ihre Heizungsanlage';
  const funding =
    c.land === 'DE'
      ? 'Für den Umstieg gibt es derzeit Förderungen (z. B. Bundesförderung für effiziente Gebäude) — wir prüfen gern, was für Sie infrage kommt.'
      : 'Für den Umstieg gibt es derzeit Förderungen von Bund und Land (z. B. „Raus aus Öl und Gas“) — wir prüfen gern, was für Sie infrage kommt.';
  return `${hello}\n\n${what} ist inzwischen ${c.ageYears} Jahre in Betrieb. Gerne beraten wir Sie unverbindlich, ob sich eine Erneuerung lohnt — etwa mit einer Wärmepumpe.\n${funding}\n\nSollen wir einen Termin für eine Besichtigung vereinbaren?\n\nFreundliche Grüße${c.firm ? `\n${c.firm}` : ''}`;
}

// ---------------------------------------------------------------------------
// Kältemittel-Jahresbericht — wie App lib/fgasYear.ts
// ---------------------------------------------------------------------------

/** Einsatz-Felder, die der Jahresbericht braucht (ohne Fotos/Unterschriften). */
export interface FgasJob {
  id: string;
  site_id: string;
  item_id: string;
  type: string;
  started_at: string;
  measurements: Record<string, string> | null;
  inspector_name: string | null;
  canceled: boolean;
  /** SHA-256-Prüfcode (gps-pruefnachweis.sql) */
  entry_hash: string | null;
}

export interface FgasYearEntry {
  date: string;
  siteName: string;
  assetName: string;
  refrigerant: string;
  added: number;
  recovered: number;
  leakResult?: string;
  inspector?: string;
  hash?: string;
}

export interface FgasYear {
  year: number;
  byRefrigerant: { refrigerant: string; added: number; recovered: number; co2eAdded: number; co2eRecovered: number; gwp?: number }[];
  leakChecks: number;
  leaksFound: number;
  entries: FgasYearEntry[];
}

const kg = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** GWP aus derselben Kältemittel-Tabelle wie co2eTons (types.ts): 1000 kg × GWP / 1000 = GWP. */
const gwpOf = (rf: string) => co2eTons(rf, '1000');

/** Jahr nach lokalem Kalender; stornierte Einträge zählen nicht. */
export function fgasYear(year: number, jobs: FgasJob[], assets: Asset[], sites: Site[]): FgasYear {
  const assetBy = new Map(assets.map((a) => [a.id, a]));
  const siteBy = new Map(sites.map((s) => [s.id, s]));
  const entries: FgasYearEntry[] = [];
  const agg = new Map<string, { added: number; recovered: number }>();
  let leakChecks = 0;
  let leaksFound = 0;
  for (const i of jobs) {
    if (i.canceled || new Date(i.started_at).getFullYear() !== year) continue;
    const m = i.measurements ?? {};
    const added = kg(m.rfAdded);
    const recovered = kg(m.rfRecovered);
    const leak = String(m.leakResult ?? '').trim();
    if (!added && !recovered && !leak && i.type !== 'refrigerant') continue;
    const a = assetBy.get(i.item_id);
    const rf = (a?.refrigerant ?? '').trim() || 'unbekannt';
    if (leak) {
      leakChecks++;
      if (isLeakFound(leak)) leaksFound++;
    }
    const g = agg.get(rf) ?? { added: 0, recovered: 0 };
    g.added += added;
    g.recovered += recovered;
    agg.set(rf, g);
    const s = siteBy.get(i.site_id);
    entries.push({
      date: i.started_at,
      siteName: s?.operator_name || s?.name || '—',
      assetName: a?.name ?? '—',
      refrigerant: rf,
      added,
      recovered,
      leakResult: leak || undefined,
      inspector: i.inspector_name ?? undefined,
      hash: i.entry_hash ?? undefined,
    });
  }
  const byRefrigerant = [...agg.entries()]
    .map(([refrigerant, g]) => {
      const gwp = gwpOf(refrigerant);
      return {
        refrigerant,
        added: r3(g.added),
        recovered: r3(g.recovered),
        co2eAdded: gwp ? Math.round(g.added * gwp) / 1000 : 0,
        co2eRecovered: gwp ? Math.round(g.recovered * gwp) / 1000 : 0,
        gwp,
      };
    })
    .sort((x, y) => y.added - x.added || x.refrigerant.localeCompare(y.refrigerant));
  return { year, byRefrigerant, leakChecks, leaksFound, entries: entries.sort((x, y) => x.date.localeCompare(y.date)) };
}

// ---------------------------------------------------------------------------
// Wochenbriefing — wie App lib/weeklyBriefing.ts (buildWeeklyBriefing), ohne Rechnungen
// (die stehen im Bereich „Rechnungen“). Archivierte Objekte zählen nicht.
// ---------------------------------------------------------------------------

/** gleiche Schreibweise wie das App-Briefing */
export const fmtEuro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;

export interface WeekItem {
  asset: Asset;
  site?: Site;
  /** Wartung fällig bis Sonntag (inkl. Überfälligem) */
  service: DueInfo | null;
  /** Pflicht-Dichtheitskontrolle bis Sonntag */
  leak: DueInfo | null;
  /** Garantie gefährdet (gleiche Regel wie der Garantie-Wächter) */
  warranty: boolean;
  price?: number;
}

export interface Week {
  due: number;
  overdue: number;
  leak: number;
  follow: number;
  euro: number;
  warranty: number;
  /** Text wie in der Montags-Benachrichtigung der App (ohne Rechnungen) */
  body: string | null;
  items: WeekItem[];
}

export function weeklyBriefing(
  org: InstOrg,
  assets: Asset[],
  sites: Site[],
  lastService: Map<string, string>,
  lastLeak: Map<string, LeakInfo>,
  followUps: OpenFollowUp[],
  weekStart: Date,
): Week {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  end.setHours(0, 0, 0, 0); // Montag danach, 00:00
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const siteBy = new Map(sites.map((s) => [s.id, s]));
  // Anlagen archivierter Objekte zählen nicht — wie Garantie-Wächter (seit 06.11. auch in der App)
  const active = assets.filter((a) => !a.retired && !a.is_demo && siteBy.get(a.site_id)?.active !== false);

  let due = 0;
  let overdue = 0;
  let leak = 0;
  let euro = 0;
  let warranty = 0;
  const items: WeekItem[] = [];
  for (const a of active) {
    const s = dueInfo(lastService.get(a.id), a);
    const l = leakDue(a, lastLeak.get(a.id));
    const serviceThisWeek = !!s.dueAt && s.dueAt.getTime() < end.getTime();
    const leakThisWeek = !!l?.dueAt && l.dueAt.getTime() < end.getTime();
    const price = assetPrice(org, a); // Vertragspreis bzw. Preis je Anlagentyp, nur > 0
    if (serviceThisWeek) {
      due++;
      if (s.dueAt!.getTime() < start.getTime()) overdue++;
      if (price !== undefined) euro += price;
    }
    if (leakThisWeek) leak++;
    const w = warrantyInfo(a, s);
    const atRisk = w.active && (s.state === 'overdue' || (s.state === 'never' && needsService(a.warranty_note)));
    if (atRisk) warranty++;
    if (serviceThisWeek || leakThisWeek || atRisk) {
      items.push({
        asset: a,
        site: siteBy.get(a.site_id),
        service: serviceThisWeek ? s : null,
        leak: leakThisWeek && l ? l : null,
        warranty: atRisk,
        price: serviceThisWeek ? price : undefined,
      });
    }
  }
  const liveIds = new Set(active.map((a) => a.id));
  const follow = followUps.filter((f) => liveIds.has(f.item_id)).length;

  const parts: string[] = [];
  if (due) parts.push(`${due === 1 ? '1 Wartung' : `${due} Wartungen`} fällig${overdue ? ` (${overdue} überfällig)` : ''}`);
  if (warranty) parts.push(`${warranty === 1 ? '1 Garantie' : `${warranty} Garantien`} gefährdet`);
  if (leak) parts.push(`${leak === 1 ? '1 Dichtheitskontrolle' : `${leak} Dichtheitskontrollen`} (F-Gas)`);
  if (euro > 0) parts.push(`ca. ${fmtEuro(euro)} Wartungsumsatz`);
  if (follow) parts.push(`${follow === 1 ? '1 Folgeeinsatz' : `${follow} Folgeeinsätze`} offen`);
  const body = parts.length ? `Diese Woche: ${parts.join(' · ')}.` : null;

  const t = (x: WeekItem) => Math.min(x.service?.dueAt?.getTime() ?? Infinity, x.leak?.dueAt?.getTime() ?? Infinity);
  items.sort((x, y) => t(x) - t(y) || x.asset.name.localeCompare(y.asset.name, 'de', { numeric: true }));
  return { due, overdue, leak, follow, euro, warranty, body, items };
}

// ---------------------------------------------------------------------------
// Kundennachricht verschicken — wie App lib/customerMessage.ts (intlPhone, extractPhone)
// ---------------------------------------------------------------------------

/** Telefonnummer international für wa.me (ohne +). */
export function intlPhone(phone: string, land: Land): string | null {
  const t = phone.trim();
  if (!t) return null;
  let d = t.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = (land === 'DE' ? '49' : land === 'CH' ? '41' : '43') + d.slice(1);
  d = d.replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}

/** Erste Telefonnummer aus einem Freitext-Kontaktfeld. */
export function extractPhone(text?: string | null): string | undefined {
  const m = /(\+|00)?[\d][\d\s/()-]{6,}\d/.exec(text ?? '');
  return m ? m[0] : undefined;
}

/** WhatsApp-Link mit Text; null ohne brauchbare Nummer. */
export function whatsAppUrl(contact: string | null | undefined, land: Land, text: string): string | null {
  const raw = extractPhone(contact);
  const p = raw ? intlPhone(raw, land) : null;
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null;
}

// ---------------------------------------------------------------------------
// Fehlercode-Verlauf „So habt ihr das schon gelöst" — wie App lib/fault.ts (pastFixes), ohne KI
// ---------------------------------------------------------------------------

/** Einsatz-Felder für den Verlauf (schmal, ohne Fotos). */
export interface FixJob {
  id: string;
  item_id: string;
  type: string;
  started_at: string;
  work_done: string | null;
  follow_up?: string | null;
  canceled: boolean;
}

export interface PastFix {
  inspectionId: string;
  assetId: string;
  date: string;
  text: string;
  sameAsset: boolean;
  codeMatch: boolean;
}

const normText = (s?: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Andere Anlagen mit gleichem Hersteller + Modell (Groß/klein und Leerzeichen egal). */
export function sameModelIds(asset: Pick<Asset, 'id' | 'manufacturer' | 'model'> | undefined, assets: Asset[]): string[] {
  return assets
    .filter(
      (a) =>
        asset &&
        a.id !== asset.id &&
        normText(a.manufacturer) &&
        normText(a.model) &&
        normText(a.manufacturer) === normText(asset.manufacturer) &&
        normText(a.model) === normText(asset.model),
    )
    .map((a) => a.id);
}

/** Wie der Betrieb ähnliche Störungen gelöst hat: gleiche Anlage oder gleiches Modell; Code-Treffer zuerst. */
export function pastFixes(
  asset: Pick<Asset, 'id' | 'manufacturer' | 'model'> | undefined,
  code: string,
  assets: Asset[],
  jobs: FixJob[],
  limit = 3,
): PastFix[] {
  const c = normText(code);
  const sameModel = new Set(sameModelIds(asset, assets));
  return jobs
    .filter((i) => !i.canceled && (i.type === 'repair' || i.type === 'service' || i.type === 'workReport') && !!i.work_done?.trim())
    .filter((i) => (asset && i.item_id === asset.id) || sameModel.has(i.item_id))
    .map((i) => {
      const text = [i.work_done, i.follow_up].filter(Boolean).join(' · ').trim();
      return {
        inspectionId: i.id,
        assetId: i.item_id,
        date: i.started_at,
        text,
        sameAsset: !!asset && i.item_id === asset.id,
        codeMatch: !!c && normText(text).includes(c),
      };
    })
    .sort((a, b) => Number(b.codeMatch) - Number(a.codeMatch) || Number(b.sameAsset) - Number(a.sameAsset) || b.date.localeCompare(a.date))
    .slice(0, limit);
}
