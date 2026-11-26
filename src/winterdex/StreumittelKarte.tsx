// Karte „Streumittel“ (WinterDex, Team-Seite unter „Betrieb“, auch im Außendienst unter Mehr → Team): Inhaber und Verwalter
// blenden Streumittel aus, die der Betrieb nicht verwendet (Kundenwunsch 26.11.2026). Gilt für den ganzen Betrieb — App,
// Dashboard und Außendienst zeigen beim Erfassen nur die aktiven. Regeln und Texte: streumittel.ts.
// Ohne Server-Update (Spalte org.streumittel_aus bzw. RPC set_streumittel_aus fehlt): Karte mit Hinweis statt Fehler, beim
// Erfassen stehen alle Streumittel wie bisher. Mitarbeiter sehen die Karte nicht (sie ändern nichts).
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check } from 'lucide-react';
import { merkeStreumittel, useStreumittelAus } from './einsatz/useStreumittel';
import {
  AUSBLENDBAR,
  IMMER_DA,
  TEXT_ALLE_AUS,
  TEXT_ERKLAERUNG,
  TEXT_NETZ,
  TEXT_SERVER_UPDATE,
  TEXT_SONSTIGES,
  gespeichertText,
  streumittelAntwort,
  streumittelUmschalten,
  type Streumittel,
} from './streumittel';

export function StreumittelKarte({ client, orgId, darf }: { client: SupabaseClient; orgId: string; darf: boolean }) {
  // Stand des Betriebs (nach dem Speichern die Antwort des Servers); null = Spalte fehlt noch
  const ausServer = useStreumittelAus();
  const [fehlt, setFehlt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  if (!darf) return null;
  const aus = ausServer ?? [];
  const ohneServer = ausServer === null || fehlt;

  async function umschalten(m: Streumittel) {
    const neu = streumittelUmschalten(aus, m);
    if (!neu) {
      setMeldung({ ok: false, text: TEXT_ALLE_AUS });
      return;
    }
    setBusy(true);
    setMeldung(null);
    try {
      const { data, error } = await client.rpc('set_streumittel_aus', { p_org: orgId, p_aus: neu });
      const r = streumittelAntwort(data, error, neu);
      if (r.art === 'ok') {
        // gilt sofort auch für Einsatz- und Fahrt-Formulare in diesem Browser
        merkeStreumittel(orgId, r.aus);
        setMeldung({ ok: true, text: gespeichertText(r.aus) });
      } else if (r.art === 'fehlt') {
        setFehlt(true);
      } else {
        setMeldung({ ok: false, text: r.text });
      }
    } catch {
      setMeldung({ ok: false, text: TEXT_NETZ });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="section-head" style={{ margin: 0 }}>
        <h2>Streumittel</h2>
      </div>
      <p className="muted small">{TEXT_ERKLAERUNG}</p>
      <div className="ez-chips sm-chips" role="group" aria-label="Streumittel beim Erfassen">
        {AUSBLENDBAR.map((m) => {
          const an = ohneServer || !aus.includes(m);
          return (
            <button
              key={m}
              type="button"
              className={`ez-chip sm-chip${an ? ' on' : ' sm-aus'}`}
              aria-pressed={an}
              disabled={busy || ohneServer}
              title={an ? `${m} ausblenden` : `${m} wieder anzeigen`}
              onClick={() => void umschalten(m)}
            >
              {an && <Check className="i" aria-hidden />}
              {m}
            </button>
          );
        })}
        <span className="ez-chip sm-chip on sm-fest" title={TEXT_SONSTIGES}>
          <Check className="i" aria-hidden />
          {IMMER_DA}
        </span>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        {ohneServer ? TEXT_SONSTIGES : `Antippen schaltet ein Streumittel an oder aus. ${TEXT_SONSTIGES}`}
      </p>
      {ohneServer && <div className="info-box">{TEXT_SERVER_UPDATE}</div>}
      {meldung &&
        (meldung.ok ? (
          <p className="small" role="status" style={{ margin: '8px 0 0' }}>
            {meldung.text}
          </p>
        ) : (
          <div className="error-box" role="alert" style={{ marginTop: 8 }}>
            {meldung.text}
          </div>
        ))}
    </div>
  );
}
