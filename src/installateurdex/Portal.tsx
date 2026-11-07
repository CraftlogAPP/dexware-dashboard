// Routen + Navigation des Betriebsportals (gleich für echte Daten und Beispieldaten).
// Menü in beschrifteten Gruppen (Vorschlag docs/VEREINFACHUNG-VORSCHLAG.md, Abschnitt 3.1):
// Start · Tagesgeschäft · Büro · Berichte · Einstellungen (eingeklappt). Am Handy 5 feste Knöpfe + „☰ Mehr“.
// Routen bleiben unverändert (alte Links/Lesezeichen funktionieren weiter) — nur die Anzeige-Texte sind neu.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock,
  CreditCard,
  Euro,
  FileUp,
  Flame,
  Gauge,
  Globe,
  Inbox,
  CalendarClock,
  LayoutDashboard,
  ListChecks,
  Menu,
  Package,
  Receipt,
  ShieldAlert,
  Snowflake,
  Store,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAsync, useLiveRefresh } from '../components/ui';
import { useInst } from './context';
import { Einfuehrung } from './Einfuehrung';
import { merkVerfuegbar, readMerk, writeMerk } from './merk';
import { Start } from './pages/Start';
import { Requests } from './pages/Requests';
import { RequestDetail } from './pages/RequestDetail';
import { Maintenance } from './pages/Maintenance';
import { Customers } from './pages/Customers';
import { SiteDetail } from './pages/SiteDetail';
import { AssetDetail } from './pages/AssetDetail';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Abo } from './pages/Abo';
import { Import } from './pages/Import';
import { Plantafel } from './planung/Plantafel';
import { Zeiten } from './planung/Zeiten';
import { Rechnungen } from './geld/Rechnungen';
import { Material } from './geld/Material';
import { Auswertungen } from './auswertung/Auswertungen';
import { Profil } from './auswertung/Profil';
import { Pruefpunkte } from './pruefpunkte/Pruefpunkte';
// @route-import

export function PortalRoutes() {
  const { base } = useInst();
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Start />} />
        <Route path="anfragen" element={<Requests />} />
        <Route path="anfragen/:id" element={<RequestDetail />} />
        <Route path="wartung" element={<Maintenance />} />
        <Route path="kunden" element={<Customers />} />
        <Route path="kunden/:id" element={<SiteDetail />} />
        <Route path="anlagen/:id" element={<AssetDetail />} />
        <Route path="einstellungen" element={<Settings />} />
        <Route path="import" element={<Import />} />
        <Route path="team" element={<Team />} />
        <Route path="abo" element={<Abo />} />
        <Route path="plantafel" element={<Plantafel />} />
        <Route path="zeiten" element={<Zeiten />} />
        <Route path="rechnungen/*" element={<Rechnungen />} />
        <Route path="material" element={<Material />} />
        <Route path="auswertungen/*" element={<Auswertungen />} />
        <Route path="profil" element={<Profil />} />
        <Route path="pruefpunkte" element={<Pruefpunkte />} />
        {/* @routes */}
        <Route path="*" element={<Navigate to={base} replace />} />
      </Route>
    </Routes>
  );
}

type Icon = LucideIcon;

interface NavItem {
  /** Pfad relativ zum Bereich ('' = Start), optional mit #Anker */
  to: string;
  label: string;
  /** Kurzname für die Handy-Leiste */
  short?: string;
  icon: Icon;
  /** Weitere Pfade, unter denen der Eintrag als „aktiv“ gilt (Unterseiten) */
  also?: string[];
  count?: boolean;
}

interface NavGroup {
  id: string;
  title: string | null;
  items: NavItem[];
  collapsible?: boolean;
}

const START: NavItem = { to: '', label: 'Start', icon: LayoutDashboard };
const ANFRAGEN: NavItem = { to: 'anfragen', label: 'Anfragen', icon: Inbox, count: true };
const PLANTAFEL: NavItem = { to: 'plantafel', label: 'Plantafel', icon: CalendarDays };
const WARTUNG: NavItem = { to: 'wartung', label: 'Fällige Wartungen', short: 'Wartung', icon: CalendarClock };
const KUNDEN: NavItem = { to: 'kunden', label: 'Kunden & Anlagen', short: 'Kunden', icon: Building2, also: ['anlagen'] };
const ZEITEN: NavItem = { to: 'zeiten', label: 'Zeiten', icon: Clock };
const EINST_ITEMS = ['einstellungen', 'pruefpunkte', 'team', 'profil', 'import', 'abo'];

