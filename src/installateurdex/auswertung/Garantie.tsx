// Garantie-Wächter — wie App screens/WarrantyWatchScreen.tsx: laufende Hersteller-Garantien im Bestand → gefährdet,
// Wartung bald, endet bald, ohne Wartungsvertrag. Je Anlage die passenden Handgriffe.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, FileText, Handshake, Send } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useInst } from '../context';
import { kindInfo } from '../types';
import { ConfirmDialog, MessageDialog, ShareRing } from './parts';
import { WATCH_LABELS, WATCH_ORDER, warrantyMessageFor, warrantyWatch, type WatchEntry, type WatchKind } from './logic';

type Filter = 'all' | WatchKind;

const TONE: Record<WatchKind, string> = { risk: 'red', soon: 'amber', ending: 'accent', noContract: 'muted' };

export function Garantie() {
  const { data, ext, org, base, isOwner } = useInst();
  const state = useAsync(async () => {
    const [sites, assets, lastService] = await Promise.all([data.sites(), data.assets(), data.lastService()]);
    return { sites, assets, lastService };
  }, [data]);
  useLiveRefresh([state.refresh], 60000);
  const [filter, setFilter] = useState<Filter>('all');
  const [msg, setMsg] = useState<WatchEntry | null>(null);
  const [contract, setContract] = useState<WatchEntry | null>(null);

  return (
    <LoadGuard state={state}>
      {({ sites, assets, lastService }) => {
        const r = warrantyWatch(assets, lastService, sites);
        const share = r.active ? r.covered / r.active : 0;
        const shown = filter === 'all' ? r.entries : r.entries.filter((e) => e.kind === filter);
        // Filter erst ab zwei verschiedenen Lagen — sonst nur Ballast (wie App)
        const filters: { id: Filter; label: string; n: number }[] = [
          { id: 'all', label: 'Alle', n: r.entries.length },
          ...WATCH_ORDER.filter((k) => r.counts[k] > 0 || filter === k).map((k) => ({
            id: k as Filter,
            label: `${WATCH_LABELS[k].emoji} ${WATCH_LABELS[k].short}`,
            n: r.counts[k],
          })),
        ];
        return (
          <>
            <section className="idx-hero aw-hero" aria-label="Garantie-Wächter">
              <ShareRing share={share} label={`${Math.round(share * 100)} %`} empty={!r.active} />
              <div style={{ minWidth: 0 }}>
                <div className="idx-hero-label">Zu tun</div>
                <div className="idx-hero-value">{r.entries.length}</div>
                <div className="idx-hero-sub">
                  {r.entries.length === 1 ? 'Anlage braucht' : 'Anlagen brauchen'} einen Handgriff · {r.covered} von {r.active}{' '}
                  Garantien mit Wartungsvertrag
                </div>
              </div>
            </section>

            {r.active === 0 ? (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Noch keine Garantien eingetragen</h3>
                <p className="muted" style={{ marginBottom: 0 }}>
                  In der App bei jeder Anlage unter „Mehr Angaben → Garantie“ das Garantie-Ende und die Bedingung eintragen (z. B.
                  „nur mit jährlicher Wartung durch Fachbetrieb“). Der Wächter meldet dann, wenn eine Garantie in Gefahr ist oder
                  ausläuft, und liefert den passenden Text für den Kunden.
                </p>
              </div>
            ) : (
              <>
                {filters.length > 2 && (
                  <div className="idx-tabs" role="tablist" aria-label="Lage">
                    {filters.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.id}
                        className={filter === f.id ? 'on' : ''}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.label} <span className="n">{f.n}</span>
                      </button>
                    ))}
                  </div>
                )}
                {shown.length === 0 ? (
                  <div className="card">
                    <h3 style={{ marginTop: 0 }}>{filter === 'all' ? '✅ Alles abgesichert' : 'Hier ist gerade nichts'}</h3>
                    <p className="muted" style={{ marginBottom: 0 }}>
                      {filter === 'all'
                        ? 'Keine Garantie in Gefahr, nichts läuft in den nächsten 90 Tagen aus, und wo die Garantie an Wartung hängt, gibt es einen Wartungsvertrag.'
                        : 'In dieser Lage ist keine Anlage. „Alle“ zeigt die ganze Liste.'}
                    </p>
                  </div>
                ) : (
                  <div className="aw-list">
                    {shown.map((e) => {
                      const k = kindInfo(e.asset.kind);
                      const termin = e.kind === 'risk' || e.kind === 'soon';
                      return (
                        <article key={e.asset.id} className={`card aw-card aw-tone-${TONE[e.kind]}`}>
                          <div className={`aw-badge aw-tone-${TONE[e.kind]}`}>
                            {WATCH_LABELS[e.kind].emoji} {WATCH_LABELS[e.kind].title}
                          </div>
                          <div className="aw-title">
                            {k.emoji}{' '}
                            {e.site ? (
                              <Link to={`${base}/kunden/${e.site.id}`}>{e.site.operator_name || e.site.name || 'Kunde'}</Link>
                            ) : (
                              'Kunde'
                            )}
                          </div>
                          <div className="muted aw-sub">
                            <Link to={`${base}/anlagen/${e.asset.id}`}>{e.asset.name}</Link>
                            {[e.asset.manufacturer, e.asset.model].filter(Boolean).map((t) => ` · ${t}`).join('')}
                          </div>
                          <p className="aw-reason">{e.reason}</p>
                          {e.asset.warranty_note && <p className="aw-note">Bedingung: {e.asset.warranty_note}</p>}
                          <div className="aw-actions">
                            <button type="button" className="btn small" onClick={() => setMsg(e)}>
                              <Send className="i" aria-hidden /> Kunde informieren
                            </button>
                            {termin ? (
                              <Link
                                className="btn ghost small"
                                to={`${base}/plantafel?neu=1&objekt=${encodeURIComponent(e.asset.site_id)}&anlage=${encodeURIComponent(e.asset.id)}&titel=${encodeURIComponent('Wartung (Garantie)')}`}
                              >
                                <CalendarPlus className="i" aria-hidden /> Termin
                              </Link>
                            ) : (
                              // Angebote schreibt nur der Inhaber (Rechnungen & Angebote sind für Monteure gesperrt)
                              isOwner && (
                                <Link className="btn ghost small" to={`${base}/rechnungen/neu?art=angebot&objekt=${encodeURIComponent(e.asset.site_id)}`}>
                                  <FileText className="i" aria-hidden /> Angebot
                                </Link>
                              )
                            )}
                            {/* Anlagen ändern darf nur der Inhaber (RLS item_update) */}
                            {isOwner && !e.asset.contract && (
                              <button type="button" className="btn ghost small aw-push" onClick={() => setContract(e)}>
                                <Handshake className="i" aria-hidden /> Vertrag ✓
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {shown.length > 0 && (
                  <p className="muted small">
                    Der Wächter wertet nur die eingetragenen Garantie-Daten aus. Was genau gilt, steht in den Garantiebedingungen des
                    Herstellers.
                  </p>
                )}
              </>
            )}

            {msg && (
              <MessageDialog
                title={`${WATCH_LABELS[msg.kind].emoji} Kunde informieren`}
                text={warrantyMessageFor(msg, org.name)}
                site={msg.site}
                land={org.land}
                subject={`Ihre Anlage ${msg.asset.name}: Garantie`}
                onClose={() => setMsg(null)}
              />
            )}
            {contract && (
              <ConfirmDialog
                title="Wartungsvertrag vermerken?"
                confirmLabel="Vermerken"
                onClose={() => setContract(null)}
                onConfirm={async () => {
                  await ext.auswertung.markContract(contract.asset.id);
                  state.refresh();
                }}
              >
                <p style={{ margin: 0 }}>
                  {contract.site?.operator_name || 'Der Kunde'} hat für {contract.asset.name} einen Wartungsvertrag abgeschlossen. Den
                  Preis kannst du danach in der App bei der Anlage eintragen.
                </p>
              </ConfirmDialog>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
