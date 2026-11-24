// WinterDex — „Nach dem Winter weitermachen“ (Plan dexware-suite/docs/ganzjahr-2026-11-24.md 5.2, Dashboard-Fassung).
// Ruhige Seite für alle Nutzer, ganzjährig, kein Pop-up: höchstens 3 Kacheln (ObjektDex, SpielDex, BaumDex), Reihenfolge
// nach geschätztem Betriebstyp (5.4, lib/ganzjahr.ts) — BaumDex fehlt nur bei Hausbetreuung. Links auf die Websites mit
// Herkunft (utm_*), im Browser nie auf Google Play. Übernahme-Link nur für den Inhaber.
// Sichtbar erst mit OBJEKTDEX_OEFFENTLICH (lib/ganzjahr.ts) — Eintrag und Adresse hängen in WinterdexArea.tsx daran.
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { appIcon, getApp } from '../../apps/registry';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { betriebstyp, JAHRESNACHWEIS_PFAD, kacheln, KOMMUNAL_LINK, UEBERNAHME_PFAD, websiteLink, type BrueckenApp } from '../../lib/ganzjahr';

const KACHEL: Record<BrueckenApp, { titel: string; text: string; zusatz?: string }> = {
  objektdex: {
    titel: 'Hausbetreuung, Grünpflege, Reinigung',
    text: 'Leistungen mit Turnus abhaken, Fotos, Mängel, PDF mit Soll/Ist für den Auftraggeber. Kehr- und Mährunden funktionieren wie deine Strecken.',
  },
  spieldex: {
    titel: 'Spielplätze kontrollieren',
    text: 'Sicht-, Funktions- und Jahreskontrolle nach EN 1176-7, Gerät für Gerät, Kontrollbuch als PDF.',
  },
  baumdex: {
    titel: 'Bäume kontrollieren',
    text: 'Baumkataster mit Karte, Fristen und Maßnahmen.',
    zusatz: '14 Tage kostenlos testen, Abo über die Website.',
  },
};

export function NachDemWinter() {
  const { session } = useAppAuth();
  const { data } = useOrg();
  return (
    <NachDemWinterInhalt
      orgName={data?.org.name ?? ''}
      email={session?.user.email ?? ''}
      inhaber={data?.role === 'owner'}
      verwalter={data?.role === 'admin'}
    />
  );
}

/** Inhalt ohne Server — auch für die Dev-Vorschau (/vorschau?app=winterdex&seite=nach-dem-winter). */
export function NachDemWinterInhalt({
  orgName,
  email,
  inhaber,
  verwalter = false,
}: {
  orgName: string;
  email: string;
  inhaber: boolean;
  /** Verwalter sehen wie der Inhaber den Weg zum Ganzjahres-Nachweis (Berichte), aber nicht die Übernahme */
  verwalter?: boolean;
}) {
  const typ = betriebstyp(orgName, email);
  const apps = kacheln(typ);
  return (
    <>
      <h1>Nach dem Winter weitermachen</h1>
      <p className="muted" style={{ marginTop: -6, maxWidth: 760 }}>
        WinterDex macht Sommerpause, deine Daten bleiben. Im Herbst geht es nahtlos weiter. Für die Arbeit dazwischen gibt es Apps
        mit derselben Bedienung:
      </p>
      <div className="tile-grid" style={{ marginTop: 18 }}>
        {apps.map((id, i) => {
          const app = getApp(id);
          const k = KACHEL[id];
          return (
            <div key={id} className="tile" style={{ '--tile-accent': app?.theme.accent, '--enter-delay': `${i * 45}ms` } as React.CSSProperties}>
              <div className="tile-head">
                <img className="tile-icon" src={appIcon(id)} alt="" loading="lazy" />
                <div>
                  <h3>{app?.name ?? id}</h3>
                  <span className="muted small">{k.titel}</span>
                </div>
              </div>
              <p>
                {k.text}
                {k.zusatz && (
                  <>
                    {' '}
                    <b>{k.zusatz}</b>
                  </>
                )}
              </p>
              {id === 'objektdex' && inhaber && (
                <p className="small" style={{ flex: 'none' }}>
                  Deine Objekte und Strecken übernimmst du danach mit einem Klick: <Link to={UEBERNAHME_PFAD}>Aus WinterDex übernehmen</Link>
                </p>
              )}
              {id === 'objektdex' && (inhaber || verwalter) && (
                <p className="small" style={{ flex: 'none' }}>
                  Winter und Rest des Jahres in einem PDF für den Auftraggeber: <Link to={JAHRESNACHWEIS_PFAD}>Ganzjahres-Nachweis</Link>
                </p>
              )}
              <div className="tile-foot">
                <a className="tile-open" href={websiteLink(id)} target="_blank" rel="noopener noreferrer">
                  {id === 'objektdex' ? 'ObjektDex ansehen' : 'Ansehen'} <ArrowUpRight className="i" aria-hidden style={{ width: 15, height: 15, verticalAlign: '-2px' }} />
                </a>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 18, maxWidth: 760 }}>
        Tipp: Objekte und Strecken, die du im Sommer nicht brauchst, pausieren — im Herbst mit einem Klick wieder aktiv.
      </p>
      {typ === 'gemeinde' && (
        <div className="info-box" style={{ maxWidth: 760 }}>
          Für Gemeinden gibt es alle Prüf- und Nachweis-Apps in einem Abo, auf Wunsch auf Rechnung:{' '}
          <a href={KOMMUNAL_LINK} target="_blank" rel="noopener noreferrer">
            dexware.app/kommunal
          </a>
        </div>
      )}
    </>
  );
}
