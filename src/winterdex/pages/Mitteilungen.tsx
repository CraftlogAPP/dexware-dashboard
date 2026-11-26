// Seiten zum Mitteilungs-Center (MitteilungsCenter.tsx): „Alle Mitteilungen“ (Liste der letzten 30 Tage, Heute /
// Gestern / Älter) und die Detailseite einer Mitteilung mit der Karte „Heute Nacht“ darunter — wie in der App beim
// Antippen einer Mitteilung (Vertrag 4). Gelesen-Stand nur in diesem Browser (mitteilungenDaten.ts).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { HeuteNacht } from '../HeuteNacht';
import { EintragInhalt, MitteilungAnsicht } from '../MitteilungsCenter';
import { useMitteilungen } from '../mitteilungenKontext';
import { EINSTELLEN_HINWEIS, gruppieren, istNeu, LEER_TEXT, SEITE_TEXT } from '../mitteilungenDaten';
import { standText } from '../heuteNachtDaten';

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
        <div className="card muted">{LEER_TEXT}</div>
      ) : (
        gruppen.map((g) => (
          <section className="mt-gruppe" key={g.gruppe} aria-label={g.gruppe}>
            <h2 className="mt-gruppe-kopf">{g.gruppe}</h2>
            <div className="card mt-liste">
              {g.eintraege.map((m) => (
                <Link key={m.id} to={st.pfad(m.id)} className={`mt-eintrag${m.kritisch ? ' mt-kritisch' : ''}`}>
                  <EintragInhalt m={m} jetzt={jetzt} tz={st.tz} neu={istNeu(m, vorher, jetzt)} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
      <p className="muted small">{EINSTELLEN_HINWEIS}</p>
    </div>
  );
}

export function MitteilungSeite() {
  const { id } = useParams<{ id: string }>();
  const st = useMitteilungen();
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  if (!st) return null;
  if (st.laedt && !st.da) return <Laedt />;
  if (!st.da) return <NichtDa />;
  const m = st.liste.find((x) => x.id === id);
  if (!m) {
    return (
      <>
        <p className="small" style={{ marginBottom: 4 }}>
          <Link to={st.pfad()}>← Alle Mitteilungen</Link>
        </p>
        <div className="info-box">Diese Mitteilung steht nicht mehr in der Liste (gezeigt werden die letzten 30 Tage).</div>
      </>
    );
  }
  const base = st.basis;
  return (
    <MitteilungAnsicht
      m={m}
      tz={st.tz}
      zurueck={st.pfad()}
      karte={
        orgCtx && (
          <HeuteNacht
            client={client}
            orgId={orgCtx.org.id}
            land={orgCtx.org.land}
            rolle={orgCtx.role}
            tz={st.tz}
            links={{ objekte: `${base}/objekte`, team: `${base}/team`, abo: `${base}/abo` }}
          />
        )
      }
    />
  );
}
