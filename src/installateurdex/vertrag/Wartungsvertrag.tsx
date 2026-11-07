// Wartungsvertrag erstellen (Kundenakte → „Wartungsvertrag erstellen“) — wie App screens/WartungsvertragScreen.tsx,
// aber zum Unterschreiben auf Papier: Anlagen + Preise wählen, Kunde Privat/Firma, Ort des Abschlusses, Bedingungen →
// Druckansicht/PDF (Unterschriftsfelder leer) → danach optional „Vertrag ist unterschrieben“: setzt bei den Anlagen
// „Wartungsvertrag“ + Preis je Wartung (netto, nach Rabatt) — über ext.auswertung.markContract (wie Garantie-Wächter).
// Texte und Logik: ./vertragLogik.ts (Kopie der App lib/wartungsvertrag.ts), HTML: ./vertragDruck.ts (Kopie der App).

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, FileSignature, Printer } from 'lucide-react';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { openReportWindow } from '../../lib/print';
import { useInst } from '../context';
import type { Land } from '../geld/invoice';
import { cleanChecks } from '../pruefpunkte/logic';
import { intervalOf, isProOrg, kindInfo, makerModel, type Asset, type Site } from '../types';
import { buildVertragHtml, type VertragsDoc } from './vertragDruck';
import {
  KUENDIGUNG_LABEL,
  ZAHLWEISE_LABEL,
  deDatum,
  euroText,
  fehlendeFirmendaten,
  fruehesterBeginn,
  hatWiderrufsrecht,
  jahrespreisVorschlag,
  leistungFor,
  leistungenGruppiert,
  parseEuro,
  preisJeWartung,
  pruefeVertrag,
  summen,
  umfangHinweise,
  wartungenProJahr,
  widerrufsbelehrung,
  type Abschlussort,
  type Firma,
  type KundenArt,
  type Kuendigung,
  type Zahlweise,
} from './vertragLogik';
import './vertrag.css';

/** Cent → Eingabe „219,90“ (wie App euroInput) */
const euroInput = (c: number) => (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100));

export function Wartungsvertrag() {
  const { id } = useParams<{ id: string }>();
  const { data, ext, org, isOwner, base } = useInst();
  const land: Land = org.land === 'DE' || org.land === 'CH' ? org.land : 'AT';

  const state = useAsync(async () => {
    const [site, assets, profile, checksRaw] = await Promise.all([
      data.site(id!),
      data.assets({ siteId: id }),
      ext.geld.profile(org.id, land, org.name).catch(() => null),
      ext.pruefpunkte.load(org.id).catch(() => null),
    ]);
    return { site, assets: assets.filter((a) => !a.retired), profile, custom: cleanChecks(checksRaw) };
  }, [data, ext, id, org.id, land]);

  return (
    <>
      <Link className="idx-back" to={`${base}/kunden/${id}`}>
        ← zurück zum Kunden
      </Link>
      <div className="idx-head">
        <h1>
          <FileSignature className="i" aria-hidden /> Wartungsvertrag erstellen
        </h1>
      </div>
      {!isOwner ? (
        <div className="info-box">Wartungsverträge schließt der Inhaber des Betriebs ab.</div>
      ) : (
        <LoadGuard state={state}>
          {(d) =>
            !d.site ? (
              <div className="error-box">Objekt nicht gefunden.</div>
            ) : (
              <VertragForm
                key={d.site.id}
                site={d.site}
                assets={d.assets}
                land={land}
                firma={
                  d.profile
                    ? { name: d.profile.legalName || org.name, street: d.profile.street, zip: d.profile.zip, city: d.profile.city, phone: d.profile.phone, email: d.profile.email, uid: d.profile.uid }
                    : { name: org.name }
                }
                vatRate={d.profile?.vatRate ?? (land === 'DE' ? 19 : 20)}
                klein={!!d.profile?.kleinunternehmer}
                custom={d.custom}
                onSaved={state.refresh}
              />
            )
          }
        </LoadGuard>
      )}
    </>
  );
}

