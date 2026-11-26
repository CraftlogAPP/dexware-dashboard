// Karte „Wetter-Guide“ (WinterDex, Team-Seite unter „Betrieb“; Bauplan P4-Teil, G8, 5.4). Früher nur „Glätte-Frühwarnung
// morgens um …“ — die Uhrzeit bleibt das Einzige, was je BETRIEB eingestellt wird (org.glaette_morgen_zeit). Mitteilungsarten
// gibt es nur JE GERÄT in der App (set_push_arten mit dem eigenen Push-Token) — der Browser hat keinen und Inhaber können
// Mitarbeitern keine Arten vorgeben; deshalb hier nur Anzeige: „Aktiv auf X von Y Handys“ (nur Inhaber/Verwalter, Server
// prüft die Rolle), die letzten Mitteilungen, Haftung + Quellen und die Vorlage „Mitarbeiter-Info“.
// Ohne NACHTRAG-WETTER-GUIDE und solange der Wetter-Guide für den Betrieb nicht freigegeben ist (guideFreigegeben) bleibt
// alles wie bisher (nur die Uhrzeit); ohne die Spalte org.glaette_morgen_zeit und ohne Wetter-Guide bleibt die Karte unsichtbar.
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, Copy } from 'lucide-react';
import { useAsync } from '../components/ui';
import { useOrgOptional } from '../components/OrgContext';
import { fmtDateTime } from '../lib/format';
import { roleLabel } from '../lib/orgApi';
import { GLAETTE_ERKLAERUNG, GLAETTE_STANDARD, glaetteZeitOptionen, hhmm, ladeGlaetteZeit, speichereGlaetteZeit } from './glaetteZeit';
import { nachweisZone } from './nachweisZeit';
import { PRO_HOW } from './pro';
import {
  ART_NAME,
  ARTEN_HINWEIS,
  GERAET_WORT,
  GERAETE_HINWEIS,
  HAFTUNG,
  guideFreigegeben,
  ladeWetterGuide,
  mitarbeiterInfo,
  QUELLEN,
  STATUS_WORT,
  type Bewertung,
  type GuideStand,
} from './wetterGuide';

