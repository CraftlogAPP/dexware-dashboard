// WinterDex — „Dein Dankeschön“ (Jahresabo-Dankeschön, Entscheidung Alex 25.11.2026): Wer WinterDex im Jahresabo bezahlt,
// wählt hier EINE App (ObjektDex, SpielDex, BaumDex) und bekommt einen persönlichen Code für 1 Monat Pro. Gedacht vor allem
// für Web-Kunden (Kauf im Browser) — dieselbe Auswahl gibt es in der WinterDex-App. Server: Funktion „gutschein“
// (lib/gutschein.ts). Ruhige Seite ohne Werbung: Wer kein Jahresabo hat, sieht nur eine kurze Erklärung.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, Gift, PartyPopper } from 'lucide-react';
import { appIcon } from '../../apps/registry';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { OBJEKTDEX_OEFFENTLICH } from '../../lib/ganzjahr';
import {
  APP_NAME,
  APP_NUTZEN,
  GUTSCHEIN_APPS,
  dankeschoenApi,
  datumWien,
  einloeseWeg,
  fehlerText,
  websiteLink,
  type DankeschoenApi,
  type Gutschein,
  type GutscheinApp,
  type GutscheinStatus,
} from '../../lib/gutschein';
import '../../components/gutschein.css';

export function Dankeschoen() {
  const { client } = useAppAuth();
  const api = useMemo(() => dankeschoenApi(async () => (await client.auth.getSession()).data.session?.access_token), [client]);
  return <DankeschoenInhalt api={api} />;
}

/** Inhalt mit austauschbarem Server — auch für die Dev-Vorschau (/vorschau?app=winterdex&seite=dankeschoen&zustand=…). */
export function DankeschoenInhalt({ api }: { api: DankeschoenApi }) {
  const state = useAsync<GutscheinStatus>(async () => {
    try {
      return await api.status();
    } catch (e) {
      throw new Error(fehlerText(e as Error, 'status'));
    }
  }, [api]);

  return (
    <div className="gs-page">
      <h1>
        <Gift className="i gs-h1-icon" aria-hidden /> Dein Dankeschön
      </h1>
      <LoadGuard state={state}>{(s) => <Ansicht api={api} start={s} />}</LoadGuard>
    </div>
  );
}

function Ansicht({ api, start }: { api: DankeschoenApi; start: GutscheinStatus }) {
  const [gutschein, setGutschein] = useState<Gutschein | null>(start.gutschein);
  const [aendern, setAendern] = useState(false);
  const [busy, setBusy] = useState<GutscheinApp | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);

  const waehle = async (app: GutscheinApp) => {
    if (busy) return;
    setBusy(app);
    setFehler(null);
    try {
      const g = await api.waehlen(app);
      setNeu(!gutschein);
      setGutschein(g);
      setAendern(false);
    } catch (e) {
      setFehler(fehlerText(e as Error, 'waehlen'));
    } finally {
      setBusy(null);
    }
  };

  if (!start.berechtigt && !gutschein) return <NichtBerechtigt status={start} />;

  const eingeloest = !!gutschein?.eingeloest_am;
  const zeigeAuswahl = !gutschein || (aendern && !eingeloest);

  return (
    <>
      <p className="muted gs-lead">
        {eingeloest
          ? 'Danke, dass du WinterDex im Jahresabo nutzt. Dein Dankeschön ist eingelöst.'
          : gutschein
            ? 'Danke, dass du WinterDex im Jahresabo nutzt. Hier ist dein persönlicher Code für 1 Monat Pro.'
            : 'Danke, dass du WinterDex im Jahresabo nutzt. Such dir eine App aus — 1 Monat Pro schenken wir dir. Für die Arbeit neben dem Winterdienst, mit derselben Bedienung.'}
      </p>

      {gutschein && !zeigeAuswahl && (
        <CodeKarte g={gutschein} neu={neu} onAendern={eingeloest ? undefined : () => setAendern(true)} />
      )}

      {zeigeAuswahl && (
        <>
          {gutschein && (
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <p className="muted small" style={{ margin: 0 }}>
                Andere App wählen — dein Code bleibt derselbe.
              </p>
              <button type="button" className="btn ghost small" onClick={() => setAendern(false)}>
                Abbrechen
              </button>
            </div>
          )}
          <div className="tile-grid gs-wahl">
            {GUTSCHEIN_APPS.map((id, i) => (
              <WahlKarte
                key={id}
                id={id}
                index={i}
                aktiv={gutschein?.app === id}
                busy={busy === id}
                gesperrt={!!busy}
                onWaehlen={() => void waehle(id)}
              />
            ))}
          </div>
          <p className="muted small gs-fuss">
            Der Code gilt ein Jahr. Pro läuft ab dem Einlösen 30 Tage, danach endet es von selbst — kein Abo, nichts zu kündigen.
          </p>
        </>
      )}

      {fehler && (
        <div className="error-box" role="alert">
          {fehler}
        </div>
      )}
    </>
  );
}