/** Menü je Rolle. Monteure: kein Büro, von den Berichten nur „Garantie in Gefahr“ (wie die App). */
function groupsFor(isOwner: boolean): NavGroup[] {
  return [
    { id: 'start', title: null, items: [START] },
    {
      id: 'tag',
      title: 'Tagesgeschäft',
      // Monteure sehen ihre eigenen Zeiten weiterhin — ohne die Gruppe „Büro“ hier.
      items: [ANFRAGEN, PLANTAFEL, WARTUNG, KUNDEN, ...(isOwner ? [] : [ZEITEN])],
    },
    ...(isOwner
      ? [
          {
            id: 'buero',
            title: 'Büro',
            items: [
              { to: 'rechnungen', label: 'Rechnungen & Angebote', icon: Receipt },
              { to: 'material', label: 'Material & Preise', icon: Package },
              ZEITEN,
            ],
          },
        ]
      : []),
    {
      id: 'berichte',
      title: 'Berichte',
      items: [
        { to: 'auswertungen/garantie', label: 'Garantie in Gefahr', icon: ShieldAlert },
        ...(isOwner
          ? [
              { to: 'auswertungen/cockpit', label: 'Cockpit', icon: Gauge },
              { to: 'auswertungen/heizungstausch', label: 'Tausch-Chancen', icon: Flame },
              { to: 'auswertungen/kaeltemittel', label: 'Kältemittel-Jahresbericht', icon: Snowflake },
              { to: 'auswertungen/woche', label: 'Wochenbericht', icon: BarChart3 },
            ]
          : []),
      ],
    },
    {
      id: 'einst',
      title: 'Einstellungen',
      collapsible: true,
      items: [
        { to: 'einstellungen', label: 'Betrieb & Land', icon: Store },
        ...(isOwner ? [{ to: 'einstellungen#preise', label: 'Preis je Wartung', icon: Euro }] : []),
        { to: 'pruefpunkte', label: 'Prüfpunkte', icon: ListChecks },
        { to: 'team', label: 'Team', icon: Users },
        ...(isOwner
          ? [
              { to: 'profil', label: 'Neue Kunden über den Helfer', icon: Globe },
              { to: 'import', label: 'Import', icon: FileUp },
            ]
          : []),
        { to: 'abo', label: 'Abo', icon: CreditCard },
      ],
    },
  ];
}

/** Die fünf festen Knöpfe der Handy-Leiste (der Rest steckt unter „Mehr“). */
const MOBILE: NavItem[] = [START, ANFRAGEN, PLANTAFEL, WARTUNG, KUNDEN];

