// Beispieldaten Wetter-Guide (Vorschau /vorschau?app=winterdex&seite=wetter und tests/wetter-dashboard.test.mjs).
// ERZEUGT aus echten Antworten der WinterDex-Proben vom 26.11.2026 (keine Kundendaten): heute_nacht aus der PGlite-Probe
// supabase/tests/wetter-karte.test.mjs (Graz/Pirching/Eggenburg, gefrierender Regen, amtliche Warnungen; München = DE) und
// Belege aus backend/test/wetter-beleg.test.mjs (Worker beleg.ts). Prüfcodes hier erfunden (SHA-256 über die Testdaten).
// Nicht von Hand ändern — neu erzeugen, wenn sich der Vertrag ändert.

/** heute_nacht (Vertrag v1) — Österreich, Stand 25.11.2026 22:27 Ortszeit, karte_live false wie in der Probe */
export const HN_PROBE: unknown = {
 "v": 1,
 "lage": {
  "satz": "Achtung: gefrierender Regen seit ca. 21:30. Amtlich: Gelbe Glatteiswarnung bis Do 09:00 (GeoSphere Austria).",
  "betroffen_orte": "3 von 3"
 },
 "gebiet": {
  "name": "Pirching am Traubenberg",
  "zellen": 3,
  "objekte": 3,
  "strecken": 0,
  "spanne_km": 188
 },
 "je_ort": [
  {
   "art": "objekt",
   "ampel": 3,
   "grund": null,
   "ref_id": "d0000000-0000-4000-8000-000000000001"
  },
  {
   "art": "objekt",
   "ampel": 2,
   "grund": null,
   "ref_id": "d0000000-0000-4000-8000-000000000002"
  },
  {
   "art": "objekt",
   "ampel": 2,
   "grund": null,
   "ref_id": "d0000000-0000-4000-8000-000000000003"
  }
 ],
 "morgen": {
  "pro": false,
  "zeit": "02:45",
  "grund": null,
  "erwartet": null,
  "gesendet_at": null
 },
 "quelle": "geosphere",
 "amtlich": [
  {
   "bis": "2026-11-26T13:00:00+00:00",
   "typ": 3,
   "von": "2026-11-25T23:00:00+00:00",
   "text": "Gelbe Schneewarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 14:00",
   "stufe": 1,
   "gemeinde": "Pirching am Traubenberg"
  },
  {
   "bis": "2026-11-26T23:00:00+00:00",
   "typ": 3,
   "von": "2026-11-25T23:00:00+00:00",
   "text": "Gelbe Schneewarnung von Do, 26.11.2026 00:00 bis Fr, 27.11.2026 00:00",
   "stufe": 1,
   "gemeinde": "Eggenburg"
  },
  {
   "bis": "2026-11-26T08:00:00+00:00",
   "typ": 4,
   "von": "2026-11-25T23:00:00+00:00",
   "text": "Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00",
   "stufe": 1,
   "gemeinde": "Pirching am Traubenberg"
  }
 ],
 "stunden": [
  {
   "t": -0.6,
   "mm": 0.6,
   "ts": "2026-11-25T21:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.1,
    0.3
   ]
  },
  {
   "t": -0.6,
   "mm": 1.2,
   "ts": "2026-11-25T22:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.2,
    0.7
   ]
  },
  {
   "t": -0.6,
   "mm": 1.2,
   "ts": "2026-11-25T23:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.2,
    0.7
   ]
  },
  {
   "t": 0,
   "mm": 0.74,
   "ts": "2026-11-26T00:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.1,
    0.2
   ]
  },
  {
   "t": -0.2,
   "mm": 0.18,
   "ts": "2026-11-26T01:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.1,
    0.1
   ]
  },
  {
   "t": -0.4,
   "mm": 0.15,
   "ts": "2026-11-26T02:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.1,
    0.1
   ]
  },
  {
   "t": -0.4,
   "mm": 0.78,
   "ts": "2026-11-26T03:00:00Z",
   "art": "gefrierend",
   "ampel": 3,
   "schnee_cm": [
    0.1,
    0.2
   ]
  },
  {
   "t": -0.5,
   "mm": 1.78,
   "ts": "2026-11-26T04:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.2,
    0.5
   ]
  },
  {
   "t": -0.6,
   "mm": 2.37,
   "ts": "2026-11-26T05:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.3,
    0.7
   ]
  },
  {
   "t": -0.6,
   "mm": 3.23,
   "ts": "2026-11-26T06:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.6,
    1.2
   ]
  },
  {
   "t": -0.6,
   "mm": 4.83,
   "ts": "2026-11-26T07:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.4,
    0.8
   ]
  },
  {
   "t": -0.4,
   "mm": 1.06,
   "ts": "2026-11-26T08:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.4,
    0.8
   ]
  },
  {
   "t": -0.2,
   "mm": 0.98,
   "ts": "2026-11-26T09:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.4,
    0.8
   ]
  },
  {
   "t": 0,
   "mm": 1.41,
   "ts": "2026-11-26T10:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.4,
    0.9
   ]
  },
  {
   "t": 0.2,
   "mm": 1.91,
   "ts": "2026-11-26T11:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.5,
    0.9
   ]
  },
  {
   "t": 0.7,
   "mm": 2.6,
   "ts": "2026-11-26T12:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.6,
    1.2
   ]
  },
  {
   "t": 1,
   "mm": 2.6,
   "ts": "2026-11-26T13:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.6,
    1.2
   ]
  },
  {
   "t": 0.7,
   "mm": 1.22,
   "ts": "2026-11-26T14:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.4,
    0.9
   ]
  },
  {
   "t": 0,
   "mm": 0.61,
   "ts": "2026-11-26T15:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.3,
    0.6
   ]
  },
  {
   "t": -0.2,
   "mm": 0.34,
   "ts": "2026-11-26T16:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.2,
    0.3
   ]
  },
  {
   "t": -0.3,
   "mm": 0.27,
   "ts": "2026-11-26T17:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.1,
    0.3
   ]
  },
  {
   "t": -0.4,
   "mm": 0.34,
   "ts": "2026-11-26T18:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.2,
    0.3
   ]
  },
  {
   "t": -0.4,
   "mm": 0.13,
   "ts": "2026-11-26T19:00:00Z",
   "art": "schnee",
   "ampel": 2,
   "schnee_cm": [
    0.1,
    0.1
   ]
  },
  {
   "t": -0.3,
   "mm": 0.05,
   "ts": "2026-11-26T20:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": [
    0,
    0.1
   ]
  }
 ],
 "stand_at": "2026-11-25T21:27:00+00:00",
 "ereignisse": null,
 "karte_live": false,
 "ampel_gesamt": 3,
 "ohne_standort_n": 0,
 "guide_live_arten": [],
 "letzte_mitteilung": null,
 "guide_gestoert_seit": null
};

