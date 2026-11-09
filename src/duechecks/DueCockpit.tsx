import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { APPS, appIcon } from '../apps/registry';
import type { DueChecksState } from './useDueChecks';

const MAX_PER_APP = 3;

/**
 * Startseite = Cockpit: sobald man in mindestens einer App angemeldet ist, stehen die Fälligkeiten ALLER
 * angemeldeten Apps oben (bisher nur hinter der Glocke). Gleiche Daten wie die Glocke (useDueChecks).
 */
export function DueCockpit({ results, totalCount, loading, signedInCount }: DueChecksState) {
  if (!signedInCount) return null;
  const groups = APPS.filter((a) => (results[a.id]?.count ?? 0) > 0);

  if (groups.length === 0) {
    return (
      <section className="cockpit cockpit-ok" aria-live="polite">
        <CircleCheck className="i" aria-hidden />
        <div>
          <b>{loading ? 'Prüfe Fälligkeiten …' : 'Alles erledigt'}</b>
          <span>
            {loading
              ? `In ${signedInCount} ${signedInCount === 1 ? 'App' : 'Apps'} angemeldet.`
              : `Nichts fällig in deinen ${signedInCount === 1 ? 'einen App' : `${signedInCount} Apps`}.`}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="cockpit" aria-label="Fällig in deinen Apps">
      <div className="cockpit-head">
        <h2>
          {totalCount} fällig <span>in {groups.length === 1 ? 'einer App' : `${groups.length} Apps`}</span>
        </h2>
        {loading && <span className="due-pop-loading">lädt weitere …</span>}
      </div>
      <div className="cockpit-grid">
        {groups.map((app) => {
          const r = results[app.id];
          const shown = r.items.slice(0, MAX_PER_APP);
          const rest = r.count - shown.length;
          return (
            <div className="cockpit-card" key={app.id}>
              <div className="due-group-head">
                <img src={appIcon(app.id)} alt="" />
                <b>{app.name}</b>
                <span className="due-group-count">{r.count}</span>
              </div>
              {shown.map((it) => (
                <Link className="due-row" key={it.id} to={it.route}>
                  <span className="due-row-label">{it.label}</span>
                  {it.sublabel && <span className="due-row-sub">{it.sublabel}</span>}
                </Link>
              ))}
              <Link className="cockpit-more" to={rest > 0 ? `/app/${app.id}` : shown[0]?.route ?? `/app/${app.id}`}>
                {rest > 0 ? `+${rest} weitere` : 'Öffnen'} <ArrowRight className="i" aria-hidden />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
