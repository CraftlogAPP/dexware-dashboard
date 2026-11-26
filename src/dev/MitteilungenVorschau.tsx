// Nur Entwicklung: /vorschau?app=winterdex&seite=mitteilungen[&id=41][&zustand=leer|gestoert][&teil=glocke]
// Mitteilungs-Center mit Beispieldaten (Vertrag v1 von meine_mitteilungen, Texte wie aus Alex' Feldtest 26.11.): Kopfzeile
// wie im WinterDex-Bereich mit der Glocke, darunter „Alle Mitteilungen“ bzw. mit &id=… die Detailseite samt Karte „Heute
// Nacht“ (Beispieldaten der PGlite-Probe). Kein Server, kein Login, kein localStorage („gesehen“ nur im Speicher der Seite).
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, LogOut, Truck } from 'lucide-react';
import { APPS, appIcon } from '../apps/registry';
import { MitteilungAnsicht, MitteilungsGlocke } from '../winterdex/MitteilungsCenter';
import { MtKontext, type MtStand } from '../winterdex/mitteilungenKontext';
import { mitteilungenLesen, neuZahl } from '../winterdex/mitteilungenDaten';
import { MitteilungenSeite } from '../winterdex/pages/Mitteilungen';
import { HeuteNachtKarte } from '../winterdex/HeuteNacht';
import { heuteNachtLesen } from '../winterdex/heuteNachtDaten';
import { HN_PROBE } from '../winterdex/wetterDemo';

const TZ = 'Europe/Vienna';
/** Do 26.11.2026, 10:00 Wien */
const JETZT = Date.parse('2026-11-26T09:00:00Z');
const BASIS = '/vorschau?app=winterdex&seite=mitteilungen';

const DEMO = {
  v: 1,
  mitteilungen: [
    { id: 41, kart: 'K10', art_name: 'Schnee-Wecker', titel: '❄️ Schnee-Wecker', text: 'Schneefall setzt ein: ca. 3–5 cm bis 05:00 bei 4 Objekten.', kurz: 'Schneefall setzt ein: ca. 3–5 cm bis 05:00 bei 4 Objekten.', zeit: '2026-11-26T03:12:00+00:00', kritisch: true },
    {
      id: 40,
      kart: 'K9',
      art_name: 'Amtliche Warnung',
      titel: 'Amtliche Warnung',
      text: 'Gelbe Schneewarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 14:00 – Graz (GeoSphere Austria). 1 Objekt betroffen. Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00 – Graz (GeoSphere Austria). 1 Objekt betroffen.',
      kurz: 'Graz: Glatteis bis 09:00, Schnee bis 14:00 (gelb). 1 Objekt betroffen.',
      zeit: '2026-11-25T23:30:00+00:00',
      kritisch: false,
    },
    { id: 38, kart: 'TEST', art_name: 'Test', titel: 'Testmitteilung', text: 'Mitteilungen kommen an.', kurz: 'Mitteilungen kommen an.', zeit: '2026-11-25T22:59:00+00:00', kritisch: false },
    { id: 37, kart: 'K1', art_name: 'Vorabend-Lage', titel: 'Heute Nacht Glätte möglich', text: 'Heute Nacht Glätte möglich ab ca. 02:00 – 3 Objekte. Frühwarnung um 02:45, falls es glatt wird.', kurz: 'Glätte möglich ab ca. 02:00 – 3 Objekte.', zeit: '2026-11-25T18:00:00+00:00', kritisch: false },
    { id: 36, kart: 'K2', art_name: 'Glätte-Frühwarnung', titel: 'Glätte-Frühwarnung', text: 'Glätte bis ca. 09:00 möglich – 3 Objekte betroffen.', kurz: 'Glätte bis ca. 09:00 möglich – 3 Objekte.', zeit: '2026-11-25T01:45:00+00:00', kritisch: false },
    { id: 35, kart: 'K5', art_name: 'Achtung Glatteis', titel: 'Achtung Glatteis', text: 'Gefrierender Regen ab ca. 21:30 erwartet – 1 Objekt (Pirching am Traubenberg). Vorbeugend streuen.', kurz: 'Gefrierender Regen ab ca. 21:30 – 1 Objekt.', zeit: '2026-11-24T20:42:00+00:00', kritisch: true },
  ],
};

