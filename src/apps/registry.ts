// Zentrale App-Registry der dexware-Suite (11 Apps).
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
  /** Emoji als Kachel-Icon */
  emoji: string;
}

export const APPS: AppConfig[] = [
  {
    id: 'craftdex',
    name: 'CraftDex',
    tagline: 'Aufträge, Zeiterfassung & Doku für Handwerksbetriebe',
    status: 'soon',
    emoji: '🛠️',
    theme: { primary: '#E8C97A', accent: '#F59E0B', bg: '#1C1A14', card: '#26231A' },
    landingUrl: 'https://craftdex.dexware.app',
  },
  {
    id: 'dokudex',
    name: 'DokuDex',
    tagline: 'Dokumente sicher archivieren & jederzeit wiederfinden',
    status: 'soon',
    emoji: '📄',
    theme: { primary: '#4F9EF8', accent: '#0EA5E9', bg: '#0F1420', card: '#171F30' },
    landingUrl: 'https://dokudex.dexware.app',
  },
  {
    id: 'tourdex',
    name: 'TourDex',
    tagline: 'Automatisches, finanzamt-konformes Fahrtenbuch',
    status: 'soon',
    emoji: '🧭',
    theme: { primary: '#60A5FA', accent: '#2563EB', bg: '#0F1923', card: '#182534' },
    landingUrl: 'https://tourdex.dexware.app',
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
    status: 'soon',
    emoji: '🚛',
    theme: { primary: '#F97316', accent: '#FDBA74', bg: '#0C1017', card: '#171D28' },
    landingUrl: 'https://kfzdex.dexware.app',
  },
  {
    id: 'spieldex',
    name: 'SpielDex',
    tagline: 'Spielplatzkontrolle nach DIN EN 1176 mit PDF-Kontrollbuch',
    status: 'dashboard',
    emoji: '🎠',
    theme: { primary: '#FF7A6E', accent: '#2DD4BF', bg: '#12191E', card: '#1B2730' },
    landingUrl: 'https://spieldex.dexware.app',
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
    supabase: {
      url: 'https://vzxqbdadtzjolppzfqxx.supabase.co',
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6eHFiZGFkdHpqb2xwcHpmcXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTk2MTUsImV4cCI6MjA5OTAzNTYxNX0.dHXH7IU3l3bRZSJJJAlpajI7nfJBiC2kkawNa2zR5a8',
    },
  },
  {
    id: 'leiterdex',
    name: 'LeiterDex',
    tagline: 'Leitern- & Tritte-Prüfung nach BetrSichV / DGUV 208-016',
    status: 'soon',
    emoji: '🪜',
    theme: { primary: '#5B8DF7', accent: '#64748B', bg: '#10141B', card: '#1A2029' },
    landingUrl: 'https://leiterdex.dexware.app',
  },
];

export function getApp(id: string): AppConfig | undefined {
  return APPS.find((a) => a.id === id);
}

/** Sortierung für den Entry-Screen: nutzbare Dashboards zuerst. */
export const STATUS_ORDER: Record<AppStatus, number> = {
  dashboard: 0,
  external: 1,
  soon: 2,
};
