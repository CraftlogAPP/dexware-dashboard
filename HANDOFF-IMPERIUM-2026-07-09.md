# HANDOFF — „Imperium ausbauen"-Batch vom 2026-07-09 (Abend)

> **Zweck:** Ein anderer Claude (oder eine spätere Session) kann hiermit NAHTLOS
> weitermachen. Alles Abgehakte ist verifiziert erledigt; alles Offene steht mit
> exaktem nächsten Schritt da. User-Regel: **NIE pushen ohne explizites User-OK**
> (Landings/Dashboard deployen sofort live via GitHub Pages).

## Der User-Auftrag (Nummern aus dem Brainstorming)

Der User wählte aus meiner Vorschlagsliste: **#2** (LeiterDex unter Git),
**#4** (Suite-Fix-Checkliste), **#5** (Wochen-Digest-E-Mail), **#6** (Suite-SSO),
**#8** (SEO-Ratgeber auf den Landings). NICHT beauftragt: #1 PrüfDex-Keystore
(Kennwort „ist beim User, sollte gehen"), SchutzDex-Keystore („später"),
#7 App 12, #9 iOS.

## Status

- [x] **#2 LeiterDex unter Git** — ERLEDIGT & GEPUSHT. Repo
  `CraftlogAPP/leiterdex` (privat, Konvention wie regaldex/spieldex), Branch
  master, Commit c2efb4c, Push verifiziert. Secret-Kontrolle vor dem Push
  bestanden (.env/keystore/credentials/android alle ignoriert).
- [x] **#4 Suite-Fix-Checkliste** — GESCHRIEBEN, NICHT gepusht. Datei
  `Desktop\dexware-suite\SUITE-FIX-CHECKLIST.md` (untracked). Enthält Prozess +
  4 Einträge: FIX-001 PDF-UUID-Dateiname (11-Apps-Tabelle; LeiterDex-Fix erst
  NACH Play-Upload von AAB vc2!), FIX-002 Cross-Promo-Launch-Sweep-Merkregel,
  FIX-003 Keystore-Backup-Tests (PrüfDex beim User, SchutzDex vertagt),
  FIX-004 OAuth-Lehren.
- [x] **#6 SSO-Konzept** — GESCHRIEBEN, NICHT gepusht. Datei
  `Desktop\dexware-suite\SSO-KONZEPT.md` (untracked). Bewusst NUR
  Entscheidungsvorlage, kein Code: 3 Stufen (1. Konto-Provisioning via zentrale
  Edge Function → 2. geteiltes JWT-Secret + UUID-Angleichung → 3. sichtbares
  SSO). Empfehlung: Stufe 1 erst beim ersten echten Suite-Abonnenten bauen.
