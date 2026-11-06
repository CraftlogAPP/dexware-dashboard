import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAsync, useUnsavedGuard } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { useInst } from '../context';
import type { OrgSettingsInput } from '../data';
import { useChecksSummary } from '../pruefpunkte/summary';
import { isRegionOf, regionsOf } from '../region';
import { ITEM_KINDS, fmtDay, isProOrg, looksLikeEmail, reminderState, type InstOrg } from '../types';

interface Form {
  phone: string;
  email: string;
  website: string;
  review: string;
  prices: Record<string, string>;
  reminder: boolean;
  days: string;
}

const DAY_OPTIONS = [7, 14, 21, 30, 45, 60, 90];

/**
 * Land & Bundesland + Berechtigungsnummern (region.sql): steuert, welche Landesgesetze App und KI anwenden
 * (Prüffristen Heizung/Klima/Wärmepumpe usw.). Eigenes Speichern — unabhängig vom Formular oben.
 */
function RegionCard() {
  const { data, org, isOwner, refreshOrg } = useInst();
  const [region, setRegion] = useState(org.region ?? '');
  const [inspectionNo, setInspectionNo] = useState(org.legal?.inspectionNo ?? '');
  const [fgasCert, setFgasCert] = useState(org.legal?.fgasCert ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const regions = regionsOf(org.land);
  const valid = isRegionOf(org.land, region);
  const dirty = region !== (org.region ?? '') || inspectionNo !== (org.legal?.inspectionNo ?? '') || fgasCert !== (org.legal?.fgasCert ?? '');

  async function save() {
    if (!isOwner) return;
    if (/[<>]/.test(inspectionNo + fgasCert)) return setMsg({ ok: false, text: 'Bitte keine spitzen Klammern in den Nummern.' });
    setBusy(true);
    setMsg(null);
    try {
      const legal = { ...(org.legal ?? {}), inspectionNo: inspectionNo.trim(), fgasCert: fgasCert.trim() };
      await data.saveRegion(org.id, valid ? region : null, legal);
      setMsg({ ok: true, text: '✓ Gespeichert' });
      refreshOrg();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h2>Land &amp; Bundesland</h2>
      </div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          Bestimmt, welche Gesetze App und KI für deinen Betrieb anwenden: Prüffristen für Heizungen, Klimaanlagen und
          Wärmepumpen, Kältemittel, Normen im Protokoll und die Rechnung. Land: <b style={{ color: 'var(--text)' }}>{org.land === 'AT' ? '🇦🇹 Österreich' : org.land === 'DE' ? '🇩🇪 Deutschland' : org.land}</b> (änderbar in der App).
        </p>
        {!valid && <div className="info-box">Noch kein Bundesland gewählt — bis dahin kennt die App nur die bundesweiten Regeln.</div>}
        <fieldset disabled={!isOwner || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <label className="field" style={{ maxWidth: 360 }}>
            Bundesland
            <select value={valid ? region : ''} onChange={(e) => { setRegion(e.target.value); setMsg(null); }}>
              <option value="">— bitte wählen —</option>
              {Object.entries(regions).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ maxWidth: 360 }}>
            Landes-Prüfberechtigung (Nummer, falls vorhanden)
            <input type="text" value={inspectionNo} maxLength={60} placeholder={org.land === 'AT' ? 'z. B. BPR-1234 (Bgld.)' : 'Nummer laut Landesrecht'} onChange={(e) => { setInspectionNo(e.target.value); setMsg(null); }} />
            <span className="small muted">Steht dann auf Prüfberichten. Ohne Nummer zeigt die App Pflichtprüfungen nur als Hinweis für den Kunden.</span>
          </label>
          <label className="field" style={{ maxWidth: 360, marginBottom: 0 }}>
            F-Gas-/Kältemittel-Zertifikat (Nummer)
            <input type="text" value={fgasCert} maxLength={60} onChange={(e) => { setFgasCert(e.target.value); setMsg(null); }} />
          </label>
        </fieldset>
        {isOwner && (
          <div className="idx-save-bar" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>
              {busy ? 'Speichern …' : 'Bundesland speichern'}
            </button>
            {msg && (msg.ok ? <span className="idx-ok">{msg.text}</span> : <span className="error-box" style={{ margin: 0 }}>{msg.text}</span>)}
          </div>
        )}
      </div>
    </>
  );
}

function priceInput(v: unknown): string {
  return typeof v === 'number' && v > 0
    ? v.toLocaleString('de-DE', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2, useGrouping: false })
    : '';
}

function fromOrg(org: InstOrg): Form {
  const prices: Record<string, string> = {};
  for (const [k, v] of Object.entries(org.maintenance_prices ?? {})) prices[k] = priceInput(v);
  return {
    phone: org.public_phone ?? '',
    email: org.public_email ?? '',
    website: org.website ?? '',
    review: org.review_url ?? '',
    prices,
    reminder: org.reminder_mail === true,
    days: String(org.reminder_days ?? 30),
  };
}

/** „220" · „220,50" · „1.200" · „1200 €" → Zahl; '' → undefined; ungültig → NaN. */
function parsePrice(raw: string): number | undefined {
  let s = raw.replace(/€/g, '').replace(/\s/g, '');
  if (!s) return undefined;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function normalizeWebsite(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function Settings() {
  const { data, org, isOwner, refreshOrg, base } = useInst();
  const location = useLocation();
  const checksSummary = useChecksSummary();
  const [form, setForm] = useState<Form>(() => fromOrg(org));
  // Gespeicherter Stand (nach dem Speichern so, wie es eingegeben wurde) — Vergleich ohne leere Preisfelder,
  // damit „gespeichert“ nicht gleich wieder als geändert gilt (Preise als Text, Webseite normalisiert)
  const [baseline, setBaseline] = useState<Form>(() => fromOrg(org));
  const comparable = (f: Form) => ({ ...f, website: f.website.trim(), review: f.review.trim(), prices: Object.fromEntries(Object.entries(f.prices).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== '').sort(([a], [b]) => a.localeCompare(b))) });
  const dirty = JSON.stringify(comparable(form)) !== JSON.stringify(comparable(baseline));
  useUnsavedGuard(isOwner && dirty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const extra = useAsync(async () => {
    const [sites, assets, reminders] = await Promise.all([data.sites(), data.assets(), data.reminders(10)]);
    return { sites, assets, reminders };
  }, [data]);

  // Link „Preise eintragen" (…/einstellungen#preise) springt direkt zum Abschnitt.
  useEffect(() => {
    if (location.hash === '#preise') {
      document.getElementById('preise')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const pro = isProOrg(org);
  const activeSites = extra.data?.sites.filter((s) => s.active && !s.is_demo) ?? [];
  const optIn = activeSites.filter((s) => reminderState(s) === 'confirmed').length;
  const optInPending = activeSites.filter((s) => ['pending', 'queued'].includes(reminderState(s))).length;
  const assetCount = (kind: string) =>
    extra.data?.assets.filter((a) => a.kind === kind && !a.retired && !a.is_demo).length ?? 0;

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    setError(null);
    setSaved(false);
    const email = form.email.trim();
    if (email && !looksLikeEmail(email)) return setError('Die E-Mail-Adresse sieht nicht richtig aus.');
    if (form.phone.trim().length > 40) return setError('Die Telefonnummer ist zu lang (höchstens 40 Zeichen).');
    const website = normalizeWebsite(form.website);
    if (website && (/\s/.test(website) || website.length > 200)) return setError('Die Webseite sieht nicht richtig aus.');
    // Bewertungslink: Datenbank-Regel (anlagenpass.sql) — https://, höchstens 300 Zeichen; wie die App
    const review = form.review.trim();
    if (review && (!/^https:\/\/\S+$/.test(review) || review.length > 300))
      return setError('Der Bewertungslink muss mit https:// beginnen (z. B. aus Google Maps → Teilen → Link zu Rezensionen).');
    const prices: Record<string, number> = {};
    for (const k of ITEM_KINDS) {
      const p = parsePrice(form.prices[k.id] ?? '');
      if (p === undefined) continue;
      if (Number.isNaN(p) || p <= 0 || p >= 100000) {
        return setError(`Preis für „${k.label}" bitte als Zahl in Euro eingeben, z. B. 220 oder 189,50.`);
      }
      prices[k.id] = p;
    }
    const days = Number(form.days);
    if (!Number.isInteger(days) || days < 7 || days > 90) return setError('Die Tage vor der Fälligkeit müssen zwischen 7 und 90 liegen.');

    const input: OrgSettingsInput = {
      public_phone: form.phone.trim() || null,
      public_email: email || null,
      website,
      review_url: review || null,
      maintenance_prices: prices,
      reminder_mail: form.reminder,
      reminder_days: days,
    };
    setBusy(true);
    try {
      await data.saveOrgSettings(org.id, input);
      setForm((f) => ({ ...f, website: website ?? '' }));
      setBaseline({ ...form, website: website ?? '' });
      setSaved(true);
      refreshOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const dayOptions = DAY_OPTIONS.includes(Number(form.days)) ? DAY_OPTIONS : [...DAY_OPTIONS, Number(form.days)].sort((a, b) => a - b);

  return (
    <div className="idx-settings">
      <h1>Einstellungen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Einstellungen für {org.name}: was Kunden auf dem Anlagenpass sehen, deine Preise je Wartung und die
        Erinnerungsmails.
      </p>
      {!isOwner && <div className="info-box">Nur der Inhaber des Betriebs kann diese Einstellungen ändern.</div>}

      <form onSubmit={submit}>
        <fieldset disabled={!isOwner} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="section-head">
            <h2>Kontakt auf dem Anlagenpass</h2>
          </div>
          <div className="card">
            <p className="small muted" style={{ marginTop: 0 }}>
              Erscheint auf dem öffentlichen Anlagenpass (QR-Aufkleber an der Anlage). Darüber rufen Kunden an oder
              schreiben dir. Leer lassen, wenn etwas nicht erscheinen soll.
            </p>
            <label className="field">
              Telefon
              <input type="tel" value={form.phone} maxLength={40} placeholder="+43 …" onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className="field">
              E-Mail
              <input
                type="email"
                value={form.email}
                maxLength={160}
                placeholder="service@dein-betrieb.at"
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              Webseite
              <input
                type="text"
                inputMode="url"
                value={form.website}
                maxLength={200}
                placeholder="www.dein-betrieb.at"
                onChange={(e) => set('website', e.target.value)}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              Link zu deinen Google-Bewertungen
              <input
                type="url"
                inputMode="url"
                value={form.review}
                maxLength={300}
                placeholder="https://g.page/r/…"
                onChange={(e) => set('review', e.target.value)}
              />
              <span className="small muted">
                Nach einem sauber abgeschlossenen, unterschriebenen Einsatz bittet die App den Kunden einmal um eine Bewertung — mit diesem Link.
              </span>
            </label>
          </div>

          <div className="section-head" id="preise" style={{ scrollMarginTop: 130 }}>
            <h2>Preis je Wartung</h2>
          </div>
          <div className="card">
            <p className="small muted" style={{ marginTop: 0 }}>
              So viel verrechnest du für eine Wartung (brutto). Daraus rechnet die Startseite das offene Wartungspotenzial:
              überfällige und in den nächsten 90 Tagen fällige Anlagen × Preis. Typen ohne Preis zählen nicht mit.
            </p>
            <div className="idx-price-grid">
              {ITEM_KINDS.map((k) => {
                const n = assetCount(k.id);
                return (
                  <label key={k.id} className="field">
                    {k.emoji} {k.label}
                    <span className="idx-euro" style={{ display: 'block' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.prices[k.id] ?? ''}
                        placeholder="—"
                        aria-label={`Preis je Wartung: ${k.label}`}
                        onChange={(e) => set('prices', { ...form.prices, [k.id]: e.target.value })}
                      />
                    </span>
                    <span className="muted small field-hint">
                      {n > 0 ? `${n} ${n === 1 ? 'Anlage' : 'Anlagen'}` : 'keine Anlage'} · alle {k.intervalMonths} Monate
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="section-head">
            <h2>Erinnerungsmails an Kunden</h2>
          </div>
          <div className="card">
            <label className="idx-check" style={{ height: 'auto', color: 'var(--text)', fontSize: 15 }}>
              <input type="checkbox" checked={form.reminder} onChange={(e) => set('reminder', e.target.checked)} />
              Kunden vor der fälligen Wartung per E-Mail erinnern
            </label>
            <label className="field" style={{ marginTop: 12, maxWidth: 320 }}>
              Wie viele Tage vorher?
              <select value={form.days} onChange={(e) => set('days', e.target.value)} disabled={!form.reminder}>
                {dayOptions.map((d) => (
                  <option key={d} value={String(d)}>
                    {d} Tage vor der Fälligkeit
                  </option>
                ))}
              </select>
            </label>
            <div className="info-box" style={{ marginBottom: 0 }}>
              Nur mit <b>Pro</b>. Mails gehen nur an Kunden, deren E-Mail-Adresse beim Objekt in der App hinterlegt ist und
              die dort der Erinnerung zugestimmt haben. Jede Mail hat einen Link zum Abmelden. In der Mail kann der Kunde
              direkt eine Wartung anfragen — die Anfrage landet unter „Anfragen".
            </div>
            {!pro && form.reminder && (
              <div className="error-box" style={{ marginBottom: 0 }}>
                Dein Betrieb nutzt gerade den Gratis-Tarif — solange Pro nicht aktiv ist, werden keine Erinnerungsmails
                verschickt.
              </div>
            )}
            {extra.data && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Bestätigt: <b style={{ color: 'var(--text)' }}>{optIn}</b> von {activeSites.length} aktiven Objekten
                {optInPending > 0 ? ` · ${optInPending} warten auf die Bestätigung des Kunden` : ''}. Erinnerungen gehen nur an
                Kunden, die die Mail per Link bestätigt haben.
              </p>
            )}
          </div>
        </fieldset>

        {isOwner && (
          <div className="idx-save-bar">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Speichern …' : 'Einstellungen speichern'}
            </button>
            {saved && <span className="idx-ok">✓ Gespeichert</span>}
            {error && (
              <span className="error-box" style={{ margin: 0 }}>
                {error}
              </span>
            )}
          </div>
        )}
      </form>

      <RegionCard />

      <div className="section-head">
        <h2>Prüfpunkte &amp; Messwerte</h2>
      </div>
      <div className="card pp-settings-card">
        <div>
          <p className="small muted" style={{ margin: 0 }}>
            Checklisten für Wartung und Inbetriebnahme an deinen Betrieb anpassen: eigene Prüfpunkte, Standard-Punkte
            ausblenden, eigene Messwerte. Gilt fürs ganze Team.
          </p>
          {checksSummary && <p style={{ margin: '6px 0 0', fontSize: 14 }}>{checksSummary}</p>}
        </div>
        <Link className="btn ghost small" to={`${base}/pruefpunkte`}>
          {isOwner ? 'Bearbeiten' : 'Ansehen'}
        </Link>
      </div>

      {extra.data && extra.data.reminders.length > 0 && (
        <>
          <div className="section-head">
            <h2>Zuletzt versendete Erinnerungen</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Versendet</th>
                  <th>Anlage</th>
                  <th className="idx-hide-sm">An</th>
                  <th>Fällig am</th>
                </tr>
              </thead>
              <tbody>
                {extra.data.reminders.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.sent_at)}</td>
                    <td>{extra.data!.assets.find((a) => a.id === r.asset_id)?.name ?? 'Anlage'}</td>
                    <td className="muted idx-hide-sm">{r.email}</td>
                    <td>{fmtDay(new Date(`${r.due_date.slice(0, 10)}T12:00:00`))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
