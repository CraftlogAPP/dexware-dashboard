// Erster Start im Browser ohne Betrieb: je App GENAU der Server-Weg, den die Android-App beim ersten Start nimmt
// (Betrieb anlegen bzw. per Code beitreten) — samt Feldern und Wortlaut ihres Onboardings.
// Nur Daten und Server-Aufrufe, keine Oberfläche (die steht in components/WebOnboarding.tsx); die Datei importiert
// bewusst nur Typen, damit tests/web-onboarding.test.mjs sie direkt laden und gegen das echte Schema laufen lassen kann.
//
// Fundstellen in den App-Repos:
//   LeiterDex, FeuerDex, ToreDex, GurtDex, HebeDex, GerüstDex, RegalDex, SpielDex
//     mobile/src/screens/OnboardingScreen.tsx → mobile/src/data/supabaseRepository.ts
//     createOrg  = RPC create_org_with_owner(p_name, p_land, p_address)   (supabase/NACHTRAG-RUNDUMCHECK-2026-11-10.sql)
//     redeemInvite = RPC redeem_invite(p_code)                             (supabase/NACHTRAG-TEAMCODE-2026-11-14.sql)
//   PrüfDex   wie oben, aber create_org_with_owner(p_name, p_inspector_name, p_qualification, p_address) — ohne Land
//   KfzDex    src/screens/onboarding/CreateOrgScreen.tsx → src/lib/queries.ts
//     createOrg = RPC create_org_with_membership(p_name) · joinOrg = RPC join_org(p_invite_code)
//   SchutzDex src/screens/onboarding/CreateOrgScreen.tsx → src/lib/queries.ts
//     createOrg = direkter INSERT in org (owner_user_id, name, branche, land, mitarbeiter_anzahl) unter RLS;
//     die App kennt KEINEN Team-Beitritt (ein Konto = ein Betrieb) → hier auch keiner.
import type { SupabaseClient } from '@supabase/supabase-js';

export type OnbLand = 'DE' | 'AT' | 'CH';

export const ONB_LAND_LABELS: Record<OnbLand, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };

export interface OnbField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** Vorbelegung wie in der App */
  initial?: string;
  maxLength?: number;
  autoComplete?: string;
  /** Zifferntastatur */
  numeric?: boolean;
}

export interface OnbJoin {
  /** Erklärtext über dem Code-Feld */
  hint: string;
  label: string;
  placeholder: string;
  button: string;
  /** Mindestlänge des Codes (PrüfDex prüft 6 Zeichen vor dem Senden) */
  minLength?: number;
  run: (sb: SupabaseClient, code: string) => Promise<void>;
  /** Server-Meldung → verständlicher Text; null = Meldung unverändert zeigen */
  errorText: (message: string, appName: string) => string | null;
}

export interface OnbSpec {
  /** Beschriftung der beiden Wahl-Knöpfe [anlegen, beitreten] */
  modes: [string, string];
  /** Satz über dem Formular „Betrieb anlegen“ */
  intro: string;
  fields: OnbField[];
  /** Länderwahl (fehlt = die App fragt kein Land ab) */
  lands?: OnbLand[];
  landLabel?: string;
  landHint?: string;
  createButton: string;
  create: (sb: SupabaseClient, values: Record<string, string>, land: OnbLand) => Promise<void>;
  /** fehlt = die App hat keinen Team-Beitritt */
  join?: OnbJoin;
}

async function rpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
}

const text = (v: Record<string, string>, key: string) => (v[key] ?? '').trim();

// ---------------------------------------------------------------- Prüf-Apps mit gleichem Mandanten-Modell
const redeemInvite = async (sb: SupabaseClient, code: string): Promise<void> => {
  const { error } = await sb.rpc('redeem_invite', { p_code: code.trim().toUpperCase() });
  // Erster Tipp kam am Server an, nur die Antwort ging verloren → man ist schon drin (die App wertet das als Erfolg).
  if (error && !/already member of an org/i.test(error.message)) throw new Error(error.message);
};

