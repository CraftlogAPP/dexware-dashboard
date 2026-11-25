// Gratis nach Ablauf von Pro — Banner, Auswahl-Dialog und Hinweis bei einer Ablehnung (Logik: gratisLage.ts).
// Ohne den Server-Nachtrag (RPC gratis_lage fehlt) zeigt nichts davon etwas an.
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Clock, TriangleAlert } from 'lucide-react';
import { useAppAuth, useAppAuthOptional } from '../auth/AppAuthContext';
import { useOrgOptional } from '../components/OrgContext';
import { Modal } from '../components/form';
import { useAsync, useLiveRefresh } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { fetchOperationMeta, fetchProperties } from './api';
import { fetchRecentRuns, fetchRoutes } from './routes';
import {
  aufGratisAenderung,
  bannerInhalt,
  fetchGratisLage,
  gratisArtText,
  istObjektArt,
  meldeGratisAenderung,
  vorauswahl,
  type GratisArt,
} from './gratisLage';
import { nachTour, neuePlaetze, verschiebe } from './tour';
import type { Property } from './types';

type Art = 'objekte' | 'strecken';

/**
 * Banner oben im WinterDex-Bereich (Dashboard und Außendienst): in der Nachfrist „noch bis …“, danach „wähle deine
 * 2 Objekte“. Nur für Betriebe, die laut Server SICHER kein Pro mehr haben und über einer Grenze liegen.
 */
