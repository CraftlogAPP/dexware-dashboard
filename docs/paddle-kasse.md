# Paddle-Kasse im Dashboard (WinterDex Pro)

> **Live-Status 26.11.2026:** Kasse **LIVE** (Alex-Go „Alle 3 sachen go“). `registry.ts` → WinterDex →
> `paddleKasse.live.rcKey` = öffentlicher RevenueCat-Schlüssel von „winterdex (Paddle Live)“ (`pdl_LqRQ…`), Angebot
> `web_pro_live` mit den Neukundenpreisen **19,99 € / Monat** und **69,99 € / Jahr** (Paddle-Preise und RevenueCat-Angebot
> umgestellt). **Sandbox-Probekauf am 26.11.2026 bestanden** (Kauf, Danke-Ansicht, Pro für den Betrieb, Kasse danach weg;
> Sandbox-Schlüssel danach wieder aus der registry entfernt). Offen nach dem Veröffentlichen: Echtkauf-Probe
> (Live-Schaltung, Schritt 6) und Landing-Knopf (Schritt 7). Abo-Seite bei Free mit Kasse: „Pro schließt du hier im Browser
> oder in der WinterDex-App (Android) ab“, statt „Abos laufen über Google Play“ ein neutraler Verwalten-Hinweis
> (`aboAnzeige` → `verwalten`, Test `tests/paddle-kasse.test.mjs` [7c]).
>
> **Reihenfolge beim Veröffentlichen:** zuerst Datenschutz-Absatz 7a (Schritt 4) auf dexware.app live, dann dieses Dashboard.

Stand: 26.11.2026 · Code: `src/lib/paddleKasse.ts` (Entscheidungen, ohne Laufzeit-Imports), `src/components/PaddleKasse.tsx`
(Kauf-Karte + Danke-Ansicht), `src/components/AboPage.tsx` (Einbau), `src/apps/registry.ts` (`paddleKasse` bei WinterDex),
`src/winterdex/pro.ts` (`PRO_HOW`), Test `tests/paddle-kasse.test.mjs`, Vorschau im Dev-Server `/vorschau-kauf?kasse=erfolg`.

## Was es macht

- Auf `dashboard.dexware.app/app/winterdex/abo` erscheint die Karte **„Direkt hier kaufen“** mit den Tarifen aus dem
  RevenueCat-Angebot (`web_pro_live`: Saison/Jahr + Monat). Ein Klick öffnet die **Paddle-Kasse als Fenster über der Seite**
  (deutsch, E-Mail des Kontos vorausgefüllt). Es gibt keinen Sprung auf `pay.rev.cat` mehr; die Domain des Dashboards ist bei
  Paddle für Checkout und Apple Pay freigegeben.
- Technik: RevenueCat Web SDK `@revenuecat/purchases-js` (feste Fassung 1.74.0) mit Paddle Billing. Das SDK legt die
  Paddle-Transaktion über RevenueCat an, lädt Paddle.js von `cdn.paddle.com` erst beim Klick und meldet nach
  `checkout.completed` den neuen Kundenstand zurück. Das SDK selbst wird nur auf der Abo-Seite nachgeladen (eigene Datei,
  nicht in der Offline-Hülle des Service Workers). Analyse-Ereignisse und UTM-Sammeln des SDK sind ausgeschaltet.
- Kennung: die **Dexware-ID** = sha256(E-Mail klein, ohne Leerzeichen außen) — dieselbe wie in App, Server und den
  bisherigen Kauf-Links. App und Server (`org_pro_active`) erkennen den Kauf daher ohne Änderung.
- Nach dem Kauf: Danke-Ansicht oben auf der Abo-Seite, die Abo-Anzeige lädt still neu („Web (Paddle)“, „Abo bei Paddle
  verwalten“), und die Seite wartet bis zu ~40 s, bis die Pro-Prüfung des Betriebs (`org_pro_active`, vorher
  `pro_status_auffrischen()`, falls eingespielt) Pro meldet. Danach werden Gratis-Banner und Listen neu gefragt.