const inviteErrorText =
  (who: string, where: string, askFor: string) =>
  (m: string, appName: string): string | null =>
    /invalid or expired|not found/i.test(m)
      ? `Der Code ist ungültig oder abgelaufen. ${askFor}`
      : /team full/i.test(m)
        ? `Das Team ist voll. Bitte ${who}, in ${appName} ${where} mehr Plätze freizuschalten.`
        : /removed from team/i.test(m)
          ? `Du wurdest aus diesem Team entfernt. Bitte ${who} um einen neuen Team-Code.`
          : null;

interface StandardInput {
  /** Kürzel der Team-Codes, z. B. LD */
  prefix: string;
  /** „Prüfungen“, „Inspektionen“, „Kontrollen“ */
  docs: string;
  namePlaceholder: string;
  landHint: string;
  lands?: OnbLand[];
}

function standard(i: StandardInput): OnbSpec {
  return {
    modes: ['Eigener Betrieb', 'Ich wurde eingeladen'],
    intro: `Einmalig einrichten — dein Team dokumentiert danach alle ${i.docs} unter diesem Betrieb.`,
    fields: [
      { key: 'name', label: 'Betriebsname *', placeholder: i.namePlaceholder, required: true, maxLength: 120, autoComplete: 'organization' },
      { key: 'address', label: 'Adresse (optional)', placeholder: 'Straße Nr., PLZ Ort', maxLength: 200, autoComplete: 'street-address' },
    ],
    lands: i.lands ?? ['DE', 'AT', 'CH'],
    landLabel: 'In welchem Land arbeitest du?',
    landHint: i.landHint,
    createButton: 'Loslegen',
    create: (sb, v, land) => rpc(sb, 'create_org_with_owner', { p_name: text(v, 'name'), p_land: land, p_address: text(v, 'address') }),
    join: {
      hint: `Dein Chef schickt dir einen Team-Code (z. B. „${i.prefix}-7KM3-RQ2P“). Damit dokumentierst du ${i.docs} direkt unter seinem Betrieb — ein eigenes Abo brauchst du nicht.`,
      label: 'Einladungscode *',
      placeholder: `${i.prefix}-XXXX-XXXX`,
      button: 'Beitreten',
      run: redeemInvite,
      errorText: inviteErrorText('deinen Chef', 'unter „Team“', 'Bitte lass dir einen neuen schicken.'),
    },
  };
}

const PRUEFDEX: OnbSpec = {
  modes: ['Eigener Betrieb', 'Ich habe einen Team-Code'],
  intro: 'Lege einmalig deinen Prüfbetrieb an — diese Daten erscheinen auf jedem Protokoll.',
  fields: [
    { key: 'name', label: 'Betriebsname *', placeholder: 'z. B. Elektro Müller GmbH', required: true, maxLength: 120, autoComplete: 'organization' },
    { key: 'inspector', label: 'Prüfer (Name)', placeholder: 'Vor- und Nachname', maxLength: 120, autoComplete: 'name' },
    { key: 'qualification', label: 'Qualifikation', initial: 'Elektrofachkraft nach DGUV V3', maxLength: 160 },
    { key: 'address', label: 'Adresse', placeholder: 'Straße, PLZ Ort', maxLength: 200, autoComplete: 'street-address' },
  ],
  createButton: 'Betrieb anlegen & loslegen',
  create: (sb, v) =>
    rpc(sb, 'create_org_with_owner', {
      p_name: text(v, 'name'),
      p_inspector_name: text(v, 'inspector'),
      p_qualification: text(v, 'qualification'),
      p_address: text(v, 'address'),
    }),
  join: {
    hint: 'Dein Betrieb nutzt PrüfDex schon? Gib den Team-Code ein, den du von deinem Betrieb bekommen hast — kein eigenes Abo nötig.',
    label: 'Team-Code *',
    placeholder: 'PD-XXXX-XXXX',
    button: 'Team beitreten',
    minLength: 6,
    run: redeemInvite,
    errorText: inviteErrorText('den Inhaber', 'unter Mehr → Team', 'Bitte beim Inhaber einen aktuellen Team-Code anfragen.'),
  },
};

