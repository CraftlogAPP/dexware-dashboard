// Öffentliches Profil = Eintrag des Betriebs im Installateur-Helfer — wie App screens/HelperListingScreen.tsx:
// Kunden in der Region sehen Name, Ort, Leistungen und Kontakt und schicken Anfragen direkt in den Eingang.
// Gleiche Felder, Prüfungen und Texte wie die App; Datenbank-Regeln: helfer.sql / NACHTRAG-HELFER.sql (org_helper_*).
// Nur Inhaber (RLS org_update).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { useInst } from '../context';
import type { HelperListing } from './data';
import './auswertung.css';

// wie App lib/helper.ts (TRADE_LABELS / TRADES) — Reihenfolge und Werte = Prüfregel org_helper_trades_check
const TRADE_LABELS = {
  heizung: 'Heizung',
  sanitaer: 'Sanitär',
  waermepumpe: 'Wärmepumpe',
  klima: 'Klima',
  lueftung: 'Lüftung',
  solar: 'Solar',
  notdienst: 'Notdienst',
} as const;
type Trade = keyof typeof TRADE_LABELS;
const TRADES = Object.keys(TRADE_LABELS) as Trade[];

export function Profil() {
  const { isOwner } = useInst();
  if (!isOwner) {
    return (
      <div className="aw">
        <h1>Öffentliches Profil</h1>
        <div className="info-box">Den Eintrag im Installateur-Helfer ändert nur der Inhaber des Betriebs — wie in der App.</div>
      </div>
    );
  }
  return <ProfilOwner />;
}

function ProfilOwner() {
  const { ext, org, base } = useInst();
  const state = useAsync(() => ext.auswertung.helperListing(org.id), [ext, org.id]);
  return (
    <div className="aw">
      <h1>Öffentliches Profil</h1>
      <LoadGuard state={state}>{(l) => <ListingForm initial={l} onSaved={state.refresh} />}</LoadGuard>
      <p className="muted small" style={{ marginTop: 16 }}>
        Telefonnummer und E-Mail für Kunden trägst du unter <Link to={`${base}/einstellungen`}>Einstellungen → Kontakt auf dem Anlagenpass</Link>{' '}
        ein.
      </p>
    </div>
  );
}

