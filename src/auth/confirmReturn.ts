/**
 * Rückkehr vom Bestätigungslink der Registrierung (21.11.2026, Alex: „das ist wichtig!“): Vorher landete man nach dem
 * Klick in der Mail ohne jede Rückmeldung im App-Bereich. Die Registrierung im Dashboard schickt deshalb
 * `/app/<id>?bestaetigt=1` als Rücksprung-Adresse mit; hier wird beim Laden einmal gelesen, ob wir von dort kommen.
 *
 * Supabase hängt bei abgelaufenem oder schon benutztem Link `#error=…&error_code=otp_expired&error_description=…` an
 * (bei PKCE zusätzlich als ?query). Dann NICHT „bestätigt“ melden. error_description wird nie angezeigt (Inhalt aus der
 * Adresse — ließe sich in einem präparierten Link frei füllen).
 */
export type ConfirmReturn = 'ok' | 'error';

/** Suchparameter, die nach der Auswertung aus der Adresse verschwinden (Token-/Code-Reste inklusive). */
const DROP = ['bestaetigt', 'error', 'error_code', 'error_description', 'code'];

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

/** Kommen wir gerade vom Bestätigungslink? Nur beim ersten Rendern aufrufen (vor dem Aufräumen der Adresse). */
export function readConfirmReturn(): ConfirmReturn | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const h = hashParams();
  const marked = q.get('bestaetigt') === '1';
  const code = h.get('error_code') || q.get('error_code');
  const failed = !!(h.get('error') || q.get('error') || code || h.get('error_description') || q.get('error_description'));
  // Ältere Bestätigungs-Mails (vor dem Merker ?bestaetigt=1) erkennt man nur am Fehlercode der E-Mail-Links.
  if (failed && (marked || code === 'otp_expired')) return 'error';
  if (marked && !failed) return 'ok';
  return null;
}

/**
 * Merker, Fehler und übrig gebliebene Token aus der Adresse entfernen. Erst aufrufen, wenn supabase-js die Adresse
 * gelesen hat (getSession() erledigt = Code getauscht) — sonst ginge die Anmeldung per Bestätigungslink verloren.
 * history.state bleibt erhalten (React Router führt dort seinen Verlauf).
 */
export function cleanConfirmUrl(): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of DROP) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    const h = hashParams();
    if (h.has('error') || h.has('error_code') || h.has('error_description') || h.has('access_token')) {
      url.hash = '';
      changed = true;
    }
    if (changed) window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* nur Komfort */
  }
}

export const CONFIRM_TEXT = {
  okSignedIn: 'E-Mail bestätigt ✓ — du bist angemeldet.',
  okSignIn: 'E-Mail bestätigt ✓ — melde dich jetzt mit E-Mail und Passwort an.',
  // Im Dashboard gibt es (anders als in den Apps) den Knopf „Bestätigungs-Mail erneut senden“ — er erscheint, sobald
  // die Anmeldung an der noch unbestätigten Adresse scheitert.
  error:
    'Link abgelaufen oder schon benutzt. Versuch dich anzumelden — vielleicht ist deine Adresse schon bestätigt. Ist sie es noch nicht, erscheint beim Anmelden der Knopf „Bestätigungs-Mail erneut senden“ und du bekommst einen neuen Link.',
  errorSignedIn: 'Dieser Bestätigungslink war abgelaufen oder schon benutzt — du bist aber angemeldet, alles in Ordnung.',
} as const;
