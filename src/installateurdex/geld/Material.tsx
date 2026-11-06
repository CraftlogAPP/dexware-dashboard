// Material & Preise — wie App ArticlesScreen: 1. Verkaufspreis-Regel, 2. Großhändler-Preisdateien (Datanorm 4.0 / CSV)
// einlesen, 3. eigene Artikel. Dazu am PC: alle Artikel durchsuchen (Server-Suche article_search).
// Parser, Zeichensatz-Erkennung und Preisregel sind wortgleich aus der App (geld/articles.ts) — gleiche Datei, gleiches
// Ergebnis. Gespeichert wird in Blöcken zu 1.000 (wie App importArticles), Abbruch zwischen zwei Blöcken.
// Anlegen/Ändern/Import nur Inhaber (RLS article_write); Monteure sehen eine reine Suche.

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/form';
import { LoadGuard, useAsync } from '../../components/ui';
import { useInst } from '../context';
import { planArticleImport, type Catalog, type StoredArticle, type StoredProfile } from './api';
import { costCents, decodeBytes, DEFAULT_PRICING, parseArticles, parseMoney, saleCents, type Article, type ParseResult, type PricingRule } from './articles';
import { euro } from './invoice';
import { errText } from './util';
import './geld.css';

const UNITS = ['Stk', 'm', 'kg', 'l', 'h', 'pauschal'];
const MAX_FILE_MB = 60; // wie App data/articles.ts
const CHUNK = 1000; // wie App importArticles
const pct = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const pctText = (n: number) => String(n).replace('.', ',');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '');
const n0 = (n: number) => n.toLocaleString('de-DE');
const KIND_LABEL: Record<Article['priceKind'], string> = { list: 'Listenpreis', net: 'Nettopreis (EK)', sale: 'Verkaufspreis' };

type Preview = ParseResult & { bytes: number; supplier: string; files: string[] };

export function Material() {
  const { ext, org, isOwner } = useInst();
  const geld = ext.geld;
  const profile = useAsync(() => geld.profile(org.id, org.land, org.name), [geld, org.id]);
  const catalogs = useAsync(() => geld.catalogs(), [geld]);

  return (
    <>
      <h1>Material &amp; Preise</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Großhändler-Preise (Datanorm/CSV), eigene Artikel und dein Aufschlag — dieselben Artikel, die in der App bei
        Rechnung und Angebot unter „+ Material“ suchbar sind.
      </p>
      {!isOwner ? (
        <>
          <div className="info-box">Artikel und Preise pflegt der Inhaber. Du kannst hier nachschlagen.</div>
          <AllArticles rule={DEFAULT_PRICING} showSale={false} />
        </>
      ) : (
        <LoadGuard state={profile}>
          {(p) => (
            <Owner
              initialProfile={p}
              catalogs={catalogs.data ?? []}
              catalogsError={catalogs.error}
              reloadCatalogs={catalogs.refresh}
            />
          )}
        </LoadGuard>
      )}
    </>
  );
}

