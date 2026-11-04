// Fotos aus dem Speicher anzeigen (seit 03.11.2026): Die Apps legen neue Fotos im privaten
// Supabase-Storage-Bucket „photos" ab und speichern in der Datenbank „storage:<pfad>".
// Ältere Fotos sind weiterhin Daten-URIs (Base64) und bleiben unverändert.
// Diese Funktion ersetzt die Pfade durch signierte Links (1 Stunde gültig) — Seiten und
// Berichte merken davon nichts.

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'photos';
const PREFIX = 'storage:';
const FIELDS = ['photo_urls', 'resolution_photo_urls', 'photo_url'];

export async function signPhotos<T>(sb: SupabaseClient, data: T): Promise<T> {
  if (!data) return data;
  const rows: Record<string, unknown>[] = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const paths = new Set<string>();
  for (const r of rows)
    for (const f of FIELDS) {
      const v = r?.[f];
      for (const x of Array.isArray(v) ? v : [v])
        if (typeof x === 'string' && x.startsWith(PREFIX)) paths.add(x.slice(PREFIX.length));
    }
  if (!paths.size) return data;
  const map = new Map<string, string>();
  const list = [...paths];
  for (let i = 0; i < list.length; i += 100) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(list.slice(i, i + 100), 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  }
  const conv = (x: unknown) =>
    typeof x === 'string' && x.startsWith(PREFIX) ? map.get(x.slice(PREFIX.length)) ?? '' : x;
  const out = rows.map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const f of FIELDS) {
      if (Array.isArray(o[f])) o[f] = (o[f] as unknown[]).map(conv).filter((x) => x !== '');
      else if (f in o) o[f] = conv(o[f]) || null;
    }
    return o;
  });
  return (Array.isArray(data) ? out : out[0]) as T;
}
