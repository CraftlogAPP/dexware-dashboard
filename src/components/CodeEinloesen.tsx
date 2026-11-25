// „Code einlösen“ (Jahresabo-Dankeschön, 25.11.2026) — gemeinsame Seite für den ObjektDex- und den SpielDex-Bereich.
// Der Code (WD-XXXX-XXXX) stammt aus WinterDex („Dein Dankeschön“) und gehört zur Person mit derselben E-Mail.
// Einlösen = 30 Tage Pro in dieser App ab heute; der Server (Funktion „gutschein“) prüft Anmeldung, Besitz, App und Frist.
// Danach meldet suite-status für diese App Pro → org_pro_active schaltet den Betrieb frei, wenn der Inhaber einlöst.
// BaumDex löst im eigenen Portal ein (baumdex.dexware.app/subscribe#gutschein).
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Ticket } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrgOptional } from './OrgContext';
import {
  APP_NAME,
  datumWien,
  einloesenApi,
  fehlerText,
  formatiereEingabe,
  normalisiereCode,
  type EinloesenApi,
  type GutscheinApp,
} from '../lib/gutschein';
import './gutschein.css';

export function CodeEinloesen() {
  const { app, client } = useAppAuth();
  const role = useOrgOptional()?.data?.role ?? null;
  const ziel = app.id as GutscheinApp;
  const api = useMemo(
    () => einloesenApi(async () => (await client.auth.getSession()).data.session?.access_token, ziel),
    [client, ziel],
  );
  return <CodeEinloesenInhalt app={ziel} api={api} inhaber={role === null || role === 'owner'} />;
}

/** Inhalt mit austauschbarem Server — auch für die Dev-Vorschau (/vorschau?app=spieldex&seite=code-einloesen). */
export function CodeEinloesenInhalt({
  app,
  api,
  inhaber,
  vorschauProBis = null,
}: {
  app: GutscheinApp;
  api: EinloesenApi;
  inhaber: boolean;
  /** nur Dev-Vorschau: direkt die Erfolgs-Anzeige zeigen */
  vorschauProBis?: string | null;
}) {
  const [eingabe, setEingabe] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [proBis, setProBis] = useState<string | null>(vorschauProBis);
  const feld = useId();
  const name = APP_NAME[app];

  const senden = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const code = normalisiereCode(eingabe);
    if (!code) {
      setFehler('Der Code hat die Form WD-XXXX-XXXX (8 Zeichen nach „WD“, ohne 0, O, 1 und I).');
      return;
    }
    setBusy(true);
    setFehler(null);
    try {
      const r = await api.einloesen(code);
      setProBis(r.pro_bis);
    } catch (err) {
      setFehler(fehlerText(err as Error, 'einloesen'));
    } finally {
      setBusy(false);
    }
  };

  if (proBis) {
    return (
      <div className="gs-page">
        <div className="card gs-erfolg" role="status" aria-live="polite">
          <div className="gs-erfolg-bild" aria-hidden>
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle className="gs-kreis" cx="32" cy="32" r="28" />
              <path className="gs-strich" d="M20 33 l8 8 l16 -18" />
            </svg>
            <span className="gs-ring" />
          </div>
          <h2>{name} Pro ist aktiv</h2>
          <p className="gs-erfolg-bis">bis {datumWien(proBis)}</p>
          <p className="muted" style={{ maxWidth: 460, margin: '0 auto' }}>
            Viel Freude damit! In der {name}-App wirkt Pro, sobald du sie das nächste Mal öffnest. Danach endet Pro von selbst —
            kein Abo, nichts zu kündigen.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <Link className="btn" to={`/app/${app}`}>
              Zur Übersicht
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gs-page">
      <h1>
        <Ticket className="i gs-h1-icon" aria-hidden /> Code einlösen
      </h1>
      <p className="muted gs-lead">
        Dein Dankeschön-Code aus WinterDex: <b>1 Monat {name} Pro</b>, ab dem Einlösen. Melde dich dafür mit derselben
        E-Mail-Adresse an wie in WinterDex.
      </p>
      {!inhaber && (
        <div className="info-box">
          Pro gilt für den ganzen Betrieb nur, wenn der <b>Inhaber</b> den Code mit seinem Konto einlöst. Löst du ihn ein, gilt
          Pro nur für dich.
        </div>
      )}
      <form className="card gs-form" onSubmit={(e) => void senden(e)} noValidate>
        <label className="field" htmlFor={feld}>
          Dein Code
        </label>
        <div className="gs-eingabe-zeile">
          <input
            id={feld}
            className="gs-eingabe mono"
            value={eingabe}
            onChange={(e) => {
              setEingabe(formatiereEingabe(e.target.value));
              setFehler(null);
            }}
            placeholder="WD-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={14}
            aria-invalid={!!fehler}
            aria-describedby={fehler ? `${feld}-f` : undefined}
          />
          <button type="submit" className="btn" disabled={busy || eingabe.replace(/[^0-9A-Z]/g, '').length < 10}>
            {busy ? <span className="spinner" /> : <Check className="i" aria-hidden />}
            Einlösen
          </button>
        </div>
        {fehler && (
          <div id={`${feld}-f`} className="error-box" role="alert">
            {fehler}
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Den Code findest du in WinterDex unter „Dein Dankeschön“. Er gilt ein Jahr und lässt sich einmal einlösen.
        </p>
      </form>
    </div>
  );
}
