// Karte „Heute Nacht“ auf der WinterDex-Startseite (Bauplan P2/5.3) — über den Kennzahl-Kacheln. Einfach, kurz,
// feldtauglich: Ampel als Zeichen + Wort, ein Lage-Satz, ein Streifen „jetzt + 12 Std.“, der Morgen-Satz, wer betroffen
// ist, Fußzeile mit Quelle. Grün/unbekannt eingeklappt (2 Zeilen), ab gelb aufgeklappt. Nie eine Bewertung, nie Namen.
// Daten und Regeln: heuteNachtDaten.ts (Sichtbarkeit entscheidet der Server über karte_live; Pro-Teile nur, wenn der Server sie
// schickt). HeuteNachtKarte ist rein (Beispieldaten-Vorschau /vorschau?app=winterdex&seite=wetter).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronDown, ChevronUp, CloudHail, CloudRain, CloudSnow, Minus, Snowflake } from 'lucide-react';
import { useAsync, useLiveRefresh } from '../components/ui';
import {
  ampelAnzeige,
  amtlichArt,
  amtlichHinweis,
  amtlichZeile,
  ART_WORT,
  betroffenZeile,
  eisregenInSicht,
  ereignisZeile,
  erledigtHeute,
  fussZeile,
  glaetteJetzt,
  gradText,
  hnSichtbar,
  hnTitel,
  hnZustand,
  ladeHeuteNacht,
  mengeText,
  morgenSatz,
  standText,
  streifen,
  uhrzeit,
  vorleseSatz,
  type HeuteNacht as HnDaten,
  type HnArt,
  type HnSpalte,
} from './heuteNachtDaten';
import { ladeGeraete, type GuideGeraete } from './wetterGuide';

export interface HnLinks {
  objekte: string;
  team: string;
  abo: string;
}

/** Lädt heute_nacht für den Betrieb und zeigt die Karte — oder nichts (nicht freigegeben, Nachtrag fehlt, kein Warn-Ort). */
export function HeuteNacht({
  client,
  orgId,
  land,
  rolle,
  tz,
  ops,
  links,
  eingeklappt = false,
}: {
  client: SupabaseClient;
  orgId: string;
  land: string | null | undefined;
  rolle: string | null | undefined;
  tz: string;
  /** Einsätze (Metadaten) für „noch 8 von 14 betroffenen offen“ — optional */
  ops?: ReadonlyArray<{ property_id: string; started_at: string; canceled: boolean }> | null;
  links: HnLinks;
  /** immer eingeklappt starten (Außendienst) */
  eingeklappt?: boolean;
}) {
  const state = useAsync(() => ladeHeuteNacht(client, orgId), [client, orgId]);
  // alle 10 Minuten still neu (der Wetter-Lauf rechnet alle 15 Minuten) und beim Zurückkehren in den Tab
  useLiveRefresh([state.refresh], 10 * 60_000);
  const ladung = state.data;
  const darf = rolle === 'owner' || rolle === 'admin';
  const d = ladung?.art === 'ok' ? ladung.d : ladung?.art === 'fehler' ? (ladung.alt?.d ?? null) : null;
  // Geräte-Zeile nur für Inhaber/Verwalter eines Pro-Betriebs (Server prüft Rolle und Pro selbst)
  const mitGeraeten = !!d && d.karte_live && d.morgen.pro && darf;
  const geraete = useAsync(async () => (mitGeraeten ? ladeGeraete(client, orgId) : null), [client, orgId, mitGeraeten]);
  if (!ladung || ladung.art === 'aus') return null;
  const jetzt = Date.now();
  if (ladung.art === 'fehler' && !ladung.alt) {
    if (!ladung.warLive) return null;
    return (
      <section className="card hn hn-au" aria-label="Wetter heute Nacht">
        <div className="hn-kopf">
          <h2>{hnTitel(jetzt, tz)}</h2>
        </div>
        <p className="hn-hinweis">Wetter gerade nicht abrufbar – erneut beim nächsten Öffnen.</p>
      </section>
    );
  }
  if (!d) return null;
  const offline = ladung.art === 'fehler' && ladung.alt ? ladung.alt.abgerufen : null;
  if (!hnSichtbar(d, jetzt, tz, darf)) return null;
  return (
    <HeuteNachtKarte
      d={d}
      jetzt={jetzt}
      tz={tz}
      land={land}
      rolle={rolle}
      erledigt={erledigtHeute(ops, jetzt, tz)}
      offlineSeit={offline}
      geraete={geraete.data ?? null}
      links={links}
      eingeklappt={eingeklappt}
    />
  );
}

