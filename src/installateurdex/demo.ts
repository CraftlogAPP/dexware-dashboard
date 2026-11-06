// Beispieldaten fürs Betriebsportal — NUR solange es kein Supabase-Projekt gibt und nur im
// Dev-Server (npm run dev). Ein erfundener Betrieb mit 6 Objekten und 15 Anlagen in allen
// Fälligkeits-Stufen, Einsätzen aller Arten, offenen Empfehlungen und Anfragen vom Anlagenpass.
// Alles im Speicher: Änderungen (Anfrage-Status, Einstellungen) gelten bis zum Neuladen der Seite.
// Namen, Adressen, Telefonnummern und E-Mails sind ausgedacht (example.com, Nullen-Nummern).

import type { Member } from '../lib/orgApi';
import type { InstData, OrgSettingsInput } from './data';
import {
  SERVICE_TYPES,
  leakInfoFromJobs,
  openFollowUpsFromJobs,
  type Asset,
  type CheckResult,
  type Defect,
  type DefectWithPhotos,
  type InspectionType,
  type InstOrg,
  type Job,
  type JobWithPhotos,
  type ReminderLog,
  type ServiceRequest,
  type Site,
} from './types';

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();
const dayAgo = (days: number) => {
  const d = new Date(Date.now() - days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Lokaler Zeitpunkt in `days` Tagen um `hour` Uhr (für Termine; Sonntag wird auf Montag geschoben). */
const at = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const hex = (n: number) => (n.toString(16).padStart(2, '0').repeat(16)).slice(0, 32);

const ORG_ID = 'demo-org';

function buildOrg(): InstOrg {
  return {
    id: ORG_ID,
    name: 'Installateur Muster GmbH',
    land: 'AT',
    address: 'Musterstraße 12, 7000 Musterstadt',
    created_at: ago(800),
    plan: 'pro',
    is_pro: false,
    logo_url: null,
    brand_color: null,
    public_phone: '+43 664 000 0000',
    public_email: 'service@example.com',
    website: '',
    maintenance_prices: { hp_air: 240, hp_brine: 260, ac_split: 180, ac_multi: 320, gas: 160, dhw_tank: 90, filter: 45 },
    reminder_mail: true,
    reminder_days: 30,
  };
}

function site(id: string, name: string, address: string, customer: string, contact: string | null, extra: Partial<Site> = {}): Site {
  return {
    id,
    org_id: ORG_ID,
    name,
    address,
    lat: null,
    lng: null,
    operator_name: customer,
    operator_contact: contact,
    notes: null,
    active: true,
    is_demo: false,
    created_at: ago(700),
    customer_email: null,
    reminder_opt_in: false,
    ...extra,
  };
}

export const SITES: Site[] = [
  site('s-huber', 'EFH Huber', 'Lindenweg 3, 7000 Musterstadt', 'Familie Huber', '+43 664 000 0101', {
    customer_email: 'huber@example.com',
    reminder_opt_in: true,
    reminder_confirmed_email: 'huber@example.com',
    reminder_confirmed_at: ago(300),
    notes: 'Schlüssel beim Nachbarn (Nr. 5). Hund ist freundlich.',
  }),
  site('s-see', 'Wohnanlage Seestraße 4', 'Seestraße 4, 7100 Neusiedl', 'Hausverwaltung Berger', 'verwaltung@example.com', {
    customer_email: 'verwaltung@example.com',
    reminder_opt_in: false,
    notes: 'Heizraum im Keller, Schlüssel im Schlüsselsafe (Code beim Hausmeister).',
  }),
  site('s-gruber', 'Bäckerei Gruber', 'Marktplatz 1, 7000 Musterstadt', 'Gruber KG', '+43 2682 000 00', {
    customer_email: 'office@example.com',
    reminder_opt_in: true,
    reminder_confirmed_email: null,
    reminder_confirm_sent_email: 'office@example.com',
    reminder_confirm_sent_at: ago(2),
  }),
  site('s-novak', 'EFH Novak (Neubau)', 'Am Feld 17, 7023 Musterdorf', 'Petra Novak', '+43 676 000 0202'),
  site('s-steiner', 'Arztpraxis Dr. Steiner', 'Bahnhofstraße 9, 7000 Musterstadt', 'Dr. Steiner', '+43 2682 000 11'),
  site('s-lechner', 'Ferienhaus Lechner', 'Waldweg 2, 7461 Musterberg', 'Familie Lechner', null, {
    active: false,
    notes: 'Verkauft — archiviert.',
  }),
];

function asset(id: string, siteId: string, name: string, kind: Asset['kind'], extra: Partial<Asset> = {}): Asset {
  return {
    id,
    org_id: ORG_ID,
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
    location: null,
    qr_token: hex(id.length * 7 + name.length),
    notes: null,
    retired: false,
    retired_at: null,
    retire_reason: null,
    is_demo: false,
    created_at: ago(700),
    ...extra,
  };
}

export const ASSETS: Asset[] = [
  // Garantie läuft noch, Wartung überfällig → „Garantie gefährdet"
  asset('a-hub-wp', 's-huber', 'WP-001', 'hp_air', { model: 'AirHeat 9', serial_no: 'MW-9-20431', build_year: '2024', install_date: dayAgo(745), power_kw: '9', refrigerant: 'R290', refrigerant_kg: '1,1', location: 'Außengerät Garten, Hydraulik Keller', warranty_until: dayAgo(745 - 5 * 365), warranty_note: '5 Jahre, nur mit jährlicher Wartung durch Fachbetrieb', remote_service: 'other' }),
  asset('a-hub-sp', 's-huber', 'SP-001', 'dhw_tank', { model: 'Speicher 300 l', build_year: '2017', location: 'Heizraum Keller' }),
  asset('a-hub-old', 's-huber', 'GT-ALT', 'gas', { model: 'Condens 24', build_year: '2009', retired: true, retired_at: ago(745), retire_reason: 'Durch Wärmepumpe ersetzt' }),
  // Wartungsverträge: GT-001 mit eigenem Preis, GT-002 zum Typpreis, KL-001 mit eigenem Preis.
  asset('a-see-gt1', 's-see', 'GT-001', 'gas', { model: 'Condens 35', serial_no: 'MW-C35-7781', build_year: '2016', power_kw: '35', location: 'Heizraum Keller links', contract: true, contract_price: 190 }),
  asset('a-see-gt2', 's-see', 'GT-002', 'gas', { model: 'Condens 35', serial_no: 'MW-C35-7782', build_year: '2016', power_kw: '35', location: 'Heizraum Keller rechts', contract: true }),
  asset('a-see-so', 's-see', 'SO-001', 'solar', { model: 'SolarFlat 12 m²', build_year: '2016', location: 'Dach Süd' }),
  asset('a-see-de', 's-see', 'DE-001', 'booster', { model: 'PressBoost 4', build_year: '2019', location: 'Technikraum' }),
  asset('a-gru-kl1', 's-gruber', 'KL-001', 'ac_split', { model: 'CoolSplit 5,0', serial_no: 'MW-CS-1188', build_year: '2021', install_date: dayAgo(1100), power_kw: '5', refrigerant: 'R32', refrigerant_kg: '1,2', location: 'Verkaufsraum', contract: true, contract_price: 170, warranty_until: dayAgo(1100 - 2 * 365) }),
  // F-Gas: R410A 3,2 kg = 6,68 t CO₂e → Dichtheitskontrolle alle 12 Monate, letzte vor 372 Tagen → überfällig
  asset('a-gru-kl2', 's-gruber', 'KL-002', 'ac_multi', { model: 'MultiCool 3×2,5', build_year: '2022', power_kw: '7,5', refrigerant: 'R410A', refrigerant_kg: '3,2', location: 'Backstube + Büro' }),
  asset('a-gru-fi', 's-gruber', 'FI-001', 'filter', { model: 'Rückspülfilter 1"', build_year: '2020', location: 'Hausanschluss' }),
  // F-Gas: letzte Kontrolle vor 12 Tagen „undicht" → Nachkontrolle nach einem Monat (wie die App)
  asset('a-gru-kl3', 's-gruber', 'KL-003', 'ac_split', { model: 'CoolSplit 7,1', build_year: '2023', install_date: dayAgo(500), power_kw: '7,1', refrigerant: 'R410A', refrigerant_kg: '2,6', location: 'Kühlraum-Vorraum' }),
  asset('a-nov-wp', 's-novak', 'WP-001', 'hp_brine', { model: 'GeoHeat 8', serial_no: 'MW-G8-5520', build_year: '2026', install_date: dayAgo(20), power_kw: '8', refrigerant: 'R410A', refrigerant_kg: '2,6', fgas_leak_detection: true, location: 'Technikraum EG', warranty_until: dayAgo(20 - 5 * 365), warranty_note: '5 Jahre mit Wartungsnachweis', remote_service: 'homecom' }),
  asset('a-nov-lu', 's-novak', 'LU-001', 'ventilation', { model: 'AirComfort 250', build_year: '2025', install_date: dayAgo(300), location: 'Dachboden' }),
  asset('a-ste-oel', 's-steiner', 'OEL-001', 'oil', { model: 'OilCondens 25', build_year: '2012', power_kw: '25', location: 'Keller' }),
  asset('a-ste-eh', 's-steiner', 'EH-001', 'softener', { model: 'SoftLine 20', location: 'Keller' }),
  asset('a-lec-pe', 's-lechner', 'PE-001', 'pellet', { model: 'PelletStar 15', build_year: '2014', power_kw: '15', location: 'Nebengebäude' }),
];

let jobSeq = 0;
function job(itemId: string, type: InspectionType, at: string, extra: Partial<Job> = {}): Job {
  const a = ASSETS.find((x) => x.id === itemId)!;
  jobSeq += 1;
  return {
    id: `j-${jobSeq}`,
    org_id: ORG_ID,
    site_id: a.site_id,
    item_id: itemId,
    type,
    started_at: at,
    lat: null,
    lng: null,
    gps_accuracy_m: null,
    checklist: {},
    measurements: {},
    work_done: null,
    materials: [],
    work_minutes: null,
    recommendations: null,
    notes: null,
    inspector_name: 'Max Muster',
    customer_signer_name: null,
    canceled: false,
    cancel_reason: null,
    canceled_at: null,
    created_at: at,
    ...extra,
  };
}

const ok = (...ids: string[]): Record<string, CheckResult> => Object.fromEntries(ids.map((id) => [id, 'ok' as CheckResult]));

const J_HUB_SERVICE = job('a-hub-wp', 'service', ago(380, 3), {
  checklist: { ...ok('visual', 'evaporator', 'condensate', 'fan', 'circuit', 'hydraulic', 'strainer', 'safety', 'errors', 'settings', 'function'), expansion: 'defect' },
  measurements: { pressure: '1,4', flow: '38', return: '33', dhw: '50', outdoor: '6', hp: '18,5', lp: '5,1' },
  work_done: 'Jahreswartung: Außengerät gereinigt, Kondensatablauf frei gemacht, Schmutzfänger gereinigt, Fehlerspeicher ausgelesen (keine Einträge).',
  work_minutes: 85,
  recommendations: 'Ausdehnungsgefäß hält den Vordruck nicht — Tausch bei nächster Gelegenheit empfohlen.',
  customer_signer_name: 'Herr Huber',
});
const J_GRU_REPAIR = job('a-gru-kl2', 'repair', ago(2, 1), {
  measurements: { errorCode: 'E5 Niederdruck', supplyAir: '19', roomAir: '27', outdoor: '14', lp: '2,1' },
  work_done: 'Gerät kühlt nicht. Niederdruck zu gering, Ölspuren an der Bördelverbindung Innengerät Backstube. Anlage abgeschaltet, Kunde informiert.',
  work_minutes: 60,
  recommendations: 'Lecksuche mit Stickstoff, Bördelverbindung neu machen, Kältemittel nachfüllen.',
  follow_up: 'Lecksuche + Bördelverbindung neu — Stickstoff und Kältemittel mitnehmen',
  inspector_name: 'Lisa Beispiel',
});
const J_STE_SERVICE = job('a-ste-oel', 'service', ago(450, 2), {
  checklist: ok('visual', 'burner', 'ignition', 'flue', 'fluegasMeasure', 'expansion', 'safety', 'function'),
  measurements: { pressure: '1,6', flow: '62', return: '50', co2: '12,4', co: '48', fluegas: '168', loss: '7,1', soot: '0' },
  work_done: 'Brenner gereinigt, Düse und Ölfilter getauscht, Abgasmessung durchgeführt.',
  materials: [
    { name: 'Öldüse 0,55 gph 60°', qty: '1', unit: 'Stk' },
    { name: 'Ölfilter-Einsatz', qty: '1', unit: 'Stk' },
  ],
  work_minutes: 95,
  recommendations: 'CO₂ etwas hoch — Brennereinstellung beim nächsten Besuch nachjustieren. Anlage ist 14 Jahre alt: Umstieg auf Wärmepumpe besprechen.',
});
const J_SEE_GT1 = job('a-see-gt1', 'service', ago(340, 4), {
  checklist: ok('visual', 'burner', 'siphon', 'ignition', 'flue', 'gasTight', 'fluegasMeasure', 'expansion', 'safety', 'errors', 'function'),
  measurements: { pressure: '1,8', flow: '60', return: '48', gasPressure: '20', co2: '9,2', co: '22', fluegas: '54', loss: '2,8' },
  work_done: 'Jahreswartung Kaskade, Kessel 1. Brenner und Wärmetauscher gereinigt, Siphon befüllt.',
  work_minutes: 70,
  recommendations: 'Rohrisolierung im Keller teilweise beschädigt — erneuern spart Energie.',
});
const J_SEE_GT2 = job('a-see-gt2', 'service', ago(300, 3), {
  checklist: { ...ok('visual', 'burner', 'ignition', 'flue', 'gasTight', 'fluegasMeasure', 'expansion', 'safety', 'errors', 'function'), siphon: 'defect' },
  measurements: { pressure: '1,8', flow: '58', return: '47', gasPressure: '21', co2: '9,0', co: '30', fluegas: '56', loss: '2,9' },
  work_done: 'Jahreswartung Kaskade, Kessel 2. Siphon tropft — Dichtung getauscht.',
  materials: [{ name: 'Siphon-Dichtung', qty: '1', unit: 'Stk' }],
  work_minutes: 65,
});

export const JOBS: Job[] = [
  // Huber
  job('a-hub-wp', 'commissioning', ago(745, 2), {
    checklist: ok('plan', 'flushed', 'circuit', 'condensate', 'expansion', 'safety', 'params', 'function', 'instructed', 'docsHanded', 'warranty', 'utility'),
    measurements: { pressure: '1,5', flow: '35', return: '30', dhw: '50', outdoor: '4' },
    work_done: 'Wärmepumpe in Betrieb genommen, Anlage gespült, befüllt und entlüftet. Heizkurve 0,4, Warmwasser 50 °C. Kunde eingewiesen, Herstellerformular ausgefüllt.',
    materials: [
      { name: 'Kupferrohr 22 mm', qty: '4', unit: 'm' },
      { name: 'Kugelhahn 1"', qty: '2', unit: 'Stk' },
      { name: 'Magnetitabscheider', qty: '1', unit: 'Stk' },
    ],
    work_minutes: 240,
    customer_signer_name: 'Herr Huber',
  }),
  J_HUB_SERVICE,
  job('a-hub-wp', 'repair', ago(60, 5), {
    measurements: { errorCode: 'F.22 Wassermangel', pressure: '0,6', flow: '22', return: '20' },
    work_done: 'Anlagendruck zu niedrig, Anlage nachgefüllt und entlüftet. Keine Undichtheit gefunden.',
    work_minutes: 40,
    recommendations: 'Druck in 2 Wochen kontrollieren lassen — bei erneutem Druckverlust Ausdehnungsgefäß tauschen.',
    customer_signer_name: 'Frau Huber',
  }),
  job('a-hub-sp', 'service', ago(710, 1), {
    checklist: ok('visual', 'anode', 'descale', 'legionella', 'safety'),
    measurements: { dhw: '60' },
    work_done: 'Speicher entkalkt, Schutzanode geprüft (noch ca. 60 %).',
    work_minutes: 50,
  }),
  // Seestraße
  job('a-see-gt1', 'service', ago(705, 2), {
    checklist: ok('visual', 'burner', 'siphon', 'ignition', 'flue', 'gasTight', 'fluegasMeasure', 'expansion', 'safety', 'errors', 'function'),
    measurements: { pressure: '1,7', flow: '62', return: '50', gasPressure: '20', co2: '9,1', co: '25', fluegas: '55', loss: '2,9' },
    work_minutes: 70,
  }),
  J_SEE_GT1,
  J_SEE_GT2,
  job('a-see-so', 'service', ago(200, 2), {
    checklist: ok('visual', 'collector', 'hydraulic', 'safety', 'function'),
    measurements: { solarPressure: '2,4', frost: '-26', ph: '8,1' },
    work_done: 'Solarflüssigkeit geprüft, Frostschutz ausreichend.',
    work_minutes: 45,
  }),
  job('a-see-de', 'service', ago(400, 3), {
    checklist: ok('pump', 'expansion', 'visual'),
    measurements: { pressure: '4,2' },
    work_minutes: 30,
  }),
  job('a-see-gt2', 'workReport', ago(0, 1.5), {
    work_done: 'Thermostatventile in Top 3 und Top 7 getauscht, Heizkörper entlüftet.',
    materials: [{ name: 'Thermostatkopf', qty: '2', unit: 'Stk' }],
    work_minutes: 55,
    inspector_name: 'Lisa Beispiel',
    customer_signer_name: 'Hausmeister Weber',
  }),
  // Gruber
  job('a-gru-kl1', 'service', ago(390, 2), {
    checklist: ok('visual', 'indoorFilter', 'coilClean', 'condensate', 'condenserClean', 'lines', 'circuit', 'electric', 'function'),
    measurements: { supplyAir: '10', roomAir: '24', outdoor: '28' },
    work_done: 'Klimagerät gereinigt und desinfiziert, Filter gereinigt.',
    work_minutes: 50,
  }),
  job('a-gru-kl1', 'refrigerant', ago(200, 4), {
    measurements: { leakResult: 'dicht', leakMethod: 'elektronischer Lecksucher', rfAdded: '0', rfRecovered: '0', hp: '24', lp: '8,5' },
    work_done: 'Dichtheitskontrolle durchgeführt, keine Undichtheit.',
    work_minutes: 25,
  }),
  job('a-gru-kl2', 'refrigerant', ago(372, 2), {
    measurements: { leakResult: 'dicht', leakMethod: 'elektronischer Lecksucher', rfAdded: '0', rfRecovered: '0' },
    work_done: 'Jährliche Dichtheitskontrolle nach F-Gas-Verordnung, keine Undichtheit.',
    work_minutes: 30,
  }),
  job('a-gru-kl2', 'service', ago(355, 3), {
    checklist: ok('visual', 'indoorFilter', 'coilClean', 'condensate', 'condenserClean', 'lines', 'circuit', 'electric', 'errors', 'function'),
    measurements: { supplyAir: '9', roomAir: '23', outdoor: '30' },
    work_minutes: 90,
  }),
  J_GRU_REPAIR,
  job('a-gru-kl3', 'service', ago(140, 3), {
    checklist: ok('visual', 'indoorFilter', 'coilClean', 'condensate', 'condenserClean', 'lines', 'circuit', 'electric', 'function'),
    work_minutes: 60,
  }),
  job('a-gru-kl3', 'refrigerant', ago(12, 2), {
    measurements: { leakResult: 'undicht — Ölspuren an der Bördelverbindung Außengerät', leakMethod: 'elektronischer Lecksucher', rfAdded: '0,3', rfRecovered: '0' },
    work_done: 'Dichtheitskontrolle: Undichtheit an der Bördelverbindung gefunden, nachgezogen, 0,3 kg nachgefüllt. Nachkontrolle vereinbart.',
    work_minutes: 50,
  }),
  job('a-gru-fi', 'service', ago(170, 2), {
    checklist: ok('backwash', 'visual'),
    work_minutes: 15,
  }),
  // Novak (Neubau)
  job('a-nov-wp', 'photoDoc', ago(40, 3), {
    work_done: 'Leitungsführung Fußbodenheizung EG und OG vor dem Estrich fotografiert.',
    work_minutes: 30,
    inspector_name: 'Lisa Beispiel',
  }),
  job('a-nov-wp', 'pressureTest', ago(25, 2), {
    measurements: { medium: 'Wasser', testPressure: '6', startPressure: '6,0', endPressure: '6,0', testMinutes: '120' },
    work_done: 'Druckprobe Heizkreise vor dem Estrich.',
    work_minutes: 150,
  }),
  job('a-nov-wp', 'flush', ago(21, 2), {
    measurements: { flushMinutes: '30', fillVolume: '220', pressure: '1,6', conductivity: '85', ph: '8,4', hardness: '0,5' },
    work_done: 'Anlage gespült, mit enthärtetem Wasser befüllt.',
    work_minutes: 75,
  }),
  job('a-nov-wp', 'commissioning', ago(20, 3), {
    checklist: { ...ok('plan', 'flushed', 'circuit', 'expansion', 'safety', 'params', 'function', 'instructed', 'docsHanded', 'warranty'), utility: 'na' },
    measurements: { pressure: '1,6', flow: '33', return: '28', dhw: '48', brineIn: '9', brineOut: '6', brinePressure: '1,8' },
    work_done: 'Sole-Wärmepumpe in Betrieb genommen, Solekreis befüllt und entlüftet, Parameter eingestellt, Kundin eingewiesen.',
    materials: [
      { name: 'Frostschutz-Konzentrat', qty: '40', unit: 'l' },
      { name: 'Sicherheitsgruppe Sole', qty: '1', unit: 'Stk' },
    ],
    work_minutes: 210,
    customer_signer_name: 'Petra Novak',
  }),
  // Steiner
  J_STE_SERVICE,
  job('a-ste-oel', 'workReport', ago(449, 5), {
    work_done: 'Doppelt erfasst.',
    canceled: true,
    cancel_reason: 'Doppelt erfasst — gilt der Eintrag vom Vortag',
    canceled_at: ago(449, 4),
  }),
  job('a-ste-eh', 'workReport', ago(0, 0.5), {
    work_done: 'Regeneriersalz nachgefüllt (2 Säcke), Uhrzeit nach Stromausfall neu eingestellt.',
    materials: [{ name: 'Regeneriersalz 25 kg', qty: '2', unit: 'Sack' }],
    work_minutes: 20,
  }),
  // Lechner (archiviert)
  job('a-lec-pe', 'service', ago(500, 3), {
    checklist: ok('visual', 'ash', 'ignition', 'flue', 'fluegasMeasure', 'expansion', 'safety', 'function'),
    work_minutes: 80,
  }),
];

function defect(id: string, j: Job | null, itemId: string, title: string, severity: Defect['severity'], extra: Partial<Defect> = {}): Defect {
  const a = ASSETS.find((x) => x.id === itemId)!;
  return {
    id,
    org_id: ORG_ID,
    site_id: a.site_id,
    inspection_id: j?.id ?? null,
    item_id: itemId,
    title,
    description: null,
    severity,
    item_blocked: false,
    status: 'open',
    reporter_name: j?.inspector_name ?? 'Max Muster',
    resolved_at: null,
    resolver_name: null,
    resolution_note: null,
    created_at: j?.started_at ?? ago(10),
    ...extra,
  };
}

const DEFECTS: Defect[] = [
  defect('d-1', J_HUB_SERVICE, 'a-hub-wp', 'Ausdehnungsgefäß tauschen', 'amber', {
    description: 'Vordruck fällt nach dem Einstellen wieder ab — Membran vermutlich defekt.',
  }),
  defect('d-2', J_SEE_GT1, 'a-see-gt1', 'Rohrisolierung im Keller erneuern', 'green'),
  defect('d-3', J_GRU_REPAIR, 'a-gru-kl2', 'Kältemittelverlust — Gerät außer Betrieb', 'red', {
    description: 'Ölspuren an der Bördelverbindung, Niederdruck zu gering. Gerät abgeschaltet, Kunde informiert.',
    item_blocked: true,
  }),
  defect('d-4', J_STE_SERVICE, 'a-ste-oel', 'Brennereinstellung nachjustieren', 'amber', {
    description: 'CO₂ im Abgas über dem üblichen Bereich.',
  }),
  defect('d-5', J_SEE_GT2, 'a-see-gt2', 'Siphon tropft', 'amber', {
    status: 'resolved',
    resolved_at: J_SEE_GT2.started_at,
    resolver_name: 'Max Muster',
    resolution_note: 'Dichtung getauscht, dicht.',
  }),
];

function req(id: string, kind: ServiceRequest['kind'], assetId: string | null, createdAt: string, extra: Partial<ServiceRequest>): ServiceRequest {
  const a = assetId ? ASSETS.find((x) => x.id === assetId) : undefined;
  return {
    id,
    org_id: ORG_ID,
    asset_id: assetId,
    site_id: a?.site_id ?? null,
    kind,
    message: null,
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    preferred: null,
    source: 'pass',
    status: 'new',
    note: null,
    handled_by: null,
    handled_at: null,
    created_at: createdAt,
    ...extra,
  };
}

// Gezeichnete Beispielfotos (SVG) statt echter Bilder — so wie sie die Pass-Seite schicken würde.
const svgPhoto = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#d8d4cc"/>${body}</svg>`,
  )}`;
const PHOTO_DISPLAY = svgPhoto(
  '<rect x="120" y="90" width="400" height="300" rx="18" fill="#f4f2ee" stroke="#9a948a" stroke-width="4"/>' +
    '<rect x="170" y="140" width="300" height="130" rx="8" fill="#2b3a2f"/>' +
    '<text x="320" y="200" font-family="monospace" font-size="44" fill="#b6f5c4" text-anchor="middle">STÖRUNG 4</text>' +
    '<text x="320" y="245" font-family="monospace" font-size="26" fill="#b6f5c4" text-anchor="middle">Brenner</text>' +
    '<circle cx="230" cy="330" r="18" fill="#c0392b"/><circle cx="320" cy="330" r="18" fill="#7f8c8d"/><circle cx="410" cy="330" r="18" fill="#7f8c8d"/>' +
    '<text x="320" y="450" font-family="sans-serif" font-size="18" fill="#6b665e" text-anchor="middle">Beispielfoto</text>',
);
const PHOTO_DRIP = svgPhoto(
  '<rect x="90" y="110" width="460" height="120" rx="22" fill="#fbfbfb" stroke="#a9a9a9" stroke-width="4"/>' +
    '<rect x="130" y="200" width="380" height="14" rx="7" fill="#cfcfcf"/>' +
    '<path d="M300 240 q10 25 0 38 q-10 -13 0 -38z M340 270 q10 25 0 38 q-10 -13 0 -38z" fill="#4aa3df"/>' +
    '<text x="320" y="450" font-family="sans-serif" font-size="18" fill="#6b665e" text-anchor="middle">Beispielfoto</text>',
);

export const REQUESTS: ServiceRequest[] = [
  req('r-1', 'fault', 'a-ste-oel', ago(0, 3), {
    message: 'Heizung geht seit heute früh nicht, im Display steht „Störung 4". In der Praxis ist es kalt.',
    contact_name: 'Dr. Steiner',
    contact_phone: '+43 2682 000 11',
    preferred: 'so bald wie möglich',
    photo_url: PHOTO_DISPLAY,
    ai_note: 'Display laut Foto: STÖRUNG 4 · Brenner (automatisch gelesen — bitte prüfen)',
  }),
  req('r-7', 'quote', 'a-hub-wp', ago(0, 6), {
    message: 'Angebot für: Ausdehnungsgefäß tauschen\nBitte mit Preis inklusive Montage.',
    contact_name: 'Familie Huber',
    contact_email: 'huber@example.com',
  }),
  // Termin vom Kunden gewählt (morgen 10–12) → Status „Geplant", steht unter „Nächste Termine"
  req('r-2', 'maintenance', 'a-hub-wp', ago(1, 2), {
    message: 'Bitte um einen Wartungstermin für die Wärmepumpe.',
    contact_name: 'Familie Huber',
    contact_phone: '+43 664 000 0101',
    contact_email: 'huber@example.com',
    preferred: 'nächste oder übernächste Woche, vormittags',
    source: 'reminder',
    status: 'scheduled',
    handled_by: 'u-owner',
    handled_at: ago(0, 20),
    slots: [{ start: at(1, 10), end: at(1, 12) }, { start: at(2, 8), end: at(2, 10) }],
    slot_token: 'demo',
    scheduled_at: at(1, 10),
    scheduled_end: at(1, 12),
  }),
  // Zwei Termine vorgeschlagen, Kunde hat noch nicht gewählt
  req('r-3', 'maintenance', 'a-see-gt1', ago(2, 6), {
    message: 'Jährliche Wartung der Heizkessel bitte wie letztes Jahr. Zugang über den Hausmeister.',
    contact_name: 'Hausverwaltung Berger',
    contact_email: 'verwaltung@example.com',
    slots: [{ start: at(3, 8), end: at(3, 10) }, { start: at(4, 13), end: at(4, 15) }],
    slot_token: 'demo',
  }),
  req('r-4', 'fault', 'a-gru-kl1', ago(5, 4), {
    message: 'Klimaanlage im Verkaufsraum tropft.',
    contact_name: 'Frau Gruber',
    contact_phone: '+43 2682 000 00',
    photo_url: PHOTO_DRIP,
    ai_note: 'Foto: kein lesbares Display erkannt',
    slots: [{ start: at(4, 8), end: at(4, 10) }],
    slot_token: 'demo',
    scheduled_at: at(4, 8),
    scheduled_end: at(4, 10),
    status: 'scheduled',
    note: 'Lisa fährt hin.',
    handled_by: 'u-owner',
    handled_at: ago(5, 2),
  }),
  req('r-5', 'maintenance', 'a-nov-lu', ago(30), {
    message: 'Filter der Lüftung tauschen?',
    contact_email: 'novak@example.com',
    status: 'done',
    note: 'Beim Inbetriebnahme-Termin mit erledigt.',
    handled_by: 'u-max',
    handled_at: ago(20),
  }),
  req('r-6', 'maintenance', null, ago(40), {
    message: 'Wartung für unsere Therme.',
    contact_name: 'Unbekannt',
    contact_phone: '+43 650 000 0000',
    status: 'dismissed',
    note: 'Anlage wurde inzwischen außer Betrieb genommen.',
    handled_by: 'u-owner',
    handled_at: ago(39),
  }),
];

const REMINDERS: ReminderLog[] = [
  { id: 'm-1', asset_id: 'a-hub-wp', site_id: 's-huber', due_date: dayAgo(15), email: 'huber@example.com', sent_at: ago(45) },
  { id: 'm-2', asset_id: 'a-gru-kl1', site_id: 's-gruber', due_date: dayAgo(25), email: 'office@example.com', sent_at: ago(55) },
];

const MEMBERS: Member[] = [
  { membership_id: 'ms-1', user_id: 'u-owner', email: 'chef@example.com', role: 'owner', joined_at: ago(800) },
  { membership_id: 'ms-2', user_id: 'u-max', email: 'max@example.com', role: 'worker', joined_at: ago(700) },
  { membership_id: 'ms-3', user_id: 'u-lisa', email: 'lisa@example.com', role: 'worker', joined_at: ago(200) },
];

// ---------------------------------------------------------------------------
// Speicher + Datenquelle
// ---------------------------------------------------------------------------
export interface DemoStore {
  org: InstOrg;
  data: InstData;
}

const wait = <T,>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
const byDateDesc = <T extends { started_at?: string; created_at: string }>(a: T, b: T) =>
  (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at);

/** Neuer Beispiel-Speicher (je Seitenaufruf einer). onOrgChange meldet gespeicherte Einstellungen. */
export function createDemoStore(onOrgChange: (org: InstOrg) => void): DemoStore {
  const org = buildOrg();
  const requests = structuredClone(REQUESTS);

  const data: InstData = {
    demo: true,
    sites: () => wait([...SITES].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de'))),
    site: (id) => wait(SITES.find((s) => s.id === id) ?? null),
    assets: (opts = {}) => wait(ASSETS.filter((a) => !opts.siteId || a.site_id === opts.siteId)),
    asset: (id) => wait(ASSETS.find((a) => a.id === id) ?? null),
    lastService: async () => {
      const map = new Map<string, string>();
      for (const j of JOBS) {
        if (j.canceled || !SERVICE_TYPES.includes(j.type)) continue;
        const prev = map.get(j.item_id);
        if (!prev || j.started_at > prev) map.set(j.item_id, j.started_at);
      }
      return wait(map, 80);
    },
    lastLeakCheck: () => wait(leakInfoFromJobs(JOBS), 80),
    assetStatus: (assetId) => {
      const mine = JOBS.filter((j) => j.item_id === assetId);
      const svc = mine.filter((j) => !j.canceled && SERVICE_TYPES.includes(j.type)).sort(byDateDesc)[0];
      return wait({ lastService: svc?.started_at, leak: leakInfoFromJobs(mine).get(assetId), validJobs: mine.filter((j) => !j.canceled).length }, 60);
    },
    assetPhoto: () => wait(null, 40),
    jobsSince: (from) =>
      wait(
        JOBS.filter((j) => !j.canceled && j.started_at >= from.toISOString())
          .sort(byDateDesc)
          .map(({ id, site_id, item_id, type, started_at, inspector_name }) => ({ id, site_id, item_id, type, started_at, inspector_name })),
      ),
    jobs: (f) =>
      wait(
        JOBS.filter((j) => (!f.siteId || j.site_id === f.siteId) && (!f.itemId || j.item_id === f.itemId))
          .sort(byDateDesc)
          .slice(0, f.limit ?? 300),
      ),
    openFollowUps: () => wait(openFollowUpsFromJobs(JOBS), 80),
    jobsForReport: (f) =>
      wait(
        JOBS.filter((j) => (!f.siteId || j.site_id === f.siteId) && (!f.itemId || j.item_id === f.itemId))
          .sort((a, b) => a.started_at.localeCompare(b.started_at))
          .map((j): JobWithPhotos => ({ ...j, photo_urls: [], signature: null, customer_signature: null })),
      ),
    defects: (f) =>
      wait(
        DEFECTS.filter(
          (d) => (!f.siteId || d.site_id === f.siteId) && (!f.itemId || d.item_id === f.itemId) && (!f.status || d.status === f.status),
        ).sort(byDateDesc),
      ),
    defectsForReport: (f) =>
      wait(
        DEFECTS.filter((d) => (!f.siteId || d.site_id === f.siteId) && (!f.itemId || d.item_id === f.itemId))
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((d): DefectWithPhotos => ({ ...d, photo_urls: [], resolution_photo_urls: [] })),
      ),
    reportCounts: (f) =>
      wait({
        jobs: JOBS.filter((j) => (!f.siteId || j.site_id === f.siteId) && (!f.itemId || j.item_id === f.itemId)).length,
        defects: DEFECTS.filter((d) => (!f.siteId || d.site_id === f.siteId) && (!f.itemId || d.item_id === f.itemId)).length,
      }, 60),
    requests: (f = {}) =>
      wait(
        requests
          .filter(
            (r) => (!f.status || r.status === f.status) && (!f.siteId || r.site_id === f.siteId) && (!f.assetId || r.asset_id === f.assetId),
          )
          .sort(byDateDesc),
      ),
    request: (id) => wait(requests.find((r) => r.id === id) ?? null),
    newRequestCount: () => wait(requests.filter((r) => r.status === 'new').length, 60),
    setRequestStatus: async (id, status, note) => {
      const r = requests.find((x) => x.id === id);
      if (!r) throw new Error('Anfrage konnte nicht gespeichert werden: not found');
      r.status = status;
      r.note = note;
      r.handled_by = status === 'new' ? null : 'u-owner';
      r.handled_at = status === 'new' ? null : new Date().toISOString();
      await wait(null, 200);
    },
    // Wie propose_slots: neue Fenster, neuer Schlüssel (hier „demo" = Beispiel-Terminseite), Wahl zurückgesetzt.
    proposeSlots: async (id, slots) => {
      const r = requests.find((x) => x.id === id);
      if (!r) throw new Error('Termine konnten nicht vorgeschlagen werden: not found');
      r.slots = structuredClone(slots);
      r.slot_token = 'demo';
      r.scheduled_at = null;
      r.scheduled_end = null;
      await wait(null, 250);
      return 'demo';
    },
    appointments: (from) =>
      wait(
        requests
          .filter((r) => r.scheduled_at && r.scheduled_at >= from.toISOString() && r.status !== 'done' && r.status !== 'dismissed')
          .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')),
      ),
    saveOrgSettings: async (_orgId, input: OrgSettingsInput) => {
      Object.assign(org, structuredClone(input));
      await wait(null, 250);
      onOrgChange(structuredClone(org));
    },
    saveRegion: async (_orgId, region: string | null, legal: Record<string, string>) => {
      Object.assign(org, { region, legal: structuredClone(legal) });
      await wait(null, 250);
      onOrgChange(structuredClone(org));
    },
    reminders: (limit) => wait(REMINDERS.slice(0, limit)),
    members: () => wait(MEMBERS),
    setSitePortal: async (siteId, enabled) => {
      const s = SITES.find((x) => x.id === siteId);
      if (!s || (enabled && !s.customer_email)) throw new Error('Freigabe nicht gespeichert: nur mit E-Mail des Kunden.');
      s.portal_enabled = enabled;
      await wait(null, 200);
    },
    // Import: im Speicher anhängen (bis zum Neuladen der Seite), Defaults wie in der Datenbank.
    insertSites: async (rows) => {
      for (const r of rows) {
        SITES.push({ ...r, lat: null, lng: null, notes: r.notes ?? null, active: true, is_demo: false, created_at: new Date().toISOString(), reminder_opt_in: false });
      }
      await wait(null, 200);
    },
    insertAssets: async (rows) => {
      for (const r of rows) {
        ASSETS.push({
          ...r,
          warranty_note: null,
          remote_service: null,
          ...r,
          warranty_until: r.warranty_until ?? null,
          power_kw: r.power_kw ?? null,
          refrigerant: r.refrigerant ?? null,
          refrigerant_kg: r.refrigerant_kg ?? null,
          location: r.location ?? null,
          qr_token: hex(ASSETS.length + 40),
          notes: null,
          retired: false,
          retired_at: null,
          retire_reason: null,
          is_demo: false,
          created_at: new Date().toISOString(),
        });
      }
      await wait(null, 200);
    },
  };

  return { org: structuredClone(org), data };
}
