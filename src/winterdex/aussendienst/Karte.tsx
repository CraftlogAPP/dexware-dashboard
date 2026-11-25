// Reiter „Karte“ im Außendienst — wie in der App: alle aktiven Objekte als Punkte (grün = heute dokumentiert,
// orange = heute noch offen), Strecken als Linien (grün = heute gefahren, orange = offen). Antippen öffnet eine
// Karte mit „Einsatz erfassen“ und „Navigation“. Leaflet + OpenStreetMap (ohne Schlüssel), eigener Chunk.
// Ohne Netz gibt es keine Kacheln — dann bleibt die Liste unter „Objekte“ der Weg.
//
// Ausschnitt wie die App (mobile 278395c, Alex 25.11.2026: „Ich lande in einer riesigen Europakarte“):
//   · Start direkt auf allen Objekten (kein Sprung über Europa); 1 Objekt = Straßenebene.
//   · Ohne Objekt-Standort: eigener Standort (nur mit SCHON erteilter Erlaubnis), sonst das Land des Betriebs.
//   · Neu dazukommende Objekte werden eingepasst — solange niemand die Karte selbst verschoben/gezoomt hat.
//   · Chips „Alle n / Offen n / Erledigt n“: zoomen auf genau diese (andere blass), nochmal tippen = alle.
//   · Knöpfe „Alle Objekte“ und „Mein Standort“ (fragt erst beim Antippen nach der Erlaubnis).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Scan } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useOrgOptional } from '../../components/OrgContext';
import { useEinsatz } from '../einsatz/context';
import { loadEinsatzData } from '../einsatz/data';
import { isToday } from '../einsatz/amount';
import type { Property } from '../types';
import type { Route, RunMeta } from '../routes';
import {
  LAND_BOX,
  STADTTEIL_ZOOM,
  STRASSE_ZOOM,
  boxKey,
  boxOf,
  landAusZeitzone,
  meinStandort,
  naechsterFilter,
  standortOhneNachfrage,
  type Box,
  type KartenFilter,
} from './kartenAusschnitt';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const GREEN = '#22c55e';
const ORANGE = '#f59e0b';
const BLUE = '#3b82f6';
/** Blass = gehört nicht zum gewählten Chip */
const LEISE = 0.28;

interface MapData {
  properties: Property[];
  doneAt: Map<string, string>;
  routes: Route[];
  drivenRouteIds: Set<string>;
  offline: boolean;
}

type Selection = { kind: 'property'; id: string } | { kind: 'route'; id: string } | null;
/** Ausschnitt ohne Objekt-Standorte: eigener Standort oder Land */
type Start = { center: L.LatLngTuple; zoom: number } | { box: Box };

const hasPos = (p: Property): p is Property & { lat: number; lng: number } => p.lat != null && p.lng != null;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const bounds = (b: Box) => L.latLngBounds([b.minLat, b.minLng], [b.maxLat, b.maxLng]);

export default function Karte() {
  const { be, userId, orgId, base } = useEinsatz();
  const state = useAsync<MapData>(async () => {
    const d = await loadEinsatzData(be, userId, orgId);
    const doneAt = new Map<string, string>();
    for (const o of d.todayOps) if (!o.canceled && isToday(o.started_at)) doneAt.set(o.property_id, o.started_at);
    // Strecken sind Zugabe: fehlen sie (alte Datenbank, Funkloch), zeigt die Karte trotzdem die Objekte.
    let routes: Route[] = [];
    let runs: RunMeta[] = [];
    if (!d.offline) {
      try {
        const list = (await be.listRoutes()).filter((r) => r.active);
        const full = await Promise.all(list.map((r) => be.getRoute(r.id).catch(() => null)));
        routes = full.filter((r): r is Route => !!r && Array.isArray(r.path) && r.path.length > 1);
        runs = await be.listTodayRuns().catch(() => []);
      } catch {
        routes = [];
      }
    }
    const drivenRouteIds = new Set(runs.filter((r) => !r.canceled && r.route_id && isToday(r.started_at)).map((r) => r.route_id!));
    return { properties: d.properties.filter((p) => p.active), doneAt, routes, drivenRouteIds, offline: d.offline };
  }, [be, userId, orgId]);
  // neue Objekte, heute Erledigtes: still auffrischen (die Karte bleibt stehen, neue Objekte werden eingepasst).
  // Alle 2 Minuten bzw. beim Zurückkehren in den Tab — jede Strecke ist eine eigene Anfrage.
  useLiveRefresh([state.refresh], 2 * 60 * 1000);

  return (
    <>
      <h1>Karte</h1>
      <LoadGuard state={state}>{(d) => <MapView data={d} base={base} />}</LoadGuard>
    </>
  );
}

