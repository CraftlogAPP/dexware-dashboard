// Zentrale App-Registry der dexware-Suite (16 Apps, HebeDex noch „Dashboard folgt“).
// Eine neue App im Dashboard = ein Eintrag hier (plus ggf. ein Dashboard-Modul).

export type AppStatus = 'dashboard' | 'external' | 'soon';

/** Farben wie auf der App-Landing (dexware-suite/landing-system/apps/<app>.js). */
export interface AppTheme {
  /** Markenfarbe (Knöpfe, aktive Navigation); Textvariante leitet das CSS ab */
  accent: string;
  /** Schriftfarbe auf der Markenfarbe */
  onAccent: string;
  /** Dunkler Seitengrund des App-Bereichs */
  bg: string;
}

export interface SupabaseConfig {
  url: string;
  /** Public Anon-Key — RLS schützt die Daten, der Key ist bewusst öffentlich. */
  anonKey: string;
}

export interface AppConfig {
  id: string;
  /** Anzeigename wie auf dexware.app (z. B. „WinterDex") */
  name: string;
  tagline: string;
  status: AppStatus;
  theme: AppTheme;
  landingUrl: string;
  /** Nur bei status 'external': bestehendes Portal (z. B. BaumDex auf Vercel) */
  externalUrl?: string;
  /** Nur bei status 'dashboard' */
  supabase?: SupabaseConfig;
  /**
   * Öffentlicher RevenueCat-SDK-Key (Android) — derselbe, der im App-Build steckt.
   * Erlaubt nur das Lesen/Anlegen des eigenen Subscriber-Datensatzes (Abo-Anzeige).
   */
  revenueCat?: string;
  /** Emoji als Kachel-Icon */
  emoji: string;
  /**
   * App gehört NICHT zum Dexware-Suite-Abo (Alex, 11.11.2026: Suite = nur die Prüf-Apps). Die Abo-Seite fragt dann
   * weder das Entitlement „suite“ noch den Suite-Server und erwähnt die Suite nicht — gilt nur das eigene Pro/Team.
   */
  notInSuite?: boolean;
  /**
   * Nicht auf der Startseite zeigen (noch nicht gestartet) — der Bereich ist nur über die Direktadresse
   * /app/<id> erreichbar. Beim Launch einfach entfernen.
   */
  unlisted?: boolean;
  /**
   * Team-Plätze, wenn die App andere Stufen hat als der Standard (Team bis 50 / Team XL bis 100, Ersatzwert 20).
   * Ohne Angabe bleibt die Team-Seite wie bisher — nur Apps mit eigenem Modell setzen das (InstallateurDex: Team 3/5/10).
   */
  teamSeats?: {
    /** Stufen-Text hinter „Mehr Plätze gibt es in der <App>-App unter Abo: “ */
    tiers: string;
    /** Anzeige bei 0 Plätzen (Pro gilt nur für den Inhaber) — wie der Text in der App */
    solo: string;
    /** Wort für die Plätze, z. B. „Plätzen für weitere Monteure“ */
    seatsWord?: string;
    /** Plätze, wenn der Server keinen Wert liefert */
    fallbackLimit?: number;
  };
}

// InstallateurDex: eigenes Projekt (Frankfurt) — gleiche Werte wie InstallateurDex/mobile/.env.
const INSTALLATEURDEX_SUPABASE: SupabaseConfig = {
  url: 'https://hqudwsxvjhdwfleboklz.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxdWR3c3h2amhkd2ZsZWJva2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4ODgyMjQsImV4cCI6MjEwOTQ2NDIyNH0.p5SvVCHjeNGDITr4bZqUgeN9FUXo_YHZo0UVeSYKl0k',
};

// ObjektDex (Leistungsnachweis Hausbetreuung/Grünpflege/Reinigung, Suite-App): Supabase-Projekt yugakdpkrbcenyqkzkad (Frankfurt),
// Schema ObjektDex/supabase/schema.sql + Nachträge eingespielt. Werte wie ObjektDex/mobile/.env (Anon-Key ist öffentlich, RLS
// schützt; ohne Anmeldung sind seit NACHTRAG-SICHERHEIT-2026-11-13 keine Tabellen lesbar). Verbunden 14.11.2026.
const OBJEKTDEX_SUPABASE: SupabaseConfig = {
  url: 'https://yugakdpkrbcenyqkzkad.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Z2FrZHBrcmJjZW55cWt6a2FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0OTYyMzcsImV4cCI6MjExMDA3MjIzN30.qIYvan-DkXiIfFR4wYaldlJ1svgKPzV86XJjZqMlQ9M',
};