export function GratisBanner({ aboUrl }: { aboUrl: string }) {
  // ohne Anmeldung/Betrieb (Beispieldaten im Dev-Server) gibt es keine Lage → kein Banner
  const client = useAppAuthOptional()?.client ?? null;
  const owner = useOrgOptional()?.data?.role === 'owner';
  const lage = useAsync(() => (client ? fetchGratisLage(client) : Promise.resolve(null)), [client]);
  useEffect(() => aufGratisAenderung(lage.refresh), [lage.refresh]);
  // selten nachfragen: über der Grenze fragt der Server bei jedem Aufruf ggf. RevenueCat
  useLiveRefresh([lage.refresh], 10 * 60 * 1000);
  const [dialog, setDialog] = useState<Art | null>(null);
  const inhalt = bannerInhalt(lage.data ?? null, fmtDateTime);
  if (!inhalt) return null;
  return (
    <>
      <div className={`wd-gratis ${inhalt.stufe}`} role="status">
        {inhalt.stufe === 'frist' ? <Clock className="i" aria-hidden /> : <TriangleAlert className="i" aria-hidden />}
        <div className="wd-gratis-body">
          <p>
            <b>{inhalt.titel}</b> {inhalt.text}
          </p>
          <div className="wd-gratis-actions">
            {owner ? (
              <>
                {inhalt.objekteWaehlen && (
                  <button type="button" className="btn small" onClick={() => setDialog('objekte')}>
                    Objekte wählen
                  </button>
                )}
                {inhalt.streckeWaehlen && (
                  <button type="button" className={`btn small${inhalt.objekteWaehlen ? ' ghost' : ''}`} onClick={() => setDialog('strecken')}>
                    Strecke wählen
                  </button>
                )}
                <Link className="btn small ghost" to={aboUrl}>
                  Pro holen
                </Link>
              </>
            ) : (
              <span className="small">Die Auswahl trifft der Inhaber deines Betriebs — oder er holt WinterDex Pro.</span>
            )}
          </div>
        </div>
      </div>
      {dialog && <GratisAuswahl art={dialog} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
    </>
  );
}

/**
 * Hinweis an der Stelle, an der der Server einen Einsatz/eine Fahrt abgelehnt hat (statt des rohen Fehlers):
 * Inhaber wählen bzw. tauschen direkt hier oder holen Pro; Mitarbeiter bekommen den Hinweis auf den Inhaber.
 */
export function GratisFehler({
  art,
  zielId,
  aboUrl,
  zusatz,
  onGewaehlt,
}: {
  art: GratisArt;
  /** Objekt/Strecke, die abgelehnt wurde — im Dialog vorausgewählt (Tausch) */
  zielId?: string | null;
  aboUrl: string;
  /** z. B. „Der Einsatz bleibt auf diesem Gerät gesichert …“ */
  zusatz?: string;
  /** nach der Auswahl (z. B. Wartendes sofort erneut senden) */
  onGewaehlt?: () => void;
}) {
  // Auswahl nur mit Anmeldung (Server-Zugriff) und nur für den Inhaber (Server-Regel property_update/route_update)
  const angemeldet = useAppAuthOptional() !== null;
  const rolle = useOrgOptional()?.data?.role;
  const owner = angemeldet && rolle === 'owner';
  const [offen, setOffen] = useState(false);
  const objekte = istObjektArt(art);
  const tausch = art === 'objekt_stillgelegt' || art === 'strecke_stillgelegt';
  return (
    <div className="wd-gratis gesperrt" role="alert">
      <TriangleAlert className="i" aria-hidden />
      <div className="wd-gratis-body">
        <p>
          <b>Gratis-Paket:</b> {gratisArtText(art)}
        </p>
        {zusatz && <p className="small">{zusatz}</p>}
        <div className="wd-gratis-actions">
          {owner ? (
            <>
              <button type="button" className="btn small" onClick={() => setOffen(true)}>
                {tausch ? (objekte ? 'Objekt tauschen' : 'Strecke tauschen') : objekte ? 'Objekte wählen' : 'Strecke wählen'}
              </button>
              <Link className="btn small ghost" to={aboUrl}>
                Pro holen
              </Link>
            </>
          ) : (
            <span className="small">Die Auswahl trifft der Inhaber deines Betriebs — oder er holt WinterDex Pro.</span>
          )}
        </div>
      </div>
      {offen && (
        <GratisAuswahl
          art={objekte ? 'objekte' : 'strecken'}
          pflicht={zielId ?? null}
          onClose={() => setOffen(false)}
          onDone={() => {
            setOffen(false);
            onGewaehlt?.();
          }}
        />
      )}
    </div>
  );
}

interface Eintrag {
  id: string;
  name: string;
  sub: string | null;
  active: boolean;
  tour_pos?: number | null;
}

interface AuswahlDaten {
  eintraege: Eintrag[];
  zuletzt: Map<string, string>;
}

async function ladeAuswahl(client: SupabaseClient, art: Art, pflicht: string | null): Promise<AuswahlDaten> {
  const zuletzt = new Map<string, string>();
  const merke = (id: string | null, at: string) => {
    if (id && (!zuletzt.has(id) || Date.parse(at) > Date.parse(zuletzt.get(id) ?? ''))) zuletzt.set(id, at);
  };
  if (art === 'objekte') {
    const [props, meta] = await Promise.all([fetchProperties(client), fetchOperationMeta(client)]);
    for (const o of meta) if (!o.canceled) merke(o.property_id, o.started_at);
    const eintraege = props
      .filter((p) => p.active || p.id === pflicht)
      .sort(nachTour)
      .map((p) => ({ id: p.id, name: p.name, sub: p.address, active: p.active, tour_pos: p.tour_pos }));
    return { eintraege, zuletzt };
  }
  const routes = await fetchRoutes(client);
  const gezeigt = routes.filter((r) => r.active || r.id === pflicht).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const runs = gezeigt.length ? await fetchRecentRuns(client, gezeigt.map((r) => r.id)) : [];
  for (const r of runs) if (!r.canceled) merke(r.route_id, r.started_at);
  return { eintraege: gezeigt.map((r) => ({ id: r.id, name: r.name, sub: r.notes, active: r.active })), zuletzt };
}

const TEIL = 100; // ids je Anfrage (Adresslänge)

/**
 * Auswahl-Dialog: welche Objekte (2) bzw. welche Strecke (1) bleiben aktiv? Bestätigen legt die übrigen still — nichts
 * wird gelöscht. Mit `pflicht` (gerade abgelehntes, stillgelegtes Ziel) ist es ein Tausch: das Ziel wird danach aktiviert.
 */
export function GratisAuswahl({
  art,
  pflicht = null,
  onClose,
  onDone,
}: {
  art: Art;
  pflicht?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { client } = useAppAuth();
  const limit = art === 'objekte' ? 2 : 1;
  const tabelle = art === 'objekte' ? 'property' : 'route';
  const daten = useAsync(() => ladeAuswahl(client, art, pflicht), [client, art, pflicht]);
  const [wahl, setWahl] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const start = useMemo(
    () => (daten.data ? vorauswahl(daten.data.eintraege.map((e) => e.id), daten.data.zuletzt, limit, pflicht) : []),
    [daten.data, limit, pflicht],
  );
  const gewaehlt = wahl ?? start;

  const umschalten = (id: string) => {
    const jetzt = gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id];
    // bei Limit 1 ersetzt ein Klick die Auswahl; sonst höchstens `limit`
    setWahl(limit === 1 ? (gewaehlt.includes(id) ? [] : [id]) : jetzt.slice(-limit));
  };

  async function bestaetigen() {
    if (!daten.data || gewaehlt.length === 0) return;
    setBusy(true);
    setFehler(null);
    try {
      const stilllegen = daten.data.eintraege.filter((e) => e.active && !gewaehlt.includes(e.id)).map((e) => e.id);
      const aktivieren = daten.data.eintraege.filter((e) => !e.active && gewaehlt.includes(e.id)).map((e) => e.id);
      // ERST stilllegen, dann aktivieren — sonst lehnt der Server das Aktivieren über der Grenze ab
      for (let i = 0; i < stilllegen.length; i += TEIL) {
        const teil = stilllegen.slice(i, i + TEIL);
        const { data, error } = await client.from(tabelle).update({ active: false }).in('id', teil).select('id');
        if (error) throw new Error(error.message);
        if ((data ?? []).length !== teil.length) throw new Error('Stilllegen kann nur der Inhaber des Betriebs.');
      }
      for (const id of aktivieren) {
        const { data, error } = await client.from(tabelle).update({ active: true }).eq('id', id).select('id');
        if (error) throw new Error(error.message.replace(/^Gratis-Grenze:\s*/, ''));
        if ((data ?? []).length !== 1) throw new Error('Aktivieren kann nur der Inhaber des Betriebs.');
      }
      meldeGratisAenderung();
      onDone();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      meldeGratisAenderung(); // Teilschritte sind schon gespeichert → Listen auffrischen
    } finally {
      setBusy(false);
    }
  }

  const wort = art === 'objekte' ? { titel: 'Deine 2 Objekte wählen', n: '2 Objekte', rest: 'übrigen Objekte' } : { titel: 'Deine Strecke wählen', n: '1 Strecke', rest: 'übrigen Strecken' };
  return (
    <Modal title={wort.titel} onClose={onClose} dirty={false}>
      <p>
        Im Gratis-Paket sind {wort.n} aktiv nutzbar. Die {wort.rest} werden <b>stillgelegt — nichts wird gelöscht</b>: sie und
        alle bisherigen Nachweise bleiben sichtbar und exportierbar. Mit Pro sind sie jederzeit wieder aktiv; tauschen
        geht auch später (eins stilllegen, ein anderes aktivieren).
      </p>
      {daten.loading && !daten.data ? (
        <div className="empty">
          <span className="spinner" />
        </div>
      ) : daten.error ? (
        <div className="error-box">{daten.error}</div>
      ) : (
        <ul className="wd-wahl">
          {(daten.data?.eintraege ?? []).map((e) => {
            const an = gewaehlt.includes(e.id);
            const zuletzt = daten.data?.zuletzt.get(e.id);
            return (
              <li key={e.id}>
                <label className={an ? 'an' : ''}>
                  <input type={limit === 1 ? 'radio' : 'checkbox'} name="wd-wahl" checked={an} onChange={() => umschalten(e.id)} />
                  <span>
                    <b>{e.name}</b>
                    <span className="muted small">
                      {e.sub ? `${e.sub} · ` : ''}
                      {zuletzt ? `zuletzt ${fmtDateTime(zuletzt)}` : 'noch nie dokumentiert'}
                      {!e.active ? ' · stillgelegt' : ''}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {fehler && <div className="error-box">{fehler}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </button>
        <button type="button" className="btn" onClick={() => void bestaetigen()} disabled={busy || !daten.data || gewaehlt.length === 0}>
          {busy ? 'Speichert …' : gewaehlt.length < limit ? `${gewaehlt.length} von ${limit} gewählt — bestätigen` : 'Auswahl bestätigen'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * „Reihenfolge ändern“ (Tour-Modus, teamweit): aktive Objekte mit ↑/↓ sortieren; speichert property.tour_pos.
 * Nur Inhaber (Server-Regel property_update) und nur, wenn die Datenbank die Spalte kennt (sonst gar nicht angeboten).
 */
export function TourReihenfolge({ objekte, onClose, onSaved }: { objekte: Property[]; onClose: () => void; onSaved: () => void }) {
  const { client } = useAppAuth();
  const [reihe, setReihe] = useState(() => objekte.filter((p) => p.active).sort(nachTour));
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [geaendert, setGeaendert] = useState(false);
  const schiebe = (i: number, r: -1 | 1) => {
    setReihe((l) => verschiebe(l, i, r));
    setGeaendert(true);
  };

  async function speichern() {
    setBusy(true);
    setFehler(null);
    try {
      const plaetze = neuePlaetze(reihe);
      // in kleinen Gruppen gleichzeitig (36 Objekte = 5 Runden statt 36 nacheinander)
      for (let i = 0; i < plaetze.length; i += 8) {
        const res = await Promise.all(
          plaetze.slice(i, i + 8).map((p) => client.from('property').update({ tour_pos: p.tour_pos }).eq('id', p.id).select('id')),
        );
        const err = res.find((r) => r.error)?.error;
        if (err) throw new Error(err.message);
        if (res.some((r) => (r.data ?? []).length !== 1)) throw new Error('Die Reihenfolge ändern kann nur der Inhaber des Betriebs.');
      }
      onSaved();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reihenfolge der Tour" onClose={onClose} dirty={geaendert}>
      <p className="muted">
        In dieser Reihenfolge erscheinen die Objekte im ganzen Team — in der Objektliste, im Außendienst und in der App
        (Tour-Modus). Pausierte Objekte stehen nicht in der Tour.
      </p>
      <ol className="wd-tour">
        {reihe.map((p, i) => (
          <li key={p.id}>
            <span className="wd-tour-nr">{i + 1}</span>
            <span className="wd-tour-name">
              <b>{p.name}</b>
              <span className="muted small">{p.address}</span>
            </span>
            <button type="button" className="btn ghost small" onClick={() => schiebe(i, -1)} disabled={i === 0 || busy} aria-label={`${p.name} nach oben`}>
              <ArrowUp className="i" aria-hidden />
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => schiebe(i, 1)}
              disabled={i === reihe.length - 1 || busy}
              aria-label={`${p.name} nach unten`}
            >
              <ArrowDown className="i" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {fehler && <div className="error-box">{fehler}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </button>
        <button type="button" className="btn" onClick={() => void speichern()} disabled={busy || !geaendert}>
          {busy ? 'Speichert …' : 'Reihenfolge speichern'}
        </button>
      </div>
    </Modal>
  );
}