- Abbruch (Fenster zu): kurze Zeile „Bestellfenster geschlossen“, keine Fehlermeldung. Wurde das Fenster erst **nach** der
  Zahlung geschlossen, fragt die Seite im Hintergrund nach und zeigt dann doch die Danke-Ansicht.
- Fehler: ruhiger Text ohne Technik; nie „nichts abgebucht“, wenn der Fehler nach der Zahlung passiert sein kann.

**Wer sieht die Karte?** Genau wer bisher die Kauf-Kacheln sah (`darfKaufen`): der **Inhaber** (oder ein Konto ohne Betrieb)
ohne bestehenden Tarif. Nie bei eigenem Pro (Play, Web, Promo), Suite bzw. Suite-Bestand, Pro über den Betrieb (Rechnung,
Kommunal-Lizenz, Bonus, Team) und nie, solange der Suite-Server gestört ist. Teammitglieder/Verwalter sehen den Hinweis, dass
der Tarif über das Konto des Inhabers läuft (Pro hängt am Inhaber-Konto, `org_pro_fuer`). Zusätzlich für die Kasse
(`betriebOhneProKlar`): Sie erscheint erst, wenn der Server (`org_pro_active`) für den Betrieb ein klares „kein Pro“ gemeldet
hat — nicht während diese Antwort noch lädt (sonst sähe eine Gemeinde mit Pro auf Rechnung kurz „Direkt hier kaufen“) und
nicht bei gestörter Antwort (dann der Hinweis „bitte später neu laden, bevor du ein Abo abschließt“).

## Schalter

| Zustand | Wirkung |
|---|---|
| kein Schlüssel (Stand im Repo bis 26.11.2026) | Kasse **aus** — Abo-Seite wie bisher (ausgegraute Kacheln „In Kürze“), `PRO_HOW` wie bisher |
| `paddleKasse.live.rcKey` = `pdl_…` (oder Bau-Variable `VITE_RC_PADDLE_KEY`) — **Stand im Repo seit 26.11.2026** | Kasse **live** mit Angebot `web_pro_live`; `PRO_HOW` nennt den Kauf im Dashboard; Free-Text der Abo-Seite nennt „hier im Browser“, Verwalten-Block neutral |
| Adresse `…/abo?kasse=sandbox` **und** Sandbox-Schlüssel (`VITE_RC_PADDLE_SANDBOX_KEY` oder `paddleKasse.sandbox.rcKey`) | Kasse im **Sandbox-Modus** (Angebot `web_pro`, Hinweis „Sandbox · Testkauf“) |
| `?kasse=sandbox` ohne Sandbox-Schlüssel | Kasse **aus** — nie stillschweigend Live |

Abgelehnt (Kasse bleibt aus): alles, was nicht `pdl_…` ist (z. B. `goog_…`), derselbe Schlüssel für Live und Sandbox und
**der geheime Paddle-API-Schlüssel** (`pdl_live_apikey_…` / `pdl_sdbx_apikey_…`).

## Woher der `pdl_…`-Schlüssel kommt

Es ist der **öffentliche RevenueCat-Schlüssel des Paddle-Eintrags** — nicht der Paddle-API-Schlüssel und nicht das
Paddle-Client-Token. Er ist öffentlich wie die `goog_…`-Schlüssel in `registry.ts` und darf ins Repo.

1. app.revenuecat.com → Projekt **winterdex** → links **Apps & providers** (je nach Ansicht „Apps“ / „Project settings → Apps“).
2. Live: Eintrag **„winterdex (Paddle Live)“** (`appfab6fe9468`) öffnen → Abschnitt **Public API key** → Wert beginnt mit `pdl_`.
   Sandbox: Eintrag **„winterdex (Paddle)“** (`app545843109b`) → ebenso.
   (Alternativ: Project settings → **API keys** → Zeile mit der App „winterdex (Paddle Live)“, Typ „Public“.)
3. Gegenprobe: Angebot **`web_pro_live`** (Product catalog → Offerings) enthält `$rc_annual` und `$rc_monthly`, beide mit den
   Live-Produkten aus „winterdex (Paddle Live)“; Angebot **`web_pro`** enthält die Sandbox-Produkte. Preise ändert man in
   Paddle/RevenueCat — das Dashboard zeigt, was das Angebot liefert.