/** heute_nacht — Deutschland (München, Open-Meteo, amtlich null) */
export const HN_PROBE_DE: unknown = {
 "v": 1,
 "lage": {
  "satz": "Trocken, Tiefstwert ca. −4 °C gegen 22:00 – Reif möglich.",
  "betroffen_orte": "1 von 1"
 },
 "gebiet": {
  "name": null,
  "zellen": 1,
  "objekte": 1,
  "strecken": 0,
  "spanne_km": 0
 },
 "je_ort": [
  {
   "art": "objekt",
   "ampel": 1,
   "grund": null,
   "ref_id": "d0000000-0000-4000-8000-0000000000de"
  }
 ],
 "morgen": {
  "pro": false,
  "zeit": "02:45",
  "grund": null,
  "erwartet": null,
  "gesendet_at": null
 },
 "quelle": "open-meteo",
 "amtlich": null,
 "stunden": [
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-25T21:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-25T22:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-25T23:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T00:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T01:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T02:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T03:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T04:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T05:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T06:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T07:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T08:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T09:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T10:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T11:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T12:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T13:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T14:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T15:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T16:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T17:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T18:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T19:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  },
  {
   "t": -4,
   "mm": 0,
   "ts": "2026-11-26T20:00:00Z",
   "art": "trocken",
   "ampel": 1,
   "schnee_cm": null
  }
 ],
 "stand_at": "2026-11-25T21:27:00+00:00",
 "ereignisse": null,
 "karte_live": false,
 "ampel_gesamt": 1,
 "ohne_standort_n": 0,
 "guide_live_arten": [],
 "letzte_mitteilung": null,
 "guide_gestoert_seit": null
};

