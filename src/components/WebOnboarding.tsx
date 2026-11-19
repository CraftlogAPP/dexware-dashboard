// Erster Start ohne Betrieb — im Browser, für alle Apps mit Eintrag in lib/webOnboarding.ts (dort stehen je App die
// Felder und der Server-Weg der Android-App). Damit lässt sich die App ganz ohne Android-Gerät einrichten
// (Übergang fürs iPhone): Konto anlegen → Betrieb anlegen oder Team beitreten → Handy-Ansicht „Vor Ort“.
// Vorbild in Aufbau und Optik: winterdex/Onboarding.tsx.
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from './OrgContext';
import { fetchOrgContext, type OrgContextData } from '../lib/orgApi';
import { ONB_LAND_LABELS, WEB_ONBOARDING, type OnbLand } from '../lib/webOnboarding';
import { VOR_ORT_PATH } from '../pruefen/Scope';

function netText(m: string): string | null {
  return /failed to fetch|load failed|networkerror|fetch failed|timeout/i.test(m)
    ? 'Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.'
    : null;
}

/** Schmaler Bildschirm = Handy: dort geht es nach dem Einrichten direkt in die Handy-Ansicht. */
function onPhone(): boolean {
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

export function WebOnboarding({
  fetchOrg = fetchOrgContext,
}: {
  /** Derselbe Abruf wie im OrgProvider des Bereichs (KfzDex, SchutzDex haben ein eigenes Mandanten-Modell) */
  fetchOrg?: (sb: SupabaseClient) => Promise<OrgContextData | null>;
}) {
  const { app, client, session } = useAppAuth();
  const org = useOrg();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const spec = WEB_ONBOARDING[app.id];
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((spec?.fields ?? []).map((f) => [f.key, f.initial ?? ''])),
  );
  const [land, setLand] = useState<OnbLand>(spec?.lands?.[0] ?? 'DE');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Doppeltipp-Sperre: zwei Tipps im selben Bild sehen den Zustand noch nicht
  const running = useRef(false);

  if (!spec) return null;
  const join = spec.join;

  /** Betrieb steht: am Handy (oder wer über den Vor-Ort-Link kam) in die Handy-Ansicht, sonst ins Dashboard. */
  const done = () => {
    const field = `/app/${app.id}/${VOR_ORT_PATH}`;
    if (!pathname.startsWith(field) && onPhone()) navigate(field, { replace: true });
    org.reload();
  };

  const run = async (what: () => Promise<void>, failed: (m: string) => string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await what();
      done();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(netText(m) ?? failed(m));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const create = () => {
    const missing = spec.fields.find((f) => f.required && !(values[f.key] ?? '').trim());
    if (missing) return setError(`Bitte ausfüllen: ${missing.label.replace(/\s*\*$/, '')}.`);
    void run(
      async () => {
        // „Antwort kam nicht an, aber angelegt“: vorher frisch fragen, ob es den Betrieb schon gibt (wie in den Apps).
        if (await fetchOrg(client)) return;
        await spec.create(client, values, land);
      },
      (m) => `Betrieb konnte nicht angelegt werden: ${m}`,
    );
  };

  const redeem = () => {
    if (!join) return;
    if (code.trim().length < (join.minLength ?? 1)) return setError('Bitte den Code eingeben.');
    void run(
      () => join.run(client, code),
      (m) => join.errorText(m, app.name) ?? `Beitritt fehlgeschlagen: ${m}`,
    );
  };

  return (
    <div className="page ez" style={{ margin: '0 auto', paddingTop: 24 }}>
      <h1>Willkommen bei {app.name}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Angemeldet als {session?.user.email ?? 'dein Konto'}. Noch ein Schritt:{' '}
        {join ? 'Betrieb anlegen oder dem Team deines Betriebs beitreten.' : 'Betrieb anlegen.'}
      </p>
      {join && (
        <div className="ez-chips" role="group" aria-label="Art" style={{ margin: '16px 0' }}>
          <button type="button" className={`ez-chip${mode === 'create' ? ' on' : ''}`} aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setError(null); }}>
            {spec.modes[0]}
          </button>
          <button type="button" className={`ez-chip${mode === 'join' ? ' on' : ''}`} aria-pressed={mode === 'join'} onClick={() => { setMode('join'); setError(null); }}>
            {spec.modes[1]}
          </button>
        </div>
      )}

      {mode === 'create' || !join ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <p className="muted small">{spec.intro}</p>
          {spec.fields.map((f) => (
            <label className="field" key={f.key}>
              {f.label}
              <input
                value={values[f.key] ?? ''}
                maxLength={f.maxLength}
                autoComplete={f.autoComplete ?? 'off'}
                inputMode={f.numeric ? 'numeric' : undefined}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          {spec.lands && (
            <>
              <div className="field" style={{ marginBottom: 6 }}>{spec.landLabel ?? 'Land'}</div>
              <div className="ez-chips" role="group" aria-label="Land" style={{ marginBottom: spec.landHint ? undefined : 18 }}>
                {spec.lands.map((l) => (
                  <button key={l} type="button" className={`ez-chip${land === l ? ' on' : ''}`} aria-pressed={land === l} onClick={() => setLand(l)}>
                    {ONB_LAND_LABELS[l]}
                  </button>
                ))}
              </div>
              {spec.landHint && <p className="muted small">{spec.landHint}</p>}
            </>
          )}
          {error && <div className="error-box">{error}</div>}
          <button className="btn ez-save" disabled={busy}>
            {busy ? 'Wird angelegt …' : spec.createButton}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            redeem();
          }}
        >
          <p className="muted small">{join.hint}</p>
          <label className="field">
            {join.label}
            <input
              value={code}
              maxLength={40}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={join.placeholder}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="btn ez-save" disabled={busy}>
            {busy ? 'Wird geprüft …' : join.button}
          </button>
        </form>
      )}
    </div>
  );
}