## Sandbox-Probekauf Schritt für Schritt

Voraussetzung: In RevenueCat (winterdex) steht der Sandbox-Zugang auf „Allowed App User IDs only“ — freigeschaltet wird nur
das dort eingetragene Testkonto. Der Probekauf läuft deshalb mit **diesem** WinterDex-Konto.

1. Im Dashboard-Ordner eine Datei `.env.local` anlegen (von git ignoriert, `*.local`):
   `VITE_RC_PADDLE_SANDBOX_KEY=pdl_…` (Schlüssel von „winterdex (Paddle)“).
2. `npm run dev` → im Browser `http://localhost:5173/app/winterdex/abo?kasse=sandbox` öffnen und mit dem freigegebenen
   Testkonto anmelden (Inhaber des Betriebs, ohne aktives Pro).
3. Erwartet: Karte „Direkt hier kaufen“ mit Abzeichen **„Sandbox · Testkauf“**, Hinweis zur Testkarte und den Tarifen aus
   `web_pro` (Preise aus RevenueCat).
4. „Weiter zur Kasse“ beim Monatstarif → das Paddle-Fenster öffnet sich auf Deutsch mit vorausgefüllter E-Mail.
   Testkarte **4242 4242 4242 4242**, Ablauf beliebig in der Zukunft, CVC **100**, Name beliebig. (Die E-Mail muss eine echte
   Domain haben; `.test`-Adressen verbucht RevenueCat nicht. Paddles Ereignis-Simulator zählt nicht.)
5. Erwartet nach dem Bezahlen: Danke-Ansicht „Danke! WinterDex Pro ist gekauft.“ → nach wenigen Sekunden „Pro ist für deinen
   Betrieb freigeschaltet“. Darunter: Tarif aktiv, Abzeichen „Sandbox-/Testkauf“, „Bezogen über: Web (Paddle)“, Knopf
   „Abo bei Paddle verwalten“. Der Gratis-Banner verschwindet; die Android-App zeigt Pro nach dem Neuöffnen.
6. Gegenproben: Fenster ohne Zahlung schließen → nur „Bestellfenster geschlossen“; Seite neu laden → Karte verschwunden
   (Pro aktiv); mit einem Teammitglied-Konto → keine Karte.
7. Aufräumen: „Abo bei Paddle verwalten“ → kündigen (oder sandbox-vendors.paddle.com → Subscriptions → Cancel). Der Testkauf
   schaltet Pro für das Testkonto wirklich frei, bis das Sandbox-Abo endet. `.env.local` danach löschen.

Variante ohne lokalen Server: Sandbox-Schlüssel in `registry.ts` (`paddleKasse.sandbox.rcKey`) eintragen und auf
`dashboard.dexware.app/app/winterdex/abo?kasse=sandbox` testen — danach wieder leeren. Ohne `?kasse=sandbox` bleibt die
Sandbox auch dann unsichtbar.

Ohne Anmeldung und ohne Netz lässt sich die Karte im Dev-Server ansehen und durchklicken:
`/vorschau-kauf?kasse=erfolg | abbruch | spaet | fehler | netz | ladefehler | leer | sandbox`,
Danke-Ansicht: `/vorschau-kauf?kasse=danke&status=pruefe|ok|spaeter[&sandbox]`.

## Live-Schaltung

1. Sandbox-Probekauf (oben) bestanden. ✅ 26.11.2026
2. **Standard-Zahlungslink bei Paddle prüfen** (Paddle Live → Checkout → Checkout settings → Default payment link). Dort steht
   noch `https://pay.rev.cat`, und diese Domain ist bei Paddle nicht freigegeben. Ob RevenueCat die Live-Transaktion damit
   anlegen kann, zeigt erst der Echtkauf (Schritt 6). Scheitert er beim Öffnen der Kasse („Der Kauf im Browser ist gerade nicht
   verfügbar“), braucht es eine Seite auf einer freigegebenen Domain, die Paddle.js mit einem Client-Token lädt
   (`?_ptxn=…`), und den Standard-Link dorthin — siehe „Offene Punkte“.
