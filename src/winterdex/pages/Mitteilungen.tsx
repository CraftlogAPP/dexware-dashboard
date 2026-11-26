// Seite „Alle Mitteilungen“ zum Mitteilungs-Center (MitteilungsCenter.tsx): Liste der letzten 30 Tage (Heute / Gestern /
// Älter). Ein Klick öffnet DIESELBE Box wie in der Glocke (Vertrag v2, A) — keine eigene Detailseite mehr. Gelesen-Stand
// nur in diesem Browser (mitteilungenDaten.ts).
import { useEffect, useState } from 'react';
import { useMitteilungen } from '../mitteilungenKontext';
import { EintragInhalt } from '../MitteilungsCenter';
import { EINSTELLEN_HINWEIS, gruppieren, istNeu, leerText, SEITE_TEXT } from '../mitteilungenDaten';
import { standText } from '../heuteNachtDaten';
import { QUELLEN_ZEILE } from '../wetterGuide';

function Laedt() {
  return (
    <div className="empty">
      <span className="spinner" />
    </div>
  );
}

function NichtDa() {
  return <div className="info-box">Mitteilungen sind hier noch nicht verfügbar.</div>;
}

export function MitteilungenSeite() {
  const st = useMitteilungen();
  // Stand VOR dem Öffnen der Seite — die neuen Einträge bleiben markiert, der Zähler an der Glocke geht auf 0
  const [vorher] = useState(() => st?.gesehen ?? null);
  const alsGesehen = st?.alsGesehen;
  useEffect(() => {
    if (st?.da) alsGesehen?.();
  }, [st?.da, alsGesehen]);

  if (!st) return null;
  if (st.laedt && !st.da) return <Laedt />;
  if (!st.da) return <NichtDa />;
  const jetzt = st.abgerufen ?? Date.now();
  const gruppen = gruppieren(st.liste, jetzt, st.tz);
  return (
    <div className="mt-seite">
      <h1>Mitteilungen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {SEITE_TEXT}
      </p>
      {st.gestoert && st.abgerufen !== null && (
        <p className="hn-warn" role="status">
          Gerade nicht abrufbar – Stand {standText(st.abgerufen, Date.now(), st.tz)}.
        </p>
      )}
      {gruppen.length === 0 ? (
        <div className="card muted">{leerText(st.pro)}</div>
      ) : (
        gruppen.map((g) => (
          <section className="mt-gruppe" key={g.gruppe} aria-label={g.gruppe}>
            <h2 className="mt-gruppe-kopf">{g.gruppe}</h2>
            <div className="card mt-liste">
              {g.eintraege.map((m) => (
                <button key={m.id} type="button" className={`mt-eintrag${m.kritisch ? ' mt-kritisch' : ''}`} onClick={() => st.zeigen(m)}>
                  <EintragInhalt m={m} jetzt={jetzt} tz={st.tz} neu={istNeu(m, vorher, jetzt)} />
                </button>
              ))}
            </div>
          </section>
        ))
      )}
      <p className="muted small">{EINSTELLEN_HINWEIS}</p>
      <p className="muted small">{QUELLEN_ZEILE}</p>
    </div>
  );
}
