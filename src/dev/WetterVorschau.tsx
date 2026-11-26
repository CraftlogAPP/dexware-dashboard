// Nur Entwicklung: /vorschau?app=winterdex&seite=wetter[&zustand=…][&rolle=owner|admin|worker][&breit=1]
// Wetter-Guide mit Beispieldaten (echte Antworten der WinterDex-Proben, src/winterdex/wetterDemo.ts): Karte „Heute Nacht“
// in allen Zuständen, Wetterverlauf im Einsatz-/Fahrt-Detail, Team-Karte „Wetter-Guide“. Kein Server, kein Login.
//   zustand = eisregen (Standard, Pro, Frühwarnung voraussichtlich ja) | gruen | free | de | neu | gestoert | offline |
//             ohne-standort | gesendet | tag (Vormittag, „noch 2 von 3 offen“)
import { APPS } from '../apps/registry';
import { HeuteNachtKarte } from '../winterdex/HeuteNacht';
import { heuteNachtLesen, type HeuteNacht } from '../winterdex/heuteNachtDaten';
import { WetterVerlauf } from '../winterdex/WetterZeitleiste';
import { WetterGuideTeil } from '../winterdex/GlaetteFruehwarnung';
import { belegLesen, type WetterBeleg } from '../winterdex/wetterBeleg';
import { BELEGE_PROBE, HN_PROBE, HN_PROBE_DE } from '../winterdex/wetterDemo';
import type { GuideStand } from '../winterdex/wetterGuide';

const TZ = 'Europe/Vienna';
/** 25.11.2026 22:32 Ortszeit — 5 Minuten nach dem Stand der Probe */
const ABEND = Date.parse('2026-11-25T21:32:00Z');
/** 26.11.2026 09:40 Ortszeit */
const VORMITTAG = Date.parse('2026-11-26T08:40:00Z');