3. Live-Schlüssel eintragen: `src/apps/registry.ts` → WinterDex → `paddleKasse.live.rcKey: 'pdl_…'`. ✅ 26.11.2026
   (`pdl_LqRQjzmmVdwVmLcGUcYpTvZkcDdL`, „winterdex (Paddle Live)“)
   (Alternativ Bau-Variable `VITE_RC_PADDLE_KEY` — dann muss `.github/workflows/pages.yml` sie beim Schritt `npm run build`
   aus einer Repo-Variable setzen; der Eintrag in `registry.ts` ist einfacher.)
4. **Vorher** Datenschutz-Absatz 7a ersetzen (Text unten unter „Rechtliches“) und den Hub veröffentlichen: Sobald das
   Dashboard mit Schlüssel online ist, kann jeder Inhaber kaufen — der alte Absatz („weitergeleitet“, „nur eine pseudonyme
   Kennung“) stimmt dann nicht mehr.
5. `node tests/paddle-kasse.test.mjs` (prüft auch den eingetragenen Schlüssel), alle Tests, `npm run build`; dann auf `master`
   übernehmen und veröffentlichen.
6. Echtkauf mit dem eigenen Konto: Monatstarif (19,99 €, Neukundenpreis seit 26.11.2026), Ablauf wie im Sandbox-Test prüfen. Danach in Paddle Live →
   Transactions → die Transaktion → **Refund** (voll). Prüfen, dass RevenueCat die Erstattung übernimmt und Pro endet.
7. Danach: Landing (`landing-system/iphone.js`, `BROWSER.winterdex.buyLive`) auf die Abo-Seite des Dashboards zeigen lassen,
   Landings bauen und veröffentlichen.

## Rückweg

- **Kasse aus:** `paddleKasse.live.rcKey` wieder `''` (bzw. Bau-Variable entfernen) → veröffentlichen. Die Abo-Seite zeigt wieder
  die ausgegrauten Kacheln, `PRO_HOW` den bisherigen Text. Bestehende Web-Abos laufen weiter: Anzeige „Web (Paddle)“ und
  „Abo bei Paddle verwalten“ hängen nicht am Schalter; Kündigung/Erstattung gehen weiter über Paddle.
- **Code ganz zurück:** den Commit dieses Umbaus zurücknehmen (`git revert`) — entfernt auch das Paket aus
  `package.json`/`package-lock.json`. Server, SQL und Apps sind nicht betroffen.
- An Paddle oder RevenueCat muss für den Rückweg nichts geändert werden.

## Rechtliches (geprüft 26.11.2026)

