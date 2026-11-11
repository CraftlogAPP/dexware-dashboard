// PinnDex — Live-Karte (Leaflet + OpenStreetMap-Kacheln, ohne Schlüssel). Eigener Chunk, nur auf der Übersicht geladen.
// Jeder Pin = ein Auftrag in Zustandsfarbe; laufende pulsieren und tragen den Namen des Monteurs. Keine Dauer-Ortung:
// laufende Aufträge stehen höchstens am Punkt, den die App EINMAL beim Starten mitgeschickt hat.
// Hinweis: Die Kacheln kommen von tile.openstreetmap.org (Nutzungsregeln: Quellenhinweis, kein Massenabruf) —
// bei vielen Betrieben auf einen Kachel-Anbieter mit Vertrag umstellen (nur TILE_URL ändern).

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATUS_LABEL, type JobStatus } from './types';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
/** Mitte DACH, wenn noch kein Pin da ist */
const START: L.LatLngTuple = [49.2, 10.8];

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  status: JobStatus;
  urgent: boolean;
  title: string;
  /** Monteur (Name), Farbe der Person */
  who: string | null;
  color: string;
  /** Zusatzzeile im Hinweis, z. B. „angekommen 08:03“ */
  extra?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function icon(p: MapPin): L.DivIcon {
  const running = p.status === 'running';
  const label = running && p.who ? `<b>${esc(p.who.split(' ')[0])}</b>` : '';
  return L.divIcon({
    className: 'pinn-pin-wrap',
    html: `<span class="pinn-pin st-${p.status}${p.urgent ? ' urgent' : ''}" style="--pc:${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#888'}"><i></i>${label}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function LiveMap({
  pins,
  focus,
  focusKey,
  onPin,
}: {
  pins: MapPin[];
  /** Pins, auf die gezoomt wird (null = alle) */
  focus: MapPin[] | null;
  /** Wechselt, wenn neu gezoomt werden soll (z. B. Klick auf einen Monteur) */
  focusKey: string;
  onPin: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, worldCopyJump: false });
    m.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    m.setView(START, 6);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // Größe ändert sich (Handy ↔ PC, Seitenleiste) → Karte neu vermessen
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Pins neu zeichnen (wenige Dutzend am Tag — komplett neu ist einfacher als abgleichen)
  useEffect(() => {
    const lg = layer.current;
    if (!lg) return;
    lg.clearLayers();
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lng], { icon: icon(p), keyboard: true, title: `${p.title} — ${STATUS_LABEL[p.status]}`, riseOnHover: true, zIndexOffset: p.status === 'running' ? 1000 : p.urgent ? 500 : 0 });
      mk.bindTooltip(
        `<b>${esc(p.title)}</b><br>${esc(STATUS_LABEL[p.status])}${p.who ? ` · ${esc(p.who)}` : ''}${p.extra ? `<br>${esc(p.extra)}` : ''}`,
        { direction: 'top', offset: [0, -12], className: 'pinn-tip' },
      );
      mk.on('click', () => onPinRef.current(p.id));
      mk.addTo(lg);
    }
  }, [pins]);

  // Zoomen: beim ersten Mal mit Pins und bei jedem neuen Fokus (Klick auf Monteur)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const target = focus ?? pins;
    const key = `${focusKey}|${target.length > 0}`;
    if (fitted.current === key || target.length === 0) return;
    const first = fitted.current === null;
    // einen Frame warten, bis der Kasten seine endgültige Größe hat (sonst rechnet Leaflet mit 0 × 0)
    const raf = requestAnimationFrame(() => {
      fitted.current = key;
      m.invalidateSize({ animate: false });
      const opts = { animate: !first };
      if (target.length === 1) m.setView([target[0].lat, target[0].lng], 15, opts);
      else m.fitBounds(L.latLngBounds(target.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 15, ...opts });
    });
    return () => cancelAnimationFrame(raf);
  }, [focus, focusKey, pins]);

  return <div ref={el} className="pinn-map" role="region" aria-label="Karte mit den Aufträgen von heute" />;
}
