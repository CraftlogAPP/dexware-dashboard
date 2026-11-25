// Echte Karte einer Fahrt (seit 25.11.2026): GPS-Spur auf OpenStreetMap, Start/Ende, Strecken-Vorlage und nicht
// befahrene Abschnitte wie in der Skizze, Unterbrechungen gelb gepunktet, Zeitmarken „09:45“ entlang der Spur.
// Maus über der Linie (bzw. Antippen) zeigt Uhrzeit + km seit Start an der nächsten Stelle; der Zeit-Regler der
// FahrtAnsicht bewegt einen Punkt über die Spur. Leaflet + OSM-Kacheln ohne Schlüssel wie aussendienst/Karte.tsx,
// eigener Chunk (lazy). Kacheln laden nicht → onKachelFehler → die FahrtAnsicht zeigt die Skizze.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ROUTE_COLORS, type LatLng } from './routes';
import { fmtUhr, infoZuPunkt, naechsterPunkt, type FahrtDaten, type ZeitMarke } from './fahrtZeit';

// gleich wie aussendienst/Karte.tsx
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const PAUSE = '#D97706';
const CURSOR = '#2563EB';
/** So nah (Bildschirm-Pixel) muss die Maus/der Finger an der Spur sein */
const HOVER_PX = 22;
const TAP_PX = 34;

export interface KartenCursor {
  lat: number;
  lng: number;
  titel: string;
  zusatz?: string;
}

export interface FahrtKarteProps {
  F: FahrtDaten;
  plan: LatLng[];
  stuecke: LatLng[][];
  missed: LatLng[][];
  marken: ZeitMarke[];
  zeitAn: boolean;
  startLabel: string | null;
  endeLabel: string | null;
  cursor: KartenCursor | null;
  /** Spur angetippt/angeklickt: Index des nächsten Punkts */
  onPick: (i: number) => void;
  onKachelFehler: () => void;
  label: string;
}

type Box = [number, number, number, number];
const ueberlappt = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Meter je Bildschirm-Pixel an dieser Stelle */
function meterProPx(m: L.Map, lat: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (m.getZoom() + 8);
}

function tipInhalt(titel: string, zusatz?: string): HTMLElement {
  const el = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = titel;
  el.appendChild(b);
  if (zusatz) {
    const s = document.createElement('div');
    s.className = 'fk-tip-zusatz';
    s.textContent = zusatz;
    el.appendChild(s);
  }
  return el;
}