- **Händler:** Paddle.com Market Limited ist Verkäufer und Vertragspartner für den Kauf („Merchant of Record“), stellt die
  Rechnung aus, führt die Umsatzsteuer ab und zeigt im Bestellfenster seine Kaufbedingungen
  ([paddle.com/legal/checkout-buyer-terms](https://www.paddle.com/legal/checkout-buyer-terms)). Die Karte sagt das vor dem Klick
  („Kauf über Paddle (Händler)“) und verlinkt AGB, Widerruf & Erstattung, Datenschutz und die Kaufbedingungen von Paddle.
- **Vor dem Klick angezeigt:** Preis inkl. USt. aus dem Angebot, Laufzeit, automatische Verlängerung, Kündigung jederzeit zum
  Laufzeitende, 14 Tage Geld zurück. Der verbindliche Bestellknopf liegt im Paddle-Fenster (Paddle ist Verkäufer).
- **Widerruf / Verzicht bei digitalen Inhalten:** Die Belehrung und — falls nötig — die Zustimmung zur sofortigen
  Bereitstellung holt Paddle im Bestellvorgang ein (Kaufbedingungen von Paddle). Auf unserer Seite gibt es bewusst **kein**
  Verzicht-Häkchen: Dexware erstattet Käufe über die Webseite 14 Tage lang ohne Angabe von Gründen (erstattung.html), das
  gesetzliche Widerrufsrecht bleibt davon unberührt — so steht es auch auf der Karte.
- **AGB § 4 / § 5 und erstattung.html** sprechen schon vom Kauf „über unsere Webseite bzw. das Dashboard“ — passt weiter.
- **Datenschutz Abschnitt 7a muss VOR der Live-Schaltung angepasst werden (Live-Schaltung, Schritt 4).** Bisher steht dort „wirst du zum Bestellvorgang
  … weitergeleitet“ und „Wir übergeben dem Bestellvorgang nur eine pseudonyme Kennung“. Neu öffnet sich das Fenster auf
  unserer Seite (Paddle.js von Paddle-Servern) und die E-Mail-Adresse des Kontos wird vorausgefüllt. Vorschlag für den Absatz:

  > Wenn du einen Tarif über unsere Webseite bzw. das Dashboard kaufst, öffnet sich der Bestellvorgang unseres
  > Vertriebspartners Paddle (Paddle.com Market Limited, 30 Old Bailey, London EC4M 7AU, Vereinigtes Königreich) als Fenster
  > auf unserer Seite; dafür lädt dein Browser erst beim Klick auf einen Tarif Programmcode und Bestellformular direkt von
  > Servern von Paddle. Paddle verarbeitet dort als eigener Verantwortlicher die für Kauf und Abrechnung nötigen Daten
  > (E-Mail-Adresse, Rechnungsland bzw. -anschrift, Zahlungsdaten, IP-Adresse zur Steuer- und Betrugsprüfung). Deine
  > Zahlungsdaten erhalten wir nicht. Damit der Kauf deinem Konto zugeordnet werden kann und du die Adresse nicht neu
  > eintippen musst, übergeben wir dem Bestellvorgang eine pseudonyme Kennung deines Kontos (einen Hash deiner
  > E-Mail-Adresse) und die E-Mail-Adresse deines Kontos. Die Zuordnung und das Anlegen des Bestellvorgangs laufen über
  > unseren Abo-Dienstleister RevenueCat, der auch für Käufe in den Apps eingesetzt wird; von Paddle bzw. RevenueCat erfahren
  > wir, welcher Tarif bis wann aktiv ist. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
  > Datenschutzhinweise von Paddle: paddle.com/legal/privacy.

  Quelle des Absatzes: `dexware-suite/landing-system/erstattung.js` (fügt 7a nur ein, wenn er fehlt — beim Ändern den
  bestehenden Absatz in `datenschutz.html` ersetzen).

## Content-Security-Policy

Das Dashboard setzt derzeit keine CSP (GitHub Pages, keine `<meta http-equiv>`), der Service Worker lässt fremde Server
durch. Falls später eine CSP kommt, braucht die Kasse mindestens: `script-src https://cdn.paddle.com`,
`frame-src https://buy.paddle.com https://sandbox-buy.paddle.com`, `connect-src https://api.revenuecat.com` (dazu die
Paddle-Ziele laut Paddle-Doku) sowie `style-src 'unsafe-inline'` für die Stile des SDK.

## Offene Punkte

- Standard-Zahlungslink bei Paddle (siehe Live-Schaltung, Schritt 2). Falls nötig: kleine Seite für `?_ptxn=` (Paddle.js +
  öffentliches Client-Token `live_…` aus Paddle → Developer tools → Authentication) und den Link dorthin umstellen. Über
  denselben Link laufen die Paddle-Mails „Zahlungsart ändern“.
- RevenueCat „Paddle Live“: automatische Kauferfassung erfasst laut RevenueCat alle Käufe des Paddle-Kontos — BaumDex-Käufe
  können dort anonym auftauchen (schalten nichts frei). In den Einstellungen des Eintrags prüfen.
- `PRO_HOW` (Texte an den Gratis-Grenzen, auch Team-Seite) schaltet mit dem Live-Schlüssel automatisch um, ebenso Free-Text
  und Verwalten-Block der Abo-Seite (26.11.2026); weitere Texte, die nur „Android-App“ nennen (Landing, Store-Texte), bei der
  Live-Schaltung mitziehen.
