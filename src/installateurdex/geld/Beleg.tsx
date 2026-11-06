// Rechnung / Angebot / Stornorechnung — wie App InvoiceScreen: Entwurf bearbeiten (Positionen, Kunde, Steuerart),
// Pflichtangaben-Check live (lib/invoice validate), Ausstellen NUR über den Server (RPC invoice_issue: lückenlose
// Nummer, Summen + Firmendaten eingefroren, nur Inhaber, nur mit Pro), danach unveränderlich: bezahlt / Zahlung
// zurücknehmen / Storno mit Grund (Server erzeugt die Stornorechnung), Mahnstufen, Druck/PDF, E-Rechnung (XML).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, FileCode2, Mail, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { Modal } from '../../components/form';
import { LoadGuard, useAsync, useUnsavedGuard } from '../../components/ui';
import { openReportWindow } from '../../lib/print';
import { useInst } from '../context';
import { isProOrg, mailHref } from '../types';
import { catalogPrices, learnPrices, type StoredArticle, type StoredInvoice, type StoredProfile } from './api';
import { DEFAULT_PRICING, saleCents, toInvoiceLine, type PricingRule } from './articles';
import {
  calendarDaysBetween,
  euro,
  lineNet,
  linesFromInspection,
  REMINDER_LABELS,
  reminderText,
  totals,
  validate,
  type InvoiceDraft,
  type InvoiceKind,
  type InvoiceLine,
  type VatMode,
} from './invoice';
import { InvoiceBadge } from './parts';
import { buildInvoiceHtml, docTitle, downloadEInvoice, type InvoiceDoc } from './print';
import { centsText, deDay, deTs, errText, localDay, qtyText, splitAddress, toCents, toQty } from './util';

interface Loaded {
  profile: StoredProfile;
  stored: StoredInvoice | null;
  draft: InvoiceDraft;
  siteId?: string;
  inspectionId?: string;
}

export function Beleg() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { ext, org, data, base } = useInst();
  const geld = ext.geld;
  const kind: InvoiceKind = sp.get('art') === 'angebot' ? 'quote' : 'invoice';
  const siteParam = sp.get('objekt') ?? '';
  const fromQuote = sp.get('ausAngebot') ?? '';
  const inspParam = sp.get('einsatz') ?? '';

  const loaded = useAsync<Loaded>(async () => {
    const profile = await geld.profile(org.id, org.land, org.name);
    if (id) {
      const inv = await geld.invoice(id);
      if (!inv) throw new Error('Diesen Beleg gibt es nicht (mehr).');
      return { profile, stored: inv, draft: inv.data, siteId: inv.siteId, inspectionId: inv.inspectionId };
    }
    if (fromQuote) {
      // Angebot → Rechnung: gleiche Positionen und Empfänger, Leistungsdatum heute (wie App)
      const q = await geld.invoice(fromQuote);
      if (q) {
        return { profile, stored: null, siteId: q.siteId, draft: { ...q.data, kind: 'invoice', serviceDate: localDay(), notes: q.number ? `Laut Angebot ${q.number}.` : q.data.notes } };
      }
    }
    // Rechnung aus Einsatz (wie App InvoiceScreen mit inspectionId): Arbeitszeit im Takt, Anfahrt, Material mit
    // Preis aus der mitlernenden Preisliste, fehlende Preise aus dem Artikelkatalog; Leistungsdatum = Tag des Einsatzes
    const insp = inspParam ? await geld.inspection(inspParam) : null;
    if (inspParam && !insp) throw new Error('Diesen Einsatz gibt es nicht (mehr).');
    if (insp?.canceled) throw new Error('Dieser Einsatz ist storniert — dafür gibt es keine Rechnung.');
    const site = insp ? await data.site(insp.siteId) : siteParam ? await data.site(siteParam) : null;
    const lines = insp ? linesFromInspection(insp, profile, profile.materialPrices) : [];
    if (lines.some((l) => l.kind === 'material' && l.unitPriceCents <= 0)) {
      const found = await catalogPrices(geld, lines, profile.articlePricing ?? DEFAULT_PRICING);
      found.forEach((cents, i) => (lines[i] = { ...lines[i], unitPriceCents: cents }));
    }
    return {
      profile,
      stored: null,
      siteId: site?.id,
      inspectionId: insp?.id,
      draft: {
        kind: insp ? 'invoice' : kind,
        recipient: { name: site?.operator_name?.trim() || site?.name || '', ...splitAddress(site?.address ?? ''), land: org.land, email: site?.customer_email ?? undefined, private: true },
        serviceDate: localDay(insp?.startedAt ? new Date(insp.startedAt) : new Date()),
        lines,
        vatMode: profile.kleinunternehmer ? 'kleinunternehmer' : 'normal',
      },
    };
  }, [geld, id, fromQuote, siteParam, inspParam, kind, org.id]);

  return (
    <>
      {/* Beleg nicht gefunden o. Ä.: auch dann zurück zur Liste (der Editor hat seinen eigenen Link) */}
      {loaded.error && (
        <Link className="idx-back" to={`${base}/rechnungen`}>
          <ArrowLeft className="i" aria-hidden /> Alle Rechnungen &amp; Angebote
        </Link>
      )}
      <LoadGuard state={loaded}>{(l) => <Editor key={id ?? `neu-${kind}-${siteParam}-${fromQuote}-${inspParam}`} initial={l} />}</LoadGuard>
    </>
  );
}