// ---------------------------------------------------------------- KfzDex (org_member, Einladungscode am Betrieb)
const KFZDEX: OnbSpec = {
  modes: ['Neu anlegen', 'Mit Code beitreten'],
  intro: 'Lege deinen Betrieb an — oder tritt einem bestehenden bei.',
  fields: [{ key: 'name', label: 'Name des Betriebs *', placeholder: 'z. B. Pfalz Installationen GmbH', required: true, maxLength: 120, autoComplete: 'organization' }],
  createButton: 'Betrieb anlegen',
  create: (sb, v) => rpc(sb, 'create_org_with_membership', { p_name: text(v, 'name') }),
  join: {
    hint: 'Den Code findet der Betriebsinhaber in der App unter „Mehr“ → „Betrieb & Team“.',
    label: 'Einladungscode *',
    placeholder: 'z. B. K7F3-X2M9-PQ4R',
    button: 'Beitreten',
    // Der Server räumt den Code selbst auf (Großschreibung, Bindestriche) und meldet „Ungültiger Einladungscode.“ /
    // „Zu viele Fehlversuche …“ schon auf Deutsch.
    run: (sb, code) => rpc(sb, 'join_org', { p_invite_code: code.trim() }),
    errorText: (m, appName) =>
      /team full/i.test(m)
        ? `Das Team ist voll. Bitte deinen Chef, in ${appName} unter „Mehr“ mehr Plätze freizuschalten.`
        : /removed from team/i.test(m)
          ? 'Du wurdest aus diesem Team entfernt. Bitte den Chef um einen neuen Einladungscode.'
          : null,
  },
};

