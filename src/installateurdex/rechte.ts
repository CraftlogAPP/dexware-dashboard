// Team-Rechte (NACHTRAG-TEAMRECHTE-2026-11-08.sql im InstallateurDex-Repo): der Inhaber macht einen Mitarbeiter zum
// Stellvertreter (alle Rechte) oder gibt einzelne Rechte. Geprüft wird am Server (RLS/RPC) — hier nur, was das Portal
// anzeigt. Ohne den Nachtrag gibt es die RPCs nicht: dann gilt der alte Stand (Inhaber alles, Mitarbeiter nichts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';

export type Perm = 'zeiten' | 'rechnungen' | 'kunden' | 'plantafel' | 'team';

export const PERMS: { key: Perm; label: string; hint: string }[] = [
  { key: 'zeiten', label: 'Zeiten aller', hint: 'Zeiten aller sehen, korrigieren, verwerfen und als abgerechnet markieren; Sollzeiten festlegen' },
  { key: 'rechnungen', label: 'Rechnungen & Angebote', hint: 'alle Belege sehen, ausstellen, „bezahlt“/storniert setzen, mahnen, Angebote nachfassen' },
  { key: 'kunden', label: 'Kunden & Anlagen', hint: 'Kunden und Anlagen anlegen, ändern, archivieren bzw. außer Betrieb nehmen, importieren' },
  { key: 'plantafel', label: 'Termine für alle', hint: 'Termine für alle Monteure planen, verschieben und löschen' },
  { key: 'team', label: 'Team einladen/entfernen', hint: 'Team-Code weitergeben und Mitarbeiter ohne Rechte entfernen' },
];
export const ALL_PERMS: Perm[] = PERMS.map((p) => p.key);
export const OWNER_ONLY_HINT = 'Abo, Betriebsdaten, Rechte vergeben und Betrieb löschen bleiben beim Inhaber.';
export const PERMS_LATER_MSG = 'Team-Rechte (Stellvertreter) kommen mit dem nächsten Server-Update.';

export interface MemberPerms {
  membership_id: string;
  user_id: string;
  role: string;
  deputy: boolean;
  perms: Perm[];
  /** was wirklich gilt (Inhaber/Stellvertreter: alle) */
  effective: Perm[];
}

/** RPC fehlt (Nachtrag noch nicht eingespielt)? */
export const isMissingRpc = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (['PGRST202', '42883', 'PGRST205', '42703'].includes(e.code ?? '') || /could not find|does not exist/i.test(e.message ?? ''));

/** Rechte aller im Betrieb. null = Server kennt die Rechte noch nicht (Nachtrag fehlt). */
export async function fetchTeamPerms(sb: SupabaseClient): Promise<MemberPerms[] | null> {
  const { data, error } = await sb.rpc('team_perms');
  if (error) {
    if (isMissingRpc(error)) return null;
    fail('Team-Rechte konnten nicht geladen werden', error);
  }
  return ((data ?? []) as MemberPerms[]).map((r) => ({ ...r, perms: r.perms ?? [], effective: r.effective ?? [] }));
}

/** Nur Inhaber: Stellvertreter-Schalter + Einzelrechte eines Mitarbeiters setzen. */
export async function saveMemberPerms(sb: SupabaseClient, membershipId: string, deputy: boolean, perms: Perm[]): Promise<void> {
  const { error } = await sb.rpc('set_member_perms', { p_membership: membershipId, p_deputy: deputy, p_perms: perms });
  if (error) {
    if (isMissingRpc(error)) throw new Error(PERMS_LATER_MSG);
    fail('Rechte nicht gespeichert', error);
  }
}

/** Kurzbeschreibung für die Liste: „Stellvertreter“, „2 Rechte“, „—“. */
export function permsLabel(p: Pick<MemberPerms, 'role' | 'deputy' | 'perms'> | undefined): string {
  if (!p) return '—';
  if (p.role === 'owner') return 'alles';
  if (p.deputy) return 'Stellvertreter';
  if (!p.perms.length) return '—';
  return p.perms.map((k) => PERMS.find((x) => x.key === k)?.label ?? k).join(', ');
}