function Owner({
  initialProfile,
  catalogs,
  catalogsError,
  reloadCatalogs,
}: {
  initialProfile: StoredProfile;
  catalogs: Catalog[];
  catalogsError: string | null;
  reloadCatalogs: () => void;
}) {
  const { ext, org } = useInst();
  const geld = ext.geld;
  const saved0 = { ...DEFAULT_PRICING, ...(initialProfile.articlePricing ?? {}) };
  const [saved, setSaved] = useState<PricingRule>(saved0);
  const [mode, setMode] = useState<PricingRule['mode']>(saved0.mode);
  const [discText, setDiscText] = useState(pctText(saved0.discountPercent));
  const [markText, setMarkText] = useState(pctText(saved0.markupPercent));
  const [ruleMsg, setRuleMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [version, setVersion] = useState(0); // Artikel-Listen neu laden

  const draftRule: PricingRule = { mode, discountPercent: pct(discText), markupPercent: pct(markText) };
  const ruleChanged = draftRule.mode !== saved.mode || draftRule.discountPercent !== saved.discountPercent || draftRule.markupPercent !== saved.markupPercent;
  const example = { priceCents: 10000, priceKind: 'list' as const };

  async function saveRule() {
    if (ruleBusy) return;
    if (draftRule.discountPercent > 95 || draftRule.markupPercent > 500) {
      setRuleMsg({ ok: false, text: 'Prozent prüfen: Rabatt höchstens 95 %, Aufschlag höchstens 500 %.' });
      return;
    }
    setRuleBusy(true);
    setRuleMsg(null);
    try {
      await geld.saveProfile(org.id, org.land, org.name, { articlePricing: draftRule });
      setSaved(draftRule);
      setRuleMsg({ ok: true, text: 'Preisregel gespeichert.' });
    } catch (e) {
      setRuleMsg({ ok: false, text: errText(e) });
    } finally {
      setRuleBusy(false);
    }
  }

  const total = catalogs.reduce((s, c) => s + c.count, 0);
  const ownCount = catalogs.find((c) => c.supplier === '')?.count ?? 0;
  const suppliers = catalogs.filter((c) => c.supplier !== '');
  const refresh = () => {
    reloadCatalogs();
    setVersion((v) => v + 1);
  };

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi idx-kpi-accent">
          <div className="kpi-label">Artikel</div>
          <div className="kpi-value">{n0(total)}</div>
          <div className="kpi-sub">suchbar in Rechnung &amp; Angebot</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Großhändler</div>
          <div className="kpi-value">{suppliers.length}</div>
          <div className="kpi-sub">{n0(total - ownCount)} Katalog-Artikel</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Eigene Artikel</div>
          <div className="kpi-value">{n0(ownCount)}</div>
          <div className="kpi-sub">Pauschalen &amp; Stammartikel</div>
        </div>
      </div>
      {catalogsError && <div className="error-box">{catalogsError}</div>}

      {/* 1. Preisregel */}
      <div className="section-head">
        <h2>1 · Verkaufspreis</h2>
      </div>
      <div className="card">
        <div className="idx-status-pick" role="radiogroup" aria-label="Verkaufspreis">
          {(['list', 'markup'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'list' ? 'Zum Listenpreis' : 'Einkauf + Aufschlag'}
            </button>
          ))}
        </div>
        <div className="idx-geld-form" style={{ marginTop: 12 }}>
          <label className="field">
            Rabatt (%)
            <input value={discText} inputMode="decimal" onChange={(e) => setDiscText(e.target.value)} />
          </label>
          <label className="field">
            Aufschlag (%)
            <input value={markText} inputMode="decimal" onChange={(e) => setMarkText(e.target.value)} />
          </label>
        </div>
        <div className="idx-geld-example">
          <span className="muted">Beispiel Listenpreis {euro(10000)}</span>
          <b>
            Einkauf {euro(costCents(example, draftRule))} → Verkauf <span className="idx-geld-accent">{euro(saleCents(example, draftRule))}</span>
          </b>
        </div>
        <p className="small muted">
          Rabatt = was dir der Großhändler auf den Listenpreis gibt.{' '}
          {mode === 'list'
            ? 'Artikel mit Listenpreis gehen zum Listenpreis auf die Rechnung, dein Gewinn ist der Rabatt. Artikel mit Nettopreis bekommen den Aufschlag.'
            : 'Alle Großhändler-Artikel: Einkaufspreis (Listenpreis minus Rabatt) plus Aufschlag. Eigene Artikel behalten ihren Preis.'}
        </p>
        <div className="row">
          {ruleChanged && (
            <button type="button" className="btn small" onClick={() => void saveRule()} disabled={ruleBusy}>
              {ruleBusy ? 'Speichert …' : 'Preisregel speichern'}
            </button>
          )}
          {ruleMsg && (ruleMsg.ok ? <span className="idx-ok">✓ {ruleMsg.text}</span> : <span className="error-box" style={{ margin: 0 }}>{ruleMsg.text}</span>)}
        </div>
      </div>

      {/* 2. Großhändler */}
      <ImportSection suppliers={suppliers} draftRule={draftRule} onChanged={refresh} />

      {/* 3. Eigene Artikel */}
      <OwnArticles version={version} onChanged={refresh} />

      {/* 4. Alle Artikel */}
      <div className="section-head">
        <h2>Alle Artikel durchsuchen</h2>
      </div>
      <AllArticles rule={saved} showSale version={version} />
    </>
  );
}

