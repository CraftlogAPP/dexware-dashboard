import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { APPS, STATUS_ORDER, appIcon, type AppConfig } from '../apps/registry';

export function Home() {
  const apps = [...APPS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const liveCount = APPS.filter((a) => a.status === 'dashboard').length;

  return (
    <>
      <header className="site-header">
        <div className="brand">
          dex<span>ware</span> Dashboard
        </div>
        <div className="spacer" />
        <a className="badge" href="https://dexware.app" target="_blank" rel="noreferrer">
          dexware.app ↗
        </a>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-pill">
            <span className="pulse-dot" aria-hidden />
            {liveCount} Dashboards live — gleiche Daten wie in deinen Apps
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

        <div className="tile-grid">
          {apps.map((app, i) => (
            <AppTile key={app.id} app={app} index={i} />
          ))}
        </div>
      </main>
    </>
  );
}

function AppTile({ app, index }: { app: AppConfig; index: number }) {
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
        {app.status === 'external' && <span className="badge external">Portal öffnen ↗</span>}
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
