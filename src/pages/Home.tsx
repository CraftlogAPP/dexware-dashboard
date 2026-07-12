import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { APPS, STATUS_ORDER, appIcon, type AppConfig } from '../apps/registry';
import { DueBell } from '../duechecks/DueBell';
import { useDueChecks } from '../duechecks/useDueChecks';
import { useHiddenApps } from '../lib/appPrefs';

export function Home() {
  const apps = [...APPS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const liveCount = APPS.filter((a) => a.status === 'dashboard').length;
  // BaumDex läuft als eigenständiges Portal — hier benennen, sonst wirkt die Zählung falsch
  const externalNames = APPS.filter((a) => a.status === 'external')
    .map((a) => a.name)
    .join(', ');
  const due = useDueChecks();
  const { hidden, toggle, reset } = useHiddenApps();
  const visible = apps.filter((a) => !hidden.has(a.id));

  return (
    <>
      <header className="site-header home">
        <div className="home-bell">
          <DueBell {...due} />
        </div>
        <div className="home-actions">
          <AppsMenu apps={apps} hidden={hidden} toggle={toggle} reset={reset} />
          <a
            className="badge home-link"
            href="https://dexware.app"
            target="_blank"
            rel="noreferrer"
          >
            dexware.app ↗
          </a>
        </div>
        <div className="brand">
          dex<span>ware</span> Dashboard
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-pill">
            <span className="pulse-dot" aria-hidden />
            {liveCount} Dashboards live
            {externalNames && ` + ${externalNames} als eigenständiges Webportal`} — gleiche
            Daten wie in deinen Apps
          </div>
          <h1>
            Dein Betrieb. <span className="grad">Alle Nachweise.</span> Ein Cockpit.
          </h1>
          <p>
            Das Web-Dashboard zur dexware-Suite: Objekte, Kontrollen und Fristen deiner
            Apps am großen Bildschirm — gleiche Daten, live. Anmeldung mit deinem
            App-Konto: per Google oder E-Mail + Passwort.
          </p>
        </section>

        {visible.length > 0 ? (
          <div className="tile-grid">
            {visible.map((app, i) => (
              <AppTile
                key={app.id}
                app={app}
                index={i}
                dueCount={due.results[app.id]?.count ?? 0}
              />
            ))}
          </div>
        ) : (
          <div className="tiles-empty">
            <p>Alle Apps sind ausgeblendet.</p>
            <button type="button" className="badge live" onClick={reset}>
              Alle anzeigen
            </button>
          </div>
        )}
        {hidden.size > 0 && visible.length > 0 && (
          <p className="tiles-hidden-hint">
            {hidden.size} {hidden.size === 1 ? 'App' : 'Apps'} ausgeblendet —{' '}
            <button type="button" onClick={reset}>
              alle anzeigen
            </button>
          </p>
        )}
      </main>
    </>
  );
}

/** Ausklapp-Menü rechts oben: welche App-Kacheln die Startseite zeigt. */
function AppsMenu({
  apps,
  hidden,
  toggle,
  reset,
}: {
  apps: AppConfig[];
  hidden: Set<string>;
  toggle: (id: string) => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Klick außerhalb oder Escape schließt das Panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="apps-menu" ref={ref}>
      <button
        type="button"
        className="badge apps-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Auswählen, welche Apps die Startseite zeigt"
      >
        ⚙️ Apps
        {hidden.size > 0 && ` · ${apps.length - hidden.size}/${apps.length}`}
      </button>
      {open && (
        <div className="apps-menu-panel" role="dialog" aria-label="Startseite anpassen">
          <div className="apps-menu-head">
            <b>Startseite anpassen</b>
            <button
              type="button"
              className="apps-menu-reset"
              onClick={reset}
              disabled={hidden.size === 0}
            >
              Alle anzeigen
            </button>
          </div>
          <p className="apps-menu-hint">
            Abgewählte Apps werden nur ausgeblendet — Daten und Fristen-Glocke bleiben
            unberührt. Jederzeit hier wieder einschaltbar.
          </p>
          {apps.map((a) => {
            const shown = !hidden.has(a.id);
            return (
              <button
                type="button"
                key={a.id}
                className={`apps-menu-row${shown ? ' on' : ''}`}
                onClick={() => toggle(a.id)}
                aria-pressed={shown}
                style={{ '--row-accent': a.theme.primary } as React.CSSProperties}
              >
                <img src={appIcon(a.id)} alt="" loading="lazy" />
                <span className="apps-menu-name">{a.name}</span>
                <span className="apps-menu-check" aria-hidden>
                  {shown ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AppTile({
  app,
  index,
  dueCount,
}: {
  app: AppConfig;
  index: number;
  dueCount: number;
}) {
  const style = {
    '--tile-accent': app.theme.primary,
    '--tile-card': app.theme.card,
    '--tile-bg': app.theme.bg,
    '--enter-delay': `${index * 45}ms`,
  } as React.CSSProperties;

  // Spotlight folgt dem Cursor (nur Desktop relevant, auf Touch passiert nichts)
  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  const body = (
    <>
      {dueCount > 0 && (
        <span className="tile-due" title="Fällige Prüfungen">
          {dueCount} fällig
        </span>
      )}
      <div className="tile-head">
        <img className="tile-icon" src={appIcon(app.id)} alt="" loading="lazy" />
        <h3>{app.name}</h3>
        {app.status !== 'soon' && (
          <span className="tile-arrow" aria-hidden>
            →
          </span>
        )}
      </div>
      <p>{app.tagline}</p>
      <div className="tile-foot">
        {app.status === 'dashboard' && <span className="badge live">● Dashboard öffnen</span>}
        {app.status === 'external' && (
          <span
            className="badge external"
            title="Eigenständiges Webportal — zählt daher nicht zu den Dashboards"
          >
            Eigenes Webportal ↗
          </span>
        )}
        {app.status === 'soon' && <span className="badge">Dashboard folgt</span>}
      </div>
    </>
  );

  if (app.status === 'dashboard') {
    return (
      <Link className="tile" style={style} to={`/app/${app.id}`} onMouseMove={onMove}>
        {body}
      </Link>
    );
  }
  if (app.status === 'external' && app.externalUrl) {
    return (
      <a
        className="tile"
        style={style}
        href={app.externalUrl}
        target="_blank"
        rel="noreferrer"
        onMouseMove={onMove}
      >
        {body}
      </a>
    );
  }
  return (
    <div className="tile disabled" style={style}>
      {body}
    </div>
  );
}
