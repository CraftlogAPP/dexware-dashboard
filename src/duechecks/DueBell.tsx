import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APPS, appIcon } from '../apps/registry';
import type { DueChecksState } from './useDueChecks';

const MAX_PER_APP = 5;

/** Glocke im Entry-Header: Gesamtzähler + Popup mit Fälligkeiten je App. */
export function DueBell({ results, totalCount, loading }: DueChecksState) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb / Escape schließt das Popup.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = APPS.filter((a) => (results[a.id]?.count ?? 0) > 0);

  function go(route: string) {
    setOpen(false);
    navigate(route);
  }

  return (
    <div className="due-bell" ref={wrapRef}>
      <button
        type="button"
        className="due-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Fälligkeiten${totalCount > 0 ? `: ${totalCount}` : ''}`}
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        {totalCount > 0 && <span className="due-bell-count">{totalCount}</span>}
      </button>

      {open && (
        <div className="due-pop" role="dialog" aria-label="Fällige Prüfungen">
          <div className="due-pop-head">
            Fälligkeiten
            {loading && <span className="due-pop-loading">lädt…</span>}
          </div>

          {groups.length === 0 ? (
            <div className="due-pop-empty">
              {loading ? 'Prüfe Fälligkeiten…' : 'Nichts fällig. 👍'}
            </div>
          ) : (
            <div className="due-pop-body">
              {groups.map((app) => {
                const r = results[app.id];
                const shown = r.items.slice(0, MAX_PER_APP);
                const rest = r.count - shown.length;
                return (
                  <div className="due-group" key={app.id}>
                    <div className="due-group-head">
                      <img src={appIcon(app.id)} alt="" />
                      <b>{app.name}</b>
                      <span className="due-group-count">{r.count}</span>
                    </div>
                    {shown.map((it) => (
                      <button
                        type="button"
                        className="due-row"
                        key={it.id}
                        onClick={() => go(it.route)}
                      >
                        <span className="due-row-label">{it.label}</span>
                        {it.sublabel && (
                          <span className="due-row-sub">{it.sublabel}</span>
                        )}
                      </button>
                    ))}
                    {rest > 0 && (
                      <button
                        type="button"
                        className="due-row due-row-more"
                        onClick={() => go(`/app/${app.id}`)}
                      >
                        +{rest} weitere →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
