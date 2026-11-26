// Abschnitt „Wetterverlauf“ im Einsatz- und Fahrt-Detail (Wetter-Guide P3, Bauplan 5.5): Kurzsatz nach G13 groß, Kernsatz,
// amtliche Warnungen wörtlich, Zeitleiste (SVG wie im PDF), Vermerke grau, Archivvermerk mit Prüfcode + „Prüfcode prüfen“,
// eingeklappt „Werte anzeigen“ mit Stundenwerten, Quellen und Fußzeile. Nie eine Bewertung; Text nur vom Server.
// Ohne Beleg der Stand-Text („wird ermittelt“, „mit WinterDex Pro“ …) — nie leer; „aus“ → nichts.
// Nachfragen bei „wird ermittelt“: wetterNachladen.ts.
import { VerifyProof } from '../components/VerifyProof';
import { uhrzeit } from './heuteNachtDaten';
import {
  amtlicheSaetze,
  archivVermerk,
  belegFusszeile,
  belegVermerk,
  quellenTexte,
  standText,
  zeitleisteSvg,
  type Bezug,
  type WetterInfo,
} from './wetterBeleg';

const ART_TEXT: Record<string, string> = {
  trocken: 'trocken',
  regen: 'Regen',
  schnee: 'Schnee',
  schneeregen: 'Schneeregen',
  eisregen: 'gefrierender Regen',
  gefrierend: 'gefrierender Regen',
};
const zahl = (n: number | null | undefined, e = '') => (typeof n === 'number' && Number.isFinite(n) ? `${String(Math.round(n * 10) / 10).replace('.', ',').replace('-', '−')}${e}` : '—');

export function WetterVerlauf({
  info,
  bezug,
  tz,
  canceled = false,
  fehler = false,
  pruefen = true,
}: {
  info: WetterInfo | null | undefined;
  bezug: Bezug;
  tz: string;
  canceled?: boolean;
  /** Laden gestört (Netz) */
  fehler?: boolean;
  /** Knopf „Prüfcode prüfen“ (braucht die Anmeldung; Vorschau ohne) */
  pruefen?: boolean;
}) {
  if (fehler && !info) {
    return (
      <>
        <div className="section-head">
          <h2>Wetterverlauf</h2>
        </div>
        <div className="card wv">
          <p className="muted" style={{ margin: 0 }}>
            Wetterverlauf gerade nicht abrufbar – erneut beim nächsten Öffnen.
          </p>
        </div>
      </>
    );
  }
  if (!info || info.stand === 'aus') return null;
  const b = info.stand === 'da' ? info.beleg : null;
  const stand = b ? null : standText(info.stand, bezug);
  if (!b && !stand) return null;
  return (
    <>
      <div className="section-head">
        <h2>Wetterverlauf</h2>
      </div>
      <div className="card wv">
        {!b ? (
          <p className="muted" style={{ margin: 0 }} role="status">
            {stand}
          </p>
        ) : (
          <>
            <p className={`wv-kurz${canceled ? ' wv-storno' : ''}`}>{b.kurz}</p>
            <p className={canceled ? 'wv-storno' : ''}>{b.satz}</p>
            {amtlicheSaetze(b).map((a, i) => (
              <p key={i} className="small">
                {a}
              </p>
            ))}
            {/* eigenes, geprüftes SVG (Werte escaped, keine Fremd-Inhalte) — gleich wie im PDF */}
            <div className="wv-zeitleiste" dangerouslySetInnerHTML={{ __html: zeitleisteSvg(b, tz) }} />
            {belegVermerk(b) && <p className="small muted">{belegVermerk(b)}</p>}
            <p className="small muted">
              {archivVermerk(b, tz).replace(/ · Prüfcode .*$/, '')} · Prüfcode <span className="mono">{b.entry_hash.slice(0, 12)}</span>
            </p>
            {pruefen && <VerifyProof id={String(b.id)} hash={b.entry_hash} rpc="verify_wetter_beleg" />}
            <details className="wv-werte">
              <summary>Werte anzeigen</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Stunde ab</th>
                      <th>Niederschlag</th>
                      <th>Art</th>
                      <th>Temperatur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(b.fakten.stunden ?? []).map((s) => (
                      <tr key={s.von}>
                        <td>{uhrzeit(s.von * 1000, tz)}</td>
                        <td>{zahl(s.mm, ' mm')}</td>
                        <td>{s.art ? (ART_TEXT[s.art] ?? s.art) : '—'}</td>
                        <td>{zahl(s.t, ' °C')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {quellenTexte([b]).map((q, i) => (
                <p key={i} className="small muted">
                  {q}
                </p>
              ))}
              <p className="small muted">{belegFusszeile(b)}</p>
            </details>
          </>
        )}
      </div>
    </>
  );
}