const ART_ICON: Record<HnArt, typeof Snowflake> = {
  trocken: Minus,
  regen: CloudRain,
  schneeregen: CloudSnow,
  schnee: Snowflake,
  gefrierend: CloudHail,
};

function Spalten({ spalten, tz, art }: { spalten: HnSpalte[]; tz: string; art: 'breit' | 'schmal' }) {
  return (
    <div className={`hn-streifen hn-${art}`} aria-hidden="true">
      {spalten.map((s) => {
        const I = s.art ? ART_ICON[s.art] : null;
        const von = uhrzeit(s.von, tz).slice(0, 2);
        const bis = s.dauer === 2 ? uhrzeit(s.von + 2 * 3_600_000, tz).slice(0, 2) : null;
        return (
          <div key={s.von} className={`hn-sp ${s.ampel === null ? 'hn-au' : `hn-a${s.ampel}`}`} title={s.art ? ART_WORT[s.art] : 'unbekannt'}>
            <span className="hn-uhr">{bis ? `${von}–${bis}` : von}</span>
            <span className="hn-sym">{I ? <I className="i" /> : '?'}</span>
            <span className="hn-t">{gradText(s.t)}</span>
            <span className="hn-m">{mengeText(s)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Die Karte selbst — rein, ohne Server (auch für die Vorschau). */
export function HeuteNachtKarte({
  d,
  jetzt,
  tz,
  land,
  rolle,
  erledigt = null,
  offlineSeit = null,
  geraete = null,
  links,
  eingeklappt = false,
}: {
  d: HnDaten;
  jetzt: number;
  tz: string;
  land: string | null | undefined;
  rolle: string | null | undefined;
  erledigt?: ReadonlySet<string> | null;
  /** gezeigter Stand ist der letzte gemerkte (offline), abgerufen um … */
  offlineSeit?: number | null;
  geraete?: GuideGeraete | null;
  links: HnLinks;
  eingeklappt?: boolean;
}) {
  const darf = rolle === 'owner' || rolle === 'admin';
  const zustand = hnZustand(d);
  const amp = ampelAnzeige(d.ampel_gesamt, { eisregen: eisregenInSicht(d), jetztLage: glaetteJetzt(d, jetzt, tz) });
  const gefahr = (d.ampel_gesamt ?? 0) >= 1;
  // Grün/unbekannt eingeklappt, ab gelb offen; der Knopf merkt sich die Wahl nur bis zum Neuladen
  const [offen, setOffen] = useState<boolean | null>(null);
  const auf = offen ?? (gefahr && !eingeklappt);
  const breit = useMemo(() => streifen(d.stunden, 12), [d.stunden]);
  const schmal = useMemo(() => streifen(d.stunden, 6), [d.stunden]);
  const titel = hnTitel(jetzt, tz);
  const m = morgenSatz(d, jetzt, tz, offlineSeit ?? jetzt);
  const betr = betroffenZeile(d, erledigt);
  const hinweisAmtlich = amtlichHinweis(d, land);
  const weck = d.morgen.zeit;

  if (zustand === 'ohne_standort') {
    return (
      <section className="card hn hn-au" aria-label={`Wetter ${titel}`}>
        <div className="hn-kopf">
          <h2>{titel}</h2>
        </div>
        <p className="hn-lage">
          Für deine Objekte ist noch kein Standort bekannt. <Link to={links.objekte}>Standort im Objekt eintragen ›</Link>
        </p>
      </section>
    );
  }

  return (
    <section className={`card hn ${amp.klasse}`} aria-labelledby="hn-titel">
      <div className="hn-kopf">
        <h2 id="hn-titel">{titel}</h2>
        {zustand === 'karte' && (
          <span className={`hn-ampel ${amp.klasse}`}>
            <b aria-hidden="true">{amp.zeichen}</b> {amp.wort}
          </span>
        )}
        <span className="hn-platz" />
        {zustand === 'karte' && (
          <button type="button" className="btn ghost small hn-auf" aria-expanded={auf} onClick={() => setOffen(!auf)}>
            {auf ? <ChevronUp className="i" aria-hidden /> : <ChevronDown className="i" aria-hidden />}
            {auf ? 'Weniger' : 'Stunden anzeigen'}
          </button>
        )}
      </div>

      {d.guide_gestoert_seit && Number.isFinite(Date.parse(d.guide_gestoert_seit)) && (
        <p className="hn-warn" role="status">
          Wetter-Guide gestört seit {standText(Date.parse(d.guide_gestoert_seit), jetzt, tz)} – Wetterlage bitte selbst prüfen.
        </p>
      )}
      {offlineSeit !== null && (
        <p className="hn-warn" role="status">
          Stand {standText(offlineSeit, jetzt, tz)}, offline – ohne Verbindung keine aktuelle Prognose für {weck}.
        </p>
      )}

      {zustand === 'neu' ? (
        <p className="hn-lage">Wetter wird geladen – in ca. 15 Min. da.</p>
      ) : (
        <>
          {d.lage.satz && <p className="hn-lage">{d.lage.satz}</p>}
          {auf && (
            <>
              <div className="hn-streifen-rahmen" role="img" aria-label={vorleseSatz(d, jetzt, tz, offlineSeit ?? jetzt)}>
                <Spalten spalten={breit} tz={tz} art="breit" />
                <Spalten spalten={schmal} tz={tz} art="schmal" />
              </div>
              {(d.amtlich ?? [])
                // nennt der Lage-Satz die Warnung schon, steht sie nicht doppelt da (Stufe immer als Wort)
                .filter((a) => !(d.lage.satz ?? '').includes(amtlichArt(a)))
                .slice(0, 3)
                .map((a, i) => (
                  <p key={i} className="hn-zeile">
                    {amtlichZeile(a, tz)}
                  </p>
                ))}
            </>
          )}
          {m && (
            <p className={`hn-morgen hn-m-${m.ton}`}>
              <b>{m.satz}</b>
              {m.grund && auf && <span className="muted"> – {m.grund}</span>}
            </p>
          )}
          {auf && betr && <p className="hn-zeile">{betr}</p>}
          {auf && d.ohne_standort_n > 0 && (
            <p className="hn-zeile">
              <Link to={links.objekte}>
                {d.ohne_standort_n} {d.ohne_standort_n === 1 ? 'Objekt' : 'Objekte'} ohne Standort – nicht überwacht ›
              </Link>
            </p>
          )}
          {/* Wetter-Guide-Ereignisse: nur wenn der Server sie schickt (Pro/Probe) */}
          {auf && d.ereignisse && d.ereignisse.length > 0 && (
            <ul className="hn-ereignisse">
              {d.ereignisse.slice(0, 3).map((e, i) => (
                <li key={i}>{ereignisZeile(e, jetzt, tz)}</li>
              ))}
            </ul>
          )}
          {auf && <GeraeteZeile d={d} darf={darf} rolle={rolle} geraete={geraete} links={links} />}
        </>
      )}

      <p className="hn-fuss">
        {fussZeile(d, jetzt, tz)}
        {hinweisAmtlich && auf ? ` · ${hinweisAmtlich}` : ''}
      </p>
    </section>
  );
}

/** Pro/Geräte (5.3, Paywall 2a): Free-Inhaber → „mit Pro ›“, Free andere → „Pro schließt der Inhaber ab.“, Pro-Inhaber/
 * Verwalter → „Wetter-Guide aktiv auf X von Y Handys ›“. Der Browser selbst ist kein Gerät für Mitteilungen. */
function GeraeteZeile({ d, darf, rolle, geraete, links }: { d: HnDaten; darf: boolean; rolle: string | null | undefined; geraete: GuideGeraete | null; links: HnLinks }) {
  if (!d.morgen.pro) {
    if (rolle === 'owner')
      return (
        <p className="hn-zeile">
          <Link to={links.abo}>Frühwarnung {d.morgen.zeit} aufs Handy: mit Pro ›</Link>
        </p>
      );
    return <p className="hn-zeile muted">Frühwarnung aufs Handy: Pro schließt der Inhaber ab.</p>;
  }
  if (darf && geraete && geraete.gesamt > 0)
    return (
      <p className="hn-zeile">
        <Link to={links.team}>
          Wetter-Guide aktiv auf {geraete.aktiv} von {geraete.gesamt} Handys ›
        </Link>
      </p>
    );
  return null;
}
