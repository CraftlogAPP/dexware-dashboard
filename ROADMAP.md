# dexware-dashboard — Feature-Roadmap: App-Auswahl (personalisierte Startseite)

> **Für jede KI, die hier weiterarbeitet:** Nach JEDEM erledigten Schritt hier abhaken (`[x]`).
> Zusätzlich das Memory `dashboard-app-auswahl.md` im Claude-Memory-Verzeichnis aktuell halten.
> Repo: `C:\Users\2easy\Desktop\dexware-dashboard` (GitHub `CraftlogAPP/dexware-dashboard`,
> deployt automatisch via Push → GitHub Pages → https://dashboard.dexware.app).

**Was?** User-Wunsch 12.07.2026: Wer nur 3–4 der 14 Apps nutzt, soll auf der Startseite
nur DIESE Kacheln sehen. Rechts oben ein Ausklapp-Menü („Apps anpassen"), in dem jede App
per Häkchen ein-/ausblendbar ist — jederzeit änder-/revidierbar („Alle anzeigen").

**Technik-Entscheidung:** Präferenz in `localStorage` (Key `dexware.hiddenApps`, JSON-Array
der App-IDs) — KEIN Backend (die 9 Apps haben getrennte Supabase-Projekte, es gibt keinen
suite-weiten User; pro Browser reicht völlig). Gilt automatisch für künftige Apps
(Menü rendert aus `registry.ts`). Die Fällig-Glocke (DueBell) zählt bewusst WEITER alle
Apps (Sicherheits-/Fristen-Relevanz — ausgeblendet heißt nicht „egal").

## Schritte

- [x] `src/lib/appPrefs.ts`: Hook `useHiddenApps()` — Set der ausgeblendeten IDs,
      `toggle(id)`, `reset()`, localStorage-persistiert
- [x] `src/pages/Home.tsx`: Kacheln filtern; rechts oben Button „⚙️ Apps" mit
      Ausklapp-Panel (Häkchen je App, Zähler, „Alle anzeigen"); Klick außerhalb schließt;
      Hinweis-Chip „N ausgeblendet" wenn gefiltert; Leer-Zustand mit Reset-Button,
      falls alles ausgeblendet
- [x] `src/index.css`: Styles fürs Menü (Design-Sprache der Startseite: dunkle Karten,
      Akzent-Häkchen, mobile-tauglich)
- [x] `npx tsc -b` grün (WICHTIG: `npx tsc --noEmit` prüft in DIESEM Repo NICHTS —
      Root-tsconfig ist Solution-Datei!) + `npm run build` grün (12.07.2026)
- [ ] Commit + Push (deployt automatisch), live auf dashboard.dexware.app verifizieren
- [ ] Memory `dashboard-app-auswahl.md` + Worklog aktualisieren

## Kontext für nachfolgende KIs

- Startseite: `src/pages/Home.tsx` (Kacheln aus `src/apps/registry.ts`, sortiert nach
  `STATUS_ORDER`); Header-Elemente absolut positioniert: `.home-bell` (links oben),
  `.home-link` (rechts oben — der neue Button kommt daneben/darunter)
- Der User will es „überall" — gemeint ist: die Auswahl wirkt auf die Kachel-Übersicht
  und funktioniert für alle (auch künftige) Apps automatisch, weil registry-getrieben
