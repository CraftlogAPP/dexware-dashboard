// Firmendaten für Rechnung & Angebot — wie App InvoiceProfileScreen (org.invoice_profile): Anschrift, UID/Steuernummer,
// Bank, Stundensatz, Anfahrt, Takt, Zahlungsziel, Kleinunternehmer, Nummern-Präfixe. Speichern nur Inhaber (RLS org).
// Gespeichert werden nur diese Felder — Preisliste und Preisregel im selben Profil bleiben unangetastet.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { useInst } from '../context';
import type { StoredProfile } from './api';
import { errText } from './util';

// wie App InvoiceProfileScreen
const centsToText = (c?: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
const textToCents = (s: string) => {
  const n = Number(s.replace(/[^0-9,.]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) : undefined;
};
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

export function Firmendaten() {
  const { ext, org, base } = useInst();
  const state = useAsync(() => ext.geld.profile(org.id, org.land, org.name), [ext.geld, org.id]);
  return (
    <div className="idx-settings">
      <Link className="idx-back" to={`${base}/rechnungen`}>
        <ArrowLeft className="i" aria-hidden /> Rechnungen &amp; Angebote
      </Link>
      <h1>Firmendaten für Rechnung &amp; Angebot</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Diese Angaben stehen auf jeder Rechnung — dieselben wie in der App unter „Rechnungsdaten“.
      </p>
      <LoadGuard state={state}>{(p) => <Form initial={p} />}</LoadGuard>
    </div>
  );
}

function Form({ initial }: { initial: StoredProfile }) {
  const { ext, org } = useInst();
  const [p, setP] = useState(initial);
  const [rate, setRate] = useState(centsToText(initial.hourlyRateCents));
  const [travel, setTravel] = useState(centsToText(initial.travelFlatCents));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof StoredProfile>(k: K, v: StoredProfile[K]) => {
    setMsg(null);
    setP((x) => ({ ...x, [k]: v }));
  };

  const checks = [
    { ok: !!p.legalName.trim(), label: 'Firmenname' },
    { ok: !!(p.street.trim() && p.zip.trim() && p.city.trim()), label: 'Anschrift' },
    { ok: !!p.kleinunternehmer || !!(p.uid?.trim() || (p.land === 'DE' && p.taxNumber?.trim())), label: p.land === 'DE' ? 'USt-IdNr. oder Steuernummer' : 'UID-Nummer' },
    { ok: !!p.iban && IBAN_RE.test(p.iban.replace(/\s+/g, '').toUpperCase()), label: 'IBAN' },
    { ok: !!textToCents(rate), label: 'Stundensatz' },
  ];
  const done = checks.filter((c) => c.ok).length;
  const de = p.land === 'DE';

  async function save() {
    if (saving) return;
    const iban = p.iban?.replace(/\s+/g, '').toUpperCase();
    if (iban && !IBAN_RE.test(iban)) {
      setMsg({ ok: false, text: 'IBAN prüfen: Die IBAN sieht nicht vollständig aus.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const patch: Partial<StoredProfile> = {
        legalName: p.legalName,
        street: p.street,
        zip: p.zip,
        city: p.city,
        land: p.land,
        phone: p.phone,
        email: p.email,
        uid: p.uid?.trim().toUpperCase() || undefined,
        taxNumber: p.taxNumber,
        kleinunternehmer: p.kleinunternehmer,
        vatRate: p.vatRate,
        iban: iban || undefined,
        bic: p.bic,
        hourlyRateCents: textToCents(rate),
        travelFlatCents: textToCents(travel),
        laborStepMinutes: p.laborStepMinutes,
        paymentDays: p.paymentDays,
        prefix: p.prefix,
        quotePrefix: p.quotePrefix,
      };
      const next = await ext.geld.saveProfile(org.id, org.land, org.name, patch);
      setP(next);
      setMsg({ ok: true, text: 'Gespeichert.' });
    } catch (e) {
      setMsg({ ok: false, text: `${errText(e)} (nur der Inhaber kann das ändern)` });
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" role="radio" aria-checked={active} className={active ? 'on' : ''} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <>
      <div className="card">
        <b>{done === checks.length ? '✅ Bereit für Rechnungen' : `Pflichtangaben: ${done} von ${checks.length}`}</b>
        <div className="idx-geld-progress" aria-hidden>
          <span style={{ width: `${(done / checks.length) * 100}%` }} className={done === checks.length ? 'full' : ''} />
        </div>
        <div className="idx-chips">
          {checks.map((c) => (
            <span key={c.label} className={`idx-chip ${c.ok ? '' : 'odd'}`}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="section-head">
        <h2>Firma</h2>
      </div>
      <div className="card idx-geld-form">
        <label className="field idx-geld-wide">
          Firmenwortlaut
          <input value={p.legalName} placeholder="z. B. Installateur Muster GmbH" onChange={(e) => set('legalName', e.target.value)} />
        </label>
        <label className="field idx-geld-wide">
          Straße, Nr.
          <input value={p.street} onChange={(e) => set('street', e.target.value)} />
        </label>
        <label className="field">
          PLZ
          <input value={p.zip} inputMode="numeric" onChange={(e) => set('zip', e.target.value)} />
        </label>
        <label className="field">
          Ort
          <input value={p.city} onChange={(e) => set('city', e.target.value)} />
        </label>
        <label className="field">
          Telefon (optional)
          <input value={p.phone ?? ''} inputMode="tel" onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label className="field">
          E-Mail (optional)
          <input type="email" value={p.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </label>
      </div>

      <div className="section-head">
        <h2>Steuer</h2>
      </div>
      <div className="card idx-geld-form">
        <label className="field">
          {de ? 'USt-IdNr.' : 'UID-Nummer'}
          <input value={p.uid ?? ''} placeholder={de ? 'DE123456789' : 'ATU12345678'} onChange={(e) => set('uid', e.target.value)} />
        </label>
        {de && (
          <label className="field">
            Steuernummer
            <input value={p.taxNumber ?? ''} placeholder="12/345/67890" onChange={(e) => set('taxNumber', e.target.value)} />
          </label>
        )}
        <label className="idx-check idx-geld-wide" style={{ height: 'auto' }}>
          <input type="checkbox" checked={!!p.kleinunternehmer} onChange={(e) => set('kleinunternehmer', e.target.checked)} />
          <span>
            Kleinunternehmer
            <span className="idx-sub">
              {de
                ? 'Keine Umsatzsteuer (§ 19 UStG) — Hinweis kommt automatisch auf die Rechnung.'
                : 'Umsatzsteuerbefreit (§ 6 Abs. 1 Z 27 UStG) — Hinweis kommt automatisch auf die Rechnung.'}
            </span>
          </span>
        </label>
        {!p.kleinunternehmer && (
          <div className="idx-geld-wide">
            <div className="small muted" style={{ marginBottom: 6 }}>
              Umsatzsteuer-Satz
            </div>
            <div className="idx-status-pick" role="radiogroup" aria-label="Umsatzsteuer-Satz">
              {[de ? 19 : 20, de ? 7 : 13, 10].filter((v, i, a) => a.indexOf(v) === i).map((v) => chip(p.vatRate === v, `${v} % USt`, () => set('vatRate', v)))}
            </div>
          </div>
        )}
      </div>

      <div className="section-head">
        <h2>Bank</h2>
      </div>
      <div className="card idx-geld-form">
        <label className="field">
          IBAN
          <input value={p.iban ?? ''} placeholder="AT61 1904 3002 3457 3201" onChange={(e) => set('iban', e.target.value)} />
        </label>
        <label className="field">
          BIC (optional)
          <input value={p.bic ?? ''} onChange={(e) => set('bic', e.target.value)} />
        </label>
      </div>

      <div className="section-head">
        <h2>Preise &amp; Abrechnung</h2>
      </div>
      <div className="card idx-geld-form">
        <label className="field idx-euro">
          Stundensatz netto
          <input value={rate} inputMode="decimal" placeholder="78,00" onChange={(e) => {
              setMsg(null);
              setRate(e.target.value);
            }} />
        </label>
        <label className="field idx-euro">
          Anfahrt pauschal
          <input value={travel} inputMode="decimal" placeholder="35,00" onChange={(e) => {
              setMsg(null);
              setTravel(e.target.value);
            }} />
        </label>
        <div className="idx-geld-wide">
          <div className="small muted" style={{ marginBottom: 6 }}>
            Abrechnungstakt
          </div>
          <div className="idx-status-pick" role="radiogroup" aria-label="Abrechnungstakt">
            {[5, 15, 30, 60].map((m) => chip((p.laborStepMinutes ?? 15) === m, m === 60 ? 'volle Stunde' : `${m} Min.`, () => set('laborStepMinutes', m)))}
          </div>
        </div>
        <div className="idx-geld-wide">
          <div className="small muted" style={{ marginBottom: 6 }}>
            Zahlungsziel
          </div>
          <div className="idx-status-pick" role="radiogroup" aria-label="Zahlungsziel">
            {[0, 7, 14, 30].map((d) => chip(p.paymentDays === d, d === 0 ? 'sofort' : `${d} Tage`, () => set('paymentDays', d)))}
          </div>
        </div>
        <label className="field">
          Präfix Rechnung
          <input value={p.prefix ?? 'RE'} onChange={(e) => set('prefix', e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6))} />
        </label>
        <label className="field">
          Präfix Angebot
          <input value={p.quotePrefix ?? 'AN'} onChange={(e) => set('quotePrefix', e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6))} />
        </label>
        <p className="small muted idx-geld-wide" style={{ margin: 0 }}>
          Nummern laufen lückenlos je Jahr: {p.prefix || 'RE'}-{new Date().getFullYear()}-0001 … (vergibt der Server beim Ausstellen)
          {Object.keys(p.materialPrices ?? {}).length > 0 &&
            ` · 💡 Deine Preisliste kennt schon ${Object.keys(p.materialPrices ?? {}).length} Artikel — sie lernt mit jeder Rechnung dazu.`}
        </p>
      </div>

      <div className="idx-save-bar">
        <button type="button" className="btn" onClick={() => void save()} disabled={saving}>
          {saving ? 'Speichert …' : 'Speichern'}
        </button>
        {msg && (msg.ok ? <span className="idx-ok">✓ {msg.text}</span> : <span className="error-box" style={{ margin: 0 }}>{msg.text}</span>)}
      </div>
      <p className="small muted">Hinweis: Die App prüft die gesetzlichen Pflichtangaben (AT § 11 UStG / DE § 14 UStG). Steuerliche Beratung ersetzt sie nicht.</p>
    </>
  );
}