function hnFuer(zustand: string): { d: HeuteNacht; jetzt: number; offline: number | null; erledigt: Set<string> | null } {
  const basis = heuteNachtLesen(zustand === 'de' ? HN_PROBE_DE : HN_PROBE)!;
  const d: HeuteNacht = structuredClone(basis);
  d.karte_live = true;
  d.morgen = { ...d.morgen, pro: true, erwartet: 'ja', grund: 'gefrierender Regen seit ca. 21:30, Glatteis möglich' };
  d.ereignisse = [
    {
      art: 'eisregen',
      status: 'laeuft',
      beginn: '2026-11-25T20:30:00Z',
      ende: '2026-11-26T02:00:00Z',
      menge_klasse: null,
      objekte: 1,
      strecken: 0,
      gemeinde: 'Pirching am Traubenberg',
      mitteilung: {
        art: 'K5',
        at: '2026-11-25T20:42:00Z',
        titel: 'Achtung Glatteis',
        text: 'Gefrierender Regen ab ca. 21:30 erwartet – 1 Objekt (Pirching am Traubenberg). Vorbeugend streuen.',
      },
    },
  ];
  let jetzt = ABEND;
  let offline: number | null = null;
  let erledigt: Set<string> | null = null;
  switch (zustand) {
    case 'gruen':
      d.stunden = d.stunden.map((s) => ({ ...s, ampel: 0, art: 'trocken', mm: 0, schnee_cm: null, t: (s.t ?? 0) + 4 }));
      d.ampel_gesamt = 0;
      d.lage = { satz: 'Trocken, Tiefstwert ca. 2 °C gegen 06:00.', betroffen_orte: '0 von 3' };
      d.je_ort = d.je_ort.map((o) => ({ ...o, ampel: 0 }));
      d.amtlich = [];
      d.morgen = { ...d.morgen, erwartet: 'nein', grund: null };
      d.ereignisse = [];
      break;
    case 'free':
      d.morgen = { ...d.morgen, pro: false };
      d.ereignisse = null; // Paywall: der Server schickt ohne Pro keine Ereignisse
      break;
    case 'de':
      d.morgen = { ...d.morgen, erwartet: 'knapp', grund: 'Reif möglich (Tiefstwert ca. −4 °C)' };
      d.ereignisse = [];
      break;
    case 'neu':
      d.stand_at = null;
      d.stunden = d.stunden.map((s) => ({ ...s, ampel: null, t: null, mm: null, art: null, schnee_cm: null }));
      d.ampel_gesamt = null;
      d.lage = { satz: null, betroffen_orte: null };
      d.morgen = { ...d.morgen, erwartet: null, grund: null };
      d.ereignisse = [];
      break;
    case 'gestoert':
      d.guide_gestoert_seit = '2026-11-25T20:15:00Z';
      jetzt = ABEND + 5 * 3_600_000;
      break;
    case 'offline':
      offline = ABEND - 50 * 60_000;
      break;
    case 'ohne-standort':
      d.gebiet = { ...d.gebiet, zellen: 0, objekte: 0 };
      d.ohne_standort_n = 4;
      break;
    case 'gesendet':
      d.morgen = { ...d.morgen, gesendet_at: '2026-11-26T01:45:00Z' };
      jetzt = Date.parse('2026-11-26T02:10:00Z');
      break;
    case 'abend-gruen':
      // 17:00: die nächsten 12 Std. trocken (grün), Frühwarnung bis 10:00 erwartet „ja“ (Schnee ab 06:00) → nie „✓“, gelb + offen
      jetzt = Date.parse('2026-11-26T16:00:00Z');
      d.stand_at = '2026-11-26T15:57:00Z';
      d.stunden = d.stunden.map((s, i) => (i < 12 ? { ...s, ampel: 0, art: 'trocken', mm: 0, schnee_cm: null } : s));
      d.ampel_gesamt = 0;
      d.lage = { satz: 'Trocken, Tiefstwert ca. −1 °C gegen 04:00.', betroffen_orte: '0 von 3' };
      d.je_ort = d.je_ort.map((o) => ({ ...o, ampel: 0 }));
      d.amtlich = [];
      d.morgen = { ...d.morgen, erwartet: 'ja', grund: 'Schneefall ab ca. 06:00, bis 10:00 ca. 1–3 cm' };
      d.ereignisse = [];
      break;
    case 'tag':
      jetzt = VORMITTAG;
      d.stand_at = '2026-11-26T08:27:00Z';
      d.ohne_standort_n = 1;
      erledigt = new Set([d.je_ort[0]?.ref_id ?? '']);
      break;
  }
  return { d, jetzt, offline, erledigt };
}

const GUIDE_DEMO: GuideStand = {
  live: true,
  geraete: {
    pro: true,
    aktiv: 3,
    gesamt: 5,
    mitglieder: [
      { name: 'inhaber@musterbetrieb.example', rolle: 'owner', status: 'aktiv' },
      { name: 'verwaltung@musterbetrieb.example', rolle: 'admin', status: 'aktiv' },
      { name: 'fahrer1@musterbetrieb.example', rolle: 'worker', status: 'aktiv' },
      { name: 'fahrer2@musterbetrieb.example', rolle: 'worker', status: 'bekommt_keine' },
      { name: 'fahrer3@musterbetrieb.example', rolle: 'worker', status: 'zustellung_fehlgeschlagen' },
    ],
  },
  mitteilungen: [
    {
      id: 3,
      kart: 'K5',
      titel: 'Achtung Glatteis',
      text: 'Gefrierender Regen ab ca. 21:30 erwartet – 1 Objekt (Pirching am Traubenberg). Vorbeugend streuen.',
      geraete: 3,
      status: 'gesendet',
      erstellt_at: '2026-11-25T20:42:00Z',
      gesendet_at: '2026-11-25T20:42:05Z',
    },
    {
      id: 2,
      kart: 'K9',
      titel: 'Amtliche Warnung',
      text: 'Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00 – Pirching am Traubenberg (GeoSphere Austria). 1 Objekt betroffen.',
      geraete: 3,
      status: 'gesendet',
      erstellt_at: '2026-11-25T17:12:00Z',
      gesendet_at: '2026-11-25T17:12:03Z',
    },
    {
      id: 1,
      kart: 'TEST',
      titel: 'Glätte-Frühwarnung (Test)',
      text: 'So kommt deine Warnung an. Echte Warnungen kommen nur bei Gefahr.',
      geraete: 1,
      status: 'gesendet',
      erstellt_at: '2026-11-25T16:02:00Z',
      gesendet_at: '2026-11-25T16:02:01Z',
    },
  ],
};

