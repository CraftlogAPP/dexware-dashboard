# Beispiel-Zugang (nur Dev-Server)

Der Beispiel-Zugang zeigt die echten Dashboard-Seiten mit Beispieldaten statt Server-Daten.
Er dient für Bilder der Landing-Seiten (Dashboard-Block) und zum Durchklicken ohne Konto.

- **Aufruf:** `npm run dev`, dann `/app/<app>?beispiel` öffnen, zum Beispiel `/app/feuerdex?beispiel`.
  Der Modus bleibt im Tab an, auch auf Unterseiten.
- **Beenden:** `?beispiel=aus` oder „Abmelden“ im Kopf.
- **Nicht `?demo`:** Bei `?demo` springen die Prüf-Apps in die Handy-Ansicht „Vor Ort“ mit eigenen Beispieldaten.
- **Apps mit Beispieldaten (26.11.2026):** die 9 Suite-Apps `gurtdex`, `toredex`, `geruestdex`, `feuerdex`, `leiterdex`,
  `regaldex`, `hebedex`, `pruefdex`, `schutzdex` sowie `spieldex`, `kfzdex`, `tourdex`, `craftdex`, `dokudex`.
  Andere Apps zeigen bei `?beispiel` die normale Anmeldung, die Konsole meldet dann „noch keine Beispieldaten“.
  WinterDex, ObjektDex, AngebotDex (`installateurdex`) und Laufzettel (`pinndex`) haben eigene Demos über `?demo`.
- **JSON-Pfade:** TourDex, CraftDex und DokuDex lesen über PostgREST-Pfade (`title:data->>title`, `.gte('data->>startTime', …)`);
  der Speicher-Client wertet sie mit `feld()` aus (`->` liefert JSON, `->>` Text).

## So funktioniert es

| Teil | Datei | Aufgabe |
|---|---|---|
| Schalter | `src/dev/beispiel/schalter.ts` | `?beispiel` lesen und für den Tab merken; Liste `BEISPIEL_APPS` |
| Einstieg | `src/auth/AppAuthContext.tsx` | nur hinter `import.meta.env.DEV`: statt Supabase-Client und Sitzung den Beispiel-Zugang laden (lazy) |
| Zugang | `src/dev/beispiel/zugang.tsx` | Beispieldaten laden, Speicher-Client und Sitzung bereitstellen |
| Speicher-Client | `src/dev/beispiel/client.ts` | baut nach, was die Seiten von supabase-js brauchen |
| Abo | `src/dev/beispiel/netz.ts` | beantwortet RevenueCat und `suite-status` und sperrt alle anderen Supabase-Server |
| Daten | `src/dev/beispiel/<app>.ts` | Tabellen, Sitzung, eigene RPCs |
| Helfer | `src/dev/beispiel/typen.ts` | IDs, Zeitpunkte relativ zu heute, Betrieb und Mitgliedschaften, Checklisten |

### Speicher-Client

Der Speicher-Client kann:

