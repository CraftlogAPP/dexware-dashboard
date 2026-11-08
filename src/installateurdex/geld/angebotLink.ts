// Angebot online annehmen — reine Logik, Kopie von InstallateurDex mobile/src/lib/quoteLink.ts (gleich halten). Server:
// supabase/angebot-online.sql (quote_link, quote_link_create, quote_offer, quote_decide); Kundenseite web/angebot/.
import type { OnlineQuote } from './nachfassLogik';

export const QUOTE_PAGE = 'https://installateurdex.dexware.app/angebot/';

/** Kundenlink aus dem Schlüssel (32 Hex-Zeichen); sonst null */
export function quoteLinkUrl(token: string | null | undefined): string | null {
  const t = String(token ?? '').trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(t) ? `${QUOTE_PAGE}?t=${t}` : null;
}

/** Nachricht für WhatsApp/SMS/Mail. Anrede neutral, Firmenname am Ende. */
export function quoteLinkMessage(o: { customer?: string; number?: string; firm?: string; url: string; validUntil?: string; privateCustomer?: boolean }): string {
  const name = (o.customer ?? '').trim();
  const hello = name ? `Guten Tag ${name},` : 'Guten Tag,';
  const until = o.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(o.validUntil) ? ` (gültig bis ${o.validUntil.slice(8, 10)}.${o.validUntil.slice(5, 7)}.${o.validUntil.slice(0, 4)})` : '';
  return [
    hello,
    '',
    `hier ist Ihr Angebot${o.number ? ` ${o.number}` : ''}${until}. Sie können es über diesen Link ansehen und direkt am Handy mit Ihrer Unterschrift annehmen, ganz ohne Ausdrucken:`,
    o.url,
    '',
    'Bei Fragen melden Sie sich gerne.',
    ...(o.firm?.trim() ? ['', `Freundliche Grüße`, o.firm.trim()] : []),
  ].join('\n');
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → „08.11. 14:05“ (Ortszeit) */
export function shortStamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type OnlineTone = 'none' | 'sent' | 'viewed' | 'accepted' | 'declined';

/** Eine Zeile Status für Angebot, Liste und Nachfassen */
export function onlineStatus(o: OnlineQuote | undefined, hasLink: boolean): { tone: OnlineTone; text: string } {
  if (o?.decision === 'accepted') return { tone: 'accepted', text: `✅ Online angenommen${o.name ? ` von ${o.name}` : ''}${o.decidedAt ? ` · ${shortStamp(o.decidedAt)}` : ''}` };
  if (o?.decision === 'declined') return { tone: 'declined', text: `❌ Online abgelehnt${o.decidedAt ? ` · ${shortStamp(o.decidedAt)}` : ''}${o.reason ? `: „${o.reason}“` : ''}` };
  if (o?.viewedAt) {
    const n = o.views ?? 1;
    return { tone: 'viewed', text: `👀 Vom Kunden geöffnet · ${shortStamp(o.viewedAt)}${n > 1 ? ` (${n}× angesehen)` : ''}` };
  }
  if (hasLink) return { tone: 'sent', text: '🔗 Link erstellt, noch nicht geöffnet' };
  return { tone: 'none', text: '' };
}
