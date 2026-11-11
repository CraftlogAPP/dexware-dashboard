// Mängel: offen / erledigt. „Erledigt“ einmalig per resolve_defect (jedes Mitglied), Meldung bleibt unverändert.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FormDialog, s, type FormValues } from '../../components/form';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useOd } from '../context';
import { fmtDateTimeB, PhotoButton } from '../parts';
import { daysBetween, dayOf, todayBerlin } from '../turnus';
import type { OdDefect } from '../types';

export function Defects() {
  const { data, base } = useOd();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [resolving, setResolving] = useState<OdDefect | null>(null);
  const state = useAsync(async () => {
    const [defects, props] = await Promise.all([data.listDefects(), data.listProperties()]);
    return { defects, names: new Map(props.map((p) => [p.id, p.name])) };
  }, [data]);
  useLiveRefresh([state.refresh]);
  const today = todayBerlin();

  async function onResolve(v: FormValues) {
    if (!resolving) return;
    await data.resolveDefect(resolving.id, s(v.note), s(v.name));
    state.reload();
  }

  return (
    <>
      <h1>Mängel</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gemeldet in der App mit Foto und Text — offen, bis jemand sie als erledigt markiert.
      </p>
      <LoadGuard state={state}>
        {({ defects, names }) => {
          const open = defects.filter((d) => d.status === 'open');
          const done = defects.filter((d) => d.status === 'done');
          const list = tab === 'open' ? open : done;
          return (
            <>
              <div className="od-seg" role="tablist">
                <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>
                  Offen ({open.length})
                </button>
                <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>
                  Erledigt ({done.length})
                </button>
              </div>
              {list.length === 0 ? (
                <div className="card empty">{tab === 'open' ? 'Keine offenen Mängel. 👍' : 'Noch nichts erledigt.'}</div>
              ) : (
                <div className="od-defects">
                  {list.map((d) => {
                    const age = daysBetween(dayOf(d.created_at), today);
                    return (
                      <div key={d.id} className={`card od-defect od-defect-${d.status}`}>
                        <div className="muted small">
                          <Link to={`${base}/objekte/${d.property_id}`}>{names.get(d.property_id) ?? 'Objekt'}</Link>
                        </div>
                        <div className="od-defect-text">{d.text}</div>
                        <div className="muted small">
                          gemeldet {fmtDateTimeB(d.created_at)} · {d.reporter_name ?? '—'}
                          {d.status === 'open' ? ` · ${age === 0 ? 'seit heute' : age === 1 ? 'seit gestern' : `seit ${age} Tagen`}` : ''}
                        </div>
                        {d.status === 'done' && (
                          <div className="od-resolved">
                            ✓ erledigt {fmtDateTimeB(d.resolved_at)}
                            {d.resolved_name ? ` · ${d.resolved_name}` : ''}
                            {d.resolved_note ? <div>{d.resolved_note}</div> : null}
                          </div>
                        )}
                        <div className="row" style={{ gap: 8, marginTop: 8 }}>
                          <PhotoButton kind="defect" id={d.id} count={d.photo_count} />
                          {d.status === 'open' && (
                            <button className="btn small" onClick={() => setResolving(d)}>
                              Als erledigt markieren
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
      {resolving && (
        <FormDialog
          title="Mangel erledigt?"
          submitLabel="Als erledigt markieren"
          onClose={() => setResolving(null)}
          onSave={onResolve}
          fields={[
            { key: 'note', label: 'Was wurde gemacht? (optional)', kind: 'textarea' },
            { key: 'name', label: 'Erledigt von (optional)' },
          ]}
        />
      )}
    </>
  );
}