- `from()` mit `select`, `eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `is`, `not`, `or`, `contains`, `like` und `ilike`
- `order`, `limit`, `range`, `single` und `maybeSingle`, dazu `count` und `head`
- `insert`, `upsert`, `update` und `delete`. Das wirkt nur im Speicher; nach dem Neuladen ist alles wieder wie vorher.
- `rpc`, `auth` (feste Beispiel-Sitzung), `storage` (Bilder aus den Beispieldaten) und `channel` (ohne Wirkung)

Fehlt eine Tabelle oder RPC in den Beispieldaten, kommt eine leere Antwort statt eines Fehlers.
Die Konsole meldet das mit `[Beispiel] …`. Gesammelt steht es in `window.__beispiel.meldungen`,
die Daten in `window.__beispiel.tabellen`.

**Pro ist immer aktiv.** Dafür sorgen die RPC `org_pro_active` und die RevenueCat-Antwort „Jahresabo Pro“.
So erscheinen weder Paywall noch Gratis-Hinweise. Es geht keine Anfrage an einen echten Server.

### Nicht im Produktions-Build

Vite ersetzt beim Bauen `import.meta.env.DEV` durch `false`. Der Zweig fällt dann weg, ebenso `schalter.ts` und
alle Beispieldaten. Das prüfen Teil 5 und Teil 6 in `tests/beispiel-zugang.test.mjs`:

- Teil 5 prüft den Quelltext: Nur `AppAuthContext` bindet `src/dev/beispiel` ein, und nur hinter `import.meta.env.DEV`.
- Teil 6 sucht nach `npm run build` in `dist/` nach dem Merkwort `DEX-BEISPIEL-ZUGANG-NUR-DEV` aus `client.ts`, nach
  dem Speicher-Schlüssel und nach Beispieldaten. Es darf kein Treffer kommen.

Prüfen von Hand: `npm run build` ausführen, dann `grep -r DEX-BEISPIEL-ZUGANG-NUR-DEV dist` muss leer bleiben.

## Weitere App ergänzen

### 1. Tabellen nachsehen

Welche Tabellen und RPCs braucht die App? Das steht in `src/<app>/api.ts`.

- In allen Apps mit Betrieb gibt es `org` und `membership`. Die liefert der Helfer `betrieb()`.
  SchutzDex ist anders: Die `org` hat dort `owner_user_id` und keine `membership`.
- Dazu kommen die Tabellen der App. Bei den Prüf-Apps sind das Ort, Einheit, `inspection` und `defect`, siehe `cfg.tables` in `src/<app>/vorOrt.ts`.
- Die Spalten müssen zum Schema der App passen: `<App>/supabase/schema.sql` und die Nachträge.

### 2. Datei anlegen

Datei `src/dev/beispiel/<app>.ts` anlegen. Vorlage ist `feuerdex.ts` (Einheiten-Modus) oder `spieldex.ts` (Orts-Modus).
Die Datei exportiert `daten: BeispielDaten` mit:

- `app`
- `nutzer` (Inhaber der Sitzung)
- `tabellen`
- optional `rpc`, zum Beispiel `list_members: () => B.mitglieder`, und `fotos`

### 3. Datei eintragen

Eine Zeile in `BEISPIEL_APPS` in `src/dev/beispiel/schalter.ts`:

```ts
gurtdex: () => import('./gurtdex'),
```

### 4. Daten glaubwürdig halten

Das sind die Regeln für Bilder der Landing-Seiten:

- **Namen und Orte:**
  - erfundener Betrieb („Musterbetrieb GmbH“ oder „Gemeinde Musterstadt“), PLZ 12345
  - Personen nur als Initial und häufiger Nachname, zum Beispiel „M. Becker“
  - E-Mails nur unter `.example`, Telefon mit Vorwahl 0123
  - keine Kundendaten, keine echten Personen
  - Hersteller leer lassen, damit keine Markennamen im Bild stehen
- **Zeitpunkte:**
  - nur relativ zu heute mit `vor(tage, hh, mm)`. Das legt sie auf Werktage und nie in die Zukunft.
  - Fristen mit `fristVor(jahre, tageBisFaellig, …)`. So stimmen „Fällig in 24 Tagen“ und „Überfällig seit 9 Tagen“ an jedem Tag.
- **Betrieb:**
  - älter als 30 Tage anlegen (`seit`)
  - mindestens ein Teil Bestand und eine gültige Prüfung. Sonst erscheint die Karte „Erste Schritte“ (`src/lib/ersteSchritte.ts`).
- **Übersicht:** Eine Mischung zeigt, was das Dashboard kann:
  - gesperrt, überfällig, noch nie geprüft und bald fällig
  - offene Mängel mit mindestens einer roten Stufe
  - verschiedene Prüfarten unter den jüngsten Einträgen
  - Die Tabelle „Fällige …“ zeigt höchstens 8 Zeilen. Mit mehr erscheint „… und N weitere“.
- **Nur Belegtes:** Schreib nur Normen, Fristen und Begriffe, die im Code der App stehen,
  zum Beispiel `src/<app>/types.ts` und `vorOrt.ts`.

### 5. Test ergänzen

In `tests/beispiel-zugang.test.mjs`:

- In Teil 2 einen Block wie „2a FeuerDex“ anlegen: Kennzahlen und Fälligkeit über die echten Abfragen aus `src/<app>/api.ts`.
- In Teil 3 die App in die Liste für den Schema-Abgleich eintragen.

Dann `node tests/beispiel-zugang.test.mjs` ausführen. Weitere Prüfungen mit den echten Abfragen:
`node tests/beispiel-pruefapps.test.mjs` (GurtDex, HebeDex, PrüfDex, SchutzDex) und
`node tests/beispiel-weitere.test.mjs` (KfzDex, TourDex, CraftDex, DokuDex).

### 6. Durchklicken und Bild aufnehmen

- Dev-Server starten (`npm run dev`).
- Jede Unterseite einmal öffnen und `window.__beispiel.meldungen` ansehen. Fehlt eine Tabelle oder RPC, steht sie dort.
- Dann das Bild aufnehmen. Der Befehl startet keinen eigenen Server. Er macht den Inhaltsbereich ohne Kopf und Menü,
  1440 × 944 Pixel wie das WinterDex-Bild:

```sh
node tests/browser/beispiel-bild.mjs "http://localhost:5173/app/<app>?beispiel" \
  ../dexware-suite/landing-system/assets/<app>-dashboard.png