function Shell() {
  const { base, org, role, data, requestsVersion, isOwner, userKey } = useInst();
  const location = useLocation();
  // Neue Anfragen in der Navigation — still alle 60 s und beim Zurückwechseln in den Tab.
  const count = useAsync(() => data.newRequestCount(), [data, requestsVersion]);
  useLiveRefresh([count.refresh], 60000);
  const n = count.data ?? 0;

  const rel = location.pathname.startsWith(base) ? location.pathname.slice(base.length).replace(/^\/+|\/+$/g, '') : '';

  /** Ist der Eintrag die aktuelle Seite? Anker (#preise) zählen mit, damit nur einer der beiden Einstellungs-Einträge leuchtet. */
  const isActive = (item: NavItem) => {
    const [path, hash] = item.to.split('#');
    if (path === '') return rel === '';
    const hit = [path, ...(item.also ?? [])].some((p) => rel === p || rel.startsWith(`${p}/`));
    if (!hit) return false;
    if (path === 'einstellungen') return hash ? location.hash === `#${hash}` : location.hash !== '#preise' || !isOwner;
    return true;
  };

  // Einstellungen: eingeklappt, Zustand gemerkt; auf einer Einstellungs-Seite automatisch offen.
  const einstKey = `idx-nav-einst:${userKey}`;
  const [einstOpen, setEinstOpen] = useState(() => readMerk(einstKey) === '1');
  const onEinstPage = EINST_ITEMS.some((p) => rel === p || rel.startsWith(`${p}/`));
  useEffect(() => {
    if (onEinstPage) setEinstOpen(true);
  }, [onEinstPage]);
  const toggleEinst = () =>
    setEinstOpen((o) => {
      writeMerk(einstKey, o ? '0' : '1');
      return !o;
    });

  // Handy: „Mehr“-Tafel. Schließt bei Seitenwechsel, Esc und Klick daneben.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const mbar = useRef<HTMLElement>(null);
  // Tafel beginnt direkt unter der Leiste (darüber können Kopf und Hinweis-Banner unterschiedlich hoch sein)
  const [panelTop, setPanelTop] = useState(120);
  const navId = useId();
  useEffect(() => setMoreOpen(false), [location.pathname, location.search, location.hash]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        moreBtn.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // Einführung: einmal je Nutzer beim ersten Besuch, später über „Einführung“ im Menü.
  const introKey = `idx-intro-v1:${userKey}`;
  // Ohne Browser-Speicher nicht bei jedem Laden aufdrängen — dann nur über den Menüeintrag.
  const [introOpen, setIntroOpen] = useState(() => merkVerfuegbar() && readMerk(introKey) === null);
  const closeIntro = () => {
    writeMerk(introKey, new Date().toISOString());
    setIntroOpen(false);
  };
  const openIntro = () => {
    setMoreOpen(false);
    setIntroOpen(true);
  };

  const href = (item: NavItem) => (item.to ? `${base}/${item.to}` : base);
  const countBadge = (item: NavItem, cls = 'idx-nav-count') =>
    item.count && n > 0 ? (
      <span className={cls} title={`${n} neue Anfragen`}>
        {n}
      </span>
    ) : null;

  const link = (item: NavItem) => {
    const active = isActive(item);
    const Ico = item.icon;
    return (
      <Link
        key={item.to}
        to={href(item)}
        className={active ? 'active' : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          // „Betrieb & Land“ aus „Preis je Wartung“ heraus: zurück an den Seitenanfang
          if (item.to === 'einstellungen' && location.hash) window.scrollTo({ top: 0 });
        }}
      >
        <Ico className="i" aria-hidden /> {item.label}
        {countBadge(item)}
      </Link>
    );
  };

  const groups = groupsFor(isOwner);
  const mobileActive = MOBILE.some(isActive);

  return (
    <div className="app-shell idx-scope">
      {/* Handy: 5 feste Einträge + „Mehr“ (statt einer langen Scroll-Leiste) */}
      <nav ref={mbar} className="idx-mbar" aria-label="Schnellmenü">
        {MOBILE.map((item) => {
          const active = isActive(item);
          const Ico = item.icon;
          return (
            <Link key={item.to} to={href(item)} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
              <span className="idx-mbar-ico">
                <Ico className="i" aria-hidden />
                {countBadge(item, 'idx-mbar-count')}
              </span>
              <span className="idx-mbar-label">{item.short ?? item.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreBtn}
          type="button"
          className={moreOpen || !mobileActive ? 'active' : undefined}
          aria-expanded={moreOpen}
          aria-controls={navId}
          onClick={() => {
            if (mbar.current) setPanelTop(Math.round(mbar.current.getBoundingClientRect().bottom));
            setMoreOpen((o) => !o);
          }}
        >
          <span className="idx-mbar-ico">{moreOpen ? <X className="i" aria-hidden /> : <Menu className="i" aria-hidden />}</span>
          <span className="idx-mbar-label">Mehr</span>
        </button>
      </nav>
      {moreOpen && <div className="idx-more-backdrop" aria-hidden style={{ top: panelTop }} onClick={() => setMoreOpen(false)} />}

      <nav
        id={navId}
        className={`app-nav idx-nav${moreOpen ? ' open' : ''}`}
        aria-label="Hauptmenü"
        style={moreOpen ? ({ '--idx-panel-top': `${panelTop}px` } as CSSProperties) : undefined}
      >
        {groups.map((g) => {
          if (g.items.length === 0) return null;
          if (!g.collapsible) {
            return (
              <div key={g.id} className="idx-nav-group" role="group" aria-label={g.title ?? 'Start'}>
                {g.title && (
                  <div className="idx-nav-title" aria-hidden>
                    {g.title}
                  </div>
                )}
                {g.items.map(link)}
              </div>
            );
          }
          const listId = `${navId}-${g.id}`;
          return (
            <div key={g.id} className="idx-nav-group">
              <button
                type="button"
                className="idx-nav-title idx-nav-toggle"
                aria-expanded={einstOpen}
                aria-controls={listId}
                onClick={toggleEinst}
              >
                {g.title}
                <ChevronDown className={`i idx-nav-chev${einstOpen ? ' up' : ''}`} aria-hidden />
              </button>
              <div id={listId} className="idx-nav-sub" hidden={!einstOpen}>
                {g.items.map(link)}
              </div>
            </div>
          );
        })}
        <div className="idx-nav-spacer" aria-hidden />
        <button type="button" className="idx-nav-help" onClick={openIntro}>
          <CircleHelp className="i" aria-hidden /> Einführung ansehen
        </button>
        <div className="nav-footer">
          <b>{org.name}</b>
          <br />
          Rolle: {role === 'owner' ? 'Inhaber' : 'Mitarbeiter'}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
      {introOpen && <Einfuehrung onClose={closeIntro} />}
    </div>
  );
}
