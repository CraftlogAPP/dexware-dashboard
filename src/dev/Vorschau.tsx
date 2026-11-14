// Nur Entwicklung (npm run dev → /vorschau?app=spieldex): zeigt alle UI-Bausteine
// mit Beispieldaten, damit sich das Design ohne Test-Login prüfen lässt.
// Wird im Produktions-Build nicht eingebunden (siehe App.tsx).
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardCheck,
  CreditCard,
  FerrisWheel,
  FileDown,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { APPS, appIcon } from '../apps/registry';
import { FormDialog } from '../components/form';
import { gpsProofHtml, proofStampHtml } from '../lib/gpsProof';

export function Vorschau() {
  const [params] = useSearchParams();
  // ObjektDex hat einen eigenen Beispieldaten-Bereich (alle Seiten bedienbar)
  if (params.get('app') === 'objektdex') return <Navigate to={`/app/objektdex?demo${params.has('sauber') ? '&sauber' : ''}`} replace />;
  return <VorschauInhalt params={params} />;
}

function VorschauInhalt({ params }: { params: URLSearchParams }) {
  const app = APPS.find((a) => a.id === params.get('app')) ?? APPS.find((a) => a.id === 'spieldex')!;
  const [dialog, setDialog] = useState(params.get('dialog') === '1');
  const style = {
    '--accent': app.theme.accent,
    '--on-accent': app.theme.onAccent,
    '--bg': app.theme.bg,
  } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <header className="site-header">
        <Link className="brand" to="/">
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
        <Link className="btn ghost small" to="/">
          <LayoutGrid className="i" aria-hidden />
          <span className="hide-sm">Alle Dashboards</span>
        </Link>
        <span className="header-user">
          <span className="email">betrieb@beispiel.de</span>
          <button className="btn ghost small">
            <LogOut className="i" aria-hidden />
            <span className="hide-sm">Abmelden</span>
          </button>
        </span>
      </header>

      <div className="app-shell">
        <nav className="app-nav">
          <a className="active" href="#">
            <LayoutDashboard className="i" aria-hidden /> Übersicht
          </a>
          <a href="#">
            <FerrisWheel className="i" aria-hidden /> Spielplätze
          </a>
          <a href="#">
            <ClipboardCheck className="i" aria-hidden /> Kontrollen
          </a>
          <a href="#">
            <TriangleAlert className="i" aria-hidden /> Mängel
          </a>
          <a href="#">
            <Users className="i" aria-hidden /> Team
          </a>
          <a href="#">
            <FileDown className="i" aria-hidden /> Kontrollbuch-PDF
          </a>
          <a href="#">
            <CreditCard className="i" aria-hidden /> Abo
          </a>
          <div className="nav-footer">
            <b>Gemeinde Musterstadt</b>
            <br />
            Rolle: Inhaber
          </div>
        </nav>
        <main className="app-main">
          <h1>Übersicht</h1>
          <p className="muted" style={{ marginTop: -6 }}>
            Gemeinde Musterstadt · Kontrollpflichten im Blick — live aus der {app.name}-App.
          </p>

          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Aktive Spielplätze</div>
              <div className="kpi-value">12</div>
              <div className="kpi-sub">14 insgesamt</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Kontrollen 7 Tage</div>
              <div className="kpi-value">38</div>
              <div className="kpi-sub">ohne Stornos</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Offene Mängel</div>
              <div className="kpi-value">5</div>
              <div className="kpi-sub">davon 1× Gefahr!</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Kontrolle fällig</div>
              <div className="kpi-value">3</div>
              <div className="kpi-sub">von 12 aktiven Spielplätzen</div>
            </div>
          </div>

          <div className="info-box">
            Hinweis: Das Dashboard zeigt dieselben Daten wie die App — Änderungen erscheinen
            sofort.
          </div>

          <div className="section-head">
            <h2>Letzte Kontrollen</h2>
            <a href="#" className="small">
              Alle Kontrollen →
            </a>
          </div>
          <div className="filter-bar">
            <label className="field" style={{ marginBottom: 0, minWidth: 200 }}>
              Spielplatz
              <select defaultValue="">
                <option value="">Alle Spielplätze</option>
                <option>Am Stadtpark</option>
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0, minWidth: 180 }}>
              Ab Datum
              <input type="date" />
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Spielplatz</th>
                  <th>Kontrollart</th>
                  <th>Ergebnis</th>
                  <th>Kontrolliert von</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['28.10.2026, 09:12', 'Am Stadtpark', 'badge external', 'Visuell', 'Alle Punkte in Ordnung (10× OK)', 'M. Berger'],
                  ['27.10.2026, 14:40', 'Schulhof Nord', 'badge amber', 'Operativ', 'Mängel bei: Fallschutz', 'S. Klein'],
                  ['25.10.2026, 08:05', 'Waldspielplatz', 'badge green', 'Hauptinspektion', 'Alle Punkte in Ordnung (10× OK)', 'M. Berger'],
                  ['24.10.2026, 16:22', 'Am Stadtpark', 'badge red', 'Storniert', 'Doppelt erfasst', 'S. Klein'],
                ].map(([t, p, cls, typ, res, who]) => (
                  <tr key={t}>
                    <td>
                      <a href="#">{t}</a>
                    </td>
                    <td className="wrap">{p}</td>
                    <td>
                      <span className={cls}>{typ}</span>
                    </td>
                    <td className="muted wrap">{res}</td>
                    <td className="muted">{who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-head">
            <h2>Offene Mängel</h2>
            <button className="btn small" onClick={() => setDialog(true)}>
              <FileDown className="i" aria-hidden /> Kontrollbuch-PDF erstellen
            </button>
          </div>
          <div className="card empty">Keine Mängel mit den gewählten Filtern.</div>

          <div className="section-head">
            <h2>Prüfnachweis (Detail)</h2>
          </div>
          <div className="kpi-grid">
            <div className="card">
              <div className="kpi-label">GPS-Stempel</div>
              <div className="small" dangerouslySetInnerHTML={{ __html: gpsProofHtml({"lat":47.84567,"lng":16.52345,"gps_accuracy_m":8,"gps_at":"2026-10-28T08:12:04Z","distance_m":14,"end_lat":47.84571,"end_lng":16.52351,"end_accuracy_m":72,"end_gps_at":"2026-10-28T08:31:40Z","end_distance_m":212,"end_mocked":true,"received_at":"2026-10-28T08:31:44Z","entry_hash":"9f2c4be1a07d3e55c0aa1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcd"}, 'Standort') + proofStampHtml({"lat":47.84567,"lng":16.52345,"gps_accuracy_m":8,"gps_at":"2026-10-28T08:12:04Z","distance_m":14,"end_lat":47.84571,"end_lng":16.52351,"end_accuracy_m":72,"end_gps_at":"2026-10-28T08:31:40Z","end_distance_m":212,"end_mocked":true,"received_at":"2026-10-28T08:31:44Z","entry_hash":"9f2c4be1a07d3e55c0aa1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcd"}, (x) => new Date(x).toLocaleString('de-DE')) }} />
              <div className="small" style={{ marginTop: 6 }}>
                <button className="btn ghost small">Prüfcode prüfen</button>{' '}
                <b style={{ color: 'var(--danger, #DC2626)' }}>✗ Prüfcode passt NICHT zum Inhalt — bitte support@dexware.app melden.</b>
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Team-Code</div>
              <div className="row">
                <span className="badge live mono" style={{ fontSize: 18 }}>WD-7K3Q-9XPA</span>
                <button className="btn ghost small">Kopieren</button>
                <button className="btn ghost small">Neuen Code erzeugen</button>
              </div>
            </div>
          </div>

          <div className="section-head">
            <h2>Knöpfe & Zustände</h2>
          </div>
          <div className="card">
            <div className="row">
              <button className="btn">Speichern</button>
              <button className="btn ghost">Abbrechen</button>
              <button className="btn" disabled>
                Deaktiviert
              </button>
              <span className="badge live">aktiv</span>
              <span className="badge">pausiert</span>
              <span className="badge red">überfällig</span>
              <span className="spinner" />
            </div>
            <div className="error-box">Netzwerkfehler: Daten konnten nicht geladen werden.</div>
          </div>
        </main>
      </div>

      {dialog && (
        <FormDialog
          title="Spielplatz bearbeiten"
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'address', label: 'Adresse', placeholder: 'Straße, Ort' },
            { key: 'active', label: 'Aktiv', kind: 'checkbox' },
          ]}
          initial={{ name: 'Am Stadtpark', address: '', active: true }}
          onClose={() => setDialog(false)}
          onSave={async () => {}}
        />
      )}
    </div>
  );
}
