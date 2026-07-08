import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';

// Ein Client pro App, gecacht — jede App ist ein eigenes Supabase-Projekt.
// storageKey ist pro App namespaced, damit Sessions sich nicht überschreiben.
const clients = new Map<string, SupabaseClient>();

export function getClient(app: AppConfig): SupabaseClient {
  if (!app.supabase) {
    throw new Error(`App ${app.id} hat kein Supabase-Dashboard-Backend`);
  }
  let client = clients.get(app.id);
  if (!client) {
    client = createClient(app.supabase.url, app.supabase.anonKey, {
      auth: {
        storageKey: `dexware-dash-${app.id}`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    clients.set(app.id, client);
  }
  return client;
}