// ---------------------------------------------------------------- SchutzDex (ein Konto = ein Betrieb, kein Team)
/** „1.000“ / „1 000“ sind Tausender-Schreibweisen; alles andere Unklare bleibt leer (wie in der App). */
export function parseStaffCount(raw: string): number | null {
  const digits = raw.trim().replace(/[.\s'’]/g, '');
  return /^\d{1,7}$/.test(digits) ? parseInt(digits, 10) : null;
}

const SCHUTZDEX: OnbSpec = {
  modes: ['Betrieb anlegen', ''],
  intro: 'Einmalig — danach kannst du Mitarbeiter und Unterweisungen verwalten.',
  fields: [
    { key: 'name', label: 'Betriebsname *', placeholder: 'z. B. Mustermann GmbH', required: true, maxLength: 120, autoComplete: 'organization' },
    { key: 'branche', label: 'Branche (optional)', placeholder: 'z. B. Sanitär / Heizung, Bau, Gastro', maxLength: 120 },
    { key: 'count', label: 'Anzahl Mitarbeiter (optional)', placeholder: 'z. B. 8', maxLength: 9, numeric: true },
  ],
  lands: ['DE', 'AT', 'CH'],
  landLabel: 'Land',
  createButton: 'Betrieb anlegen',
  create: async (sb, v, land) => {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Nicht eingeloggt.');
    const { error } = await sb.from('org').insert({
      owner_user_id: uid,
      name: text(v, 'name'),
      branche: text(v, 'branche') || null,
      land,
      mitarbeiter_anzahl: parseStaffCount(v.count ?? ''),
    });
    // Betrieb gibt es schon (eindeutiger Index je Konto, z. B. Antwort des ersten Anlegens kam nicht an): kein Fehler.
    if (error && error.code !== '23505') throw new Error(error.message);
  },
};

/** App-ID → Onboarding. Nur Apps, die hier stehen, bieten „Betrieb anlegen“ im Browser an. */
export const WEB_ONBOARDING: Record<string, OnbSpec> = {
  leiterdex: standard({
    prefix: 'LD',
    docs: 'Prüfungen',
    namePlaceholder: 'z. B. Gebäudeservice Müller GmbH',
    landHint: 'Die DIN EN 131 gilt europaweit — in Deutschland konkretisieren TRBS 2121-2 und die DGUV Information 208-016 die Prüfpflicht.',
  }),
  feuerdex: standard({
    prefix: 'FD',
    docs: 'Prüfungen',
    namePlaceholder: 'z. B. Gebäudeservice Müller GmbH',
    landHint:
      'Die Wahl steuert Rechtsgrundlage und Prüffrist: DE/AT Instandhaltung durch Sachkundige spätestens alle 2 Jahre (DIN 14406-4 bzw. TRVB F 124 / ÖNORM F 1053), CH üblich alle 3 Jahre (VKF-Praxis).',
  }),
  toredex: standard({
    prefix: 'TD',
    docs: 'Prüfungen',
    namePlaceholder: 'z. B. Gebäudeservice Müller GmbH',
    landHint:
      'Die Wahl steuert die Rechtsgrundlagen im PDF: kraftbetätigte Tore sind im gesamten DACH-Raum mindestens jährlich durch einen Sachkundigen zu prüfen (DE: ASR A1.7 / DGUV I 208-022, AT: ArbStättV, CH: VUV/EKAS-Praxis).',
  }),
  gurtdex: standard({
    prefix: 'GD',
    docs: 'Prüfungen',
    namePlaceholder: 'z. B. Dachdeckerei Müller GmbH',
    landHint:
      'Die Wahl steuert die Rechtsgrundlagen im PDF: PSA gegen Absturz ist im gesamten DACH-Raum mindestens alle 12 Monate durch eine sachkundige Person zu prüfen (DE: DGUV R 112-198 / DGUV G 312-906, AT: § 14 PSA-V, CH: VUV/EKAS-Praxis — jeweils plus Herstellerangaben, EN 365).',
  }),
  hebedex: standard({
    prefix: 'HD',
    docs: 'Prüfungen',
    namePlaceholder: 'z. B. Metallbau Müller GmbH',
    lands: ['DE', 'AT'], // CH bietet die App nicht an (erst nach eigener Rechtsprüfung)
    landHint:
      'Die Wahl steuert Fristen und Rechtsgrundlagen im Prüfbuch. DE: mindestens alle 12 Monate durch eine befähigte Person (DGUV Regel 109-017, BetrSichV), Rundstahlketten zusätzlich alle 3 Jahre Rissprüfung. AT: mindestens einmal im Kalenderjahr, höchstens 15 Monate Abstand (AM-VO § 8). Bewerten darf nur die befähigte Person — HebeDex dokumentiert.',
  }),
  geruestdex: standard({
    prefix: 'GD',
    docs: 'Prüfungen',
    namePlaceholder: 'z. B. Gerüstbau Müller GmbH',
    landHint: 'Die TRBS 2121-1 konkretisiert die Prüfpflichten der BetrSichV — ergänzt durch die DGUV Information 201-011 (Arbeiten auf Gerüsten).',
  }),
  regaldex: standard({
    prefix: 'RD',
    docs: 'Inspektionen',
    namePlaceholder: 'z. B. Logistik Müller GmbH',
    landHint: 'Die DIN EN 15635 gilt europaweit als anerkannte Regel der Technik — in Deutschland ergänzt durch die DGUV Regel 108-007.',
  }),
  spieldex: standard({
    prefix: 'SD',
    docs: 'Kontrollen',
    namePlaceholder: 'z. B. Hausmeisterservice Pfalz',
    landHint: 'Die DIN EN 1176 gilt in der gesamten DACH-Region als anerkannte Regel der Technik.',
  }),
  pruefdex: PRUEFDEX,
  kfzdex: KFZDEX,
  schutzdex: SCHUTZDEX,
};
