// Eine Fahrt: echte Karte mit Zeitmarken + Zeit-Regler + Zeitleiste („wann war er wo“, seit 25.11.2026; Skizze als
// Rückfall), Server-Werte (Länge/Abdeckung/nicht befahren), Hinweise, Prüfcode prüfen, Nachweis als PDF,
// Storno mit Pflicht-Begründung. Dashboard und Außendienst zeigen dieselbe Seite.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileDown, Info } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { FormDialog, s, type FormValues } from '../../components/form';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import { VerifyProof } from '../../components/VerifyProof';
import { isSafeImgSrc } from '../../lib/imgSrc';
import { fmtDateTime } from '../../lib/format';
import type { Org } from '../../lib/orgApi';
import { openReportWindowAfter } from '../../lib/print';
import { gritLabel, WEATHER_SOURCE, weatherLabel } from '../labels';
import { CoverageBadge } from '../RouteSketch';
import { FahrtAnsicht } from '../FahrtAnsicht';
import { buildRunHtmlMitKarte } from '../routeReport';
import { fetchOrgPro, withWatermark } from '../pro';
import { cancelRun, cleanGaps, fetchRun, fmtDistance, fmtDuration, fmtTimeSpan, type Run } from '../routes';
import { fetchStrassen, STRASSEN_PDF_HINWEIS, strassenFrisch, strassenOffen, type StrassenStand } from '../strassen';
import { useStrassenNachladen } from '../strassenNachladen';
import { nachweisZone } from '../nachweisZeit';

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const state = useAsync<Run>(() => fetchRun(client, id!), [client, id]);
  // Straßenverlauf (route_run_strassen) getrennt laden — wirft nie; fehlt er, fehlt nur der Abschnitt.
  // „Wird ermittelt“ → alle 20 s selbst nachfragen (höchstens 10 min), die Tabelle erscheint ohne Neuladen.
  const strState = useAsync(() => fetchStrassen(client, id!), [client, id]);
  const strassen = useStrassenNachladen(id, strState.data, (rid) => fetchStrassen(client, rid), state.data);
  // Pro vorab laden: das Druckfenster muss direkt beim Klick aufgehen (sonst blockt der Browser das Pop-up)
  const proState = useAsync(() => fetchOrgPro(client), [client]);

  return (
    <LoadGuard state={state}>
      {(run) => (
        <RunView
          run={run}
          strassen={strassen}
          org={org?.org ?? null}
          pro={proState.data ?? true}
          ladeStrassen={() => fetchStrassen(client, id!)}
          canCancel={!run.canceled && org?.role === 'owner'}
          onCancel={async (reason) => {
            await cancelRun(client, id!, reason);
            state.reload();
          }}
        />
      )}
    </LoadGuard>
  );
}