function MapView({ data, base }: { data: MapData; base: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const mir = useRef<L.CircleMarker | null>(null);
  /** selbst verschoben/gezoomt → nicht mehr automatisch umsetzen (bis „Alle Objekte“ oder ein Chip) */
  const vonHand = useRef(false);
  /** gerade bewegt die Seite selbst die Karte (dann ist ein Zoom kein Eingriff des Nutzers) */
  const steuer = useRef(false);
  /** welcher Ausschnitt gerade automatisch gezeigt wird — ändert er sich, sanft nachführen */
  const gezeigt = useRef<string | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [filter, setFilter] = useState<KartenFilter>('alle');
  const [start, setStart] = useState<Start | null>(null);
  const [sucht, setSucht] = useState(false);
  const [standortHinweis, setStandortHinweis] = useState<string | null>(null);
  const land = useOrgOptional()?.data?.org.land ?? null;

  const placed = useMemo(() => data.properties.filter(hasPos), [data.properties]);
  const unplaced = data.properties.length - placed.length;
  const open = data.properties.filter((p) => !data.doneAt.has(p.id)).length;
  const offenePunkte = placed.filter((p) => !data.doneAt.has(p.id));
  const erledigtePunkte = placed.filter((p) => data.doneAt.has(p.id));

  const allBox = boxOf([
    ...placed.map((p) => [p.lat, p.lng] as const),
    ...data.routes.flatMap((r) => (r.path ?? []).map(([lat, lng]) => [lat, lng] as const)),
  ]);
  const boxFuer = (f: KartenFilter): Box | null =>
    f === 'offen' ? boxOf(offenePunkte.map((p) => [p.lat, p.lng] as const)) : f === 'erledigt' ? boxOf(erledigtePunkte.map((p) => [p.lat, p.lng] as const)) : allBox;
  const keyFuer = (f: KartenFilter) => `${f}|${boxKey(boxFuer(f) ?? allBox)}|${start ? 'start' : ''}`;
  const zielKey = keyFuer(filter);

  // Chip ohne Objekte mehr (z. B. letztes offenes gerade erledigt) → wieder alle
  const filterLeer = filter !== 'alle' && !boxFuer(filter);
  useEffect(() => {
    if (filterLeer) setFilter('alle');
  }, [filterLeer]);

  // Ohne einen einzigen Standort: eigener Standort (nur mit schon erteilter Erlaubnis), sonst das Land des Betriebs
  const ohnePunkte = !allBox;
  useEffect(() => {
    if (!ohnePunkte || start) return;
    let lebt = true;
    void standortOhneNachfrage().then((pos) => {
      if (!lebt) return;
      setStart(pos ? { center: [pos.lat, pos.lng], zoom: STADTTEIL_ZOOM } : { box: LAND_BOX[land ?? landAusZeitzone()] });
    });
    return () => {
      lebt = false;
    };
  }, [ohnePunkte, start, land]);

  /** Ausschnitt setzen — als Programm (kein Eingriff des Nutzers). */
  const setze = (ziel: Start, animate: boolean) => {
    const m = map.current;
    if (!m) return;
    steuer.current = true;
    if ('box' in ziel) m.fitBounds(bounds(ziel.box).pad(0.15), { maxZoom: STRASSE_ZOOM, animate });
    else m.setView(ziel.center, ziel.zoom, { animate });
    window.setTimeout(() => {
      steuer.current = false;
    }, animate ? 700 : 0);
  };
  const ziel = (f: KartenFilter): Start | null => {
    const b = boxFuer(f) ?? allBox;
    return b ? { box: b } : start;
  };
  // für Karten-Ereignisse (Größe ändert sich) immer den aktuellen Stand
  const zielJetzt = useRef(() => ziel(filter));
  zielJetzt.current = () => ziel(filter);
  const keyJetzt = useRef(zielKey);
  keyJetzt.current = zielKey;

  // Karte erst anlegen, wenn der Start-Ausschnitt feststeht — sie öffnet gleich richtig statt über Europa zu springen
  const bereit = !!allBox || !!start;
  useEffect(() => {
    if (!bereit || !el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', () => setSel(null));
    m.on('dragstart', () => {
      vonHand.current = true;
    });
    m.on('zoomstart', () => {
      if (!steuer.current) vonHand.current = true;
    });
    map.current = m;
    const z = zielJetzt.current();
    if (z) setze(z, false);
    gezeigt.current = keyJetzt.current;
    // Im Handy-Rahmen kennt Leaflet die Größe erst nach dem Layout → bei jeder Größenänderung neu einpassen,
    // solange niemand die Karte bewegt hat.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      m.invalidateSize();
      const zz = zielJetzt.current();
      if (!vonHand.current && zz) setze(zz, false);
    });
    ro?.observe(el.current);
    const t = window.setTimeout(() => m.invalidateSize(), 60);
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
      mir.current = null;
    };
    // setze/ziel lesen den aktuellen Stand über Refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bereit]);

  // Standorte kommen dazu bzw. ändern sich (neues Objekt, Chip-Menge kleiner) → sanft nachführen, solange nicht von Hand bewegt
  useEffect(() => {
    if (!map.current || gezeigt.current === zielKey) return;
    gezeigt.current = zielKey;
    if (vonHand.current) return;
    const z = zielJetzt.current();
    if (z) setze(z, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zielKey]);

  // Linien und Punkte (blass, wenn sie nicht zum gewählten Chip gehören)
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const r of data.routes) {
      const pts = (r.path ?? []).map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
      const done = data.drivenRouteIds.has(r.id);
      const leise = filter !== 'alle' && (filter === 'erledigt') !== done;
      const line = L.polyline(pts, { color: done ? GREEN : ORANGE, weight: 5, opacity: leise ? LEISE : 0.85 });
      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSel({ kind: 'route', id: r.id });
      });
      line.addTo(g);
    }
    for (const p of placed) {
      const done = data.doneAt.has(p.id);
      const leise = filter !== 'alle' && (filter === 'erledigt') !== done;
      const mk = L.circleMarker([p.lat, p.lng], {
        radius: 11,
        color: '#ffffff',
        weight: 2,
        opacity: leise ? LEISE : 1,
        fillColor: done ? GREEN : ORANGE,
        fillOpacity: leise ? LEISE : 1,
      });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSel({ kind: 'property', id: p.id });
      });
      mk.addTo(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, placed, filter, bereit]);

  /** Chip: auf genau diese Objekte zoomen; nochmal tippen = wieder alle. „Alle Objekte“ = immer alle. */
  const waehle = (f: KartenFilter) => {
    const next = naechsterFilter(filter, f);
    setFilter(next);
    setSel(null);
    vonHand.current = false;
    const z = ziel(next);
    gezeigt.current = keyFuer(next);
    if (z) setze(z, true);
  };

  /** „Mein Standort“: hier darf der Browser nach der Erlaubnis fragen (ausdrücklich getippt). */
  const zuMir = async () => {
    if (sucht) return;
    setSucht(true);
    setStandortHinweis(null);
    const r = await meinStandort();
    setSucht(false);
    if (r === 'verweigert') {
      setStandortHinweis('Standort nicht freigegeben — damit die Karte zeigt, wo du bist, den Standort in den Einstellungen des Browsers für diese Seite erlauben.');
      return;
    }
    if (!r) {
      setStandortHinweis('Standort gerade nicht gefunden. Bitte gleich noch einmal versuchen.');
      return;
    }
    const m = map.current;
    if (!m) return;
    if (mir.current) mir.current.setLatLng([r.lat, r.lng]);
    else mir.current = L.circleMarker([r.lat, r.lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: BLUE, fillOpacity: 1 }).addTo(m);
    vonHand.current = true; // eigener Standort ist eine bewusste Ansicht → nicht automatisch wegschwenken
    setze({ center: [r.lat, r.lng], zoom: Math.max(m.getZoom(), 15) }, true);
  };

  const selProp = sel?.kind === 'property' ? data.properties.find((p) => p.id === sel.id) : undefined;
  const selRoute = sel?.kind === 'route' ? data.routes.find((r) => r.id === sel.id) : undefined;
  const chip = (f: Exclude<KartenFilter, 'alle'>, n: number) => (
    <button
      type="button"
      className={`ad-map-chip${filter === f ? ' an' : ''}`}
      aria-pressed={filter === f}
      disabled={n === 0}
      onClick={() => waehle(f)}
      title={filter === f ? 'Nochmal tippen = wieder alle' : `Auf die ${f === 'offen' ? 'heute offenen' : 'heute erledigten'} Objekte zoomen`}
    >
      <i style={{ background: f === 'offen' ? ORANGE : GREEN }} /> {f === 'offen' ? 'Offen' : 'Erledigt'} <b>{n}</b>
    </button>
  );

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        {data.properties.length === 0
          ? 'Noch keine aktiven Objekte.'
          : open === 0
            ? `Alle ${data.properties.length} Objekte heute dokumentiert.`
            : `Heute noch offen: ${open} von ${data.properties.length}.`}
      </p>
      {data.offline && (
        <div className="info-box">Keine Verbindung — die Karte braucht Internet. Erfassen geht weiter über „Objekte“.</div>
      )}
      <div className="ad-map-bar">
        <div className="ad-map-chips" role="group" aria-label="Objekte auf der Karte">
          <button type="button" className={`ad-map-chip${filter === 'alle' ? ' an' : ''}`} aria-pressed={filter === 'alle'} onClick={() => waehle('alle')}>
            Alle <b>{placed.length}</b>
          </button>
          {chip('offen', offenePunkte.length)}
          {chip('erledigt', erledigtePunkte.length)}
        </div>
        <div className="ad-map-tools">
          <button type="button" className="btn ghost small" onClick={() => waehle('alle')} disabled={!allBox} title="Alle Objekte und Strecken zeigen">
            <Scan className="i" aria-hidden /> Alle Objekte
          </button>
          <button type="button" className="btn ghost small" onClick={() => void zuMir()} disabled={sucht} title="Karte auf meinen Standort">
            <LocateFixed className="i" aria-hidden /> {sucht ? 'Sucht …' : 'Mein Standort'}
          </button>
        </div>
      </div>
      {standortHinweis && <div className="info-box">{standortHinweis}</div>}
      {/* Leaflet-Behälter ohne React-Kinder; bis der Start-Ausschnitt feststeht (≤ 2,5 s) nur die leere Fläche */}
      <div className={`ad-map${bereit ? '' : ' wartet'}`} ref={el} aria-label="Karte der Objekte" aria-busy={!bereit} />

      {selProp && (
        <div className="card ad-map-card">
          <b>{selProp.name}</b>
          <div className="muted small">{selProp.address}</div>
          <div className="small" style={{ margin: '6px 0 12px' }}>
            {data.doneAt.has(selProp.id) ? `✓ Heute dokumentiert um ${fmtTime(data.doneAt.get(selProp.id)!)} Uhr` : 'Heute noch offen'}
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" to={`${base}/objekt/${selProp.id}`}>Einsatz erfassen</Link>
            {hasPos(selProp) && (
              <a
                className="btn ghost"
                href={`https://www.google.com/maps/dir/?api=1&destination=${selProp.lat},${selProp.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Navigation ↗
              </a>
            )}
          </div>
        </div>
      )}
      {selRoute && (
        <div className="card ad-map-card">
          <b>{selRoute.name}</b>
          <div className="small" style={{ margin: '6px 0 12px' }}>
            {data.drivenRouteIds.has(selRoute.id) ? '✓ Heute gefahren' : 'Heute noch nicht gefahren'}
          </div>
          <Link className="btn" to={`${base}/strecken/${selRoute.id}`}>Strecke öffnen</Link>
        </div>
      )}
      {unplaced > 0 && (
        <p className="muted small">
          {unplaced === 1 ? '1 Objekt hat' : `${unplaced} Objekte haben`} noch keinen Standort und{' '}
          {unplaced === 1 ? 'fehlt' : 'fehlen'} auf der Karte. Den Standort setzt der Inhaber vor Ort unter „Mehr →
          Objekte“ → Objekt öffnen → „Hier stehe ich“ (oder in der App).
        </p>
      )}
    </>
  );
}