function WahlKarte({
  id,
  index,
  aktiv,
  busy,
  gesperrt,
  onWaehlen,
}: {
  id: GutscheinApp;
  index: number;
  aktiv: boolean;
  busy: boolean;
  gesperrt: boolean;
  onWaehlen: () => void;
}) {
  const n = APP_NUTZEN[id];
  const accent = { objektdex: '#34D8A6', spieldex: '#EA5A47', baumdex: '#4ADE80' }[id];
  return (
    <div className={`tile gs-karte${aktiv ? ' gs-aktiv' : ''}`} style={{ '--tile-accent': accent, '--enter-delay': `${index * 45}ms` } as React.CSSProperties}>
      <div className="tile-head">
        <img className="tile-icon" src={appIcon(id)} alt="" loading="lazy" />
        <div>
          <h3>{APP_NAME[id]}</h3>
          <span className="muted small">{n.titel}</span>
        </div>
      </div>
      <p>{n.text}</p>
      {id === 'objektdex' && !OBJEKTDEX_OEFFENTLICH && (
        <p className="small gs-hinweis">ObjektDex kommt in Kürze in den Play Store. Der Code gilt ein Jahr — du kannst ihn später einlösen.</p>
      )}
      <div className="tile-foot">
        <button type="button" className="btn small" onClick={onWaehlen} disabled={gesperrt || aktiv} aria-busy={busy}>
          {busy ? <span className="spinner small" /> : aktiv ? <Check className="i" aria-hidden /> : null}
          {aktiv ? 'Gewählt' : `${APP_NAME[id]} wählen`}
        </button>
        <a className="tile-open" href={websiteLink(id)} target="_blank" rel="noopener noreferrer">
          Ansehen <ArrowUpRight className="i" aria-hidden style={{ width: 15, height: 15, verticalAlign: '-2px' }} />
        </a>
      </div>
    </div>
  );
}

