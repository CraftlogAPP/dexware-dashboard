// Heizungstausch-Radar — wie App screens/ReplaceRadarScreen.tsx: alte Öl-/Gas-/Wärmeerzeuger aus dem Bestand →
// ansprechen, Besichtigung planen, Angebot. „angesprochen“ merkt sich wie in der App das Gerät (hier: dieser Browser).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, FileText, Send } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useInst } from '../context';
import { kindInfo, type Asset, type Site } from '../types';
import { MessageDialog } from './parts';
import { candidates, replacementMessage, type Candidate } from './logic';

// gleicher Schlüssel wie die App (InstallateurDex.replaceContacted), dazu der Betrieb — mehrere Konten im selben Browser
const doneKey = (orgId: string) => `InstallateurDex.replaceContacted.${orgId}`;

function readDone(orgId: string): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(doneKey(orgId)) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDone(orgId: string, v: Record<string, string>) {
  try {
    localStorage.setItem(doneKey(orgId), JSON.stringify(v));
  } catch {
    /* privates Fenster / Speicher voll: gilt dann nur bis zum Neuladen */
  }
}

export function Radar() {
  const { data, org, base } = useInst();
  const state = useAsync(async () => {
    const [sites, assets] = await Promise.all([data.sites(), data.assets()]);
    return { sites, assets };
  }, [data]);
  useLiveRefresh([state.refresh], 60000);
  const [done, setDone] = useState<Record<string, string>>(() => readDone(org.id));
  const [msg, setMsg] = useState<{ c: Candidate; site: Site | undefined } | null>(null);

  const setContacted = (id: string, on: boolean) => {
    setDone((prev) => {
      const next = { ...prev };
      if (on) next[id] = next[id] ?? new Date().toISOString();
      else delete next[id];
      writeDone(org.id, next);
      return next;
    });
  };

  return (
    <LoadGuard state={state}>
      {({ sites, assets }) => {
        const siteBy = new Map(sites.map((s) => [s.id, s]));
        // wie App: Anlagen archivierter Objekte zählen nicht
        const list = candidates(assets.filter((a: Asset) => siteBy.get(a.site_id)?.active !== false));
        const count = (p: number) => list.filter((c) => c.priority === p).length;
        return (
          <>
            <section className="idx-hero" aria-label="Tausch-Chancen">
              <div className="idx-hero-label">🔥 Tausch-Chancen</div>
              <div className="idx-hero-value">{list.length}</div>
              <div className="idx-hero-sub">
                {list.length === 1 ? 'Anlage' : 'Anlagen'} reif für ein Gespräch · Öl {count(1)} · Gas {count(2)} · sonstige {count(3)}
              </div>
            </section>

            {list.length === 0 ? (
              <div className="card muted">
                Keine Kandidaten. Die Tausch-Chancen brauchen bei den Anlagen das Datum der Inbetriebnahme oder das Baujahr (Typenschild-Scan in
                der App trägt es ein): Öl und Gas ab 15 Jahren, andere Wärmeerzeuger ab 20 Jahren.
              </div>
            ) : (
              <div className="aw-list">
                {list.map((c) => {
                  const s = siteBy.get(c.asset.site_id);
                  const isDone = !!done[c.asset.id];
                  const tone = c.priority === 1 ? 'red' : c.priority === 2 ? 'amber' : 'muted';
                  return (
                    <article key={c.asset.id} className={`card aw-card${isDone ? ' aw-done' : ''}`}>
                      <div className="aw-radar-row">
                        <div className={`aw-age aw-tone-${tone}`} aria-label={`${c.ageYears} Jahre`}>
                          <b>{c.ageYears}</b>
                          <span>Jahre</span>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="aw-title">
                            {kindInfo(c.asset.kind).emoji}{' '}
                            {s ? <Link to={`${base}/kunden/${s.id}`}>{s.operator_name || s.name || 'Kunde'}</Link> : 'Kunde'}
                          </div>
                          <div className="muted aw-sub">
                            <Link to={`${base}/anlagen/${c.asset.id}`}>{c.asset.name}</Link>
                            {[c.asset.manufacturer, c.asset.model].filter(Boolean).map((t) => ` · ${t}`).join('')}
                          </div>
                          <p className="aw-reason">{c.reason}</p>
                        </div>
                      </div>
                      <div className="aw-actions">
                        <button type="button" className="btn small" onClick={() => setMsg({ c, site: s })}>
                          <Send className="i" aria-hidden /> Kunde informieren
                        </button>
                        <Link
                          className="btn ghost small"
                          to={`${base}/plantafel?neu=1&objekt=${encodeURIComponent(c.asset.site_id)}&anlage=${encodeURIComponent(c.asset.id)}&titel=${encodeURIComponent('Besichtigung')}`}
                        >
                          <CalendarPlus className="i" aria-hidden /> Besichtigung
                        </Link>
                        <Link className="btn ghost small" to={`${base}/rechnungen/neu?art=angebot&objekt=${encodeURIComponent(c.asset.site_id)}`}>
                          <FileText className="i" aria-hidden /> Angebot
                        </Link>
                        <label className={`idx-check aw-push${isDone ? ' aw-checked' : ''}`}>
                          <input type="checkbox" checked={isDone} onChange={(e) => setContacted(c.asset.id, e.target.checked)} />
                          {isDone ? 'angesprochen ✓' : 'angesprochen?'}
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {list.length > 0 && (
              <p className="muted small">
                Förderungen ändern sich laufend — die Nachricht nennt sie nur als Hinweis, ohne Beträge. „angesprochen“ merkt sich
                dieser Browser (wie in der App das Handy), es wird nicht mit dem Team geteilt.
              </p>
            )}

            {msg && (
              <MessageDialog
                title="🔥 Kunde informieren"
                text={replacementMessage({ ageYears: msg.c.ageYears, kind: msg.c.asset.kind, customer: msg.site?.operator_name, firm: org.name, land: org.land })}
                site={msg.site}
                land={org.land}
                subject="Ihre Heizung: Erneuerung und Förderung"
                onSent={() => setContacted(msg.c.asset.id, true)}
                onClose={() => setMsg(null)}
              />
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