export default function FahrtKarte(p: FahrtKarteProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const hover = useRef<L.CircleMarker | null>(null);
  const cur = useRef<L.CircleMarker | null>(null);
  const props = useRef(p);
  props.current = p;

  // Karte + alle Linien einmal je Fahrt anlegen (die Eingaben sind in der FahrtAnsicht vorberechnet und gemerkt)
  useEffect(() => {
    if (!el.current) return;
    const { F, plan, stuecke, missed, marken, zeitAn, startLabel, endeLabel } = props.current;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    map.current = m;
    // Mausrad erst nach Klick in die Karte — sonst bleibt beim Scrollen der Seite die Karte „hängen“
    m.on('focus', () => m.scrollWheelZoom.enable());
    m.on('blur', () => m.scrollWheelZoom.disable());

    // Kacheln: laden keine (kein Netz, gesperrt) → Skizze als Rückfall; die Spur bleibt so immer sichtbar
    let geladen = 0;
    let fehler = 0;
    const tiles = L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 });
    tiles.on('tileload', () => {
      geladen++;
    });
    tiles.on('tileerror', () => {
      fehler++;
      if (geladen === 0 && fehler >= 4) props.current.onKachelFehler();
    });
    tiles.addTo(m);
    const wache = window.setTimeout(() => {
      if (geladen === 0) props.current.onKachelFehler();
    }, 12000);

    // Linien: Vorlage (grau, breit) → Spur (weißer Rand + grün) → nicht befahren (rot gestrichelt)
    const alle: L.LatLngExpression[] = [];
    if (plan.length >= 2) {
      // Vorlage als breites, halbdurchsichtiges Schieferband — reines Grau wie in der Skizze ginge zwischen den grauen
      // Straßen der Karte unter; die Spur liegt darauf, die Ränder des Bands bleiben sichtbar
      L.polyline(plan, { color: ROUTE_COLORS.planMap, weight: 15, opacity: 0.5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(m);
      alle.push(...plan);
    }
    for (const s of stuecke) {
      if (s.length >= 2) {
        L.polyline(s, { color: '#ffffff', weight: 7.5, opacity: 0.85, interactive: false }).addTo(m);
        L.polyline(s, { color: ROUTE_COLORS.track, weight: 4.5, opacity: 1, interactive: false }).addTo(m);
      }
      alle.push(...s);
    }
    for (const s of missed) {
      if (s.length >= 2) L.polyline(s, { color: ROUTE_COLORS.missed, weight: 5, dashArray: '8 6', interactive: false }).addTo(m);
    }

    // Unterbrechungen: gelb gepunktete Verbindung + Pausen-Zeichen (Antippen/Maus: Uhrzeit)
    for (const u of F.unterbrechungen) {
      const zeit = zeitAn && Number.isFinite(u.von) && Number.isFinite(u.bis) ? `${fmtUhr(u.von)}–${fmtUhr(u.bis)}` : '';
      const text = `Unterbrechung${zeit ? ` ${zeit} Uhr` : ''} — Pause oder kein GPS, nicht als gefahren gewertet`;
      if (u.ab && u.an) L.polyline([u.ab, u.an], { color: PAUSE, weight: 3, dashArray: '2 7', opacity: 0.95, interactive: false }).addTo(m);
      const at = u.ab ?? u.an;
      if (at) {
        L.marker(at, {
          icon: L.divIcon({ className: 'fk-pause', html: '<i></i><i></i>', iconSize: [18, 18] }),
          keyboard: false,
          title: text,
        })
          .bindTooltip(text, { direction: 'top', offset: [0, -10], className: 'fk-tip' })
          .addTo(m);
      }
    }

    // Start / Ende — mit Uhrzeit als feste Beschriftung
    const first = stuecke.find((s) => s.length)?.[0] ?? (plan.length ? plan[0] : null);
    const lastSeg = [...stuecke].reverse().find((s) => s.length);
    const last = lastSeg ? lastSeg[lastSeg.length - 1] : plan.length >= 2 ? plan[plan.length - 1] : null;
    // Start und Ende am selben Ort (typisch: ab Bauhof, zurück zum Bauhof) → Start-Beschriftung unter den Punkt
    const zeigtEnde = !!last && alle.length > 1;
    const amSelbenOrt = !!first && zeigtEnde && L.latLng(first).distanceTo(L.latLng(last!)) < 60;
    const se: { ll: L.LatLng; unten: boolean }[] = [];
    if (last && zeigtEnde) {
      const mk = L.circleMarker(last, { radius: 8, color: '#ffffff', weight: 3, fillColor: ROUTE_COLORS.end, fillOpacity: 1, interactive: false }).addTo(m);
      if (endeLabel) mk.bindTooltip(endeLabel, { permanent: true, direction: 'top', offset: [0, -9], className: 'fk-se' });
      se.push({ ll: L.latLng(last), unten: false });
    }
    if (first) {
      // Start zuletzt zeichnen: liegt sonst unter dem Ende-Punkt
      const mk = L.circleMarker(first, { radius: amSelbenOrt ? 6 : 8, color: '#ffffff', weight: 3, fillColor: ROUTE_COLORS.track, fillOpacity: 1, interactive: false }).addTo(m);
      if (startLabel)
        mk.bindTooltip(startLabel, { permanent: true, direction: amSelbenOrt ? 'bottom' : 'top', offset: [0, amSelbenOrt ? 9 : -9], className: 'fk-se' });
      se.push({ ll: L.latLng(first), unten: amSelbenOrt });
    }

    // Zeitmarken
    const tm = marken.map((z) => {
      const mk = L.marker([z.lat, z.lng], {
        icon: L.divIcon({ className: 'fk-tm', html: `<i></i><b>${z.label.replace(/[<>&"]/g, '')}</b>`, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(m);
      return { mk, label: z.label };
    });
    // Beschriftungen ordnen: rechts, sonst links vom Punkt, sonst ausblenden (Punkt bleibt) — nach jedem Zoom neu
    const ordne = () => {
      const belegt: Box[] = [];
      for (const { ll, unten } of se) {
        const q = m.latLngToContainerPoint(ll);
        belegt.push([q.x - 9, q.y - 9, q.x + 9, q.y + 9]);
        if (startLabel || endeLabel) belegt.push(unten ? [q.x - 46, q.y + 8, q.x + 46, q.y + 40] : [q.x - 46, q.y - 40, q.x + 46, q.y - 8]);
      }
      for (const { mk } of tm) {
        const q = m.latLngToContainerPoint(mk.getLatLng());
        belegt.push([q.x - 6, q.y - 6, q.x + 6, q.y + 6]);
      }
      for (const { mk, label } of tm) {
        const q = m.latLngToContainerPoint(mk.getLatLng());
        const w = label.length * 7 + 12;
        const rechts: Box = [q.x + 8, q.y - 10, q.x + 8 + w, q.y + 10];
        const links: Box = [q.x - 8 - w, q.y - 10, q.x - 8, q.y + 10];
        const pos = !belegt.some((b) => ueberlappt(b, rechts)) ? 'rechts' : !belegt.some((b) => ueberlappt(b, links)) ? 'links' : 'aus';
        if (pos !== 'aus') belegt.push(pos === 'rechts' ? rechts : links);
        const e = mk.getElement();
        e?.classList.toggle('links', pos === 'links');
        e?.classList.toggle('aus', pos === 'aus');
      }
    };
    m.on('zoomend', ordne);

    // Ausschnitt: ganze Spur (+ Vorlage) eingepasst; solange niemand die Karte bewegt, bei Größenänderung neu
    let vonHand = false;
    let steuer = false;
    const einpassen = () => {
      steuer = true;
      if (alle.length >= 2) m.fitBounds(L.latLngBounds(alle).pad(0.06), { maxZoom: 17, animate: false });
      else if (alle.length === 1) m.setView(alle[0], 17, { animate: false });
      else m.setView([47.5, 13.5], 6, { animate: false });
      steuer = false;
      ordne();
    };
    m.on('dragstart', () => {
      vonHand = true;
    });
    m.on('zoomstart', () => {
      if (!steuer) vonHand = true;
    });
    einpassen();
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            m.invalidateSize();
            if (!vonHand) einpassen();
            else ordne();
          });
    ro?.observe(el.current);

    // Maus über der Spur: Uhrzeit + km an der nächsten Stelle (nicht bei Touch — dort Antippen)
    const hv = L.circleMarker([0, 0], { radius: 6, color: '#ffffff', weight: 2.5, fillColor: ROUTE_COLORS.end, fillOpacity: 1, interactive: false });
    hv.bindTooltip('', { permanent: true, direction: 'top', offset: [0, -8], className: 'fk-tip' });
    hover.current = hv;
    let frame = 0;
    let letzte: L.LeafletMouseEvent | null = null;
    const zeige = () => {
      frame = 0;
      const e = letzte;
      if (!e || F.n === 0) return;
      const i = naechsterPunkt(F, e.latlng.lat, e.latlng.lng, HOVER_PX * meterProPx(m, e.latlng.lat));
      if (i < 0) {
        if (m.hasLayer(hv)) hv.remove();
        el.current?.classList.remove('fk-zeiger');
        return;
      }
      const info = infoZuPunkt(F, i, zeitAn);
      hv.setLatLng([F.lat[i], F.lng[i]]);
      hv.setTooltipContent(tipInhalt(info.titel, info.zusatz));
      if (!m.hasLayer(hv)) hv.addTo(m);
      el.current?.classList.add('fk-zeiger');
    };
    m.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (L.Browser.mobile) return;
      letzte = e;
      if (!frame) frame = requestAnimationFrame(zeige);
    });
    m.on('mouseout', () => {
      letzte = null;
      if (m.hasLayer(hv)) hv.remove();
      el.current?.classList.remove('fk-zeiger');
    });
    // Klick/Antippen auf die Spur: Regler springt auf diese Uhrzeit (der blaue Punkt zeigt Uhrzeit + km)
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (F.n === 0) return;
      const i = naechsterPunkt(F, e.latlng.lat, e.latlng.lng, TAP_PX * meterProPx(m, e.latlng.lat));
      if (i < 0) return;
      if (m.hasLayer(hv)) hv.remove();
      props.current.onPick(i);
    });

    const t = window.setTimeout(() => {
      m.invalidateSize();
      if (!vonHand) einpassen();
    }, 60);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(wache);
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      m.remove();
      map.current = null;
      hover.current = null;
      cur.current = null;
    };
  }, [p.F, p.plan, p.stuecke, p.missed, p.marken, p.zeitAn, p.startLabel, p.endeLabel]);

  // Punkt des Zeit-Reglers (bzw. der angetippten Stelle)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = p.cursor;
    if (!c) {
      cur.current?.remove();
      cur.current = null;
      return;
    }
    if (!cur.current) {
      cur.current = L.circleMarker([c.lat, c.lng], { radius: 9, color: '#ffffff', weight: 3, fillColor: CURSOR, fillOpacity: 1, interactive: false });
      cur.current.bindTooltip('', { permanent: true, direction: 'top', offset: [0, -10], className: 'fk-tip fk-tip-cursor' });
      cur.current.addTo(m);
    }
    cur.current.setLatLng([c.lat, c.lng]);
    cur.current.setTooltipContent(tipInhalt(c.titel, c.zusatz));
    cur.current.bringToFront();
    if (!m.getBounds().pad(-0.08).contains([c.lat, c.lng])) m.panInside([c.lat, c.lng], { padding: [40, 40], animate: false });
    // auch nach einem Neuaufbau der Karte (neue Fahrt-Daten) wieder setzen
  }, [p.cursor, p.F, p.plan, p.stuecke, p.missed, p.marken, p.zeitAn, p.startLabel, p.endeLabel]);

  return <div ref={el} className="fk-map" role="region" aria-label={p.label} />;
}