function ListingForm({ initial, onSaved }: { initial: HelperListing; onSaved: () => void }) {
  const { ext, org, base } = useInst();
  const [l, setL] = useState<HelperListing>(initial);
  // Stand in der Datenbank (für „PLZ/Ort geändert?“ → Ortsmitte der Umkreissuche verwerfen)
  const [saved, setSaved] = useState<HelperListing>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; settings?: boolean } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // Kontakt kann sich in den Einstellungen geändert haben → hasContact nachziehen, ohne Eingaben zu verwerfen
  useEffect(() => {
    setL((cur) => ({ ...cur, hasContact: initial.hasContact }));
    setSaved((cur) => ({ ...cur, hasContact: initial.hasContact }));
  }, [initial.hasContact]);

  const set = (p: Partial<HelperListing>) => {
    setOk(false);
    setL((cur) => ({ ...cur, ...p }));
  };
  const toggleTrade = (t: Trade) => set({ trades: l.trades.includes(t) ? l.trades.filter((x) => x !== t) : [...l.trades, t] });

  async function save(listed = l.listed) {
    if (busy) return;
    setErr(null);
    setOk(false);
    // gleiche Prüfungen wie die App vor dem Speichern
    if (listed && !/^\d{4,5}$/.test(l.zip.trim())) {
      setErr({ text: 'PLZ fehlt: Bitte die Postleitzahl des Betriebs eintragen. Danach finden dich Kunden aus deiner Region.' });
      return;
    }
    if (listed && !l.hasContact) {
      setErr({
        text: 'Kontakt fehlt: Damit Kunden dich erreichen, braucht es eine öffentliche Telefonnummer oder E-Mail (Einstellungen → Anlagenpass & Kunden).',
        settings: true,
      });
      return;
    }
    // Die App rechnet beim Speichern die Ortsmitte (PLZ + Ort) für die Umkreissuche über den Ortsdienst des Handys aus.
    // Das Portal hat keinen solchen Dienst: gleiche PLZ/Ort → Ortsmitte bleibt; geändert → löschen (dann PLZ-Suche).
    const placeChanged = l.zip.trim() !== saved.zip.trim() || l.city.trim() !== saved.city.trim();
    setBusy(true);
    try {
      await ext.auswertung.saveHelperListing(org.id, { listed, zip: l.zip, city: l.city, trades: l.trades, blurb: l.blurb, clearGeo: placeChanged });
      const hasGeo = placeChanged ? false : saved.hasGeo;
      const next = { ...l, listed, zip: l.zip.trim(), city: l.city.trim(), blurb: l.blurb.trim(), hasGeo };
      setL(next);
      setSaved(next);
      setGeoNote(
        hasGeo
          ? '📍 Umkreissuche aktiv: Kunden in der Nähe sehen die Entfernung zu deinem Ort.'
          : '📍 Kunden finden dich über die Postleitzahl. Für die Umkreissuche (Entfernung in km) in der App unter Einstellungen → „Im Installateur-Helfer gefunden werden“ einmal speichern — die App rechnet die Ortsmitte aus.',
      );
      setOk(true);
      onSaved();
    } catch (e) {
      setErr({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const shownTrades = l.trades.filter((t) => t !== 'notdienst' && t in TRADE_LABELS) as Trade[];

  return (
    <>
      <section className="idx-hero aw-helper-hero" aria-label="Installateur-Helfer">
        <div className="idx-hero-label">🔧 Installateur-Helfer</div>
        <div className="idx-hero-value aw-helper-title">Neue Kunden aus deiner Region</div>
        <div className="idx-hero-sub">
          Hausbesitzer beschreiben ihr Problem in der kostenlosen Helfer-App oder auf installateurdex.dexware.app/hilfe. Passt es zu
          dir, sehen sie deinen Betrieb und schicken die Anfrage direkt in deinen Eingang.
        </div>
      </section>

      <div className="idx-cols">
        <div className="idx-stack">
          <div className="card aw-switch-card">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ margin: 0 }}>Im Helfer gefunden werden</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {l.listed ? 'Aktiv: Kunden aus deiner Region sehen deinen Betrieb.' : 'Aus: Dein Betrieb erscheint nicht im Helfer.'}
              </p>
            </div>
            <label className="aw-switch">
              <input
                type="checkbox"
                role="switch"
                checked={l.listed}
                disabled={busy}
                onChange={(e) => void save(e.target.checked)}
                aria-label="Im Installateur-Helfer gefunden werden"
              />
              <span aria-hidden />
            </label>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Wo und was</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="aw-zip-row">
                <label className="field aw-zip">
                  PLZ
                  <input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={l.zip}
                    onChange={(e) => set({ zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                  />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 0 }}>
                  Ort
                  <input value={l.city} maxLength={60} autoComplete="address-level2" onChange={(e) => set({ city: e.target.value })} />
                </label>
              </div>
              <div className="aw-label">Leistungen</div>
              <div className="idx-chips aw-chips">
                {TRADES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`aw-chip${l.trades.includes(t) ? ' on' : ''}`}
                    aria-pressed={l.trades.includes(t)}
                    onClick={() => toggleTrade(t)}
                  >
                    {t === 'notdienst' ? '🚨 Notdienst' : TRADE_LABELS[t]}
                  </button>
                ))}
              </div>
              <label className="field">
                Ein Satz über deinen Betrieb (optional)
                <input
                  value={l.blurb}
                  maxLength={200}
                  placeholder="z. B. Familienbetrieb seit 1998, Wärmepumpen-Spezialist"
                  onChange={(e) => set({ blurb: e.target.value })}
                />
                <span className="field-hint muted">{l.blurb.length}/200 Zeichen</span>
              </label>
              {!l.hasContact && (
                <p className="aw-warn">
                  ⚠️ Noch keine öffentliche Telefonnummer oder E-Mail. Die trägst du in den{' '}
                  <Link to={`${base}/einstellungen`}>Einstellungen</Link> unter „Kontakt auf dem Anlagenpass“ ein.
                </p>
              )}
              {err && (
                <div className="error-box">
                  {err.text}
                  {err.settings && (
                    <>
                      {' '}
                      <Link to={`${base}/einstellungen`}>Zu den Einstellungen</Link>
                    </>
                  )}
                </div>
              )}
              {geoNote && <p className="muted small">{geoNote}</p>}
              {!geoNote && (
                <p className="muted small">
                  {l.hasGeo
                    ? '📍 Umkreissuche aktiv: Kunden in der Nähe sehen die Entfernung zu deinem Ort.'
                    : '📍 Noch keine Umkreissuche: Kunden finden dich über die Postleitzahl. Die Ortsmitte rechnet die App beim Speichern aus.'}
                </p>
              )}
              <div className="row">
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Speichere …' : 'Speichern'}
                </button>
                {ok && !busy && <span className="badge green">Gespeichert ✓</span>}
              </div>
            </form>
          </div>
        </div>

        <div className="idx-stack">
          <h3 className="aw-h" style={{ marginTop: 0 }}>
            So sehen Kunden deinen Betrieb
          </h3>
          <div className="aw-preview" aria-label="Vorschau">
            <div className="aw-preview-name">{org.name || 'Dein Betrieb'}</div>
            <div className="muted">{[l.zip, l.city].filter(Boolean).join(' ') || 'PLZ Ort'}</div>
            {l.blurb && <div className="aw-preview-text">{l.blurb}</div>}
            {shownTrades.length > 0 && <div className="muted">{shownTrades.map((t) => TRADE_LABELS[t]).join(' · ')}</div>}
            <div className="aw-preview-btns">
              <span className="aw-pbtn">
                <Phone className="i" aria-hidden /> Anrufen
              </span>
              <span className="aw-pbtn on">
                <Mail className="i" aria-hidden /> Anfrage senden
              </span>
            </div>
          </div>
          <p className="muted small">
            Gezeigt werden nur Name, Ort, Leistungen, dein Satz, die öffentliche Telefonnummer/E-Mail und dein Bewertungslink. Kunden
            sehen keine Sterne, die du nicht selbst verlinkt hast.
          </p>
        </div>
      </div>
    </>
  );
}