function VertragForm({
  site,
  assets,
  land,
  firma,
  vatRate,
  klein,
  custom,
  onSaved,
}: {
  site: Pick<Site, 'id' | 'name' | 'operator_name' | 'address' | 'customer_email'>;
  assets: Asset[];
  land: Land;
  firma: Firma & { uid?: string };
  vatRate: number;
  klein: boolean;
  custom: ReturnType<typeof cleanChecks>;
  onSaved: () => void;
}) {
  const { org, ext, base } = useInst();
  const prices = org.maintenance_prices ?? {};
  // Vorbelegt wie die App: alle Anlagen ohne Vertrag; Preis je Jahr aus Vertragspreis bzw. Preis je Wartung des Typs
  const [selected, setSelected] = useState<Set<string>>(() => new Set(assets.filter((a) => !a.contract).map((a) => a.id)));
  const [priceText, setPriceText] = useState<Record<string, string>>(() =>
    Object.fromEntries(assets.map((a) => {
      const v = jahrespreisVorschlag(a, prices);
      return [a.id, v !== null ? euroInput(v) : ''];
    })),
  );
  const [openPoints, setOpenPoints] = useState<string | null>(null);
  const [kunde, setKunde] = useState<KundenArt>('verbraucher');
  const [kName, setKName] = useState(site.operator_name?.trim() || site.name);
  const [kAddr, setKAddr] = useState(site.address ?? '');
  const [kMail, setKMail] = useState(site.customer_email ?? '');
  const [kUid, setKUid] = useState('');
  const [ort, setOrt] = useState<Abschlussort>('ausserhalb');
  const [kuendigung, setKuendigung] = useState<Kuendigung>('jahr');
  const [zahlweise, setZahlweise] = useState<Zahlweise>('jaehrlich');
  const [rabattText, setRabattText] = useState('');
  const [anfahrt, setAnfahrt] = useState(true);
  const [material, setMaterial] = useState(false);
  const [extra, setExtra] = useState('');
  const [vorzeitig, setVorzeitig] = useState<boolean | null>(null);
  const [signer, setSigner] = useState('');
  const [place, setPlace] = useState(firma.city ?? '');
  const [touched, setTouched] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ ok: string[]; failed: string[] } | null>(null);

  // Rückfrage beim Verlassen, solange etwas eingegeben und der Vertrag nicht als unterschrieben vermerkt ist
  useUnsavedGuard(touched && !saved);
  const touch = () => setTouched(true);

  const chosen = useMemo(() => assets.filter((a) => selected.has(a.id)), [assets, selected]);
  const positions = useMemo(() => chosen.map((a) => ({ assetId: a.id, intervalMonths: intervalOf(a), jahrCents: parseEuro(priceText[a.id] ?? '') ?? -1 })), [chosen, priceText]);
  const ohnePreis = positions.filter((p) => p.jahrCents <= 0).length;
  const rabattPct = Math.min(100, Math.max(0, Number(rabattText.replace(',', '.')) || 0));
  const sum = useMemo(() => summen(positions.filter((p) => p.jahrCents > 0), { rabattPct, vatRate, kleinunternehmer: klein }), [positions, rabattPct, vatRate, klein]);
  const widerrufAktiv = hatWiderrufsrecht({ land, kunde, ort });
  const check = pruefeVertrag({ anlagen: chosen.length, ohnePreis, kundeName: kName, kundeAnschrift: kAddr, kunde, firma, widerruf: widerrufAktiv });
  const fragOffen = widerrufAktiv && vorzeitig === null;

  const toggle = (aid: string) => {
    touch();
    setSaved(null);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(aid)) n.delete(aid);
      else n.add(aid);
      return n;
    });
  };

  function buildDoc(): VertragsDoc {
    const datum = new Date();
    const widerruf = widerrufsbelehrung({ land, kunde, ort, firma });
    return {
      land,
      datum,
      ort: place,
      firma,
      kunde: { name: kName.trim(), anschrift: kAddr.trim(), email: kMail.trim() || undefined, uid: kunde === 'unternehmer' ? kUid.trim() || undefined : undefined, art: kunde },
      objekt: site.name,
      anlagen: chosen.map((a) => ({
        name: a.name,
        kindLabel: kindInfo(a.kind).label,
        geraet: [a.manufacturer, a.model, a.serial_no ? `Nr. ${a.serial_no}` : ''].filter(Boolean).join(' ') || undefined,
        standort: a.location ?? undefined,
        intervalMonths: intervalOf(a),
        jahrCents: Math.max(0, parseEuro(priceText[a.id] ?? '') ?? 0),
      })),
      leistungen: leistungenGruppiert(chosen, custom),
      umfang: umfangHinweise({ anfahrtInkl: anfahrt, kleinmaterialInkl: material }),
      summen: sum,
      rabattPct,
      kleinunternehmer: klein,
      zahlweise,
      kuendigung,
      beginn: fruehesterBeginn(datum, !!vorzeitig, !!widerruf),
      vereinbarungen: extra,
      widerruf,
      vorzeitig: !!vorzeitig,
      // Papier: Unterschriftsfelder bleiben leer (keine Bild-Unterschriften)
      firmaSigner: signer,
    };
  }

  function print() {
    setPrintError(null);
    if (!check.ok || fragOffen) {
      setShowErrors(true);
      return;
    }
    const pro = isProOrg(org);
    const ok = openReportWindow(buildVertragHtml(buildDoc(), { brandColor: org.brand_color, logoUri: org.logo_url }, pro));
    if (!ok) setPrintError('Der Browser hat das Druckfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.');
    else setPrinted(true);
  }

  async function markSigned() {
    setBusy(true);
    const ok: string[] = [];
    const failed: string[] = [];
    // wie App conclude(): „Wartungsvertrag“ + Preis je Wartung (netto, nach Rabatt) wie im Anlagenformular
    for (const a of chosen) {
      const jahr = sum.jeAnlage.get(a.id) ?? 0;
      try {
        await ext.auswertung.markContract(a.id, jahr > 0 ? preisJeWartung(jahr, intervalOf(a)) : undefined);
        ok.push(a.name);
      } catch {
        failed.push(a.name);
      }
    }
    setBusy(false);
    setConfirm(false);
    setSaved({ ok, failed });
    onSaved();
  }

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" className={`wv-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { touch(); onClick(); }}>
      {label}
    </button>
  );

  return (
    <div className="wv">
      <p className="wv-legal">
        ⚖️ Vorlage — bitte einmal vom eigenen Rechtsberater prüfen lassen. Die Widerrufsbelehrung folgt den amtlichen Mustern (
        {land === 'DE' ? 'Anlage 1 und 2 zu Art. 246a EGBGB' : 'Anhang I FAGG'}).
      </p>

      {/* ---------- 1. Anlagen ---------- */}
      <section className="card wv-sec" aria-labelledby="wv-anl">
        <h2 id="wv-anl">1. Welche Anlagen?</h2>
        {assets.length === 0 ? (
          <div className="empty">An diesem Objekt ist keine aktive Anlage erfasst.</div>
        ) : (
          <div className="wv-assets">
            {assets.map((a) => {
              const on = selected.has(a.id);
              const iv = intervalOf(a);
              const n = wartungenProJahr(iv);
              const raw = priceText[a.id] ?? '';
              const price = parseEuro(raw);
              const l = leistungFor(a, custom);
              return (
                <div key={a.id} className={`wv-asset ${on ? 'on' : ''}`}>
                  <label className="wv-asset-head">
                    <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
                    <span>
                      <b>
                        {kindInfo(a.kind).emoji} {a.name}
                      </b>
                      {a.contract && <span className="badge green wv-badge">Vertrag besteht</span>}
                      <span className="muted small wv-sub">
                        {kindInfo(a.kind).label}
                        {makerModel(a) ? ` · ${makerModel(a)}` : ''}
                        {a.location ? ` · ${a.location}` : ''}
                      </span>
                    </span>
                  </label>
                  {on && (
                    <div className="wv-asset-body">
                      <label className="field">
                        Preis je Jahr netto (€) — {n === 1 ? '1 Wartung' : `${String(n).replace('.', ',')} Wartungen`} pro Jahr
                        <input
                          value={raw}
                          inputMode="decimal"
                          placeholder="z. B. 220"
                          aria-invalid={price === null && !!raw.trim()}
                          onChange={(e) => {
                            touch();
                            setPriceText((p) => ({ ...p, [a.id]: e.target.value }));
                          }}
                        />
                        {price === null && raw.trim() ? <span className="field-hint wv-warn">Bitte eine Zahl eingeben, z. B. 220 oder 219,90</span> : null}
                        {price !== null && price > 0 && (
                          <span className="field-hint muted">= {euroText(Math.round(price / n))} je Wartung</span>
                        )}
                      </label>
                      <button type="button" className="wv-link" aria-expanded={openPoints === a.id} onClick={() => setOpenPoints((o) => (o === a.id ? null : a.id))}>
                        {l.titel} · {l.punkte.length} Prüfpunkte {openPoints === a.id ? '▾' : '▸'}
                      </button>
                      {openPoints === a.id && (
                        <ul className="wv-points">
                          {l.punkte.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {ohnePreis > 0 && <p className="wv-warn">Bitte bei jeder gewählten Anlage einen Preis je Jahr eintragen.</p>}
      </section>

      {/* ---------- 2. Kunde ---------- */}
      <section className="card wv-sec" aria-labelledby="wv-kunde">
        <h2 id="wv-kunde">2. Kunde</h2>
        <div className="wv-chips" role="group" aria-label="Kunde">
          {chip(kunde === 'verbraucher', 'Privatperson', () => setKunde('verbraucher'))}
          {chip(kunde === 'unternehmer', 'Firma (mit UID)', () => setKunde('unternehmer'))}
        </div>
        <div className="wv-grid">
          <label className="field">
            Name
            <input value={kName} placeholder="Vor- und Nachname bzw. Firma" onChange={(e) => { touch(); setKName(e.target.value); }} />
          </label>
          <label className="field">
            Anschrift
            <input value={kAddr} placeholder="Straße, PLZ Ort" onChange={(e) => { touch(); setKAddr(e.target.value); }} />
          </label>
          <label className="field">
            E-Mail (optional)
            <input type="email" value={kMail} onChange={(e) => { touch(); setKMail(e.target.value); }} />
          </label>
          {kunde === 'unternehmer' && (
            <label className="field">
              UID-Nummer (optional)
              <input value={kUid} placeholder={land === 'DE' ? 'DE…' : 'ATU…'} onChange={(e) => { touch(); setKUid(e.target.value.toUpperCase()); }} />
            </label>
          )}
        </div>
        {kunde === 'verbraucher' && (
          <>
            <span className="wv-label">Wo wird unterschrieben?</span>
            <div className="wv-chips" role="group" aria-label="Ort des Abschlusses">
              {chip(ort === 'ausserhalb', 'Beim Kunden / unterwegs', () => setOrt('ausserhalb'))}
              {chip(ort === 'geschaeft', 'In unserem Geschäft', () => setOrt('geschaeft'))}
            </div>
          </>
        )}
        <p className="muted small">
          {widerrufAktiv
            ? 'Privatkunde, Vertrag außerhalb der Geschäftsräume: 14 Tage Widerrufsrecht. Widerrufsbelehrung und Muster-Formular kommen automatisch in den Vertrag.'
            : kunde === 'unternehmer'
              ? 'Firmenkunde: kein Widerrufsrecht, keine Widerrufsbelehrung.'
              : 'Vertrag in den Geschäftsräumen: kein gesetzliches Widerrufsrecht.'}
        </p>
      </section>

      {/* ---------- 3. Bedingungen ---------- */}
      <section className="card wv-sec" aria-labelledby="wv-bed">
        <h2 id="wv-bed">3. Bedingungen</h2>
        <span className="wv-label">Laufzeit und Kündigung</span>
        <div className="wv-radios" role="radiogroup" aria-label="Laufzeit und Kündigung">
          {(['jahr', 'monat'] as Kuendigung[]).map((k) => (
            <label key={k} className="wv-radio">
              <input type="radio" name="kuendigung" checked={kuendigung === k} onChange={() => { touch(); setKuendigung(k); }} />
              {KUENDIGUNG_LABEL[k]}
              {k === 'jahr' ? ' — Standard' : ''}
            </label>
          ))}
        </div>
        <span className="wv-label">Zahlung</span>
        <div className="wv-chips" role="group" aria-label="Zahlung">
          {(['jaehrlich', 'halbjaehrlich', 'jeWartung'] as Zahlweise[]).map((z) => chip(zahlweise === z, ZAHLWEISE_LABEL[z], () => setZahlweise(z)))}
        </div>
        <div className="wv-grid">
          <label className="field">
            Rabatt in % (optional)
            <input value={rabattText} inputMode="decimal" placeholder="z. B. 5" onChange={(e) => { touch(); setRabattText(e.target.value); }} />
          </label>
        </div>
        <span className="wv-label">Im Preis enthalten</span>
        <div className="wv-chips" role="group" aria-label="Im Preis enthalten">
          {chip(anfahrt, 'Anfahrt', () => setAnfahrt((v) => !v))}
          {chip(material, 'Kleinmaterial', () => setMaterial((v) => !v))}
        </div>
        <label className="field">
          Weitere Vereinbarungen (optional)
          <textarea rows={3} value={extra} placeholder="z. B. Wartung bevorzugt im Frühjahr" onChange={(e) => { touch(); setExtra(e.target.value); }} />
        </label>
      </section>

      {/* ---------- 4. Vorschau + Druck ---------- */}
      <section className="card wv-sec" aria-labelledby="wv-sum">
        <h2 id="wv-sum">4. Zusammenfassung und Druck</h2>
        <div className="wv-summary">
          <div>
            {chosen.length} {chosen.length === 1 ? 'Anlage' : 'Anlagen'}: {chosen.map((a) => a.name).join(', ') || '—'}
          </div>
          <div>{KUENDIGUNG_LABEL[kuendigung]}</div>
          <div>
            {ZAHLWEISE_LABEL[zahlweise]} · Anfahrt {anfahrt ? 'inklusive' : 'extra'} · Kleinmaterial {material ? 'inklusive' : 'extra'}
          </div>
          <div className="wv-total">
            Gesamt je Jahr: {euroText(sum.brutto)}
            {!klein && sum.vatRate > 0 ? ' inkl. USt' : ''}
            {sum.rabatt > 0 && <span className="muted small"> (nach {String(rabattPct).replace('.', ',')} % Rabatt)</span>}
          </div>
          {widerrufAktiv && <div>Mit Widerrufsbelehrung und Muster-Widerrufsformular</div>}
        </div>
        {check.hinweise.map((h) => (
          <p key={h} className="wv-warn">
            {h}
          </p>
        ))}
        {(showErrors || touched) &&
          check.fehler.map((h) => (
            <p key={h} className="wv-err">
              {h}
            </p>
          ))}
        {fehlendeFirmendaten(firma).length > 0 && (
          <p className="small">
            <Link to={`${base}/rechnungen/firmendaten`}>Firmendaten ergänzen →</Link>
          </p>
        )}

        {widerrufAktiv && (
          <>
            <span className="wv-label">Soll vor Ablauf der Widerrufsfrist mit der Leistung begonnen werden?</span>
            <div className="wv-chips" role="group" aria-label="Vorzeitiger Beginn">
              {chip(vorzeitig === true, 'Ja, sofort beginnen', () => setVorzeitig(true))}
              {chip(vorzeitig === false, 'Nein, erst nach 14 Tagen', () => setVorzeitig(false))}
            </div>
            <p className={fragOffen && showErrors ? 'wv-err' : 'muted small'}>
              {vorzeitig === true
                ? 'Der Kunde erklärt im Vertrag: Er verlangt ausdrücklich den Beginn vor Ablauf der Frist. Widerruft er trotzdem, zahlt er einen angemessenen Betrag für die bis dahin erbrachten Leistungen; ist die Leistung vollständig erbracht, erlischt sein Widerrufsrecht.'
                : vorzeitig === false
                  ? `Leistungsbeginn frühestens am ${deDatum(fruehesterBeginn(new Date(), false, true))} — vorher keine Wartung aus diesem Vertrag.`
                  : 'Bitte mit dem Kunden klären und ankreuzen — die Antwort steht im Vertrag.'}
            </p>
          </>
        )}

        <div className="wv-grid">
          <label className="field">
            Name Unterzeichner Betrieb
            <input value={signer} onChange={(e) => { touch(); setSigner(e.target.value); }} />
          </label>
          <label className="field">
            Ort (optional)
            <input value={place} onChange={(e) => { touch(); setPlace(e.target.value); }} />
          </label>
        </div>
        <p className="muted small">
          Die Druckansicht enthält leere Unterschriftsfelder für Kunde und Betrieb. Im Druckfenster „Als PDF speichern“ wählen, um den Vertrag zu
          verschicken.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={print}>
            <Printer className="i" aria-hidden /> Druckansicht / PDF
          </button>
        </div>
        {printError && <div className="error-box">{printError}</div>}
      </section>

      {/* ---------- 5. Unterschrieben ---------- */}
      <section className="card wv-sec" aria-labelledby="wv-done">
        <h2 id="wv-done">5. Vertrag unterschrieben?</h2>
        {saved ? (
          <div className={saved.failed.length ? 'error-box' : 'info-box'} role="status">
            {saved.failed.length
              ? `Bei ${saved.failed.join(', ')} konnte „Wartungsvertrag“ nicht gespeichert werden — bitte in der App bei der Anlage nachtragen.`
              : `🤝 ${saved.ok.length} ${saved.ok.length === 1 ? 'Anlage' : 'Anlagen'} als Wartungsvertrag vermerkt, Preis je Wartung laut Vertrag übernommen.`}{' '}
            <Link to={`${base}/kunden/${site.id}`}>Zum Kunden</Link>
          </div>
        ) : confirm ? (
          <div className="wv-confirm">
            <p>
              Bei {chosen.length} {chosen.length === 1 ? 'Anlage' : 'Anlagen'} „Wartungsvertrag“ setzen und den Preis je Wartung (netto, nach Rabatt)
              übernehmen?
            </p>
            <ul className="wv-points">
              {chosen.map((a) => {
                const jahr = sum.jeAnlage.get(a.id) ?? 0;
                return (
                  <li key={a.id}>
                    {a.name}: {jahr > 0 ? `${euroText(Math.round(preisJeWartung(jahr, intervalOf(a)) * 100))} je Wartung` : 'Preis bleibt'}
                  </li>
                );
              })}
            </ul>
            <div className="row">
              <button type="button" className="btn" onClick={() => void markSigned()} disabled={busy}>
                <Check className="i" aria-hidden /> {busy ? 'Speichert …' : 'Ja, vermerken'}
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(false)} disabled={busy}>
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="muted small">
              Erst, wenn Kunde und Betrieb unterschrieben haben: vermerkt bei den gewählten Anlagen „Wartungsvertrag“ und den Preis je Wartung —
              so zählen sie im Wartungspotenzial, im Cockpit und in der App.
            </p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => (check.ok ? setConfirm(true) : setShowErrors(true))}
              disabled={chosen.length === 0}
              title={printed ? undefined : 'Tipp: zuerst die Druckansicht erstellen und unterschreiben lassen'}
            >
              <FileSignature className="i" aria-hidden /> Vertrag ist unterschrieben
            </button>
          </>
        )}
      </section>
    </div>
  );
}
