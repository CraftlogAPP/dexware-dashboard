// Zentrale App-Registry der dexware-Suite (16 Apps).
// Eine neue App im Dashboard = ein Eintrag hier (plus ggf. ein Dashboard-Modul).

export type AppStatus = 'dashboard' | 'external' | 'soon';

export interface AppTheme {
  /** Markenfarbe, lesbar auf dunklem Grund (Buttons, Links, aktive Nav, Kachel-Akzent) */
  primary: string;
  /** Sekundär-/Akzentfarbe (Badges, Highlights) */
  accent: string;
  /** Flächen-Hintergrund des App-Bereichs */
  bg: string;
  /** Kartenfläche */
  card: string;
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
}

export const APPS: AppConfig[] = [
  {
    id: 'craftdex',
    name: 'CraftDex',
    tagline: 'Aufträge, Zeiterfassung & Doku für Handwerksbetriebe',
    status: 'dashboard',
    emoji: '🛠️',
    theme: { primary: '#E8C97A', accent: '#F59E0B', bg: '#1C1A14', card: '#26231A' },
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
    theme: { primary: '#4F9EF8', accent: '#0EA5E9', bg: '#0F1420', card: '#171F30' },
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
    tagline: 'Automatisches, finanzamt-konformes Fahrtenbuch',
    status: 'dashboard',
    emoji: '🧭',
    theme: { primary: '#60A5FA', accent: '#2563EB', bg: '#0F1923', card: '#182534' },
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
    tagline: 'Baumkataster & Verkehrssicherung — Kontrollen rechtssicher dokumentiert',
    status: 'external',
    emoji: '🌳',
    theme: { primary: '#4ADE80', accent: '#0D9488', bg: '#0A1712', card: '#122A1E' },
    landingUrl: 'https://baumdex.dexware.app',
    externalUrl: 'https://baumdex-portal.vercel.app',
  },
  {
    id: 'schutzdex',
    name: 'SchutzDex',
    tagline: 'Arbeitsschutz-Unterweisung mit prüffestem Nachweis',
    status: 'dashboard',
    emoji: '🦺',
    theme: { primary: '#22C55E', accent: '#2563EB', bg: '#0B1220', card: '#141E31' },
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
    theme: { primary: '#7DA7F9', accent: '#1D4ED8', bg: '#0D1526', card: '#162038' },
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
    tagline: 'Räum- & Streupflicht gerichtsfest dokumentiert',
    status: 'dashboard',
    emoji: '❄️',
    theme: { primary: '#38BDF8', accent: '#FB923C', bg: '#0A1520', card: '#122334' },
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
    theme: { primary: '#F97316', accent: '#FDBA74', bg: '#0C1017', card: '#171D28' },
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
    theme: { primary: '#FF7A6E', accent: '#2DD4BF', bg: '#12191E', card: '#1B2730' },
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
    theme: { primary: '#F59E0B', accent: '#5B7185', bg: '#14120C', card: '#211D14' },
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
    theme: { primary: '#EF4444', accent: '#B91C1C', bg: '#1C1512', card: '#292019' },
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
    theme: { primary: '#2DD4BF', accent: '#14B8A6', bg: '#0E1A19', card: '#162927' },
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
    theme: { primary: '#A78BFA', accent: '#8B5CF6', bg: '#131020', card: '#1D1830' },
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
    theme: { primary: '#F472B6', accent: '#DB2777', bg: '#170D14', card: '#241520' },
    landingUrl: 'https://gurtdex.dexware.app',
    revenueCat: 'goog_AgviVPXkwpqsIocTiFHGfTvnIdM',
    supabase: {
      url: 'https://sqwvkpigdxqfflvaotek.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxd3ZrcGlnZHhxZmZsdmFvdGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMjk5MzEsImV4cCI6MjA5OTcwNTkzMX0.LQ-WgfbD7gZ3PCjDtCgLtuamMznbxlgow-JhXnpnSTU',
    },
  },
  {
    id: 'leiterdex',
    name: 'LeiterDex',
    tagline: 'Leitern- & Tritte-Prüfung nach BetrSichV / DGUV 208-016',
    status: 'dashboard',
    emoji: '🪜',
    theme: { primary: '#60A5FA', accent: '#64748B', bg: '#141A22', card: '#1B2733' },
    landingUrl: 'https://leiterdex.dexware.app',
    revenueCat: 'goog_vTdzyRKXPUnpDufpvAdJPpBFdhS',
    supabase: {
      url: 'https://nluocglurpymdhhzfxjd.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdW9jZ2x1cnB5bWRoaHpmeGpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDgyNzEsImV4cCI6MjA5OTE4NDI3MX0.1m1IfBeSDOy7vODufezJ2p0_RhL2iaFMSRrxZN2SCds',
    },
  },
  {
    id: 'turndex',
    name: 'TurnDex',
    tagline: 'Sportgeräte & Sporthallen prüfen nach DGUV-I 202-044 (DIN EN 913)',
    status: 'soon',
    emoji: '🤸',
    theme: { primary: '#A3E635', accent: '#84CC16', bg: '#141807', card: '#1E240F' },
    landingUrl: 'https://turndex.dexware.app',
  },
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