export function MitteilungenVorschau({ params }: { params: URLSearchParams }) {
  const app = APPS.find((a) => a.id === 'winterdex')!;
  const style = { '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties;
  const zustand = params.get('zustand');
  const id = params.get('id');
  const [platz, setPlatz] = useState<HTMLElement | null>(null);
  const [gesehen, setGesehen] = useState<number | null>(null);
  const liste = useMemo(() => (zustand === 'leer' ? [] : (mitteilungenLesen(DEMO) ?? [])), [zustand]);
  const pfad = useCallback((x?: string) => (x ? `${BASIS}&id=${encodeURIComponent(x)}` : BASIS), []);
  const alsGesehen = useCallback(() => {
    if (liste.length) setGesehen((g) => Math.max(g ?? 0, liste[0].ms));
  }, [liste]);
  const st: MtStand = useMemo(
    () => ({
      da: true,
      laedt: false,
      liste,
      abgerufen: JETZT,
      gestoert: zustand === 'gestoert',
      gesehen,
      neu: neuZahl(liste, gesehen, JETZT),
      tz: TZ,
      basis: BASIS,
      pfad,
      alsGesehen,
    }),
    [liste, zustand, gesehen, pfad, alsGesehen],
  );
  const m = id ? liste.find((x) => x.id === id) : null;
  // teil=glocke: nur die Kopfzeile (die Seite „Alle Mitteilungen“ setzt den Zähler sonst sofort auf 0)
  const nurGlocke = params.get('teil') === 'glocke';
  const hn = useMemo(() => {
    const d = heuteNachtLesen(HN_PROBE)!;
    return { ...d, karte_live: true };
  }, []);
  const links = { objekte: BASIS, team: BASIS, abo: BASIS };

  return (
    <div className="app-scope" style={style}>
      <MtKontext.Provider value={st}>
        {/* Kopfzeile wie AppArea mit WinterDex-Zusatz (Glocke + „Außendienst“), angemeldet */}
        <header className="site-header has-action">
          <Link className="brand" to="/" aria-label="Dexware Dashboard – alle Apps">
            <img src="/dexware.webp" alt="" width="28" height="28" />
            <span className="wm">
              Dex<span>ware</span>
            </span>
          </Link>
          <span className="header-sep" aria-hidden />
          <span className="app-chip">
            <img src={appIcon(app.id)} alt="" width="24" height="24" />
            {app.name} <span className="hide-sm">Dashboard</span>
          </span>
          <div className="spacer" />
          <span className="mt-platz" ref={setPlatz} />
          <Link className="btn small mode-field" to={BASIS}>
            <Truck className="i" aria-hidden /> Außendienst
          </Link>
          <Link className="btn ghost small all-dash" to="/">
            <LayoutGrid className="i" aria-hidden />
            <span className="hide-sm">Alle Dashboards</span>
          </Link>
          <span className="header-user">
            <span className="email">konto@beispiel.example</span>
            <button className="btn ghost small" type="button">
              <LogOut className="i" aria-hidden />
              <span className="hide-sm">Abmelden</span>
            </button>
          </span>
        </header>
        <MitteilungsGlocke platz={platz} />
        <div className="page">
          {m ? (
            <MitteilungAnsicht m={m} tz={TZ} zurueck={BASIS} karte={<HeuteNachtKarte d={hn} jetzt={Date.parse('2026-11-25T21:32:00Z')} tz={TZ} land="AT" rolle="owner" links={links} />} />
          ) : nurGlocke ? (
            <p className="muted">Vorschau Mitteilungs-Center: Glocke oben rechts.</p>
          ) : (
            <MitteilungenSeite />
          )}
        </div>
      </MtKontext.Provider>
    </div>
  );
}
