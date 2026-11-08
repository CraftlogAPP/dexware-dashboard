// Welche Bildquellen dürfen in Druckvorlagen und Bildanzeigen? (Sicherheitsprüfung 08.11.)
// Nur eingebettete Rasterbilder (kein SVG — kann Skripte/Fremdlinks enthalten) oder signierte/öffentliche Links aus
// einem Supabase-Speicher. Beliebige https-Links hätten beim Drucken fremde Server angefragt (Tracking/IP-Leck);
// das Druckfenster läuft auf derselben Herkunft wie das Portal.
// Gleiche Regel wie die App (InstallateurDex pdf/report.ts imgSrc) und planung/zeitbuchDruck.ts.

const DATA_IMG = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
const SUPABASE_STORAGE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(sign|public)\/[^\s"'<>`]+$/i;

export function isSafeImgSrc(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  return DATA_IMG.test(s) || SUPABASE_STORAGE.test(s);
}