// Laufzettel (intern PinnDex, Live-Pinnwand für Aufträge): Supabase-Projekt otdixdconynnzngwkotx (Frankfurt, seit 12.11.2026),
// Schema PinnDex/supabase/schema.sql ist eingespielt. Werte wie PinnDex/mobile/.env (Anon-Key ist öffentlich, RLS schützt).
const PINNDEX_SUPABASE: SupabaseConfig = {
  url: 'https://otdixdconynnzngwkotx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZGl4ZGNvbnlubnpuZ3drb3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDc0OTAsImV4cCI6MjExMDA4MzQ5MH0.vS-30hvxBGTloq-o0Q5HqXpouicgN6ZiUbrmwfzIr4I',
};

export const APPS: AppConfig[] = [
  {
    id: 'craftdex',
    name: 'CraftDex',
    tagline: 'Aufträge, Zeiterfassung & Doku für Handwerksbetriebe',
    status: 'dashboard',
    emoji: '🛠️',
    theme: { accent: '#E8C97A', onAccent: '#1c1607', bg: '#13110c' },
    landingUrl: 'https://craftdex.dexware.app',
    revenueCat: 'goog_HmRtYRTtdzfVQSFyGWKUcvJUwEK',
    supabase: {
      url: 'https://hxwnpgnipukomxcuayjl.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4d25wZ25pcHVrb214Y3VheWpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2ODU3ODAsImV4cCI6MjA5NjI2MTc4MH0.WQIZfcgrrB4qovyBtBWMrZf1iy-PbHwqSejqKHGXGbg',
    },
  },
  {
    id: 'dokudex',
    name: 'DokuDex',
    tagline: 'Dokumente sicher archivieren & jederzeit wiederfinden',
    status: 'dashboard',
    emoji: '📄',
    theme: { accent: '#4F9EF8', onAccent: '#03172e', bg: '#0b0c10' },
    landingUrl: 'https://dokudex.dexware.app',
    revenueCat: 'goog_koiFQGRJsYbLXBOfMsMxEcyKIno',
    supabase: {
      url: 'https://vzofqnhhwfmmsqsjcyhi.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6b2Zxbmhod2ZtbXNxc2pjeWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2ODYzODIsImV4cCI6MjA5NjI2MjM4Mn0.fAaSWvzdRTU4AdlEOJGFUa_dfMgK6nbm0_SoCzneIR0',
    },
  },
  {
    id: 'tourdex',
    name: 'TourDex',
    tagline: 'Automatisches Fahrtenbuch mit PDF fürs Finanzamt',
    status: 'dashboard',
    emoji: '🧭',
    theme: { accent: '#3B82F6', onAccent: '#ffffff', bg: '#0a1119' },
    landingUrl: 'https://tourdex.dexware.app',
    revenueCat: 'goog_vGPVighPABtAUUCceMEYzkIasxZ',
    supabase: {
      url: 'https://uwchhdhdbjgixdqjtvhr.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3Y2hoZGhkYmpnaXhkcWp0dmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2ODc2MjAsImV4cCI6MjA5NjI2MzYyMH0.S0iRyVRawOXlfl2BBCE-j2BpcjRk1klMtIYkl1Vl0os',
    },
  },
  {
    id: 'baumdex',
    name: 'BaumDex',
    tagline: 'Baumkataster & Verkehrssicherung — Kontrollen lückenlos dokumentiert',
    status: 'external',
    emoji: '🌳',
    theme: { accent: '#4ADE80', onAccent: '#052e16', bg: '#0a1410' },
    landingUrl: 'https://baumdex.dexware.app',
    externalUrl: 'https://baumdex-portal.vercel.app',
  },
  {
    id: 'schutzdex',
    name: 'SchutzDex',
    tagline: 'Arbeitsschutz-Unterweisung mit prüffestem Nachweis',
    status: 'dashboard',
    emoji: '🦺',
    theme: { accent: '#3B82F6', onAccent: '#ffffff', bg: '#090e1a' },
    landingUrl: 'https://schutzdex.dexware.app',
    revenueCat: 'goog_bFUROrBgFYMKMKDFIJYmvCSMcrT',
    supabase: {
      url: 'https://fdeuotsktshxtkobkpay.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkZXVvdHNrdHNoeHRrb2JrcGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDgyNjEsImV4cCI6MjA5Nzg4NDI2MX0.ojenzJIONPgpf2v-flWM4_ELbioiL_68LNR3SDFuPI4',
    },
  },
  {
    id: 'pruefdex',
    name: 'PrüfDex',
    tagline: 'DGUV-V3-Geräteprüfung mobil & prüffest',
    status: 'dashboard',
    emoji: '🔌',
    theme: { accent: '#2F6BF2', onAccent: '#ffffff', bg: '#090e1c' },
    landingUrl: 'https://pruefdex.dexware.app',
    revenueCat: 'goog_pPXjHAIrXRKvpiGVTwCVDdRyOco',
    supabase: {
      url: 'https://rwiqqppaiqnepsraeeaa.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3aXFxcHBhaXFuZXBzcmFlZWFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MTMwODgsImV4cCI6MjA5ODA4OTA4OH0.CaJ344hTNxmMWQ5aEt1Q8lIM_QWduJ95rwc6WgXPUwM',
    },
  },
  {
    id: 'winterdex',
    name: 'WinterDex',
    tagline: 'Räum- & Streupflicht lückenlos dokumentiert',
    status: 'dashboard',
    emoji: '❄️',
    theme: { accent: '#0EA5E9', onAccent: '#03202f', bg: '#08111a' },
    landingUrl: 'https://winterdex.dexware.app',
    revenueCat: 'goog_EFamBqKZmcNVjBZZoYgveMeyoUw',
    supabase: {
      url: 'https://nppmhxpnynziuavvqmvd.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wcG1oeHBueW56aXVhdnZxbXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MzYyNDksImV4cCI6MjA5ODUxMjI0OX0.OzKb4TrZHM4CMLABT3ek9Vtm3UsSqbJK0hUXGj-opFw',
    },
  },
  {
    id: 'kfzdex',
    name: 'KfzDex',
    tagline: 'UVV-Prüfung & Führerscheinkontrolle mit Fristen-Ampel',
    status: 'dashboard',
    emoji: '🚛',
    theme: { accent: '#F97316', onAccent: '#1f0b00', bg: '#0b0f15' },
    landingUrl: 'https://kfzdex.dexware.app',
    revenueCat: 'goog_EGwxQkGUiswhKHzJfwpurysKnFI',
    supabase: {
      url: 'https://xjfkxrtvrpxwbqqozmar.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZmt4cnR2cnB4d2JxcW96bWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwOTkzNzgsImV4cCI6MjA5ODY3NTM3OH0.5NUPdSEhJg15vYKdLu8mRONVzbwLO4PrVxy47e41fBg',
    },
  },
  {
    id: 'spieldex',
    name: 'SpielDex',
    tagline: 'Spielplatzkontrolle nach DIN EN 1176 mit PDF-Kontrollbuch',
    status: 'dashboard',
    emoji: '🎠',
    theme: { accent: '#EA5A47', onAccent: '#ffffff', bg: '#0b1517' },
    landingUrl: 'https://spieldex.dexware.app',
    revenueCat: 'goog_pUmlTTpXcHtjVuLUNPSArxyVarJ',
    supabase: {
      url: 'https://ycstxklzqfapgtgoomxw.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc3R4a2x6cWZhcGd0Z29vbXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzc0NTQsImV4cCI6MjA5ODk1MzQ1NH0.20eJ1TpnjSi8N6c0oDVnmVCoZPvwQ8JuvwWJ0jHGN_A',
    },
  },
  {
    id: 'regaldex',
    name: 'RegalDex',
    tagline: 'Regalinspektion nach DIN EN 15635 im Ampelverfahren',
    status: 'dashboard',
    emoji: '🏗️',
    theme: { accent: '#F59E0B', onAccent: '#211400', bg: '#13110c' },
    landingUrl: 'https://regaldex.dexware.app',
    revenueCat: 'goog_aYtkRUUHPzDFfjbhkvXrpfyWHpn',
    supabase: {
      url: 'https://vzxqbdadtzjolppzfqxx.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6eHFiZGFkdHpqb2xwcHpmcXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTk2MTUsImV4cCI6MjA5OTAzNTYxNX0.dHXH7IU3l3bRZSJJJAlpajI7nfJBiC2kkawNa2zR5a8',
    },
  },
  {
    id: 'feuerdex',
    name: 'FeuerDex',
    tagline: 'Feuerlöscher-Prüfung nach ASR A2.2 / DIN 14406-4',
    status: 'dashboard',
    emoji: '🧯',
    theme: { accent: '#DC2626', onAccent: '#ffffff', bg: '#140c0b' },
    landingUrl: 'https://feuerdex.dexware.app',
    revenueCat: 'goog_UZqByYBRPUCNkRbRMVXyAVdQfuX',
    supabase: {
      url: 'https://evwdeonvgocfeflpecga.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2d2Rlb252Z29jZmVmbHBlY2dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTQwMzcsImV4cCI6MjA5OTI3MDAzN30.0zJqaTUx0fV5Y2OCGbXKZHJYMGOIzhSM9VIASSmB02U',
    },
  },
  {
    id: 'geruestdex',
    name: 'GerüstDex',
    tagline: 'Gerüstprüfung nach TRBS 2121-1 mit Freigabe-Nachweis',
    status: 'dashboard',
    emoji: '🚧',
    theme: { accent: '#14B8A6', onAccent: '#042f2b', bg: '#0a1413' },
    landingUrl: 'https://geruestdex.dexware.app',
    revenueCat: 'goog_JtcTMMIsmhGoHABsFvpqfmnGvUW',
    supabase: {
      url: 'https://tncufucamwaiqgjnyuwd.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuY3VmdWNhbXdhaXFnam55dXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTg1ODQsImV4cCI6MjA5OTI5NDU4NH0.Mi7ULPWQ02f3F2-V4fBQ_KxNcSMNEqQfAaz-ivc12Lo',
    },
  },
  {
    id: 'toredex',
    name: 'ToreDex',
    tagline: 'Tor- & Türenprüfung nach ASR A1.7 mit Prüfbuch-PDF',
    status: 'dashboard',
    emoji: '🚪',
    theme: { accent: '#7C3AED', onAccent: '#ffffff', bg: '#100d17' },
    landingUrl: 'https://toredex.dexware.app',
    revenueCat: 'goog_vCXreEPQCtnZnxADPLpSozSpnRY',
    supabase: {
      url: 'https://lecgketoggxvecmolnqx.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlY2drZXRvZ2d4dmVjbW9sbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NzI2NDQsImV4cCI6MjA5OTQ0ODY0NH0.65afL7Xjl4EY_pspHJmohMfyf7ZbbPqPYMiZgqfel8M',
    },
  },
  {
    id: 'gurtdex',
    name: 'GurtDex',
    tagline: 'PSA gegen Absturz prüfen — mit Ablegereife-Wächter (DGUV 312-906)',
    status: 'dashboard',
    emoji: '🧗',
    theme: { accent: '#DB2777', onAccent: '#ffffff', bg: '#150d13' },
    landingUrl: 'https://gurtdex.dexware.app',
    revenueCat: 'goog_AgviVPXkwpqsIocTiFHGfTvnIdM',
    supabase: {
      url: 'https://sqwvkpigdxqfflvaotek.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxd3ZrcGlnZHhxZmZsdmFvdGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMjk5MzEsImV4cCI6MjA5OTcwNTkzMX0.LQ-WgfbD7gZ3PCjDtCgLtuamMznbxlgow-JhXnpnSTU',
    },
  },
  {
    id: 'hebedex',
    name: 'HebeDex',
    tagline: 'Anschlag-, Lastaufnahme- & Zurrmittel prüfen — mit Ablegereife-Rechner (DGUV Regel 109-017)',
    status: 'dashboard',
    emoji: '⛓️',
    theme: { accent: '#84CC16', onAccent: '#0E120B', bg: '#0E120B' },
    landingUrl: 'https://hebedex.dexware.app',
    revenueCat: 'goog_RARplVhVPiwOtVtDVUmuqwmqBGk',
    supabase: {
      url: 'https://pwaxrteojzryzfiagbfc.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YXhydGVvanpyeXpmaWFnYmZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MjM3NDEsImV4cCI6MjEwOTA5OTc0MX0.UiItgyGJAC2wfdc3gIxDatLqvx12D5GBsulPx7Qa2YY',
    },
  },
  {
    id: 'leiterdex',
    name: 'LeiterDex',
    tagline: 'Leitern- & Tritte-Prüfung nach BetrSichV / DGUV 208-016',
    status: 'dashboard',
    emoji: '🪜',
    theme: { accent: '#2563EB', onAccent: '#ffffff', bg: '#0a0e16' },
    landingUrl: 'https://leiterdex.dexware.app',
    revenueCat: 'goog_vTdzyRKXPUnpDufpvAdJPpBFdhS',
    supabase: {
      url: 'https://nluocglurpymdhhzfxjd.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdW9jZ2x1cnB5bWRoaHpmeGpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDgyNzEsImV4cCI6MjA5OTE4NDI3MX0.1m1IfBeSDOy7vODufezJ2p0_RhL2iaFMSRrxZN2SCds',
    },
  },
  {
    id: 'installateurdex',
    name: 'InstallateurDex',
    tagline: 'Wartungen, Anlagenpass & Kundenanfragen für Installateure (Heizung, Wärmepumpe, Klima, Sanitär)',
    status: 'dashboard',
    emoji: '🔧',
    // eigener Tarif, nicht im Suite-Abo (11.11.2026) — wie tarif-abgleich.sql/NACHTRAG-SUITE-TRENNUNG
    notInSuite: true,
    theme: { accent: '#D9822B', onAccent: '#14181D', bg: '#0F1216' },
    landingUrl: 'https://installateurdex.dexware.app',
    revenueCat: 'goog_DOFgenvUDvWqRvosCnrBsaEkUcG',
    supabase: INSTALLATEURDEX_SUPABASE,
    // Wie die App (TeamScreen + tarif-abgleich.sql): Pro = nur Inhaber, Team 3/5/10 = 2/4/9 weitere Monteure
    teamSeats: {
      tiers: 'Team 3, Team 5 oder Team 10 (2, 4 bzw. 9 weitere Monteure)',
      solo: 'Pro gilt für dich allein — jeder weitere Monteur höchstens 4,99 € im Monat',
      seatsWord: 'Plätzen für weitere Monteure',
      fallbackLimit: 0,
    },
  },
  {
    id: 'objektdex',
    name: 'ObjektDex',
    tagline: 'Hausbetreuung, Grünpflege & Reinigung — jeder Einsatz mit Soll/Ist belegt',
    status: 'dashboard',
    // noch nicht gestartet (geschlossener Test) → nicht auf der Startseite; die App verlinkt direkt /app/objektdex
    unlisted: true,
    emoji: '🏠',
    // Farben wie die App (frisches Grün/Petrol auf dunklem Grund, ObjektDex/mobile/src/theme.ts)
    theme: { accent: '#34D8A6', onAccent: '#04261D', bg: '#0A1615' },
    landingUrl: 'https://objektdex.dexware.app',
    // Öffentlicher RevenueCat-SDK-Key wie ObjektDex/mobile/.env (nur Abo-Anzeige)
    revenueCat: 'goog_WBvzEsiVeXLgRjHhOWiuYcoysur',
    supabase: OBJEKTDEX_SUPABASE,
  },
  {
    id: 'pinndex',
    // Sichtbarer Name seit 11.11.2026 „Laufzettel“ (eigene Marke, kein Teil der Suite) — Kennung/Route bleiben „pinndex“ (wie Bucket pinn)
    name: 'Laufzettel',
    tagline: 'Der digitale Laufzettel für dein Team — Aufträge verteilen, Status live sehen',
    status: 'dashboard',
    // Eigenständige Marke, noch nicht gestartet → nicht auf der Startseite (nur /app/pinndex bzw. /app/laufzettel)
    unlisted: true,
    emoji: '📋',
    // Farben wie die App (Bernstein auf Graphit, PinnDex/mobile)
    theme: { accent: '#F5B544', onAccent: '#1A1305', bg: '#121315' },
    landingUrl: 'https://laufzettel.dexware.app',
    supabase: PINNDEX_SUPABASE.url && PINNDEX_SUPABASE.anonKey ? PINNDEX_SUPABASE : undefined,
  },
  // TurnDex bleibt bewusst draußen: auf Eis gelegt (kein freies Supabase-Projekt
  // verfügbar), darf in keiner öffentlichen Fläche auftauchen.
];

export function getApp(id: string): AppConfig | undefined {
  return APPS.find((a) => a.id === id);
}

/** Echtes App-Icon (public/icons/<id>.png, 128 px) — für alle 14 Apps vorhanden. */
export function appIcon(id: string): string {
  return `/icons/${id}.png`;
}

/** Sortierung für den Entry-Screen: nutzbare Dashboards zuerst. */
export const STATUS_ORDER: Record<AppStatus, number> = {
  dashboard: 0,
  external: 1,
  soon: 2,
};
