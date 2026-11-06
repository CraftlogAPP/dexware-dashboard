// Beispieldaten der Auswertungen — NUR über ext-demo.ts (DemoArea, Dev-Server) geladen, nie im Produktions-Build.
// Ergänzt den Beispiel-Bestand um ein paar Anlagen, damit Heizungstausch-Radar und Garantie-Wächter alle Lagen zeigen
// (die Zusatz-Anlagen erscheinen dadurch auch in Wartungsliste und Objekten — wie echte Daten).

import { ASSETS, JOBS } from '../demo';
import type { Asset } from '../types';
import type { AuswertungData, HelperListing } from './data';
import { helperSaveError } from './data';

const DAY = 86_400_000;
/** yyyy-mm-dd, n Tage vor (negativ: nach) heute — lokal */
function dayAgo(days: number): string {
  const d = new Date(Date.now() - days * DAY);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function extra(id: string, siteId: string, name: string, kind: Asset['kind'], more: Partial<Asset>): Asset {
  const base = ASSETS[0];
  return {
    ...base,
    id,
    site_id: siteId,
    name,
    kind,
    manufacturer: 'Musterwerk',
    model: null,
    serial_no: null,
    build_year: null,
    install_date: null,
    power_kw: null,
    refrigerant: null,
    refrigerant_kg: null,
    interval_months: null,
    contract: false,
    contract_price: null,
    warranty_until: null,
    warranty_note: null,
    remote_service: null,
    fgas_hermetic: null,
    fgas_leak_detection: null,
    location: null,
    qr_token: null,
    notes: null,
    retired: false,
    retired_at: null,
    retire_reason: null,
    is_demo: false,
    ...more,
  };
}

const EXTRA: Asset[] = [
  // Heizungstausch-Radar: Öl 1999, Gas 2008, Pellets 2003
  extra('ax-ste-oel2', 's-steiner', 'OEL-002', 'oil', { model: 'OilStar 30', build_year: '1999', power_kw: '30', location: 'Keller, Nebenraum' }),
  extra('ax-see-gt3', 's-see', 'GT-003', 'gas', { model: 'Therme 24', build_year: '2008', power_kw: '24', location: 'Hausmeisterwohnung' }),
  extra('ax-hub-pe', 's-huber', 'PE-ALT', 'pellet', { model: 'Holzvergaser 20', build_year: '2003', location: 'Schuppen' }),
  // Garantie-Wächter: Wartung in ~20 Tagen fällig, Garantie hängt an Wartung → „Wartung bald"
  extra('ax-nov-kl', 's-novak', 'KL-001', 'ac_split', {
    model: 'CoolSplit 3,5',
    install_date: dayAgo(345),
    refrigerant: 'R32',
    refrigerant_kg: '0,8',
    warranty_until: dayAgo(345 - 3 * 365),
    warranty_note: 'Herstellergarantie 3 Jahre bei jährlicher Inspektion',
    location: 'Schlafzimmer',
  }),
  // Garantie endet in ~60 Tagen, ohne Vertrag → „endet bald"
  extra('ax-ste-wp', 's-steiner', 'WP-001', 'hp_air', {
    model: 'AirHeat 12',
    install_date: dayAgo(670),
    warranty_until: dayAgo(-60),
    warranty_note: '2 Jahre Herstellergarantie',
    refrigerant: 'R290',
    refrigerant_kg: '1,4',
    location: 'Außengerät Hof',
  }),
];

let added = false;
function addExtraAssets() {
  if (added) return;
  added = true;
  for (const a of EXTRA) if (!ASSETS.some((x) => x.id === a.id)) ASSETS.push(a);
  // Fehlercode-Verlauf: Störung am baugleichen Kessel GT-002 (gleiches Modell wie GT-001)
  if (!JOBS.some((j) => j.id === 'jx-see-f28')) {
    const t = new Date(Date.now() - 95 * DAY).toISOString();
    JOBS.push({
      ...JOBS[0],
      id: 'jx-see-f28',
      site_id: 's-see',
      item_id: 'a-see-gt2',
      type: 'repair',
      started_at: t,
      created_at: t,
      checklist: {},
      measurements: {},
      work_done: 'Störung F28 (keine Flammenbildung): Zündelektrode verschlissen, getauscht, Abstand 4 mm eingestellt. Gerät läuft.',
      materials: [],
      work_minutes: 55,
      recommendations: null,
      follow_up: 'Ersatz-Zündelektrode für GT-001 mitnehmen',
      notes: null,
      customer_signer_name: null,
      canceled: false,
      cancel_reason: null,
      canceled_at: null,
    });
  }
  // Wartung vor 200 Tagen an der Wärmepumpe Steiner → Wartung in Ordnung, nur die Garantie läuft aus („endet bald")
  const at = new Date(Date.now() - 200 * DAY).toISOString();
  if (!JOBS.some((j) => j.id === 'jx-ste-wp')) {
    JOBS.push({
      ...JOBS[0],
      id: 'jx-ste-wp',
      site_id: 's-steiner',
      item_id: 'ax-ste-wp',
      type: 'service',
      started_at: at,
      created_at: at,
      checklist: {},
      measurements: { flow: '35', return: '29' },
      work_done: 'Jährliche Wartung, Filter gereinigt, Kältekreis geprüft.',
      materials: [],
      work_minutes: 70,
      recommendations: null,
      follow_up: null,
      notes: null,
      customer_signer_name: null,
      canceled: false,
      cancel_reason: null,
      canceled_at: null,
    });
  }
}

export function demoAuswertung(): AuswertungData {
  addExtraAssets();
  let listing: HelperListing = {
    listed: false,
    zip: '7000',
    city: 'Musterstadt',
    trades: ['heizung', 'waermepumpe', 'notdienst'],
    blurb: 'Familienbetrieb seit 1998, Wärmepumpen-Spezialist',
    hasContact: true,
    hasGeo: true,
  };
  const wait = <T,>(v: T, ms = 150): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));

  return {
    fgasJobs: (year) =>
      wait(
        JOBS.filter((j) => new Date(j.started_at).getFullYear() === year).map((j) => ({
          id: j.id,
          site_id: j.site_id,
          item_id: j.item_id,
          type: j.type,
          started_at: j.started_at,
          measurements: j.measurements,
          inspector_name: j.inspector_name,
          canceled: j.canceled,
          // Prüfcode wie in der Datenbank (64 Hex-Zeichen) — hier nur erfunden
          entry_hash: Array.from({ length: 64 }, (_, k) => ((j.id.charCodeAt(k % j.id.length) * (k + 7)) % 16).toString(16)).join(''),
        })),
      ),
    fixJobs: (itemIds) =>
      wait(
        JOBS.filter((j) => itemIds.includes(j.item_id)).map((j) => ({
          id: j.id,
          item_id: j.item_id,
          type: j.type,
          started_at: j.started_at,
          work_done: j.work_done,
          follow_up: j.follow_up ?? null,
          canceled: j.canceled,
        })),
      ),
    markContract: async (assetId) => {
      await wait(null, 300);
      // Beispieldaten: Vertrag gleich im Bestand vermerken, damit die Liste nach dem Neuladen stimmt
      const a = ASSETS.find((x) => x.id === assetId);
      if (a) a.contract = true;
    },
    helperListing: () => wait(listing),
    saveHelperListing: async (_orgId, p) => {
      await wait(null, 400);
      if (p.listed && (!/^\d{4,5}$/.test(p.zip.trim()) || !listing.hasContact)) throw new Error(helperSaveError('helper_listed_check'));
      const { clearGeo, ...fields } = p;
      listing = { ...listing, ...fields, zip: p.zip.trim(), city: p.city.trim(), blurb: p.blurb.trim(), hasGeo: clearGeo ? false : listing.hasGeo };
    },
  };
}