```

Optionen:

- `--hoehe H`: andere Inhaltshöhe
- `--ohne-menue`: für Seiten ohne Menü links
- `--ausschnitt l,o,b,h` und `--fenster BxH`: frei wählen. Mit `--ausschnitt 0,0,1672,1004` kommt die ganze Seite samt Kopf zur Kontrolle.

Für die Unterseite die Adresse anpassen, zum Beispiel `/app/feuerdex/standorte/<id>?beispiel`.
Die IDs stehen in `window.__beispiel.tabellen`.

So nimmt der Befehl das Bild auf:

- Edge läuft headless mit `--screenshot`, `--virtual-time-budget=12000` und `--hide-scrollbars`, in einem leeren Profil je Lauf.
- Das Fenster ist 1672 × 1004 groß: Menü 232 + Inhalt 1440, Kopf 60 + Inhalt 944.
- Zugeschnitten wird mit sharp aus `dexware-suite/landing-system/node_modules`, ein anderer Ort geht mit `SHARP_DIR`.

Danach das Bild ansehen. Prüfe dabei:

- keine Fehlermeldung, keine leere Tabelle, keine Karte „Erste Schritte“
- Schnitt unten möglichst zwischen zwei Zeilen

Erst danach den Dashboard-Block der Landing eintragen (`img: ['assets/<app>-dashboard.png', 'dashboard.webp', 1440]`).

## Hinweis für Worktrees mit `node_modules` als Verbindung

Ist `node_modules` eine Verbindung (Junction) zu einem anderen Worktree, schreibt der Dev-Server seinen Vorab-Cache
in dessen `node_modules/.vite`. Ebenso schreibt `npm run build` mit `tsc -b` in dessen `node_modules/.tmp/*.tsbuildinfo`.

- Für den Dev-Server einen eigenen `cacheDir` unterhalb eines `node_modules`-Pfads im eigenen Worktree nehmen,
  zum Beispiel `vite-cache.local/node_modules/.vite`. `*.local` ist ignoriert. Liegt der Cache außerhalb eines
  `node_modules`-Pfads, scheitert die Umwandlung der Vorab-Pakete.
- Die `tsbuildinfo`-Dateien vor dem Bauen sichern und danach zurücklegen.