- [x] **#8 SEO-Ratgeber** — 6 SEITEN FERTIG (lokal, NICHT gepusht), je im Look
  der Landing, FAQ inkl. JSON-LD-FAQPage-Schema, canonical korrekt, von
  index.html verlinkt („Ratgeber" im Footer/Nav). Verifiziert auf der Platte:
  - `leiterdex-web\ratgeber-leiterpruefung.html`
  - `regaldex-web\ratgeber-regalinspektion.html`
  - `spieldex-web\ratgeber-spielplatzkontrolle.html`
  - `winterdex-web\ratgeber-raeum-streupflicht.html`
  - `pruefdex-landing\ratgeber-dguv-v3.html`
  - `kfzdex-web\ratgeber-uvv-fuhrpark.html`
  (+ jeweils geänderte index.html im selben Repo.)
- [x] **#5 Wochen-Digest-E-Mail** — FERTIG, GEPUSHT **UND LIVE DEPLOYED**
  (2026-07-09 spätere Session, mit User-Freigabe „du darfst alles!").
  Stand: Function `weekly-digest` deployed auf bundlesuit
  (jsrfxentjqfmpusaubyw), Tabelle `digest_unsubscribe` angelegt, pg_cron-Job
  aktiv (`0 5 * * 1` UTC = 06:00 Berlin Winter / 07:00 Sommer — CRON_TZ wird
  vom pg_cron dieses Projekts abgelehnt, daher UTC). Alle 15 Secrets gesetzt
  (RESEND_API_KEY, DIGEST_CRON_SECRET, DIGEST_UNSUB_SECRET + je URL/SERVICE_KEY
  für spieldex/leiterdex/regaldex/pruefdex/kfzdex/winterdex). Testlauf erfolg-
  reich: 6/6 Apps geprüft, 0 übersprungen, 4 Empfänger, 4 Mails gesendet,
  0 Fehler. Resend-Domain dexware.app war schon verifiziert.
  **STOLPERFALLE für spätere Deploys:** `supabase projects api-keys` MASKIERT
  die Keys (zeigt nur „eyJ…", Länge 4!). Echte service_role-Keys nur über
  Management-API `GET /v1/projects/<ref>/api-keys?reveal=true` oder aus dem
  Dashboard. Die 6 App-Projekte liegen über 4 Supabase-Accounts verteilt
  (Free-Limit 2 Projekte/Account); Secrets schreiben braucht den bundlesuit-
  Account-Token, Keys lesen den jeweiligen App-Account-Token. Mehrere
  App-Projekte waren nie umbenannt (hießen „<email>'s Project") — Identität per
  Tabellen-Check verifiziert (winterdex=property/operation, regaldex=warehouse/
  inspection).
  Alt-Notiz (Code-Stand, weiterhin gültig):
  `Desktop\dexware-suite\supabase\functions\weekly-digest\` enthält index.ts,
  apps.ts, due.ts, email.ts, crypto.ts, cron.sql, README.md; dazu Migration
  `supabase\migrations\0002_digest_unsubscribe.sql`. Gegen die
  Dashboard-Adapter (`dexware-dashboard\src\duechecks\`) und das
  revenuecat-webhook-Auth-Muster abgeglichen (2026-07-09, spätere Session).
  Kein Deno lokal → kein `deno check` gelaufen; Review manuell.
  Deploy-Schritte für den User stehen komplett im README (Migration → Secrets
  → Resend-Domain-Verify → `functions deploy --no-verify-jwt` → cron.sql).
  **Spezifikation (so war der Agent beauftragt):** zentrale Edge Function im
  bundlesuit-Projekt (jsrfxentjqfmpusaubyw); Secrets je App
  `DIGEST_<APPID>_URL` + `DIGEST_<APPID>_SERVICE_KEY` (fehlende Secrets = App
  still übersprungen); Versand via Resend (`RESEND_API_KEY`, Absender
  digest@dexware.app, Domain-Verify nötig); Fälligkeitslogik = Port der
  Dashboard-Adapter aus `dexware-dashboard\src\duechecks\` (leiterdex 30/365 je
  Leiter, regaldex 7/365, spieldex 7/90/365, pruefdex next_due_date inkl. bald
  fällig, kfzdex UVV+Führerscheinkontrolle, winterdex >48 h NUR Saison Okt–Apr);
  ein User = EINE Mail über alle Apps, Matching per E-Mail (kein SSO!);
  Unsubscribe per HMAC-Token (`DIGEST_UNSUB_SECRET`) + Abmeldetabelle in
  bundlesuit (SQL mitliefern); Cron Montag 06:00 Europe/Berlin (pg_cron-SQL);
  Auth via Shared-Secret im Authorization-Header (Muster: revenuecat-webhook im
  selben Repo). Deploy macht der USER nach README (supabase functions deploy,
  secrets set, Resend, Cron-SQL).
- [x] **PUSH ERLEDIGT (User-Freigabe „du darfst alles!", 2026-07-09 spätere
  Session):** alle 6 Landing-Repos (Ratgeber + index.html, deployen via
  GitHub Pages) + dexware-suite (be5375f: weekly-digest komplett inkl. README
  + Migration 0002, SUITE-FIX-CHECKLIST.md, SSO-KONZEPT.md) committet &
  gepusht, alle Repos clean & in sync mit origin/main. Secret-Kontrolle vor
  dem Suite-Push bestanden.
  → Damit ist der GESAMTE Batch #2/#4/#5/#6/#8 abgeschlossen. Offen bleibt
  nur Nicht-Batch-Arbeit: weekly-digest-DEPLOY durch den User (nach README)
  und LeiterDex-Play-Upload (AAB vc2) durch den User.

## Kontext davor am selben Tag (bereits komplett erledigt & live)

- LeiterDex launch-ready: Landing live mit TLS (leiterdex.dexware.app),
  Datenschutz-/Konto-Löschungs-URLs live, AAB **versionCode 2** gebaut
  (neues Google-Cloud-Projekt 398166604465, neue Web-Client-ID im Bundle
  verifiziert) — **User muss es noch in Play Internal Testing hochladen und
  den Google-Login AUS DEM PLAY-TRACK testen**; erst danach im alten Projekt
  780611936316 „Webclient 11 - leiterdex" + „Android-Client 25 - leiterdex"
  löschen. Store-Screenshots + Feature-Grafik fertig in `LeiterDex\store\`.
- Cross-Promo-Sweep: RegalDex + LeiterDex in alle 9 Mobile-Apps eingetragen,
  committet & gepusht (DokuDex auf Branch `backend-cloudflare-workers`).
- Dashboard: LeiterDex-Bereich + appübergreifende Fälligkeits-Anzeige
  (Kachel-Badges + Glocken-Popup, `src\duechecks\`) — live auf
  dashboard.dexware.app. WinterDex-Adapter meldet nur Okt–Apr (Userentscheid).

## Wichtige Arbeitsregeln aus der Session

1. Push nur mit User-OK; Landings/Dashboard = sofortiges Live-Deploy.
2. LeiterDex `android\` ist prebuild-generiert & gitignored — versionCode steht
   DOPPELT (app.json + android\app\build.gradle), kein `expo prebuild`, kein
   `gradlew clean`; vor Rebuild JS-Bundle-Caches löschen (Details:
   `LeiterDex\docs\ROADMAP.md` Changelog 2026-07-09).
3. Fixes, die mehrere Apps betreffen → in SUITE-FIX-CHECKLIST.md eintragen.
4. Statusquellen: je App `docs\ROADMAP.md` §12; suite-weit
   `dexware-suite\SUITE-STATUS.md` (Stand von heute schon gepusht).
