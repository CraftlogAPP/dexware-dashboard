// Erster Start ohne Betrieb — wie das Onboarding der App (mobile/src/screens/OnboardingScreen.tsx):
// „Eigener Betrieb“ (RPC create_org_with_owner, optional Empfehlungs-Code) oder „Ich wurde eingeladen“ (RPC redeem_invite).
// Damit lässt sich WinterDex auch ganz ohne Android-Gerät einrichten (Übergang fürs iPhone, 19.11.2026).
import { useRef, useState } from 'react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { fetchOrgContext } from '../lib/orgApi';
import { LAND_LABELS } from './types';

type Land = 'DE' | 'AT' | 'CH';
const LANDS: Land[] = ['DE', 'AT', 'CH'];

const DUTY_HINTS: Record<Land, string> = {
  DE: 'Deutschland: Verkehrssicherungspflicht nach § 823 BGB, die Zeiten regelt die Satzung der Gemeinde.',
  AT: 'Österreich: § 93 StVO — Räum- und Streupflicht von 6 bis 22 Uhr.',
  CH: 'Schweiz: Werkeigentümerhaftung (Art. 58 OR), dazu kantonale und kommunale Vorgaben.',
};

function netText(m: string): string | null {
  return /failed to fetch|load failed|networkerror|fetch failed|timeout/i.test(m)
    ? 'Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.'
    : null;
}

function referralErrorText(m: string): string {
  if (/could not find the function|does not exist|PGRST202/i.test(m)) return 'Das Empfehlungsprogramm startet in Kürze.';
  if (/invalid referral code/i.test(m)) return 'Diesen Empfehlungs-Code gibt es nicht. Bitte prüf die Schreibweise.';
  if (/own referral code/i.test(m)) return 'Das ist dein eigener Code — den kannst du nur weitergeben.';
  if (/already referred/i.test(m)) return 'Für deinen Betrieb wurde schon ein Empfehlungs-Code eingetragen.';
  if (/already paid/i.test(m)) return 'Ein Empfehlungs-Code lässt sich nur vor dem ersten bezahlten Abo eintragen.';
  if (/referral check unavailable/i.test(m)) return 'Der Code konnte gerade nicht geprüft werden.';
  return netText(m) ?? m;
}

