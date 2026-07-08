# dexware Dashboard

Web-Cockpit der dexware-Suite — **ein** Einstieg (`dashboard.dexware.app`), eine
Kachel pro App, dahinter pro App ein Dashboard auf das jeweilige Supabase-Projekt.

## Architektur

- **Vite + React + TypeScript**, kein eigenes Backend: Jede App-Ansicht ist ein
  weiterer `supabase-js`-Client auf das bestehende Supabase-Projekt der App —
  dieselben RLS-Regeln wie in der Mobile-App gelten auch hier. Anon-Keys sind
  public by design.
- **App-Registry** (`src/apps/registry.ts`): alle 11 Apps mit Name, Tagline,
  Markenfarben, Status (`dashboard` = internes Dashboard, `external` = Link auf
  bestehendes Portal, `soon` = Kachel ohne Link) und ggf. Supabase-Zugang.
  Eine neue App im Dashboard = ein Registry-Eintrag + ein Bereich unter `src/<app>/`.
- **Per-App-Login** (`src/auth/`): E-Mail + Passwort des bestehenden App-Kontos,
  Passwort-Reset per 6-stelligem OTP (wie mobil). Sessions pro App getrennt
  (`storageKey: dexware-dash-<app>`), es gibt bewusst kein Suite-SSO.
- **WinterDex** (`src/winterdex/`): erster vollständiger Dashboard-Bereich —
  Übersicht (KPIs, „lange nicht dokumentiert"), Objekte, Einsätze (append-only,
  Stornos markiert), Einsatz-Detail mit Wetter-Snapshot/GPS/Beweisfotos, Team
  (Beitrittscodes per RPC), Nachweis-PDF über den Browser-Druckdialog.
  **Wichtig:** `operation.photo_urls` enthält Base64-Fotos — Listen laden diese
  Spalte nie (siehe `OPERATION_COLS` in `src/winterdex/api.ts`), nur Detail/Bericht.
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
- **BaumDex** verlinkt als Kachel auf das bestehende Portal
  (`https://baumdex-portal.vercel.app`).

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc + vite build + 404.html-Fallback (GitHub Pages SPA)
npm run preview
```

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
