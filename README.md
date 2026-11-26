# dexware Dashboard

Web-Cockpit der dexware-Suite — **ein** Einstieg (`dashboard.dexware.app`), eine
Kachel pro App, dahinter pro App ein Dashboard auf das jeweilige Supabase-Projekt.

## Architektur

- **Vite + React + TypeScript**, kein eigenes Backend: Jede App-Ansicht ist ein
  weiterer `supabase-js`-Client auf das bestehende Supabase-Projekt der App —
  dieselben RLS-Regeln wie in der Mobile-App gelten auch hier. Anon-Keys sind
  public by design.
- **App-Registry** (`src/apps/registry.ts`): alle Apps mit Name, Tagline,
  Markenfarben, Status (`dashboard` = internes Dashboard, `external` = Link auf
  bestehendes Portal, `soon` = Kachel ohne Link) und ggf. Supabase-Zugang.
  Eine neue App im Dashboard = ein Registry-Eintrag + ein Bereich unter `src/<app>/`.
  **Suite-Abo** (seit 26.11.2026 nur 9 Apps, `inSuite`/`SUITE_APPS`): `notInSuite` = nie in der Suite
  (InstallateurDex, Laufzettel); `suiteNurBestand` = eigenes Abo mit Bestandsschutz für Suite-Abos vom Stichtag
  (SpielDex, WinterDex, KfzDex, BaumDex, TourDex, CraftDex, DokuDex, ObjektDex) — Abfrage `suite-status?…&app=<id>`,
  Entscheidung `src/lib/abo.ts`, Texte der Abo-Seite `src/lib/aboAnzeige.ts`, Test `tests/suite-bestand.test.mjs`.
- **Per-App-Login** (`src/auth/`): E-Mail + Passwort des bestehenden App-Kontos,
  Passwort-Reset per 6-stelligem OTP (wie mobil). Sessions pro App getrennt
  (`storageKey: dexware-dash-<app>`), es gibt bewusst kein Suite-SSO.
- **WinterDex** (`src/winterdex/`): erster vollständiger Dashboard-Bereich —
  Übersicht (KPIs, „lange nicht dokumentiert"), Objekte, Einsätze (append-only,
  Stornos markiert), Einsatz-Detail mit Wetter-Snapshot/GPS/Beweisfotos, Team
  (Beitrittscodes per RPC), Nachweis-PDF über den Browser-Druckdialog.
  **Wichtig:** `operation.photo_urls` enthält Base64-Fotos — Listen laden diese
  Spalte nie (siehe `OPERATION_COLS` in `src/winterdex/api.ts`), nur Detail/Bericht.
  **Außendienst** (`/app/winterdex/aussendienst`, Umschalter oben rechts; `src/winterdex/aussendienst/` + `einsatz/`,
  seit 19.11.2026): Handy-Ansicht wie die App, getrennt vom Dashboard (Übergang fürs iPhone). Reiter „Objekte“
  (Einsatz erfassen: GPS-Stempel Beginn/Ende, Wetter, Maßnahme, Streumittel, Fotos) und „Strecken“ (Freie Fahrt,
  Strecke fahren mit Live-Abdeckung, neue Strecke abfahren oder aus Objekten, umbenennen/pausieren — nur Inhaber).
  Geschrieben werden dieselben Zeilen wie aus der App (operation, route, route_run; Fotos im Bucket `photos`),
  Prüfcode/Länge/Abdeckung rechnet der Server. Entwürfe, laufende Aufzeichnung (alle 10 s) und nicht Gesendetes liegen
  in IndexedDB und werden automatisch nachgesendet. **Grenze des Browsers:** aufgezeichnet wird nur bei offener Seite
  und eingeschaltetem Bildschirm (Wake Lock); Verlassen/Sperren wird als Pause im Nachweis vermerkt.
  Ohne Konto testen: Dev-Server → `/app/winterdex/aussendienst?demo` (`&netz=aus`, `&netz=nein`, `&pro=0`, `&rolle=mitarbeiter`).
  Die alte Adresse `/app/winterdex/einsatz` leitet weiter.
  **Wetter-Guide** (seit 26.11.2026, Bauplan `dexware-suite/docs/wetter-guide-bauplan-2026-11-26.md`): Karte „Heute Nacht“
  auf der Übersicht und eingeklappt im Außendienst (`HeuteNacht.tsx`, Daten `heuteNachtDaten.ts`, RPC `heute_nacht` —
  sichtbar nur, wenn der Server `karte_live` meldet), Wetterverlauf je Einsatz/Fahrt aus `wetter_beleg` im Detail, im
  Einsatz-/Fahrt-PDF, im Fahrtenbuch und in Excel (`wetterBeleg.ts`, `WetterZeitleiste.tsx`; Kurzsatz + Prüfcode, nur Pro,
  Text nur vom Server; ohne Beleg bleibt in PDF-Zeilen der bisherige Schnappschuss, Pro-Hinweis nur auf der Detailseite,
  Nachtrag-Belege gekennzeichnet), Team-Karte „Wetter-Guide“ (`GlaetteFruehwarnung.tsx`: Uhrzeit, „Aktiv auf X von Y Handys“, letzte
  Mitteilungen, Haftung, Vorlage Mitarbeiter-Info; Mitteilungsarten nur je Handy in der App). Ohne die SQL-Nachträge
  bleibt alles wie vorher. Beispieldaten: `/vorschau?app=winterdex&seite=wetter[&zustand=…][&teil=karte|verlauf|team][&eingeklappt=1]`,
  Tests `tests/wetter-dashboard.test.mjs`.
