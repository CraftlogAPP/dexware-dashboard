// Wiederverwendete Bausteine der Portal-Seiten.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeEuro, Mail, Maximize2, Phone, Printer, ScanText, Siren, Wrench, X } from 'lucide-react';
import { fmtDateTime } from '../lib/format';
import { openReportWindow } from '../lib/print';
import { RequestKindBadge, RequestStatusBadge } from './badges';
import {
  appointmentOf,
  appointmentText,
  looksLikeEmail,
  looksLikePhone,
  mailHref,
  relTime,
  telHref,
  type Asset,
  type ServiceRequest,
  type Site,
} from './types';

/**
 * Überschrift einer Anfrage: Anlage · Objekt, sonst das Objekt. Ohne beides: Anfrage aus dem Installateur-Helfer
 * (neuer Kunde, noch ohne Objekt) mit Kontaktnamen — „nicht mehr vorhanden“ nur, wenn die verknüpfte Anlage fehlt.
 */
export function requestTitle(r: ServiceRequest, asset: Asset | null | undefined, site: Site | null | undefined): string {
  if (asset) return `${asset.name} · ${site?.name ?? 'Objekt'}`;
  if (site) return site.name;
  if (r.asset_id) return 'Anlage nicht mehr vorhanden';
  if (r.site_id) return 'Objekt nicht mehr vorhanden';
  return r.contact_name?.trim() ? `Neuer Kunde: ${r.contact_name.trim()}` : 'Neuer Kunde (noch ohne Objekt)';
}

/** Karte einer Anfrage in Listen (Start, Inbox, Objekt). Störungen rot, Angebote grün abgesetzt. */
export function RequestCard({
  r,
  asset,
  site,
  base,
}: {
  r: ServiceRequest;
  asset: Asset | undefined;
  site: Site | undefined;
  base: string;
}) {
  const closed = r.status === 'done' || r.status === 'dismissed';
  const contact = [r.contact_name, r.contact_phone, r.contact_email].filter(Boolean).join(' · ');
  const appt = closed ? null : appointmentOf(r);
  return (
    <Link
      to={`${base}/anfragen/${r.id}`}
      className={`idx-req ${r.kind === 'fault' ? 'fault' : r.kind === 'quote' ? 'quote' : ''} ${closed ? 'closed' : ''}`}
    >
      <span className="idx-req-icon" aria-hidden>
        {r.kind === 'fault' ? <Siren className="i" /> : r.kind === 'quote' ? <BadgeEuro className="i" /> : <Wrench className="i" />}
      </span>
      <span className="idx-req-main">
        <span className="idx-req-top">
          <RequestKindBadge kind={r.kind} />
          {r.status !== 'new' && <RequestStatusBadge status={r.status} />}
          {asset?.contract && <span className="badge green">🤝 Vertragskunde</span>}
          {r.source === 'reminder' && <span className="badge">aus Erinnerungsmail</span>}
          {r.source === 'portal' && <span className="badge">aus „Mein Zuhause“</span>}
          {r.source === 'helper' && <span className="badge amber">🧭 Neuer Kunde über den Installateur-Helfer</span>}
        </span>
        <span className="idx-req-title" style={{ display: 'block', marginTop: 6 }}>
          {requestTitle(r, asset, site)}
        </span>
        {r.message && <span className="idx-req-msg">{r.message}</span>}
        {r.ai_note && (
          <span className="idx-ai-note small" title="Automatisch vom Foto gelesen — bitte prüfen">
            <ScanText className="i" aria-hidden /> {r.ai_note}
          </span>
        )}
        {appt && <span className={`idx-appt small ${appt.state}`}>{appointmentText(appt)}</span>}
        <span className="idx-req-meta" style={{ display: 'block' }}>
          {contact || 'ohne Kontaktangabe'}
          {r.preferred ? ` · Wunschtermin: ${r.preferred}` : ''}
        </span>
        <span className="idx-req-meta idx-show-sm">Eingegangen {relTime(r.created_at)}</span>
      </span>
      <span className="idx-req-side">
        <span className="idx-req-when" title={fmtDateTime(r.created_at)}>
          {relTime(r.created_at)}
        </span>
        {r.photo_url && <img className="idx-req-thumb" src={r.photo_url} alt="Foto vom Kunden" loading="lazy" />}
      </span>
    </Link>
  );
}

/** Gelbe Notiz: was die KI auf dem Kundenfoto gelesen hat (Fehlercode/Displaytext). */
export function AiNote({ text }: { text: string }) {
  return (
    <div className="idx-ai-note" role="note">
      <ScanText className="i" aria-hidden />
      <span>
        <b>Automatisch vom Foto gelesen</b>
        <br />
        {text}
      </span>
    </div>
  );
}

/** Foto vom Kunden: antippen öffnet es groß (Escape oder Klick daneben schließt). */
export function RequestPhoto({ src }: { src: string }) {
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBig(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [big]);
  return (
    <>
      <button type="button" className="idx-photo-btn" onClick={() => setBig(true)} aria-label="Foto vom Kunden groß anzeigen">
        <img src={src} alt="Foto vom Kunden" />
        <span className="idx-photo-hint">
          <Maximize2 className="i" aria-hidden /> Antippen zum Vergrößern
        </span>
      </button>
      {big && (
        <div
          className="idx-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Foto vom Kunden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBig(false);
          }}
        >
          <img src={src} alt="Foto vom Kunden (groß)" />
          <div className="idx-lightbox-bar">
            <a className="btn ghost small" href={src} target="_blank" rel="noreferrer">
              In neuem Tab öffnen
            </a>
            <button type="button" className="btn small" onClick={() => setBig(false)}>
              <X className="i" aria-hidden /> Schließen
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Telefon/E-Mail aus einem Freitext-Kontaktfeld als Links (sonst Text). */
export function ContactValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  const v = value.trim();
  const mail = looksLikeEmail(v) ? mailHref(v) : null;
  if (mail) return <a href={mail}>{v}</a>;
  if (looksLikePhone(v)) return <a href={telHref(v)}>{v}</a>;
  return <>{v}</>;
}

/** Große Knöpfe Anrufen / E-Mail (Anfrage-Detail). */
export function ContactButtons({ phone, email, subject }: { phone: string | null; email: string | null; subject: string }) {
  const mail = email ? mailHref(email, subject) : null;
  return (
    <div className="idx-contact">
      {phone && (
        <a className="btn" href={telHref(phone)}>
          <Phone className="i" aria-hidden /> {phone}
        </a>
      )}
      {email &&
        (mail ? (
          <a className="btn ghost" href={mail}>
            <Mail className="i" aria-hidden /> {email}
          </a>
        ) : (
          <span className="small" style={{ overflowWrap: 'anywhere' }}>
            <Mail className="i" aria-hidden /> {email}
          </span>
        ))}
      {!phone && !email && <span className="muted">Keine Kontaktangabe.</span>}
    </div>
  );
}

/** Druck-Knopf: baut das HTML (async) und öffnet den Druckdialog. */
export function PrintButton({ label, build }: { label: string; build: () => Promise<string> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const html = await build();
      if (!openReportWindow(html)) {
        setError('Der Browser hat das Druckfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="btn small" onClick={() => void run()} disabled={busy}>
        <Printer className="i" aria-hidden /> {busy ? 'Wird erstellt …' : label}
      </button>
      {error && <span className="error-box" style={{ marginTop: 8 }}>{error}</span>}
    </span>
  );
}