export function GlaetteFruehwarnung({ client, orgId, darf }: { client: SupabaseClient; orgId: string; darf: boolean }) {
  const state = useAsync(() => ladeGlaetteZeit(client, orgId), [client, orgId]);
  const guide = useAsync(() => ladeWetterGuide(client, orgId, darf), [client, orgId, darf]);
  // erst nach der Freischaltung für den Betrieb (Testbetrieb / live) — vorher bleibt die Karte wie bisher
  const frei = useAsync(() => guideFreigegeben(client, orgId), [client, orgId]);
  const org = useOrgOptional()?.data ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const wert = state.data;
  const live = !!guide.data?.live && frei.data === true;
  // lädt noch, Spalte fehlt oder nicht lesbar — und (noch) kein Wetter-Guide: unsichtbar wie bisher
  if (wert == null && !live) return null;

  async function aendern(m: number) {
    setErr(null);
    setOk(false);
    setBusy(true);
    try {
      await speichereGlaetteZeit(client, orgId, m);
      state.reload();
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card wg" style={{ marginBottom: 18 }}>
      <div className="section-head" style={{ margin: 0 }}>
        <h2>{live ? 'Wetter-Guide' : 'Glätte-Frühwarnung'}</h2>
      </div>
      {wert != null && <Uhrzeit wert={wert} darf={darf} busy={busy} aendern={aendern} />}
      {ok && !err && wert != null && (
        <p className="small" role="status" style={{ marginBottom: 0 }}>
          Gespeichert — die Frühwarnung kommt künftig um {hhmm(wert)} Uhr.
        </p>
      )}
      {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
      {live && guide.data && (
        <WetterGuideTeil
          g={guide.data}
          darf={darf}
          inhaber={org?.role === 'owner'}
          tz={nachweisZone(org?.org.land)}
          betrieb={org?.org.name ?? ''}
          anschrift={org?.org.address ?? null}
        />
      )}
    </div>
  );
}

function Uhrzeit({ wert, darf, busy, aendern }: { wert: number; darf: boolean; busy: boolean; aendern: (m: number) => void }) {
  return (
    <>
      {darf ? (
        <label className="field" style={{ maxWidth: 320, marginBottom: 6 }}>
          Glätte-Frühwarnung morgens um …
          <select value={wert} disabled={busy} onChange={(e) => void aendern(Number(e.target.value))} aria-describedby="glaette-zeit-erklaerung">
            {glaetteZeitOptionen().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p style={{ marginBottom: 6 }}>
          Glätte-Frühwarnung morgens um <b>{hhmm(wert)} Uhr</b>
          {wert === GLAETTE_STANDARD ? ' (Standard)' : ''} — ändern können Inhaber oder Verwalter.
        </p>
      )}
      <p className="muted small" id="glaette-zeit-erklaerung" style={{ marginBottom: 0 }}>
        {GLAETTE_ERKLAERUNG}
      </p>
    </>
  );
}

const GERAET_KLASSE = { aktiv: 'badge green', bekommt_keine: 'badge', zustellung_fehlgeschlagen: 'badge red' } as const;

export function WetterGuideTeil({ g, darf, inhaber, tz, betrieb, anschrift }: { g: GuideStand; darf: boolean; inhaber: boolean; tz: string; betrieb: string; anschrift: string | null }) {
  const ger = g.geraete;
  return (
    <>
      {/* Paywall: Mitteilungen nur mit Pro/Probe — der Server entscheidet beim Senden (wg_pro_stand) */}
      {darf && ger && !ger.pro && (
        <div className="info-box">{inhaber ? `Mitteilungen aufs Handy gibt es nur mit Pro. ${PRO_HOW}` : 'Mitteilungen aufs Handy gibt es nur mit Pro — Pro schließt der Inhaber ab.'}</div>
      )}
      <p className="small muted wg-absatz">{ARTEN_HINWEIS}</p>

      {darf && ger && ger.gesamt > 0 && (
        <>
          <h3 className="wg-h3">
            Aktiv auf {ger.aktiv} von {ger.gesamt} Handys
          </h3>
          <ul className="wg-liste">
            {ger.mitglieder.map((m, i) => (
              <li key={i}>
                <span className="wg-name">{m.name}</span>
                <span className="muted small">{roleLabel(m.rolle)}</span>
                <span className={GERAET_KLASSE[m.status]}>{GERAET_WORT[m.status]}</span>
              </li>
            ))}
          </ul>
          <p className="small muted wg-absatz">{GERAETE_HINWEIS}</p>
        </>
      )}

      <h3 className="wg-h3">Letzte Mitteilungen</h3>
      {g.mitteilungen === null ? (
        <p className="small muted">Mitteilungen gerade nicht ladbar – erneut beim nächsten Öffnen.</p>
      ) : g.mitteilungen.length === 0 ? (
        <p className="small muted">Noch keine Wetter-Guide-Mitteilungen.</p>
      ) : (
        <ul className="wg-mitteilungen">
          {g.mitteilungen.map((m) => (
            <li key={m.id}>
              <div className="small muted">
                {fmtDateTime(m.gesendet_at ?? m.erstellt_at, tz)}
                {m.titel ? '' : ` · ${ART_NAME[m.kart] ?? m.kart}`}
                {typeof m.geraete === 'number' ? ` · an ${m.geraete} ${m.geraete === 1 ? 'Handy' : 'Handys'}` : ''} · {STATUS_WORT[m.status] ?? m.status}
              </div>
              <div>
                {m.titel && <b>{m.titel}: </b>}
                {m.text}
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="wg-details">
        <summary>Hinweis und Datenquellen</summary>
        <p className="small">{HAFTUNG}</p>
        {QUELLEN.map((q) => (
          <p key={q} className="small muted">
            {q}
          </p>
        ))}
      </details>
      {darf && <MitarbeiterInfo betrieb={betrieb} anschrift={anschrift} />}
    </>
  );
}

/** Vorlage „Mitarbeiter-Info“ (5.4): Betrieb/Anschrift eingesetzt, Leistungsbewertung wählbar, kopieren zum Aushang/Mail */
function MitarbeiterInfo({ betrieb, anschrift }: { betrieb: string; anschrift: string | null }) {
  const [bew, setBew] = useState<Bewertung>('nicht');
  const [datum, setDatum] = useState('');
  const [kopiert, setKopiert] = useState(false);
  const text = mitarbeiterInfo(betrieb, anschrift, bew, datum);
  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
    } catch {
      // Zwischenablage nicht verfügbar — der Text steht markierbar im Feld
    }
  }
  return (
    <details className="wg-details">
      <summary>Vorlage „Mitarbeiter-Info“</summary>
      <p className="small muted">
        Zum Aushang oder per Mail an dein Team: was WinterDex speichert und wofür. Bitte vor dem Verteilen prüfen und bei Bedarf anpassen.
      </p>
      <label className="field" style={{ maxWidth: 420 }}>
        Leistungsbewertung einzelner Personen anhand dieser Daten
        <select
          value={bew}
          onChange={(e) => {
            setBew(e.target.value as Bewertung);
            setKopiert(false);
          }}
        >
          <option value="nicht">erfolgt nicht</option>
          <option value="betriebsvereinbarung">nur nach Betriebsvereinbarung</option>
        </select>
      </label>
      {bew === 'betriebsvereinbarung' && (
        <label className="field" style={{ maxWidth: 260 }}>
          Betriebsvereinbarung vom
          <input
            value={datum}
            placeholder="z. B. 01.12.2026"
            onChange={(e) => {
              setDatum(e.target.value);
              setKopiert(false);
            }}
          />
        </label>
      )}
      <textarea className="wg-vorlage" readOnly value={text} rows={7} aria-label="Text der Mitarbeiter-Info" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn ghost small" onClick={() => void kopieren()}>
        {kopiert ? <Check className="i" aria-hidden /> : <Copy className="i" aria-hidden />} {kopiert ? 'Kopiert' : 'Text kopieren'}
      </button>
    </details>
  );
}