/** Belege (wetter_beleg-Zeilen): Einsatz (Alex' Beispiel + amtlich), Räumzeit, Eisregen, Nachtrag DE, Fahrt über 2 Zellen */
export const BELEGE_PROBE: unknown[] = [
 {
  "id": 101,
  "operation_id": "e0000000-0000-4000-8000-000000000001",
  "run_id": null,
  "stufe": "verlauf",
  "satz": "Schneefall ca. 01:15–05:30 (Neuschnee grob 3–5 cm, geschätzt), danach trocken · Einsatz ab 05:50",
  "kurz": "Schneefall endete ca. 05:30 · Einsatz ab 05:50",
  "fakten": {
   "v": 1,
   "regel": "wv1",
   "nachweis": {
    "art": "einsatz",
    "beginn": 1795668620,
    "ende": null
   },
   "zeitraum": {
    "von": 1795625100,
    "bis": 1795676400
   },
   "grundlage": "analyse",
   "fall": "vorher",
   "zellen": [
    {
     "z": "z4707_1029",
     "land": "AT",
     "gemeinde": "Graz",
     "abdeckung": 100,
     "analyse": true,
     "stunden": "analyse"
    }
   ],
   "phasen": [
    {
     "z": "z4707_1029",
     "art": "schnee",
     "beginn": 1795652100,
     "ende": 1795667400,
     "ende_bestaetigt": true,
     "mm": 5.1,
     "cm": [
      2.5,
      5.1
     ],
     "luecke": false
    }
   ],
   "stunden": [
    {
     "von": 1795622400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": false,
     "quelle": "analyse"
    },
    {
     "von": 1795626000,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795629600,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795633200,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795636800,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795640400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795644000,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795647600,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795651200,
     "mm": 0.9,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795654800,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795658400,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795662000,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795665600,
     "mm": 0.6,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795669200,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795672800,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    }
   ],
   "luecken": [],
   "tmin": -1,
   "mm_summe": 5.1,
   "amtlich": [
    {
     "warnid": 4877,
     "chgid": 2,
     "verlaufid": 2,
     "typ": 4,
     "stufe": 1,
     "beginn": 1795647600,
     "ende": 1795680000,
     "wortlaut": true,
     "text": "Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00",
     "gemeinde": "Graz",
     "gespeichert_at": 1795646520,
     "satz": "Amtliche Warnung (GeoSphere Austria): Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00 – Graz (in WinterDex gespeichert am 25.11. um 23:42)"
    }
   ],
   "amtlich_gespeichert": true,
   "pflicht_ab": null,
   "vermerk": null,
   "fusszeile": "Wetterangaben sind Analyse- und Modellwerte für den Objektstandort und können örtlich abweichen (Schauer, Höhenlage, Beschattung). § 93 StVO legt keine feste Wartezeit nach Ende des Schneefalls fest; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden. Datensatz und Zeitraum sind angegeben, damit die Werte unabhängig geprüft werden können."
  },
  "quellen": [
   {
    "code": "geosphere-nowcast",
    "datensatz": "nowcast-v1-15min-1km",
    "abfrage": "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km (Schritt 0 = Analyse, alle 15 Min. abgerufen und gespeichert)",
    "zeitraum": [
     1795625100,
     1795676400
    ],
    "lizenz": "CC BY 4.0",
    "text": "Wetterdaten: GeoSphere Austria – data.hub.geosphere.at, Lizenz CC BY 4.0 (creativecommons.org/licenses/by/4.0). Kurzfrist-Analyse (15 Min.) im 1-km-Raster; nach Daten von GeoSphere Austria, von WinterDex ausgewertet und zusammengefasst, Zeiten auf 15 Min. gerundet, Schneemengen geschätzt."
   }
  ],
  "entry_hash": "3732045512bf3433bbf13425032e80f47c22ea92a68559fa342e9e76968a90fc",
  "erstellt_at": "2026-11-26T07:42:10Z",
  "zeitraum_von": "2026-11-25T16:45:00.000Z",
  "zeitraum_bis": "2026-11-26T07:00:00.000Z",
  "land": "AT"
 },
 {
  "id": 102,
  "operation_id": "e0000000-0000-4000-8000-000000000002",
  "run_id": null,
  "stufe": "verlauf",
  "satz": "Schneefall ca. 01:15–05:30 (Neuschnee grob 3–5 cm, geschätzt), danach trocken · Einsatz ab 05:50 · Räumzeit laut Objekt ab 07:00",
  "kurz": "Schneefall endete ca. 05:30 · Einsatz ab 05:50",
  "fakten": {
   "v": 1,
   "regel": "wv1",
   "nachweis": {
    "art": "einsatz",
    "beginn": 1795668600,
    "ende": null
   },
   "zeitraum": {
    "von": 1795625100,
    "bis": 1795676400
   },
   "grundlage": "analyse",
   "fall": "vorher",
   "zellen": [
    {
     "z": "z4707_1029",
     "land": "AT",
     "gemeinde": "Graz",
     "abdeckung": 100,
     "analyse": true,
     "stunden": "analyse"
    }
   ],
   "phasen": [
    {
     "z": "z4707_1029",
     "art": "schnee",
     "beginn": 1795652100,
     "ende": 1795667400,
     "ende_bestaetigt": true,
     "mm": 5.1,
     "cm": [
      2.5,
      5.1
     ],
     "luecke": false
    }
   ],
   "stunden": [
    {
     "von": 1795622400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": false,
     "quelle": "analyse"
    },
    {
     "von": 1795626000,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795629600,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795633200,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795636800,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795640400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795644000,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795647600,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795651200,
     "mm": 0.9,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795654800,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795658400,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795662000,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795665600,
     "mm": 0.6,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795669200,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795672800,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    }
   ],
   "luecken": [],
   "tmin": -1,
   "mm_summe": 5.1,
   "amtlich": [],
   "amtlich_gespeichert": true,
   "pflicht_ab": "07:00",
   "vermerk": null,
   "fusszeile": "Wetterangaben sind Analyse- und Modellwerte für den Objektstandort und können örtlich abweichen (Schauer, Höhenlage, Beschattung). § 93 StVO legt keine feste Wartezeit nach Ende des Schneefalls fest; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden. Datensatz und Zeitraum sind angegeben, damit die Werte unabhängig geprüft werden können."
  },
  "quellen": [
   {
    "code": "geosphere-nowcast",
    "datensatz": "nowcast-v1-15min-1km",
    "abfrage": "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km (Schritt 0 = Analyse, alle 15 Min. abgerufen und gespeichert)",
    "zeitraum": [
     1795625100,
     1795676400
    ],
    "lizenz": "CC BY 4.0",
    "text": "Wetterdaten: GeoSphere Austria – data.hub.geosphere.at, Lizenz CC BY 4.0 (creativecommons.org/licenses/by/4.0). Kurzfrist-Analyse (15 Min.) im 1-km-Raster; nach Daten von GeoSphere Austria, von WinterDex ausgewertet und zusammengefasst, Zeiten auf 15 Min. gerundet, Schneemengen geschätzt."
   }
  ],
  "entry_hash": "ed3e062745371a1c9474658122afedd7a29ba7fece6513b85b5a2eab41fac49d",
  "erstellt_at": "2026-11-26T07:42:11Z",
  "zeitraum_von": "2026-11-25T16:45:00.000Z",
  "zeitraum_bis": "2026-11-26T07:00:00.000Z",
  "land": "AT"
 },
 {
  "id": 103,
  "operation_id": "e0000000-0000-4000-8000-000000000003",
  "run_id": null,
  "stufe": "verlauf",
  "satz": "Gefrierender Regen laut Analyse ca. 04:00–05:15, danach trocken · Einsatz ab 05:20",
  "kurz": "Gefrierender Regen endete ca. 05:15 · Einsatz ab 05:20",
  "fakten": {
   "v": 1,
   "regel": "wv1",
   "nachweis": {
    "art": "einsatz",
    "beginn": 1795666800,
    "ende": null
   },
   "zeitraum": {
    "von": 1795623300,
    "bis": 1795674600
   },
   "grundlage": "analyse",
   "fall": "vorher",
   "zellen": [
    {
     "z": "z4707_1029",
     "land": "AT",
     "gemeinde": "Graz",
     "abdeckung": 100,
     "analyse": true,
     "stunden": "analyse"
    }
   ],
   "phasen": [
    {
     "z": "z4707_1029",
     "art": "eisregen",
     "beginn": 1795662000,
     "ende": 1795666500,
     "ende_bestaetigt": true,
     "mm": 0.5,
     "cm": null,
     "luecke": false
    }
   ],
   "stunden": [
    {
     "von": 1795622400,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": false,
     "quelle": "analyse"
    },
    {
     "von": 1795626000,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795629600,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795633200,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795636800,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795640400,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795644000,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795647600,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795651200,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795654800,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795658400,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795662000,
     "mm": 0.4,
     "t": -0.5,
     "art": "eisregen",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795665600,
     "mm": 0.1,
     "t": -0.5,
     "art": "eisregen",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795669200,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795672800,
     "mm": 0,
     "t": -0.5,
     "art": "trocken",
     "voll": false,
     "quelle": "analyse"
    }
   ],
   "luecken": [],
   "tmin": -0.5,
   "mm_summe": 0.5,
   "amtlich": [],
   "amtlich_gespeichert": true,
   "pflicht_ab": null,
   "vermerk": null,
   "fusszeile": "Wetterangaben sind Analyse- und Modellwerte für den Objektstandort und können örtlich abweichen (Schauer, Höhenlage, Beschattung). § 93 StVO legt keine feste Wartezeit nach Ende des Schneefalls fest; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden. Datensatz und Zeitraum sind angegeben, damit die Werte unabhängig geprüft werden können."
  },
  "quellen": [
   {
    "code": "geosphere-nowcast",
    "datensatz": "nowcast-v1-15min-1km",
    "abfrage": "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km (Schritt 0 = Analyse, alle 15 Min. abgerufen und gespeichert)",
    "zeitraum": [
     1795623300,
     1795674600
    ],
    "lizenz": "CC BY 4.0",
    "text": "Wetterdaten: GeoSphere Austria – data.hub.geosphere.at, Lizenz CC BY 4.0 (creativecommons.org/licenses/by/4.0). Kurzfrist-Analyse (15 Min.) im 1-km-Raster; nach Daten von GeoSphere Austria, von WinterDex ausgewertet und zusammengefasst, Zeiten auf 15 Min. gerundet, Schneemengen geschätzt."
   }
  ],
  "entry_hash": "aa66f06ce8a250b6f11f8c4b0704dba13a5f8343ace059b2dd9f10313c8a4a8a",
  "erstellt_at": "2026-11-26T07:57:03Z",
  "zeitraum_von": "2026-11-25T16:15:00.000Z",
  "zeitraum_bis": "2026-11-26T06:30:00.000Z",
  "land": "AT"
 },
 {
  "id": 104,
  "operation_id": "e0000000-0000-4000-8000-000000000004",
  "run_id": null,
  "stufe": "nachtrag",
  "satz": "Kein Niederschlag (unter 0,1 mm je Stunde) zwischen 18:00 und 07:00 laut Stundenwerten (Modell) · Tiefstwert ca. 1 °C (Luft, 2 m) · Einsatz ab 06:10",
  "kurz": "Kein Niederschlag laut Stundenwerten seit 18:00 · Einsatz ab 06:10",
  "fakten": {
   "v": 1,
   "regel": "wv1",
   "nachweis": {
    "art": "einsatz",
    "beginn": 1795669800,
    "ende": null
   },
   "zeitraum": {
    "von": 1795626000,
    "bis": 1795677300
   },
   "grundlage": "stunden",
   "fall": "stunden_trocken",
   "zellen": [
    {
     "z": "z5252_893",
     "land": null,
     "gemeinde": null,
     "abdeckung": 0,
     "analyse": false,
     "stunden": "open-meteo"
    }
   ],
   "phasen": [],
   "stunden": [
    {
     "von": 1795626000,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795629600,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795633200,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795636800,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795640400,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795644000,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795647600,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795651200,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795654800,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795658400,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795662000,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795665600,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795669200,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795672800,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    },
    {
     "von": 1795676400,
     "mm": 0,
     "t": 1,
     "art": "trocken",
     "voll": true,
     "quelle": "open-meteo"
    }
   ],
   "luecken": [],
   "tmin": 1,
   "mm_summe": 0,
   "amtlich": [],
   "amtlich_gespeichert": false,
   "pflicht_ab": null,
   "vermerk": "Aus Stundenwerten nachträglich ermittelt am 26.11.2026 (zum Einsatzzeitpunkt nicht gespeichert). Amtliche Warnungen für diesen Standort nicht angebunden.",
   "fusszeile": "Wetterangaben sind Analyse- bzw. Modellwerte für den Standort und können örtlich abweichen. Zeiten und Fristen ergeben sich aus den örtlichen Vorschriften; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden."
  },
  "quellen": [
   {
    "code": "open-meteo",
    "datensatz": "open-meteo forecast (stündlich)",
    "abfrage": "u",
    "abgerufen_at": 0,
    "lizenz": "CC BY 4.0",
    "text": "Wetterdaten: Open-Meteo.com (CC BY 4.0), Modellwerte."
   }
  ],
  "entry_hash": "75b3307981092db99df7d5fc150d78d0ab682b8534500f91da2889c42c1ab20d",
  "erstellt_at": "2026-12-10T10:12:00Z",
  "zeitraum_von": "2026-11-25T17:00:00.000Z",
  "zeitraum_bis": "2026-11-26T07:15:00.000Z",
  "land": "XX"
 },
 {
  "id": 105,
  "operation_id": null,
  "run_id": "f0000000-0000-4000-8000-000000000001",
  "stufe": "verlauf",
  "satz": "Schneefall endete im Streckengebiet ca. 05:15–05:45 (Neuschnee grob 3–5 cm, geschätzt), danach trocken · Fahrt 05:50–06:40",
  "kurz": "Schneefall endete im Streckengebiet ca. 05:15–05:45 · Fahrt ab 05:50",
  "fakten": {
   "v": 1,
   "regel": "wv1",
   "nachweis": {
    "art": "fahrt",
    "beginn": 1795668600,
    "ende": 1795671600
   },
   "zeitraum": {
    "von": 1795625100,
    "bis": 1795679100
   },
   "grundlage": "analyse",
   "fall": "gebiet_vorher",
   "zellen": [
    {
     "z": "z4707_1029",
     "land": "AT",
     "gemeinde": "Graz",
     "abdeckung": 100,
     "analyse": true,
     "stunden": "analyse"
    },
    {
     "z": "z4709_1031",
     "land": "AT",
     "gemeinde": "Graz",
     "abdeckung": 100,
     "analyse": true,
     "stunden": "analyse"
    }
   ],
   "phasen": [
    {
     "z": "z4707_1029",
     "art": "schnee",
     "beginn": 1795651200,
     "ende": 1795666500,
     "ende_bestaetigt": true,
     "mm": 5.1,
     "cm": [
      2.5,
      5.1
     ],
     "luecke": false
    },
    {
     "z": "z4709_1031",
     "art": "schnee",
     "beginn": 1795653000,
     "ende": 1795668300,
     "ende_bestaetigt": true,
     "mm": 5.1,
     "cm": [
      2.5,
      5.1
     ],
     "luecke": false
    }
   ],
   "stunden": [
    {
     "von": 1795622400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": false,
     "quelle": "analyse"
    },
    {
     "von": 1795626000,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795629600,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795633200,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795636800,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795640400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795644000,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795647600,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795651200,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795654800,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795658400,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795662000,
     "mm": 1.2,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795665600,
     "mm": 0.9,
     "t": -1,
     "art": "schnee",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795669200,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795672800,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": true,
     "quelle": "analyse"
    },
    {
     "von": 1795676400,
     "mm": 0,
     "t": -1,
     "art": "trocken",
     "voll": false,
     "quelle": "analyse"
    }
   ],
   "luecken": [],
   "tmin": -1,
   "mm_summe": 5.7,
   "amtlich": [],
   "amtlich_gespeichert": true,
   "pflicht_ab": null,
   "vermerk": null,
   "fusszeile": "Wetterangaben sind Analyse- und Modellwerte für den Objektstandort und können örtlich abweichen (Schauer, Höhenlage, Beschattung). § 93 StVO legt keine feste Wartezeit nach Ende des Schneefalls fest; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden. Datensatz und Zeitraum sind angegeben, damit die Werte unabhängig geprüft werden können."
  },
  "quellen": [
   {
    "code": "geosphere-nowcast",
    "datensatz": "nowcast-v1-15min-1km",
    "abfrage": "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km (Schritt 0 = Analyse, alle 15 Min. abgerufen und gespeichert)",
    "zeitraum": [
     1795625100,
     1795679100
    ],
    "lizenz": "CC BY 4.0",
    "text": "Wetterdaten: GeoSphere Austria – data.hub.geosphere.at, Lizenz CC BY 4.0 (creativecommons.org/licenses/by/4.0). Kurzfrist-Analyse (15 Min.) im 1-km-Raster; nach Daten von GeoSphere Austria, von WinterDex ausgewertet und zusammengefasst, Zeiten auf 15 Min. gerundet, Schneemengen geschätzt."
   }
  ],
  "entry_hash": "c48667062f87c4314df0b91bd8c9b47c889ba4766530fa5b035561fb1227348c",
  "erstellt_at": "2026-11-26T08:57:40Z",
  "zeitraum_von": "2026-11-25T16:45:00.000Z",
  "zeitraum_bis": "2026-11-26T07:45:00.000Z",
  "land": "AT"
 }
];
