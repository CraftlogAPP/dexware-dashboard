import { Link } from 'react-router-dom';
import { APPS, STATUS_ORDER, type AppConfig } from '../apps/registry';

export function Home() {
  const apps = [...APPS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

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
          <h1>
            Dein Betrieb. <span className="grad">Alle Nachweise.</span> Ein Cockpit.
          </h1>
          <p>
            Das Web-Dashboard zur dexware-Suite: Objekte, Kontrollen und Fristen deiner
            Apps am großen Bildschirm — gleiche Zugangsdaten, gleiche Daten, live.
          </p>
        </section>

        <div className="tile-grid">
          {apps.map((app) => (
            <AppTile key={app.id} app={app} />
          ))}
        </div>
      </main>
    </>
  );
}

function AppTile({ app }: { app: AppConfig }) {
  const style = { '--tile-accent': app.theme.primary } as React.CSSProperties;

  const body = (
    <>
      <div className="tile-head">
        <span className="tile-emoji" aria-hidden>
          {app.emoji}
        </span>
        <h3>{app.name}</h3>
      </div>
      <p>{app.tagline}</p>
      <div className="tile-foot">
        {app.status === 'dashboard' && <span className="badge live">● Dashboard öffnen</span>}
        {app.status === 'external' && <span className="badge external">Portal öffnen ↗</span>}
        {app.status === 'soon' && <span className="badge">Dashboard folgt</span>}
        <span className="muted">{app.landingUrl.replace('https://', '')}</span>
      </div>
    </>
  );

  if (app.status === 'dashboard') {
    return (
      <Link className="tile" style={style} to={`/app/${app.id}`}>
        {body}
      </Link>
    );
  }
  if (app.status === 'external' && app.externalUrl) {
    return (
      <a className="tile" style={style} href={app.externalUrl} target="_blank" rel="noreferrer">
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