function ImportSection({ suppliers, draftRule, onChanged }: { suppliers: Catalog[]; draftRule: PricingRule; onChanged: () => void }) {
  const { ext, org } = useInst();
  const geld = ext.geld;
  const [supplier, setSupplier] = useState('');
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const cancel = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Während des Imports nicht versehentlich wegklicken
  useEffect(() => {
    if (!progress) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [progress]);

  function pick() {
    setMsg(null);
    if (!supplier.trim()) {
      setMsg({ ok: false, text: 'Bitte zuerst den Namen des Großhändlers eintragen, z. B. „Holter“ oder „Frauenthal“. So bleiben mehrere Kataloge getrennt.' });
      return;
    }
    fileRef.current?.click();
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const name = supplier.trim();
    if (!files.length || !name) return;
    const bytes = files.reduce((s, f) => s + f.size, 0);
    const names = files.map((f) => f.name);
    if (bytes > MAX_FILE_MB * 1024 * 1024) {
      setPreview({ format: 'unknown', articles: [], skipped: 0, truncated: false, bytes, supplier: name, files: names, error: `Die Datei ist größer als ${MAX_FILE_MB} MB. Bitte beim Großhändler nur die nötigen Warengruppen anfordern oder in Teilen importieren.` });
      return;
    }
    setReading(true);
    try {
      // Datanorm kommt oft in mehreren Teilen (DATANORM.001, .002 …) — gemeinsam lesen, damit B-Sätze ihre A-Sätze finden (wie App)
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
      const texts: string[] = [];
      for (const f of sorted) texts.push(decodeBytes(new Uint8Array(await f.arrayBuffer())));
      await new Promise((r) => setTimeout(r, 0)); // Oberfläche einmal zeichnen lassen
      const res = parseArticles(texts.join('\n'), name);
      setPreview({ ...res, bytes, supplier: name, files: names });
    } catch (err) {
      setMsg({ ok: false, text: `Datei nicht lesbar: ${errText(err)}` });
    } finally {
      setReading(false);
    }
  }

  async function runImport() {
    if (!preview?.articles.length || progress) return;
    cancel.current = false;
    const { withNo, withoutNo, suppliersWithoutNo } = planArticleImport(preview.articles);
    const total = withNo.length + withoutNo.length;
    let done = 0;
    setProgress({ done: 0, total });
    try {
      // Ohne Artikelnummer lässt sich nichts zuordnen → diese Artikel des Großhändlers werden ersetzt (wie App)
      for (const s of suppliersWithoutNo) await geld.deleteSupplierWithoutNo(org.id, s);
      const step = async (rows: Article[], upsert: boolean) => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          if (cancel.current) return false;
          const chunk = rows.slice(i, i + CHUNK);
          await geld.writeArticleChunk(org.id, chunk, upsert);
          done += chunk.length;
          setProgress({ done, total });
        }
        return true;
      };
      if (await step(withNo, true)) await step(withoutNo, false);
      const stopped = cancel.current && done < total;
      setMsg({
        ok: true,
        text: stopped
          ? `Import abgebrochen: ${n0(done)} Artikel wurden übernommen. Erneut einlesen setzt fort, ohne zu verdoppeln.`
          : `Fertig ✓ ${n0(done)} Artikel von ${preview.supplier} sind jetzt in Rechnung und Angebot suchbar.`,
      });
      setPreview(null);
      setSupplier('');
    } catch (e) {
      setMsg({ ok: false, text: `Import unterbrochen: ${errText(e)} — ${n0(done)} Artikel sind schon übernommen und bleiben; ein neuer Versuch aktualisiert sie, ohne zu verdoppeln.` });
      setPreview(null);
    } finally {
      setProgress(null);
      onChanged();
    }
  }

  async function removeCatalog(c: Catalog) {
    if (removing) return;
    if (!window.confirm(`Katalog „${c.supplier}“ entfernen?\n\n${n0(c.count)} Artikel werden gelöscht. Bereits erstellte Rechnungen bleiben unverändert.`)) return;
    setRemoving(c.supplier);
    setMsg(null);
    try {
      await geld.deleteCatalog(org.id, c.supplier);
      setMsg({ ok: true, text: `Katalog „${c.supplier}“ entfernt.` });
    } catch (e) {
      setMsg({ ok: false, text: `Nicht entfernt: ${errText(e)}` });
    } finally {
      setRemoving(null);
      onChanged();
    }
  }

  const sample = preview?.articles.slice(0, 3) ?? [];
  const pctDone = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const colName: Record<string, string> = { no: 'Nr.', name: 'Bezeichnung', unit: 'Einheit', price: 'Preis', ean: 'EAN', group: 'Gruppe' };

  return (
    <>
      <div className="section-head">
        <h2>2 · Preise vom Großhändler</h2>
      </div>
      {msg && <div className={msg.ok ? 'info-box' : 'error-box'}>{msg.text}</div>}
      {suppliers.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Großhändler</th>
                <th className="idx-num">Artikel</th>
                <th className="idx-hide-sm">Stand</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((c) => (
                <tr key={c.supplier}>
                  <td className="wrap">🏬 {c.supplier}</td>
                  <td className="idx-num">{n0(c.count)}</td>
                  <td className="idx-hide-sm muted">{day(c.updated)}</td>
                  <td className="idx-num">
                    <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button type="button" className="btn ghost small" onClick={() => setSupplier(c.supplier)} disabled={!!progress}>
                        Neu einlesen
                      </button>
                      <button type="button" className="btn ghost small idx-geld-danger" onClick={() => void removeCatalog(c)} disabled={!!removing || !!progress} aria-label={`Katalog ${c.supplier} entfernen`}>
                        {removing === c.supplier ? 'Entfernt …' : 'Entfernen'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h3 className="idx-card-title">📥 Preisdatei einlesen</h3>
        <div className="idx-geld-form">
          <label className="field">
            Großhändler
            <input value={supplier} maxLength={60} placeholder="z. B. Holter" onChange={(e) => setSupplier(e.target.value)} />
          </label>
          <div style={{ alignSelf: 'end', marginBottom: 14 }}>
            <button type="button" className="btn" style={{ width: '100%', height: 43 }} onClick={pick} disabled={reading || !!progress}>
              <FileUp className="i" aria-hidden /> {reading ? 'Lese Datei …' : 'Datei(en) auswählen'}
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => void onFiles(e)} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Datanorm 4.0 oder CSV (Excel: „Speichern unter → CSV“). ZIP-Dateien vorher entpacken; mehrteilige Datanorm-Dateien
          (DATANORM.001, .002 …) gemeinsam auswählen. Bis {MAX_FILE_MB} MB, höchstens 300.000 Artikel je Betrieb. Vorhandene
          Artikelnummern werden aktualisiert, nicht verdoppelt.
        </p>
      </div>

      {preview && (
        <Modal title={preview.error ? 'Datei passt nicht' : `${n0(preview.articles.length)} Artikel erkannt`} onClose={() => !progress && setPreview(null)}>
          {preview.error ? (
            <>
              <p>{preview.error}</p>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn ghost" onClick={() => setPreview(null)}>
                  OK
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                {preview.format === 'datanorm' ? 'Datanorm' : 'CSV'} · {preview.supplier} · {(preview.bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB
                {preview.files.length > 1 ? ` · ${preview.files.length} Dateien` : ''}
                {preview.skipped ? ` · ${n0(preview.skipped)} Zeilen ohne Bezeichnung/Preis übersprungen` : ''}
              </p>
              {preview.truncated && <div className="info-box">Mehr als 300.000 Artikel: nur die ersten werden übernommen.</div>}
              {preview.columns && (
                <p className="small muted">
                  Spalten:{' '}
                  {Object.entries(preview.columns)
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${colName[k]} = „${v}“`)
                    .join(', ')}
                </p>
              )}
              <div className="idx-geld-sample">
                {sample.map((a, i) => (
                  <div key={i} className="idx-geld-sample-row">
                    <span>{a.name}</span>
                    <b>
                      {euro(saleCents(a, draftRule))} / {a.unit}
                    </b>
                  </div>
                ))}
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  Verkaufspreise nach deiner Preisregel ({draftRule.mode === 'list' ? 'Listenpreis' : `Einkauf + ${pctText(draftRule.markupPercent)} %`}).
                </p>
              </div>
              {progress ? (
                <div style={{ marginTop: 12 }}>
                  <div className="idx-geld-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctDone}>
                    <span style={{ width: `${pctDone}%` }} />
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {n0(progress.done)} von {n0(progress.total)} ({pctDone} %)
                    </span>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        cancel.current = true;
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                  <p className="small muted">Bitte dieses Fenster offen lassen. Abbrechen stoppt nach dem laufenden Block — Übernommenes bleibt.</p>
                </div>
              ) : (
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                  <button type="button" className="btn ghost" onClick={() => setPreview(null)}>
                    Abbrechen
                  </button>
                  <button type="button" className="btn" onClick={() => void runImport()}>
                    Übernehmen
                  </button>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

type Edit = Partial<StoredArticle> & { priceText?: string };

function OwnArticles({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { ext, org } = useInst();
  const geld = ext.geld;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), q ? 250 : 0);
    return () => clearTimeout(h);
  }, [q]);
  const own = useAsync(() => geld.searchArticles(debounced, 100, ''), [geld, debounced, version]);
  const list = own.data ?? [];

  async function save() {
    if (!edit || busy) return;
    const name = (edit.name ?? '').trim();
    const price = parseMoney(edit.priceText ?? '');
    if (!name) return setErr('Bezeichnung fehlt: Wie heißt der Artikel?');
    if (price === null) return setErr('Preis prüfen: Bitte den Verkaufspreis netto eingeben, z. B. 12,50.');
    setBusy(true);
    setErr(null);
    try {
      await geld.saveArticle(org.id, { id: edit.id, supplier: '', no: edit.no?.trim() || undefined, name, unit: edit.unit || 'Stk', priceCents: price, priceKind: 'sale' });
      setEdit(null);
      onChanged();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!edit?.id || busy || !window.confirm(`Artikel löschen?\n\n${edit.name ?? ''}`)) return;
    setBusy(true);
    setErr(null);
    try {
      await geld.deleteArticle(edit.id);
      setEdit(null);
      onChanged();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h2>3 · Eigene Artikel</h2>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setErr(null);
            setEdit({ unit: 'Stk', priceText: '' });
          }}
        >
          <Plus className="i" aria-hidden /> Neuer Artikel
        </button>
      </div>
      {(list.length > 6 || q) && (
        <div className="filter-bar">
          <label className="field" style={{ flex: '1 1 260px' }}>
            Eigene Artikel durchsuchen
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      )}
      {own.error && <div className="error-box">{own.error}</div>}
      {list.length === 0 ? (
        <div className="card empty">
          {own.loading ? <span className="spinner" /> : q ? 'Nichts gefunden.' : 'Pauschalen und Artikel, die du oft verbaust: z. B. „Kleinmaterial pauschal“, „Entsorgung Altgerät“, „Wartungsset Gastherme“.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th className="idx-hide-sm">Nr.</th>
                <th className="idx-num">Preis netto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="wrap">{a.name}</td>
                  <td className="idx-hide-sm muted">{a.no ?? '—'}</td>
                  <td className="idx-num">
                    {euro(a.priceCents)} <span className="muted">/ {a.unit}</span>
                  </td>
                  <td className="idx-num">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        setErr(null);
                        setEdit({ ...a, priceText: (a.priceCents / 100).toFixed(2).replace('.', ',') });
                      }}
                      aria-label={`${a.name} bearbeiten`}
                    >
                      <Pencil className="i" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <Modal title={edit.id ? 'Artikel bearbeiten' : 'Neuer Artikel'} onClose={() => !busy && setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field">
              Bezeichnung
              <input value={edit.name ?? ''} maxLength={200} placeholder="z. B. Kleinmaterial pauschal" onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
            </label>
            <div className="idx-geld-form">
              <label className="field idx-euro">
                Verkaufspreis netto
                <input value={edit.priceText ?? ''} inputMode="decimal" placeholder="12,50" onChange={(e) => setEdit({ ...edit, priceText: e.target.value })} />
              </label>
              <label className="field">
                Artikelnr. (optional)
                <input value={edit.no ?? ''} maxLength={40} onChange={(e) => setEdit({ ...edit, no: e.target.value })} />
              </label>
            </div>
            <div className="small muted" style={{ margin: '4px 0 6px' }}>
              Einheit
            </div>
            <div className="idx-status-pick" role="radiogroup" aria-label="Einheit">
              {UNITS.map((u) => (
                <button key={u} type="button" role="radio" aria-checked={(edit.unit ?? 'Stk') === u} className={(edit.unit ?? 'Stk') === u ? 'on' : ''} onClick={() => setEdit({ ...edit, unit: u })}>
                  {u}
                </button>
              ))}
            </div>
            {err && <div className="error-box">{err}</div>}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
              {edit.id ? (
                <button type="button" className="btn ghost idx-geld-danger" onClick={() => void remove()} disabled={busy}>
                  <Trash2 className="i" aria-hidden /> Artikel löschen
                </button>
              ) : (
                <span />
              )}
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Speichert …' : 'Speichern'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Suche über alle Artikel (eigene + Kataloge) — Server-Suche wie in der App (höchstens 100 Treffer). */
function AllArticles({ rule, showSale, version = 0 }: { rule: PricingRule; showSale: boolean; version?: number }) {
  const { ext } = useInst();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), q ? 300 : 0);
    return () => clearTimeout(h);
  }, [q]);
  const res = useAsync(() => ext.geld.searchArticles(debounced, 100), [ext.geld, debounced, version]);
  const list = res.data ?? [];
  return (
    <>
      <div className="filter-bar">
        <label className="field" style={{ flex: '1 1 300px' }}>
          Suche (alle Wörter: Name, Artikelnummer oder EAN)
          <input type="search" value={q} placeholder="z. B. Bogen 22 press" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {res.error && <div className="error-box">{res.error}</div>}
      {list.length === 0 ? (
        <div className="card empty">{res.loading ? <span className="spinner" /> : debounced ? 'Nichts gefunden.' : 'Noch keine Artikel.'}</div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th className="idx-hide-sm">Großhändler</th>
                  <th className="idx-num idx-hide-sm">Preis laut Datei</th>
                  {showSale && <th className="idx-num idx-hide-sm">Einkauf</th>}
                  {showSale && <th className="idx-num">Verkauf netto</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td className="wrap">
                      {a.name}
                      <span className="idx-sub">
                        {a.no ? `Nr. ${a.no}` : 'ohne Nr.'}
                        {a.ean ? ` · EAN ${a.ean}` : ''}
                        {a.group ? ` · ${a.group}` : ''}
                        <span className="idx-show-sm"> · {a.supplier || 'Eigener Artikel'}</span>
                      </span>
                    </td>
                    <td className="idx-hide-sm">{a.supplier || <span className="muted">Eigener Artikel</span>}</td>
                    <td className="idx-num idx-hide-sm">
                      {euro(a.priceCents)} / {a.unit}
                      <span className="idx-sub">{KIND_LABEL[a.priceKind]}</span>
                    </td>
                    {showSale && <td className="idx-num idx-hide-sm">{a.priceKind === 'sale' ? <span className="muted">—</span> : euro(costCents(a, rule))}</td>}
                    {showSale && (
                      <td className="idx-num">
                        <b>{euro(saleCents(a, rule))}</b> <span className="muted">/ {a.unit}</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="idx-sum">
            {list.length >= 100 ? 'Die ersten 100 Treffer — für mehr die Suche genauer machen.' : `${list.length} ${list.length === 1 ? 'Treffer' : 'Treffer'}`}
            {showSale && ' · Verkaufspreis nach deiner gespeicherten Preisregel.'}
          </p>
        </>
      )}
    </>
  );
}