export function Onboarding() {
  const { client, session } = useAppAuth();
  const org = useOrg();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [land, setLand] = useState<Land>('DE');
  const [address, setAddress] = useState('');
  const [refCode, setRefCode] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Betrieb steht, nur der Empfehlungs-Code ging nicht: Hinweis zeigen, dann weiter
  const [refNote, setRefNote] = useState<string | null>(null);
  const running = useRef(false);

  const create = async () => {
    if (running.current) return;
    if (!name.trim()) return setError('Bitte den Betriebsnamen eingeben.');
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      // Doppeltipp bzw. „Antwort kam nicht an, aber angelegt“: vorher frisch fragen, ob es den Betrieb schon gibt —
      // sonst entstünde ein zweiter Betrieb (wie in der App).
      if (await fetchOrgContext(client)) return org.reload();
      const { error: e } = await client.rpc('create_org_with_owner', { p_name: name.trim(), p_land: land, p_address: address.trim() });
      if (e) throw new Error(e.message);
      const entered = refCode.toUpperCase().replace(/\s+/g, '');
      if (entered) {
        const { error: re } = await client.rpc('redeem_referral', { p_code: entered });
        if (re) {
          setRefNote(`${referralErrorText(re.message)} Dein Betrieb ist angelegt — den Code kannst du später in der App unter Einstellungen → „Empfehlen & 3 Monate gratis“ nachtragen.`);
          return;
        }
      }
      org.reload();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(netText(m) ?? `Betrieb konnte nicht angelegt werden: ${m}`);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const join = async () => {
    if (running.current) return;
    if (!code.trim()) return setError('Bitte den Einladungscode eingeben.');
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await client.rpc('redeem_invite', { p_code: code.trim() });
      // Erster Tipp kam am Server an, nur die Antwort ging verloren → man ist schon drin (wie ein Erfolg behandeln).
      if (e && !/already member of an org/i.test(e.message)) throw new Error(e.message);
      org.reload();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(
        /invalid or expired/i.test(m)
          ? 'Der Code ist ungültig oder abgelaufen. Bitte lass dir einen neuen schicken.'
          : /team full/i.test(m)
            ? 'Das Team ist voll. Bitte deinen Chef, in WinterDex unter „Team“ mehr Plätze freizuschalten.'
            : /removed from team/i.test(m)
              ? 'Du wurdest aus diesem Team entfernt. Bitte deinen Chef um einen neuen Team-Code.'
              : /team needs pro/i.test(m)
                ? 'Dieser Betrieb hat gerade kein aktives WinterDex Pro — Mitarbeiter können erst beitreten, wenn dein Chef Pro (wieder) aktiviert hat.'
                : (netText(m) ?? `Beitritt fehlgeschlagen: ${m}`),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  if (refNote) {
    return (
      <div className="page ez" style={{ margin: "0 auto", paddingTop: 24 }}>
        <h1>Betrieb angelegt</h1>
        <div className="info-box">Empfehlungs-Code nicht eingetragen: {refNote}</div>
        <button type="button" className="btn ez-big" onClick={org.reload}>
          Weiter
        </button>
      </div>
    );
  }

  return (
    <div className="page ez" style={{ margin: "0 auto", paddingTop: 24 }}>
      <h1>Willkommen bei WinterDex</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Angemeldet als {session?.user.email ?? 'dein Konto'}. Noch ein Schritt: Betrieb anlegen oder dem Team deines
        Betriebs beitreten.
      </p>
      <div className="ez-chips" role="group" aria-label="Art" style={{ margin: '16px 0' }}>
        <button type="button" className={`ez-chip${mode === 'create' ? ' on' : ''}`} aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setError(null); }}>
          Eigener Betrieb
        </button>
        <button type="button" className={`ez-chip${mode === 'join' ? ' on' : ''}`} aria-pressed={mode === 'join'} onClick={() => { setMode('join'); setError(null); }}>
          Ich wurde eingeladen
        </button>
      </div>

      {mode === 'create' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <p className="muted small">Einmalig einrichten — dein Team dokumentiert danach alle Einsätze unter diesem Betrieb.</p>
          <label className="field">
            Betriebsname *
            <input value={name} maxLength={120} autoComplete="organization" placeholder="z. B. Hausmeisterservice Muster" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Adresse (optional)
            <input value={address} maxLength={200} autoComplete="street-address" placeholder="Straße Nr., PLZ Ort" onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div className="field" style={{ marginBottom: 6 }}>Land</div>
          <div className="ez-chips" role="group" aria-label="Land">
            {LANDS.map((l) => (
              <button key={l} type="button" className={`ez-chip${land === l ? ' on' : ''}`} aria-pressed={land === l} onClick={() => setLand(l)}>
                {LAND_LABELS[l]}
              </button>
            ))}
          </div>
          <p className="muted small">{DUTY_HINTS[land]}</p>
          <label className="field">
            Empfehlungs-Code (optional)
            <input value={refCode} maxLength={20} autoCapitalize="characters" autoComplete="off" placeholder="WD-EMPF-XXXXX" onChange={(e) => setRefCode(e.target.value)} />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="btn ez-save" disabled={busy}>
            {busy ? 'Wird angelegt …' : 'Loslegen'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <p className="muted small">
            Dein Chef findet den Team-Code in WinterDex unter „Team“. Nach dem Beitritt dokumentierst du unter seinem Betrieb
            — ein eigenes Abo brauchst du nicht.
          </p>
          <label className="field">
            Einladungscode *
            <input value={code} maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="Code vom Chef" onChange={(e) => setCode(e.target.value)} />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="btn ez-save" disabled={busy}>
            {busy ? 'Trete bei …' : 'Team beitreten'}
          </button>
        </form>
      )}
    </div>
  );
}