type Notice = { tone: 'ok' | 'error'; text: ReactNode } | null;

function Editor({ initial }: { initial: Loaded }) {
  const { ext, org, data, base } = useInst();
  const geld = ext.geld;
  const navigate = useNavigate();
  const location = useLocation();
  const pro = isProOrg(org);
  const handoverState = location.state as { notice?: string; tone?: 'ok' | 'error' } | null;
  const handover = handoverState?.notice;
  const handoverTone = handoverState?.tone === 'error' ? 'error' : 'ok';
  const [profile, setProfile] = useState(initial.profile);
  const [stored, setStored] = useState(initial.stored);
  const [draft, setDraft] = useState(initial.draft);
  const [siteId, setSiteId] = useState(initial.siteId);
  const [keys, setKeys] = useState<number[]>(() => initial.draft.lines.map((_, i) => i));
  const nextKey = useRef(initial.draft.lines.length);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(handover ? { tone: handoverTone, text: handover } : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cancelText, setCancelText] = useState<string | null>(null);

  const status = stored?.status ?? 'draft';
  const editable = status === 'draft';
  const quote = draft.kind === 'quote';
  const credit = draft.kind === 'credit';
  const t = totals(draft);
  const issues = editable ? validate(draft, profile) : [];
  const docProfile = (stored?.profile as StoredProfile | undefined) ?? profile;

  // Nichts verlieren: ungespeicherte Änderungen beim Schließen/Neuladen UND bei Klicks auf Links im Portal ansprechen
  useUnsavedGuard(dirty);

  // Stornierte Rechnung ↔ Stornorechnung verlinken — gezielt per ID bzw. cancels_id (nicht nur unter den neuesten 500)
  const related = useAsync(async () => {
    if (!stored || !(stored.status === 'canceled' || stored.kind === 'credit')) return null;
    if (stored.kind === 'credit') return stored.cancelsId ? await geld.invoice(stored.cancelsId) : null;
    return geld.creditFor(stored.id);
  }, [geld, stored?.id, stored?.status]);

  // ---- Bearbeiten ----
  const setD = (patch: Partial<InvoiceDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setLine = (i: number, patch: Partial<InvoiceLine>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  };
  const appendLine = (line: InvoiceLine) => {
    setDirty(true);
    setDraft((d) => ({ ...d, lines: [...d.lines, { ...line, vatRate: d.vatMode === 'normal' ? line.vatRate : 0 }] }));
    setKeys((k) => [...k, nextKey.current++]);
  };
  const addLine = (kind: InvoiceLine['kind']) => {
    const rate = draft.vatMode === 'normal' ? profile.vatRate : 0;
    // wie App addLine
    appendLine(
      kind === 'labor'
        ? { kind, text: 'Arbeitszeit', qty: 1, unit: 'h', unitPriceCents: profile.hourlyRateCents ?? 0, vatRate: rate }
        : kind === 'travel'
          ? { kind, text: 'Anfahrt', qty: 1, unit: 'pauschal', unitPriceCents: profile.travelFlatCents ?? 0, vatRate: rate }
          : kind === 'flat'
            ? { kind, text: '', qty: 1, unit: 'pauschal', unitPriceCents: 0, vatRate: rate }
            : { kind, text: '', qty: 1, unit: 'Stk', unitPriceCents: 0, vatRate: rate },
    );
  };
  const removeLine = (i: number) => {
    setDirty(true);
    setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }));
    setKeys((k) => k.filter((_, j) => j !== i));
  };
  const setVatMode = (m: VatMode) => setD({ vatMode: m, lines: draft.lines.map((l) => ({ ...l, vatRate: m === 'normal' ? profile.vatRate : 0 })) });
  const r = draft.recipient;
  const setR = (patch: Partial<InvoiceDraft['recipient']>) => setD({ recipient: { ...r, ...patch } });

  function adopt(next: StoredInvoice | null) {
    if (!next) return;
    setStored(next);
    setDraft(next.data);
    setSiteId(next.siteId);
    setKeys(next.data.lines.map((_, i) => i));
    nextKey.current = next.data.lines.length;
    setDirty(false);
  }

  /** Entwurf speichern + Preisliste lernt mit (wie App persist). Liefert die ID. */
  async function persist(): Promise<string> {
    const id = await geld.saveDraft({ id: stored?.id, orgId: org.id, kind: draft.kind, siteId, inspectionId: stored?.inspectionId ?? initial.inspectionId, data: draft });
    const learned = learnPrices(profile, draft.lines);
    if (learned) {
      geld
        .saveProfile(org.id, org.land, org.name, { materialPrices: learned })
        .then(setProfile)
        .catch(() => {}); // still wie in der App
    }
    return id;
  }

  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  const saveOnly = () =>
    run('save', async () => {
      const id = await persist();
      const fresh = await geld.invoice(id);
      adopt(fresh);
      setNotice({ tone: 'ok', text: 'Entwurf gespeichert.' });
      if (!stored) navigate(`${base}/rechnungen/${id}`, { replace: true, state: { notice: 'Entwurf gespeichert.' } });
    });

  const issue = () => {
    if (issues.length) {
      setNotice({ tone: 'error', text: `Noch nicht vollständig: ${issues.join(' ')}` });
      return;
    }
    if (!pro) {
      setNotice({ tone: 'error', text: <>Ausstellen gibt es mit InstallateurDex Pro (wie in der App). <Link to={`${base}/abo`}>Zum Abo</Link></> });
      return;
    }
    if (!window.confirm(`${quote ? 'Angebot' : 'Rechnung'} ausstellen?\n\nDie Nummer wird vergeben. Danach lässt sich der Beleg nicht mehr ändern — nur stornieren.`)) return;
    void run('issue', async () => {
      const wasNew = !stored;
      const id = await persist();
      // Gespeicherten Entwurf sofort übernehmen (wie saveOnly): scheitert das Ausstellen danach, speichert der nächste
      // Klick in DENSELBEN Entwurf statt einen zweiten anzulegen.
      adopt(await geld.invoice(id));
      let number: string;
      try {
        const fresh = await geld.profile(org.id, org.land, org.name); // Firmendaten frisch einfrieren
        number = await geld.issue(id, fresh);
        setProfile(fresh);
      } catch (e) {
        // Neuer Beleg: Adresse auf den gespeicherten Entwurf setzen (Neuladen zeigt ihn, nicht ein leeres Formular)
        if (wasNew) navigate(`${base}/rechnungen/${id}`, { replace: true, state: { notice: `Entwurf gespeichert, aber nicht ausgestellt: ${errText(e)}`, tone: 'error' } });
        throw e;
      }
      adopt(await geld.invoice(id));
      const text = `${quote ? 'Angebot' : 'Rechnung'} ${number} ausgestellt.`;
      setNotice({ tone: 'ok', text });
      if (wasNew) navigate(`${base}/rechnungen/${id}`, { replace: true, state: { notice: text } });
    });
  };

  const changeStatus = (s: 'paid' | 'issued' | 'canceled', reason?: string) =>
    run(s, async () => {
      if (!stored) return;
      const res = await geld.setStatus(stored.id, s, reason);
      adopt(await geld.invoice(stored.id));
      setCancelText(null);
      if (res.creditId) {
        setNotice({
          tone: 'ok',
          text: (
            <>
              Storniert. Stornorechnung {res.creditNumber ?? ''} wurde erstellt — schick sie dem Kunden zusammen mit dem Hinweis auf die Gutschrift.{' '}
              <Link to={`${base}/rechnungen/${res.creditId}`}>Stornobeleg öffnen</Link>
            </>
          ),
        });
      } else if (s === 'paid') setNotice({ tone: 'ok', text: 'Als bezahlt markiert.' });
      else if (s === 'issued') setNotice({ tone: 'ok', text: 'Zahlung zurückgenommen — die Rechnung ist wieder offen.' });
      else setNotice({ tone: 'ok', text: 'Storniert.' });
    });

  const deleteDraft = () => {
    if (!stored || !window.confirm('Entwurf löschen? Der Entwurf wird entfernt.')) return;
    void run('delete', async () => {
      await geld.deleteDraft(stored.id);
      setDirty(false);
      navigate(`${base}/rechnungen?f=drafts`, { replace: true });
    });
  };

  const doc = (): InvoiceDoc => ({ draft, profile: docProfile, number: stored?.number, issuedAt: stored?.issuedAt, dueAt: stored?.dueAt, status });
  const print = () => {
    const html = buildInvoiceHtml(doc(), { pro, brandColor: org.brand_color, logoUrl: org.logo_url });
    if (!openReportWindow(html)) setNotice({ tone: 'error', text: 'Der Browser hat das Druckfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.' });
  };
  const xml = () => {
    try {
      downloadEInvoice(doc(), docProfile.land === 'DE' ? 'xrechnung' : 'en16931');
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    }
  };

  // ---- Mahnung (wie App: Text fertig, Versand per Mail oder kopieren, Stufe am Server vermerken) ----
  const overdueDays = stored?.status === 'issued' && stored.kind === 'invoice' && stored.dueAt ? calendarDaysBetween(stored.dueAt, localDay()) : 0;
  const remLevel = stored?.reminderLevel ?? 0;
  const reminder = () =>
    stored?.number
      ? reminderText(remLevel, { number: stored.number, issuedAt: stored.issuedAt, dueAt: stored.dueAt, amountCents: t.dueCents, customer: r.name, firm: docProfile.legalName, iban: docProfile.iban })
      : null;
  const recordReminder = () =>
    run('remind', async () => {
      if (!stored) return;
      const lv = await geld.remind(stored.id);
      adopt(await geld.invoice(stored.id));
      setNotice({ tone: 'ok', text: `${REMINDER_LABELS[lv - 1] ?? 'Mahnstufe'} vermerkt.` });
    });
  const sendMail = () => {
    const m = reminder();
    // mailHref lässt nur schlichte Adressen zu — eine Eingabe wie „a@b.at?cc=…“ brächte sonst weitere Empfänger in die Mail
    const href = m && r.email ? mailHref(r.email, m.subject, m.body) : null;
    if (!href) return;
    window.location.href = href;
    void recordReminder();
  };
  const copyReminder = async () => {
    const m = reminder();
    if (!m) return;
    try {
      await navigator.clipboard.writeText(`${m.subject}\n\n${m.body}`);
    } catch {
      setNotice({ tone: 'error', text: 'Kopieren hat nicht geklappt — der Browser erlaubt die Zwischenablage nicht.' });
      return;
    }
    void recordReminder();
  };

  const sites = useAsync(async () => (editable ? data.sites() : []), [data, editable]);
  const pickSite = (id: string) => {
    const s = sites.data?.find((x) => x.id === id);
    if (!s) {
      setSiteId(undefined);
      setDirty(true);
      return;
    }
    setSiteId(s.id);
    // wie App (Objekt → Empfänger): Name = Kunde, sonst Objektname; Anschrift aufgeteilt; E-Mail des Kunden
    const a = splitAddress(s.address ?? '');
    setD({ recipient: { ...r, name: s.operator_name?.trim() || s.name, street: a.street, zip: a.zip, city: a.city, email: s.customer_email ?? r.email } });
  };

  const titleText = credit
    ? `Stornorechnung ${stored?.number ?? ''}${draft.cancels ? ` zu ${draft.cancels}` : ''}`
    : stored?.number
      ? `${quote ? 'Angebot' : docTitle(draft)} ${stored.number}`
      : quote
        ? stored
          ? 'Angebot (Entwurf)'
          : 'Neues Angebot'
        : stored
          ? 'Rechnung (Entwurf)'
          : 'Neue Rechnung';
  const missingPrices = draft.lines.filter((l) => l.unitPriceCents <= 0 && l.kind !== 'other').length;
  const sgn = (c: number) => euro(credit ? -c : c);
  const showsVat = draft.vatMode === 'normal';
  const rule = profile.articlePricing ?? DEFAULT_PRICING;

  return (
    <div className="idx-geld-beleg">
      <Link className="idx-back" to={`${base}/rechnungen`}>
        <ArrowLeft className="i" aria-hidden /> Alle Rechnungen &amp; Angebote
      </Link>
      <div className="idx-head">
        <h1>{titleText}</h1>
        <div className="row">
          {stored && <InvoiceBadge x={stored} />}
          {dirty && <span className="badge amber">nicht gespeichert</span>}
        </div>
      </div>

      {notice && <div className={notice.tone === 'ok' ? 'info-box' : 'error-box'}>{notice.text}</div>}

      <div className="idx-cols" style={{ marginTop: 14 }}>
        <div className="idx-stack">
          {editable && !stored && (
            <div className="idx-status-pick" role="radiogroup" aria-label="Art des Belegs">
              {(
                [
                  ['invoice', '🧾 Rechnung'],
                  ['quote', '📝 Angebot'],
                ] as [InvoiceKind, string][]
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={draft.kind === k} className={draft.kind === k ? 'on' : ''} onClick={() => setD({ kind: k })}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Positionen */}
          <div className="card">
            <div className="idx-geld-cardhead">
              <h3 className="idx-card-title">Positionen</h3>
              {missingPrices > 0 && editable && <span className="badge amber">{missingPrices === 1 ? '1 Preis fehlt' : `${missingPrices} Preise fehlen`}</span>}
            </div>
            {draft.lines.length === 0 && <p className="muted">Noch keine Positionen — unten hinzufügen.</p>}
            {editable ? (
              <div className="idx-geld-lines">
                {draft.lines.length > 0 && (
                  <div className="idx-geld-line idx-geld-linehead" aria-hidden>
                    <span className="pos">#</span>
                    <span className="text">Bezeichnung</span>
                    <span className="qty">Menge</span>
                    <span className="unit">Einheit</span>
                    <span className="price">Preis € netto</span>
                    <span className="sum">Betrag</span>
                    <span className="del" />
                  </div>
                )}
                {draft.lines.map((l, i) => (
                  <LineRow key={keys[i]} index={i} line={l} onChange={(p) => setLine(i, p)} onRemove={() => removeLine(i)} />
                ))}
                <div className="row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn small" onClick={() => setPickerOpen(true)}>
                    <Search className="i" aria-hidden /> Material aus Artikeln
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => addLine('material')}>
                    <Plus className="i" aria-hidden /> Material frei
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => addLine('labor')}>
                    <Plus className="i" aria-hidden /> Arbeitszeit
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => addLine('travel')}>
                    <Plus className="i" aria-hidden /> Anfahrt
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => addLine('flat')}>
                    <Plus className="i" aria-hidden /> Pauschale
                  </button>
                </div>
              </div>
            ) : (
              draft.lines.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Leistung / Material</th>
                        <th className="idx-num">Menge</th>
                        <th className="idx-num">Einzelpreis</th>
                        {showsVat && <th className="idx-num idx-hide-sm">USt</th>}
                        <th className="idx-num">Betrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="muted">{i + 1}</td>
                          <td className="wrap">{l.text}</td>
                          <td className="idx-num">
                            {l.qty.toLocaleString('de-DE', { maximumFractionDigits: 3 })} {l.unit}
                          </td>
                          <td className="idx-num">{sgn(l.unitPriceCents)}</td>
                          {showsVat && <td className="idx-num idx-hide-sm">{l.vatRate} %</td>}
                          <td className="idx-num">{sgn(lineNet(l))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Kunde */}
          <div className="card">
            <h3 className="idx-card-title">Kunde</h3>
            {editable ? (
              <div className="idx-geld-form">
                <label className="field idx-geld-wide">
                  Aus Objekt übernehmen (optional)
                  <select value={siteId ?? ''} onChange={(e) => pickSite(e.target.value)} disabled={!sites.data}>
                    <option value="">— kein Objekt —</option>
                    {(sites.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.operator_name ? `${s.operator_name} · ${s.name}` : s.name}
                        {s.active ? '' : ' (archiviert)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field idx-geld-wide">
                  Name
                  <input value={r.name} onChange={(e) => setR({ name: e.target.value })} maxLength={200} />
                </label>
                <label className="field idx-geld-wide">
                  Straße, Nr.
                  <input value={r.street ?? ''} onChange={(e) => setR({ street: e.target.value })} />
                </label>
                <label className="field">
                  PLZ
                  <input value={r.zip ?? ''} inputMode="numeric" onChange={(e) => setR({ zip: e.target.value })} />
                </label>
                <label className="field">
                  Ort
                  <input value={r.city ?? ''} onChange={(e) => setR({ city: e.target.value })} />
                </label>
                <label className="idx-check idx-geld-wide">
                  <input type="checkbox" checked={!!r.private} onChange={(e) => setR({ private: e.target.checked })} />
                  Privatkunde
                </label>
                {!r.private && (
                  <label className="field">
                    UID des Kunden
                    <input value={r.uid ?? ''} onChange={(e) => setR({ uid: e.target.value.toUpperCase() })} />
                  </label>
                )}
                <label className="field">
                  E-Mail (für Erinnerungen)
                  <input type="email" value={r.email ?? ''} onChange={(e) => setR({ email: e.target.value.trim() || undefined })} />
                </label>
                {!quote && (
                  <label className="field">
                    Leistungsdatum
                    <input type="date" value={draft.serviceDate} onChange={(e) => e.target.value && setD({ serviceDate: e.target.value })} />
                  </label>
                )}
              </div>
            ) : (
              <dl className="idx-dl">
                <dt>Name</dt>
                <dd>{r.name || '—'}</dd>
                <dt>Anschrift</dt>
                <dd>{[r.street, [r.zip, r.city].filter(Boolean).join(' ')].filter((x) => x && x.trim()).join(', ') || '—'}</dd>
                <dt>Art</dt>
                <dd>
                  {r.private ? 'Privatkunde' : 'Firma'}
                  {r.uid ? ` · UID ${r.uid}` : ''}
                </dd>
                {r.email && (
                  <>
                    <dt>E-Mail</dt>
                    <dd>{r.email}</dd>
                  </>
                )}
                {!quote && (
                  <>
                    <dt>Leistung</dt>
                    <dd>{draft.serviceDateTo && draft.serviceDateTo !== draft.serviceDate ? `${deDay(draft.serviceDate)} – ${deDay(draft.serviceDateTo)}` : deDay(draft.serviceDate)}</dd>
                  </>
                )}
                {siteId && (
                  <>
                    <dt>Objekt</dt>
                    <dd>
                      <Link to={`${base}/kunden/${siteId}`}>Zum Objekt</Link>
                    </dd>
                  </>
                )}
              </dl>
            )}
          </div>

          {/* Weitere Optionen */}
          {editable ? (
            <div className="card">
              <h3 className="idx-card-title">Weitere Optionen</h3>
              {!quote && (
                <>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Umsatzsteuer
                  </div>
                  <div className="idx-status-pick" role="radiogroup" aria-label="Umsatzsteuer">
                    {(
                      [
                        ['normal', `Normal (${profile.vatRate} %)`],
                        ['kleinunternehmer', 'Kleinunternehmer'],
                        ['reverseCharge', 'Reverse Charge (Bauleistung)'],
                      ] as [VatMode, string][]
                    ).map(([m, label]) => (
                      <button key={m} type="button" role="radio" aria-checked={draft.vatMode === m} className={draft.vatMode === m ? 'on' : ''} onClick={() => setVatMode(m)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="idx-geld-form" style={{ marginTop: 10 }}>
                    <label className="idx-check idx-geld-wide">
                      <input type="checkbox" checked={!!draft.partial} onChange={(e) => setD({ partial: e.target.checked })} />
                      Abschlagsrechnung
                    </label>
                    <MoneyField label="Bereits bezahlte Abschläge brutto (€)" cents={draft.prepaidCents ?? 0} onChange={(c) => setD({ prepaidCents: c })} />
                  </div>
                </>
              )}
              <label className="field">
                Hinweis auf dem Beleg
                <textarea rows={3} value={draft.notes ?? ''} placeholder="z. B. Vielen Dank für Ihren Auftrag!" onChange={(e) => setD({ notes: e.target.value })} />
              </label>
            </div>
          ) : (
            draft.notes && (
              <div className="card">
                <h3 className="idx-card-title">Hinweis</h3>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{draft.notes}</p>
              </div>
            )
          )}
        </div>

        {/* Rechte Spalte: Betrag, Prüfung, Aktionen */}
        <div className="idx-stack">
          <div className={`card idx-geld-total ${status}`}>
            <div className="small muted">{quote ? 'Angebotssumme' : credit ? 'Gutschrift gesamt' : t.prepaidCents > 0 ? 'zu zahlen' : 'Gesamtbetrag'}</div>
            <div className="idx-geld-total-value">{credit ? euro(-t.grossCents) : t.prepaidCents > 0 ? euro(t.dueCents) : euro(t.grossCents)}</div>
            <div className="small muted">
              {draft.vatMode === 'normal'
                ? `netto ${sgn(t.netCents)} · USt ${sgn(t.vatCents)}`
                : draft.vatMode === 'kleinunternehmer'
                  ? 'ohne USt (Kleinunternehmer)'
                  : 'netto · Reverse Charge'}
              {t.prepaidCents > 0 ? ` · Gesamt ${euro(t.grossCents)}, abzüglich Abschläge ${euro(t.prepaidCents)}` : ''}
            </div>
            {stored?.issuedAt && <div className="small muted">Belegdatum {deDay(stored.issuedAt)}</div>}
            {stored?.dueAt && status === 'issued' && !credit && (
              <div className="small muted">
                {quote ? 'gültig bis' : 'fällig am'} {deDay(stored.dueAt)}
              </div>
            )}
            {status === 'paid' && stored?.paidAt && <div className="small" style={{ color: '#86efac' }}>bezahlt am {deTs(stored.paidAt)}</div>}
            {status === 'canceled' && stored?.canceledReason && <div className="idx-storno">Storniert: {stored.canceledReason}</div>}
          </div>

          {editable && (
            <div className={`card idx-geld-check ${issues.length ? 'warn' : 'ok'}`}>
              {issues.length === 0 ? (
                <b className="idx-ok">
                  ✓ Bereit zum Ausstellen{quote ? '' : ` · Pflichtangaben ${profile.land === 'DE' ? '§ 14 UStG' : '§ 11 UStG'}`}
                </b>
              ) : (
                <>
                  <b>{issues.length === 1 ? 'Noch 1 Angabe' : `Noch ${issues.length} Angaben`}</b>
                  <ul className="idx-list">
                    {issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  {issues.some((x) => /Einstellungen|Firmen|UID-Nummer|Steuernummer|Kleinunternehmer-Regelung/.test(x)) && (
                    <Link to={`${base}/rechnungen/firmendaten`}>Firmendaten ergänzen →</Link>
                  )}
                </>
              )}
            </div>
          )}

          {overdueDays > 0 && (
            <div className="card idx-geld-check warn">
              <b>Überfällig seit {overdueDays === 1 ? '1 Tag' : `${overdueDays} Tagen`}</b>
              <p className="small muted" style={{ margin: '4px 0 10px' }}>
                {remLevel === 0
                  ? 'Noch keine Erinnerung verschickt.'
                  : `Zuletzt: ${REMINDER_LABELS[remLevel - 1]}${stored?.remindedAt ? ` am ${deTs(stored.remindedAt)}` : ''}.`}
              </p>
              {remLevel < 3 ? (
                <div className="row">
                  {r.email && mailHref(r.email) && (
                    <button type="button" className="btn small" onClick={sendMail} disabled={!!busy}>
                      <Mail className="i" aria-hidden /> {REMINDER_LABELS[remLevel]} per E-Mail
                    </button>
                  )}
                  <button type="button" className="btn ghost small" onClick={() => void copyReminder()} disabled={!!busy}>
                    <Copy className="i" aria-hidden /> Text kopieren
                  </button>
                </div>
              ) : (
                <p className="small" style={{ margin: 0 }}>
                  Alle Mahnstufen verschickt — jetzt am besten anrufen.
                </p>
              )}
              {remLevel < 3 && <p className="small muted" style={{ margin: '8px 0 0' }}>Die Mahnstufe wird beim Öffnen der E-Mail bzw. beim Kopieren vermerkt — wie in der App.</p>}
            </div>
          )}

          <div className="card idx-geld-actions">
            {editable ? (
              <>
                <button type="button" className="btn" onClick={issue} disabled={!!busy}>
                  {busy === 'issue' ? 'Einen Moment …' : quote ? 'Angebot ausstellen' : 'Rechnung ausstellen'}
                </button>
                {!pro && (
                  <p className="small muted" style={{ margin: 0 }}>
                    Ausstellen gibt es mit Pro — <Link to={`${base}/abo`}>Abo</Link>. Entwürfe gehen immer.
                  </p>
                )}
                <button type="button" className="btn ghost" onClick={() => void saveOnly()} disabled={!!busy}>
                  {busy === 'save' ? 'Speichert …' : 'Als Entwurf speichern'}
                </button>
                <button type="button" className="btn ghost" onClick={print}>
                  <Printer className="i" aria-hidden /> Vorschau drucken
                </button>
                {stored && (
                  <button type="button" className="btn ghost idx-geld-danger" onClick={deleteDraft} disabled={!!busy}>
                    <Trash2 className="i" aria-hidden /> Entwurf löschen
                  </button>
                )}
              </>
            ) : (
              <>
                {status === 'issued' && !quote && !credit && (
                  <button type="button" className="btn" onClick={() => void changeStatus('paid')} disabled={!!busy}>
                    {busy === 'paid' ? 'Einen Moment …' : 'Als bezahlt markieren'}
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={print}>
                  <Printer className="i" aria-hidden /> Drucken / PDF
                </button>
                {!quote && status !== 'canceled' && (
                  <button type="button" className="btn ghost" onClick={xml}>
                    <FileCode2 className="i" aria-hidden /> E-Rechnung (XML)
                  </button>
                )}
                {quote && status === 'issued' && (
                  <Link className="btn ghost" to={`${base}/rechnungen/neu?ausAngebot=${stored?.id}`}>
                    → In Rechnung umwandeln
                  </Link>
                )}
                {status === 'paid' && (
                  <button type="button" className="btn ghost" onClick={() => void changeStatus('issued')} disabled={!!busy}>
                    Zahlung zurücknehmen
                  </button>
                )}
                {(status === 'issued' || status === 'paid') && !credit && (
                  <>
                    {cancelText === null ? (
                      <button type="button" className="btn ghost idx-geld-danger" onClick={() => setCancelText('')}>
                        Stornieren …
                      </button>
                    ) : (
                      <div className="idx-geld-cancel">
                        <label className="field">
                          Storno-Grund (Pflicht)
                          <input value={cancelText} maxLength={300} placeholder="z. B. falscher Empfänger" onChange={(e) => setCancelText(e.target.value)} autoFocus />
                        </label>
                        <p className="small muted" style={{ margin: '0 0 8px' }}>
                          {quote ? 'Das Angebot wird als storniert markiert.' : 'Der Server erstellt dazu eine Stornorechnung mit eigener Nummer (negative Beträge).'}
                        </p>
                        <div className="row">
                          <button type="button" className="btn idx-geld-danger-solid" onClick={() => void changeStatus('canceled', cancelText)} disabled={!!busy || cancelText.trim().length < 3}>
                            {busy === 'canceled' ? 'Einen Moment …' : 'Storno bestätigen'}
                          </button>
                          <button type="button" className="btn ghost" onClick={() => setCancelText(null)}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {related.data && (
                  <Link to={`${base}/rechnungen/${related.data.id}`}>
                    {credit ? `→ Ursprüngliche Rechnung ${related.data.number ?? ''}` : `→ Stornorechnung ${related.data.number ?? ''}`}
                  </Link>
                )}
              </>
            )}
          </div>
          {!pro && !editable && <p className="small muted">Ohne Pro druckt das Portal wie die App ohne Logo und Firmenfarbe.</p>}
          {editable && <p className="small muted">Hinweis: Die App prüft die gesetzlichen Pflichtangaben (AT § 11 UStG / DE § 14 UStG). Steuerliche Beratung ersetzt sie nicht.</p>}
        </div>
      </div>

      {pickerOpen && (
        <ArticlePicker
          rule={rule}
          onClose={() => setPickerOpen(false)}
          onPick={(a) => {
            appendLine(toInvoiceLine(a, rule, draft.vatMode === 'normal' ? profile.vatRate : 0, 1));
            void geld.markUsed(a.id).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

/** Eine Position im Entwurf: Zahlen als Text (Komma), umgerechnet wie in der App. */
function LineRow({ index, line, onChange, onRemove }: { index: number; line: InvoiceLine; onChange: (p: Partial<InvoiceLine>) => void; onRemove: () => void }) {
  const [qty, setQty] = useState(qtyText(line.qty));
  const [price, setPrice] = useState(centsText(line.unitPriceCents));
  const missing = line.unitPriceCents <= 0 && line.kind !== 'other';
  const icon = line.kind === 'labor' ? '🕐' : line.kind === 'travel' ? '🚐' : line.kind === 'material' ? '🔩' : '📌';
  return (
    <div className={`idx-geld-line ${missing ? 'missing' : ''}`}>
      <span className="pos" title={`Position ${index + 1}`}>
        {icon}
      </span>
      <label className="text">
        <span className="l">Bezeichnung</span>
        <input
          value={line.text}
          placeholder={line.kind === 'material' ? 'Material, z. B. Kugelhahn 1"' : 'Bezeichnung'}
          onChange={(e) => onChange({ text: e.target.value })}
          aria-label={`Position ${index + 1}, Bezeichnung`}
        />
      </label>
      <label className="qty">
        <span className="l">Menge</span>
        <input
          value={qty}
          inputMode="decimal"
          onChange={(e) => {
            setQty(e.target.value);
            onChange({ qty: toQty(e.target.value) });
          }}
          aria-label="Menge"
        />
      </label>
      <label className="unit">
        <span className="l">Einheit</span>
        <input value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} aria-label="Einheit" maxLength={12} />
      </label>
      <label className="price">
        <span className="l">Preis €</span>
        <input
          value={price}
          inputMode="decimal"
          placeholder="0,00"
          onChange={(e) => {
            setPrice(e.target.value);
            onChange({ unitPriceCents: toCents(e.target.value) });
          }}
          aria-label="Einzelpreis netto in Euro"
        />
      </label>
      <span className="sum">{euro(Math.round(line.qty * line.unitPriceCents))}</span>
      <span className="del">
        <button type="button" className="btn ghost small" onClick={onRemove} aria-label={`Position ${index + 1} entfernen`} title="Position entfernen">
          <X className="i" aria-hidden />
        </button>
      </span>
    </div>
  );
}

function MoneyField({ label, cents, onChange }: { label: string; cents: number; onChange: (c: number) => void }) {
  const [text, setText] = useState(centsText(cents));
  return (
    <label className="field">
      {label}
      <input
        value={text}
        inputMode="decimal"
        placeholder="0,00"
        onChange={(e) => {
          setText(e.target.value);
          onChange(toCents(e.target.value));
        }}
      />
    </label>
  );
}

/** Artikelsuche (Server, RPC article_search) — wie App ArticlePickerSheet: Verkaufspreis nach Preisregel, Menge 1. */
function ArticlePicker({ rule, onClose, onPick }: { rule: PricingRule; onClose: () => void; onPick: (a: StoredArticle) => void }) {
  const { ext } = useInst();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), q ? 250 : 0);
    return () => clearTimeout(h);
  }, [q]);
  const res = useAsync(() => ext.geld.searchArticles(debounced, 40), [ext.geld, debounced]);
  const items = useMemo(() => res.data ?? [], [res.data]);
  return (
    <Modal title="Material aus Artikeln" onClose={onClose}>
      <label className="field">
        Suche (Name, Artikelnummer oder EAN)
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z. B. Kugelhahn 1" autoFocus />
      </label>
      {res.error && <div className="error-box">{res.error}</div>}
      <div className="idx-geld-picklist">
        {res.loading && items.length === 0 ? (
          <div className="empty">
            <span className="spinner" />
          </div>
        ) : items.length === 0 ? (
          <p className="muted">{debounced ? 'Nichts gefunden.' : 'Noch keine Artikel — unter „Material & Preise“ eine Großhändler-Datei einlesen oder eigene Artikel anlegen.'}</p>
        ) : (
          items.map((a) => (
            <button
              key={a.id}
              type="button"
              className="idx-geld-pick"
              onClick={() => {
                onPick(a);
                setAdded((x) => [...x, a.id]);
              }}
            >
              <span className="n">
                {a.name}
                <span className="idx-sub">
                  {a.supplier || 'Eigener Artikel'}
                  {a.no ? ` · Nr. ${a.no}` : ''}
                  {added.includes(a.id) ? ' · ✓ hinzugefügt' : ''}
                </span>
              </span>
              <span className="p">
                {euro(saleCents(a, rule))}
                <span className="idx-sub">je {a.unit}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn" onClick={onClose}>
          Fertig
        </button>
      </div>
    </Modal>
  );
}