- **SpielDex** (`src/spieldex/`): zweiter Dashboard-Bereich nach dem WinterDex-
  Muster — Übersicht mit Fälligkeits-Ampel (visuell 7 T / operativ 90 T /
  Hauptinspektion 365 T), Spielplätze mit Geräte-Inventar, Kontrollen mit
  DIN-EN-1176-7-Checkliste, Mängel mit Schweregrad und Behebungs-Vermerk,
  Kontrollbuch-PDF. **Wichtig:** `inspection.photo_urls`, `defect.photo_urls`/
  `resolution_photo_urls` und `equipment.photo_url` enthalten Base64 — Listen
  laden diese Spalten nie (siehe Spaltenlisten in `src/spieldex/api.ts`).
- **RegalDex** (`src/regaldex/`): dritter Dashboard-Bereich, gleiches Muster —
  Lager mit Regal-Inventar (Fach-/Feldlasten), Inspektionen (Sichtkontrolle 7 T /
  Experteninspektion 365 T) mit DIN-EN-15635-Checkliste, Schäden im
  Ampelverfahren (Grün/Orange/Rot), Prüfbericht-PDF. Base64-Foto-Spalten wie
  bei SpielDex nie in Listen laden.
- **PrüfDex** (`src/pruefdex/`): Kunden/Standorte, Geräte mit
  Prüffristen-Ampel (überfällig/bald fällig/ok), DGUV-V3-Prüfungen mit
  Sichtprüfung + Messwert-Bewertung nach VDE 0701-0702, Prüflisten-PDF je
  Kunde. **Kein** Team-Bereich (App hat kein Invite-System); org hat kein
  `land` — `fetchOrgContext` lädt deshalb `select('*')`.
- **SchutzDex** (`src/schutzdex/`): anderes Mandanten-Modell — org gehört dem
  Auth-User direkt (`owner_user_id`, kein membership), Mitarbeiter sind
  Datensätze ohne Konten. Eigener Org-Fetcher `fetchOwnerOrgContext` via
  `<OrgProvider fetch={…}>`. Seiten: Mitarbeiter, Unterweisungen, Zuweisungen
  (mit Überfälligkeits-Logik), prüffeste Nachweise.
- **CraftDex** (`src/craftdex/`): Single-User-Modell ohne Org/Team — der
  Cloud-Sync legt jedes Projekt als jsonb-Blob in `projects.data` ab
  (inkl. Base64-Fotos!). Listen selektieren nur skalare JSON-Felder
  (`data->>title`, `data->loggedHours`, …), der volle Blob wird nur im
  Detail geladen. Seiten: Übersicht (Termine, abzurechnen), Aufträge, Detail
  mit Schritten/Material/Kosten/Fotos.
- **BaumDex** verlinkt als Kachel auf das bestehende Portal
  (`https://baumdex-portal.vercel.app`).

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc + vite build + 404.html-Fallback (GitHub Pages SPA)
npm run preview
```

**Design** (seit 2026-10-29): gleiche Sprache wie App-Landings und dexware.app —
Tokens aus `dexware-suite/landing-system/styles.js`, Inter lokal (`public/fonts/`),
Icons von `lucide-react` (Klasse `i`). Alles Optische steckt zentral in `src/index.css`;
App-Farben (`theme.accent/onAccent/bg` in der Registry) = Werte der jeweiligen Landing.
Ohne Test-Login zeigt **`/vorschau?app=<id>`** (nur `npm run dev`, fehlt im Build) alle
Bausteine mit Beispieldaten; `&dialog=1` öffnet zusätzlich den Bearbeiten-Dialog.

## Deployment (GitHub Pages)

- Workflow: `.github/workflows/pages.yml` (Push auf main/master → Pages).
- `public/CNAME` = `dashboard.dexware.app`; SPA-Fallback via `dist/404.html`.
- Einmalig nötig: Repo `CraftlogAPP/dexware-dashboard` anlegen (public), in den
  Repo-Settings **Pages → Source: GitHub Actions**, und im dexware.app-DNS ein
  **CNAME `dashboard` → `craftlogapp.github.io`** setzen.

## Nächste Ausbaustufen

1. Weitere Apps als Registry-Eintrag + Bereich (LeiterDex teilt das Muster,
   hat aber noch kein Supabase-Projekt — erst Backend anlegen).
2. Pro-Gating des Dashboards (RevenueCat/`app_metadata.pro`/Suite-Backend).
3. Optional echtes Suite-SSO (erst sinnvoll, wenn das Bundle zieht).