/** Anzeige einer geladenen Fahrt — ohne eigenen Server-Zugriff (auch für die Beispieldaten im Dev-Server). */
export function RunView({
  run,
  strassen = null,
  org,
  pro,
  ladeStrassen,
  canCancel,
  onCancel,
}: {
  run: Run;
  /** Straßenverlauf (seit 25.11.2026) — null = keiner/noch nicht geladen */
  strassen?: StrassenStand | null;
  org: Org | null;
  pro: boolean;
  /** Straßenverlauf frisch vom Server (PDF-Knopf) — ohne: nur der übergebene Stand */
  ladeStrassen?: () => Promise<StrassenStand | null>;
  canCancel: boolean;
  onCancel: (reason: string) => Promise<void>;
}) {
  const [canceling, setCanceling] = useState(false);
  const [printErr, setPrintErr] = useState<string | null>(null);
  const [druckt, setDruckt] = useState(false);
  // beim PDF frisch geladener Straßenverlauf (fertig/leer/aufgegeben) — gilt dann auch für die Anzeige
  const [frisch, setFrisch] = useState<{ id: string; stand: StrassenStand } | null>(null);
  const strAnzeige = frisch?.id === run.id && (frisch.stand.status !== 'in_arbeit' || !strassen) ? frisch.stand : strassen;
  // Uhrzeiten IMMER in der Zone des Betriebs (Land), nie in der des Geräts (Tagescheck 26.11.2026, Fund 31)
  const tz = nachweisZone(org?.land);

  // Fenster sofort im Klick öffnen („Bericht wird erstellt …“), dann Straßenverlauf frisch (≤ 3 s, Tagescheck
  // 26.11.2026 Fund 10: sonst blieb „wird ermittelt“ im PDF, obwohl der Server längst fertig war), Kartenbild (≤ 8 s,
  // sonst Skizze) + Bericht
  function print() {
    setPrintErr(null);
    if (!org) return setPrintErr('Betrieb nicht geladen.');
    setDruckt(true);
    openReportWindowAfter(async () => {
      let str = strAnzeige ?? null;
      if (ladeStrassen && !run.canceled) {
        const neu = await strassenFrisch(ladeStrassen, 3000);
        if (neu) {
          str = neu;
          setFrisch({ id: run.id, stand: neu });
        }
      }
      return withWatermark(await buildRunHtmlMitKarte(org, run, str, { timeZone: tz }), pro);
    })
      .then((ok) => {
        if (!ok) setPrintErr('Das Druckfenster wurde blockiert — bitte Pop-ups für dieses Dashboard erlauben.');
      })
      .catch((e) => setPrintErr(`Bericht konnte nicht erstellt werden: ${String((e as Error)?.message ?? e)}`))
      .finally(() => setDruckt(false));
  }

  const hasPlan = !!run.planned_path && run.planned_path.length >= 2;
  const missed = run.missed ?? [];
  const name = run.route_name ?? 'Freie Fahrt';
  // nie mit Vorlage gefahren (Fahrten einer später gelöschten Strecke behalten route_name)
  const frei = !run.route_id && !run.route_name;
  const gaps = cleanGaps(run.gaps);
  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        {run.route_id ? <Link to={`../strecken/${run.route_id}`}>← {name}</Link> : <Link to="../strecken">← Alle Strecken</Link>}
      </p>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ marginBottom: 0 }}>
          {name} · {fmtDateTime(run.started_at, tz)}
        </h1>
        <ActionBadge action={run.action} canceled={run.canceled} />
      </div>
      <p className="muted">
        {fmtTimeSpan(run.started_at, run.ended_at, tz)} · dokumentiert von {run.performer_name ?? '—'}
      </p>

      {run.canceled && (
        <div className="error-box">
          Storniert am {fmtDateTime(run.canceled_at, tz)} — Begründung: {run.cancel_reason ?? '—'}
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Gefahren (GPS)</div>
          <div className="kpi-value">{fmtDistance(run.track_length_m)}</div>
          <div className="kpi-sub">vom Server berechnet</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dauer</div>
          <div className="kpi-value">{fmtDuration(Date.parse(run.ended_at) - Date.parse(run.started_at))}</div>
          <div className="kpi-sub">{fmtTimeSpan(run.started_at, run.ended_at, tz)}</div>
        </div>
        {hasPlan && (
          <div className="kpi">
            <div className="kpi-label">Abgedeckt</div>
            <div className="kpi-value">
              <CoverageBadge pct={run.coverage_pct} />
            </div>
            <div className="kpi-sub">Korridor 25 m um die Vorlage</div>
          </div>
        )}
        {hasPlan && (
          <div className="kpi">
            <div className="kpi-label">Nicht befahren</div>
            <div className="kpi-value">{fmtDistance(run.missed_m ?? 0)}</div>
            <div className="kpi-sub">
              {missed.length} {missed.length === 1 ? 'Abschnitt' : 'Abschnitte'}
            </div>
          </div>
        )}
      </div>

      <FahrtAnsicht
        plan={run.planned_path}
        track={run.track}
        missed={missed}
        gaps={gaps}
        startedAt={run.started_at}
        endedAt={run.ended_at}
        label={`Karte der Fahrt ${name} vom ${fmtDateTime(run.started_at, tz)}`}
        strassen={strAnzeige}
        canceled={run.canceled}
        timeZone={tz}
        gefahrenM={run.track_length_m}
      />

      {frei && (
        <p className="small muted fk-frei-hinweis">
          <Info className="i" aria-hidden />
          <span>
            Freie Fahrt reicht als Nachweis. Mit einer Strecken-Vorlage siehst du zusätzlich, wie viel der geplanten Strecke
            abgedeckt ist — Vorlage einmal anlegen unter <Link to="../strecken">Strecken</Link> („Neue Strecke“ in der App bzw.
            im Außendienst).
          </span>
        </p>
      )}

      {(gaps.length > 0 || run.gps_mocked || run.nachgetragen) && (
        <div className="card" style={{ marginBottom: 16 }}>
          {run.nachgetragen && (
            <div className="gps-warn" style={{ color: '#B91C1C', fontWeight: 700 }}>
              Nachgemeldet: ohne Fahrtpunkte und erst mehr als 15 Minuten nach dem Ende beim Server eingegangen (Kennzeichen vom
              Server)
            </div>
          )}
          {gaps.length > 0 && (
            <div className="gps-warn" style={{ color: '#B91C1C', fontWeight: 700 }}>
              Unterbrechungen der Aufzeichnung (Pause oder kein GPS):{' '}
              {gaps
                .filter((g) => Array.isArray(g))
                .map(([a, b]) => fmtTimeSpan(a, b, tz))
                .join(', ')}{' '}
              — nicht als gefahren gewertet
            </div>
          )}
          {run.gps_mocked && (
            <div className="gps-warn" style={{ color: '#B91C1C', fontWeight: 700 }}>
              Achtung: Das Gerät hat Fake-GPS gemeldet (Android).
            </div>
          )}
        </div>
      )}

      <div className="kpi-grid">
        <div className="card">
          <div className="kpi-label">Maßnahme</div>
          <div>{gritLabel(run.grit_material, run.grit_amount) === '—' ? '' : `Streumittel: ${gritLabel(run.grit_material, run.grit_amount)}`}</div>
          <div className="muted small">Wetter (archiviert): {weatherLabel(run.weather)}</div>
          {run.weather && <div className="muted small">{WEATHER_SOURCE}</div>}
        </div>
        <div className="card">
          <div className="kpi-label">Prüffester Nachweis</div>
          {run.entry_hash ? (
            <>
              <div className="muted small">
                Server-Eingang {fmtDateTime(run.received_at ?? run.created_at, tz)} · Prüfcode{' '}
                <span className="mono">{run.entry_hash.slice(0, 12)}</span>
              </div>
              <VerifyProof id={run.id} hash={run.entry_hash} rpc="verify_route_run" />
            </>
          ) : (
            <div className="muted small">Kein Prüfcode vorhanden.</div>
          )}
        </div>
      </div>

      {run.notes && (
        <>
          <div className="section-head">
            <h2>Notiz</h2>
          </div>
          <div className="card">{run.notes}</div>
        </>
      )}

      {Math.max(run.photo_total ?? 0, run.photo_urls.length) > 0 && (
        <>
          <div className="section-head">
            <h2>Beweisfotos ({Math.max(run.photo_total ?? 0, run.photo_urls.length)})</h2>
          </div>
          {(run.photo_total ?? 0) > run.photo_urls.filter(isSafeImgSrc).length && (
            <p className="muted small">
              Nicht alle Fotos ließen sich gerade laden — sie bleiben bei der Fahrt gespeichert. Seite neu laden versucht es erneut.
            </p>
          )}
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {run.photo_urls.filter(isSafeImgSrc).map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noreferrer">
                <img src={src} alt={`Beweisfoto ${i + 1}`} style={{ width: 220, maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
              </a>
            ))}
          </div>
        </>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={print} disabled={druckt} aria-busy={druckt}>
          <FileDown className="i" aria-hidden /> {druckt ? 'Bericht mit Karte wird erstellt …' : 'Nachweis als PDF'}
        </button>
        {/* Straßenverlauf noch nicht fertig: kurzer Hinweis — das PDF entsteht trotzdem (mit Vermerk an der Stelle der Tabelle) */}
        {strassenOffen(strAnzeige, run) && (run.track?.length ?? 0) >= 2 && (
          <span className="small muted" role="status">
            {STRASSEN_PDF_HINWEIS}
          </span>
        )}
        {canCancel && (
          <button className="btn ghost" onClick={() => setCanceling(true)}>
            Fahrt stornieren
          </button>
        )}
      </div>
      {printErr && <div className="error-box" style={{ marginTop: 10 }}>{printErr}</div>}

      {canceling && (
        <FormDialog
          title={`Fahrt stornieren — ${fmtDateTime(run.started_at, tz)}`}
          submitLabel="Stornieren"
          onClose={() => setCanceling(false)}
          onSave={(v: FormValues) => onCancel(s(v.reason))}
          fields={[
            {
              key: 'reason',
              label: 'Storno-Grund',
              kind: 'textarea',
              required: true,
              hint: 'Die Fahrt bleibt im Fahrtenbuch sichtbar und wird nur gekennzeichnet',
            },
          ]}
        />
      )}
    </>
  );
}