function CodeKarte({ g, neu, onAendern }: { g: Gutschein; neu: boolean; onAendern?: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  const app = g.app;
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(g.code);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2500);
    } catch {
      // ohne Zwischenablage (alter Browser, kein https): Code markieren, dann Strg+C
      const el = document.getElementById('gs-code');
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  };

  if (g.eingeloest_am) {
    return (
      <div className="card gs-code-karte gs-eingeloest">
        <div className="gs-erfolg-zeile">
          <span className="gs-haken" aria-hidden>
            <Check className="i" />
          </span>
          <div>
            <h3 style={{ margin: 0 }}>
              {app ? `${APP_NAME[app]} Pro` : 'Pro'} läuft bis {datumWien(g.pro_bis)}
            </h3>
            <p className="muted small" style={{ margin: '2px 0 0' }}>
              Eingelöst am {datumWien(g.eingeloest_am)} · Code <span className="mono">{g.code}</span>
            </p>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Danach endet Pro von selbst. Mit der Verlängerung deines WinterDex-Jahresabos gibt es im nächsten Jahr wieder ein Dankeschön.
        </p>
      </div>
    );
  }

  const weg = app ? einloeseWeg(app) : null;
  return (
    <div className={`card gs-code-karte${neu ? ' gs-neu' : ''}`}>
      {neu && (
        <p className="gs-neu-zeile">
          <PartyPopper className="i" aria-hidden /> Dein Code ist da.
        </p>
      )}
      <div className="gs-code-zeile">
        <code id="gs-code" className="gs-code" aria-label={`Dein Code: ${g.code.split('').join(' ')}`}>
          {g.code}
        </code>
        <button type="button" className="btn ghost small" onClick={() => void kopieren()}>
          {kopiert ? <Check className="i" aria-hidden /> : <Copy className="i" aria-hidden />}
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {app ? (
          <>
            Für <b>{APP_NAME[app]}</b> · gültig bis {datumWien(g.gueltig_bis)} · nur mit deinem Konto (gleiche E-Mail) einlösbar
          </>
        ) : (
          <>Gültig bis {datumWien(g.gueltig_bis)} · App noch offen</>
        )}
      </p>
      {weg && app && (
        <div className="gs-anleitung">
          <h3>So löst du ihn ein</h3>
          <ol>
            <li>
              {app === 'baumdex' ? 'Im BaumDex-Portal mit derselben E-Mail anmelden' : `${APP_NAME[app]} mit derselben E-Mail-Adresse anmelden wie WinterDex`}
              {app !== 'baumdex' && (
                <>
                  {' '}
                  (App am Handy oder{' '}
                  <Link to={`/app/${app}`}>{APP_NAME[app]}-Dashboard</Link>)
                </>
              )}
              .
            </li>
            <li>
              {weg.app}
              {app === 'baumdex' ? (
                <>
                  {' — '}
                  <a href={weg.web} target="_blank" rel="noopener noreferrer">
                    {weg.webText}
                  </a>
                </>
              ) : (
                <>
                  {' — oder '}
                  <Link to={weg.web}>{weg.webText}</Link>
                </>
              )}
              .
            </li>
            <li>Code eingeben — ab dann 30 Tage Pro{app === 'baumdex' ? ' für deinen ganzen Betrieb' : ', auch für dein Team, wenn du Inhaber bist'}.</li>
          </ol>
        </div>
      )}
      {onAendern && (
        <button type="button" className="btn ghost small" onClick={onAendern}>
          {app ? 'Andere App wählen' : 'App wählen'}
        </button>
      )}
    </div>
  );
}

function NichtBerechtigt({ status }: { status: GutscheinStatus }) {
  return (
    <div className="card gs-leer">
      {status.probe_bis ? (
        <>
          <h3 style={{ marginTop: 0 }}>Bald für dich da</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Dein Jahresabo läuft gerade in der kostenlosen Probezeit. Dein Dankeschön — 1 Monat Pro in ObjektDex, SpielDex oder
            BaumDex — kannst du nach der ersten Abbuchung hier wählen, ab {datumWien(status.probe_bis)}.
          </p>
        </>
      ) : status.grund === 'kein_jahresabo' ? (
        <>
          <h3 style={{ marginTop: 0 }}>Ein Dankeschön zum Jahresabo</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Wer WinterDex im Jahresabo nutzt, bekommt als Dank 1 Monat Pro in ObjektDex, SpielDex oder BaumDex. Dein Konto hat
            gerade ein anderes Abo. Wechseln kannst du in Google Play bzw. über die Abo-Verwaltung.
          </p>
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>Für WinterDex-Jahreskunden</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Für dieses Konto ist kein WinterDex-Jahresabo hinterlegt. Das Dankeschön gehört zu der Person, die das Abo
            abgeschlossen hat. Hast du mit einer anderen E-Mail-Adresse gekauft? Dann melde dich mit dieser an.
          </p>
        </>
      )}
    </div>
  );
}