export function WetterVorschau({ params }: { params: URLSearchParams }) {
  const app = APPS.find((a) => a.id === 'winterdex')!;
  const style = { '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties;
  const zustand = params.get('zustand') ?? 'eisregen';
  const rolle = params.get('rolle') ?? 'owner';
  const { d, jetzt, offline, erledigt } = hnFuer(zustand);
  const belege = BELEGE_PROBE.map(belegLesen).filter((b): b is WetterBeleg => !!b);
  const einsatz = belege.find((b) => b.id === 101)!;
  const fahrt = belege.find((b) => b.run_id)!;
  const nachtrag = belege.find((b) => b.stufe === 'nachtrag')!;
  const links = { objekte: '/vorschau?app=winterdex&seite=wetter', team: '/vorschau?app=winterdex&seite=wetter#team', abo: '/vorschau?app=winterdex&seite=wetter' };
  const teil = params.get('teil');
  return (
    <div className="app-scope" style={style}>
      <div className="page">
        {(!teil || teil === 'karte') && (
          <>
            <h1>Übersicht</h1>
            <p className="muted" style={{ marginTop: -6 }}>
              Vorschau Wetter-Guide · Zustand „{zustand}“ · Rolle {rolle}
            </p>
            {/* eingeklappt=1: wie im Außendienst (Karte startet immer eingeklappt) */}
            <HeuteNachtKarte d={d} jetzt={jetzt} tz={TZ} land={zustand === 'de' ? 'DE' : 'AT'} rolle={rolle} erledigt={erledigt} offlineSeit={offline} geraete={GUIDE_DEMO.geraete} links={links} eingeklappt={params.get('eingeklappt') === '1'} />
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Aktive Objekte</div>
                <div className="kpi-value">3</div>
                <div className="kpi-sub">3 insgesamt</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Einsätze 24 h</div>
                <div className="kpi-value">1</div>
                <div className="kpi-sub">ohne Stornos</div>
              </div>
            </div>
          </>
        )}
        {(!teil || teil === 'verlauf') && (
          <>
            <h1>Einsatz · 26.11.2026, 05:50 Uhr</h1>
            <WetterVerlauf info={{ stand: 'da', beleg: einsatz }} bezug="operation" tz={TZ} pruefen={false} />
            <WetterVerlauf info={{ stand: 'da', beleg: fahrt }} bezug="run" tz={TZ} pruefen={false} />
            <WetterVerlauf info={{ stand: 'da', beleg: nachtrag }} bezug="operation" tz="Europe/Berlin" pruefen={false} />
            <WetterVerlauf info={{ stand: 'nur_pro', beleg: null }} bezug="operation" tz={TZ} />
            <WetterVerlauf info={{ stand: 'wird_ermittelt', beleg: null }} bezug="run" tz={TZ} />
          </>
        )}
        {(!teil || teil === 'team') && (
          <div id="team" className="card wg" style={{ marginTop: 24 }}>
            <div className="section-head" style={{ margin: 0 }}>
              <h2>Wetter-Guide</h2>
            </div>
            <p style={{ marginBottom: 6 }}>
              Glätte-Frühwarnung morgens um <b>02:45 Uhr</b> (Standard)
            </p>
            <WetterGuideTeil
              g={rolle === 'worker' ? { ...GUIDE_DEMO, geraete: null } : GUIDE_DEMO}
              darf={rolle !== 'worker'}
              inhaber={rolle === 'owner'}
              tz={TZ}
              betrieb="Musterbetrieb Winterdienst"
              anschrift="Hauptplatz 1, 8010 Graz"
            />
          </div>
        )}
      </div>
    </div>
  );
}
