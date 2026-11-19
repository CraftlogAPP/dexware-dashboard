// Reiter „Karte“ im Außendienst — wie in der App: alle aktiven Objekte als Punkte (grün = heute dokumentiert,
// orange = heute noch offen), Strecken als Linien (grün = heute gefahren, orange = offen). Antippen öffnet eine
// Karte mit „Einsatz erfassen“ und „Navigation“. Leaflet + OpenStreetMap (ohne Schlüssel), eigener Chunk.
// Ohne Netz gibt es keine Kacheln — dann bleibt die Liste unter „Objekte“ der Weg.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LoadGuard, useAsync } from '../../components/ui';
import { useEinsatz } from '../einsatz/context';
import { loadEinsatzData } from '../einsatz/data';
import { isToday } from '../einsatz/amount';
import type { Property } from '../types';
import type { Route, RunMeta } from '../routes';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
/** Ausschnitt DACH, solange kein Objekt Koordinaten hat. */
const START: L.LatLngTuple = [48.7, 10.5];
const GREEN = '#22c55e';
const ORANGE = '#f59e0b';

interface MapData {
  properties: Property[];
  doneAt: Map<string, string>;
  routes: Route[];
  drivenRouteIds: Set<string>;
  offline: boolean;
}

type Selection = { kind: 'property'; id: string } | { kind: 'route'; id: string } | null;

const hasPos = (p: Property): p is Property & { lat: number; lng: number } => p.lat != null && p.lng != null;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export default function Karte() {
  const { be, userId, base } = useEinsatz();
  const state = useAsync<MapData>(async () => {
    const d = await loadEinsatzData(be, userId);
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
  }, [be, userId]);

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
  const fitted = useRef(false);
  const [sel, setSel] = useState<Selection>(null);

  const placed = useMemo(() => data.properties.filter(hasPos), [data.properties]);
  const unplaced = data.properties.length - placed.length;
  const open = data.properties.filter((p) => !data.doneAt.has(p.id)).length;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(START, 6);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', () => setSel(null));
    map.current = m;
    fitted.current = false; // neue Karte (auch nach erneutem Einhängen) → einmal auf die Punkte zoomen
    // Im Handy-Rahmen kennt Leaflet die Größe erst nach dem ersten Layout.
    const t = window.setTimeout(() => m.invalidateSize(), 60);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const r of data.routes) {
      const pts = (r.path ?? []).map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
      const line = L.polyline(pts, { color: data.drivenRouteIds.has(r.id) ? GREEN : ORANGE, weight: 5, opacity: 0.85 });
      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSel({ kind: 'route', id: r.id });
      });
      line.addTo(g);
      bounds.push(...pts);
    }
    for (const p of placed) {
      const done = data.doneAt.has(p.id);
      const mk = L.circleMarker([p.lat, p.lng], {
        radius: 11,
        color: '#ffffff',
        weight: 2,
        fillColor: done ? GREEN : ORANGE,
        fillOpacity: 1,
      });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSel({ kind: 'property', id: p.id });
      });
      mk.addTo(g);
      bounds.push([p.lat, p.lng]);
    }
    // Nur beim ersten Laden zoomen — danach nicht mehr am Nutzer herumziehen.
    if (!fitted.current && bounds.length) {
      fitted.current = true;
      m.invalidateSize();
      m.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 16 });
    }
  }, [data, placed]);

  const selProp = sel?.kind === 'property' ? data.properties.find((p) => p.id === sel.id) : undefined;
  const selRoute = sel?.kind === 'route' ? data.routes.find((r) => r.id === sel.id) : undefined;

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
      <div className="ad-map" ref={el} aria-label="Karte der Objekte" />
      <div className="ad-map-legend">
        <span><i style={{ background: GREEN }} /> heute erledigt</span>
        <span><i style={{ background: ORANGE }} /> heute offen</span>
      </div>

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
          {unplaced === 1 ? 'fehlt' : 'fehlen'} auf der Karte. Der Standort wird beim ersten Einsatz vor Ort oder unter
          „Mehr → Objekte verwalten“ gesetzt.
        </p>
      )}
    </>
  );
}
