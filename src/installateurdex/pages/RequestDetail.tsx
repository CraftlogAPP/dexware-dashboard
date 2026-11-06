import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { DueCell, RequestStatusBadge } from '../badges';
import { useInst } from '../context';
import { AiNote, ContactButtons, ContactValue, RequestPhoto } from '../parts';
import { AppointmentCard } from '../Appointment';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  dueInfo,
  fmtEur,
  kindInfo,
  lastServiceFromJobs,
  makerModel,
  relTime,
  type RequestStatus,
  type ServiceRequest,
} from '../types';

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, base, bumpRequests } = useInst();

  const state = useAsync(async () => {
    const r = await data.request(id!);
    if (!r) return { r: null, asset: null, site: null, jobs: [], members: [] };
    const [asset, site, jobs, members] = await Promise.all([
      r.asset_id ? data.asset(r.asset_id) : Promise.resolve(null),
      r.site_id ? data.site(r.site_id) : Promise.resolve(null),
      r.asset_id ? data.jobs({ itemId: r.asset_id, limit: 100 }) : Promise.resolve([]),
      data.members().catch(() => []),
    ]);
    return { r, asset, site, jobs, members };
  }, [data, id]);

  return (
    <>
      <Link className="idx-back" to={`${base}/anfragen`}>
        ← Alle Anfragen
      </Link>
      <LoadGuard state={state}>
        {({ r, asset, site, jobs, members }) => {
          if (!r) return <div className="error-box">Anfrage nicht gefunden.</div>;
          const due = asset ? dueInfo(lastServiceFromJobs(jobs).get(asset.id), asset) : null;
          const handler = r.handled_by ? members.find((m) => m.user_id === r.handled_by)?.email : undefined;
          const topic = r.kind === 'fault' ? 'Ihre Störungsmeldung' : r.kind === 'quote' ? 'Ihr Angebot' : 'Ihre Wartungsanfrage';
          const subject = `${topic}${asset ? ` — Anlage ${asset.name}` : ''}${site ? ` (${site.name})` : ''}`;

          return (
            <>
              <div className="idx-head">
                <h1>{REQUEST_KIND_LABELS[r.kind]}</h1>
                <span className="row" style={{ gap: 8 }}>
                  {asset?.contract && <span className="badge green">🤝 Vertragskunde</span>}
                  <RequestStatusBadge status={r.status} />
                  {r.status !== 'done' && r.status !== 'dismissed' && (
                    // Plantafel übernimmt Objekt, Anlage, Titel und den vom Kunden gewählten Termin aus der Anfrage.
                    <Link className="btn small" to={`${base}/plantafel?neu=1&anfrage=${encodeURIComponent(r.id)}`}>
                      <CalendarPlus className="i" aria-hidden /> Termin einplanen
                    </Link>
                  )}
                </span>
              </div>
              <p className="muted" style={{ marginTop: 4 }}>
                Eingegangen {relTime(r.created_at)} · {fmtDateTime(r.created_at)} · über{' '}
                {r.source === 'reminder' ? 'die Erinnerungsmail' : 'den QR-Anlagenpass'}
              </p>
              {r.kind === 'fault' && (
                <div className="idx-fault-box">
                  🚨 <b>Störungsmeldung</b> — der Kunde wartet auf eine Rückmeldung. Bitte zeitnah melden.
                </div>
              )}
              {r.kind === 'quote' && (
                <div className="idx-quote-box">
                  💶 <b>Angebotsanfrage</b> — der Kunde möchte ein Angebot zu einer Empfehlung an dieser Anlage.
                  {asset && ' Offene Empfehlungen stehen in der Anlagenakte.'}
                </div>
              )}

              <div className="idx-cols" style={{ marginTop: 14 }}>
                <div className="idx-stack">
                  <div className="card">
                    <h3 className="idx-card-title">Nachricht des Kunden</h3>
                    {r.message ? <div className="idx-message">{r.message}</div> : <span className="muted">Ohne Nachricht.</span>}
                    {r.preferred && (
                      <p style={{ marginBottom: 0 }}>
                        <span className="muted">Wunschtermin:</span> <b>{r.preferred}</b>
                      </p>
                    )}
                  </div>

                  {(r.photo_url || r.ai_note) && (
                    <div className="card">
                      <h3 className="idx-card-title">Foto vom Kunden</h3>
                      {r.ai_note && <AiNote text={r.ai_note} />}
                      {r.photo_url ? (
                        <RequestPhoto src={r.photo_url} />
                      ) : (
                        <span className="muted small">Das Foto konnte nicht geladen werden.</span>
                      )}
                    </div>
                  )}

                  <div className="card">
                    <h3 className="idx-card-title">Anlage &amp; Objekt</h3>
                    {asset ? (
                      <dl className="idx-dl">
                        <dt>Anlage</dt>
                        <dd>
                          <Link to={`${base}/anlagen/${asset.id}`}>{asset.name}</Link> · {kindInfo(asset.kind).emoji}{' '}
                          {kindInfo(asset.kind).label}
                        </dd>
                        {makerModel(asset) && (
                          <>
                            <dt>Hersteller / Modell</dt>
                            <dd>{makerModel(asset)}</dd>
                          </>
                        )}
                        <dt>Wartungsvertrag</dt>
                        <dd>
                          {asset.contract ? (
                            <>
                              ja
                              {asset.contract_price != null && ` · ${fmtEur(asset.contract_price)} je Wartung laut Vertrag`}
                            </>
                          ) : (
                            'nein'
                          )}
                        </dd>
                        {due && (
                          <>
                            <dt>Nächste Wartung</dt>
                            <dd>
                              <DueCell info={due} retired={asset.retired} />
                            </dd>
                          </>
                        )}
                        {site && (
                          <>
                            <dt>Objekt</dt>
                            <dd>
                              <Link to={`${base}/kunden/${site.id}`}>{site.name}</Link>
                            </dd>
                            <dt>Kunde</dt>
                            <dd>{site.operator_name ?? '—'}</dd>
                            <dt>Adresse</dt>
                            <dd>{site.address || '—'}</dd>
                            <dt>Kontakt (Objekt)</dt>
                            <dd>
                              <ContactValue value={site.operator_contact} />
                            </dd>
                          </>
                        )}
                      </dl>
                    ) : (
                      <span className="muted">
                        Die Anlage gibt es nicht mehr (gelöscht oder außer Betrieb genommen). Die Kontaktdaten der Anfrage
                        bleiben erhalten.
                      </span>
                    )}
                  </div>
                </div>

                <div className="idx-stack">
                  <div className="card">
                    <h3 className="idx-card-title">Kontakt</h3>
                    {r.contact_name && (
                      <p style={{ marginTop: 0 }}>
                        <b>{r.contact_name}</b>
                      </p>
                    )}
                    <ContactButtons phone={r.contact_phone} email={r.contact_email} subject={subject} />
                  </div>

                  <AppointmentCard r={r} asset={asset} site={site} onChanged={() => { bumpRequests(); state.refresh(); }} />

                  <StatusEditor r={r} handler={handler} onSaved={() => { bumpRequests(); state.refresh(); }} />
                </div>
              </div>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}

function StatusEditor({ r, handler, onSaved }: { r: ServiceRequest; handler?: string; onSaved: () => void }) {
  const { data } = useInst();
  const [status, setStatus] = useState<RequestStatus>(r.status);
  const [note, setNote] = useState(r.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Nach dem Speichern kommen neue Daten — Formular gleichziehen.
  useEffect(() => {
    setStatus(r.status);
    setNote(r.note ?? '');
  }, [r.status, r.note]);

  const dirty = status !== r.status || note.trim() !== (r.note ?? '').trim();

  async function save() {
    if (note.trim().length > 2000) {
      setError('Die Notiz darf höchstens 2000 Zeichen haben.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await data.setRequestStatus(r.id, status, note.trim());
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 className="idx-card-title">Bearbeiten</h3>
      <div className="small muted">Status</div>
      <div className="idx-status-pick" role="radiogroup" aria-label="Status">
        {REQUEST_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            className={status === s ? 'on' : ''}
            onClick={() => {
              setStatus(s);
              setSaved(false);
            }}
          >
            {REQUEST_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <label className="field">
        Interne Notiz (nur für das Team)
        <textarea
          rows={4}
          maxLength={2000}
          value={note}
          placeholder="z. B. Termin Do 9 Uhr, Max fährt hin"
          onChange={(e) => {
            setNote(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      {error && <div className="error-box">{error}</div>}
      <div className="row">
        <button type="button" className="btn" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? 'Speichern …' : 'Speichern'}
        </button>
        {saved && !dirty && <span className="idx-ok">✓ Gespeichert</span>}
      </div>
      {r.handled_at && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Zuletzt bearbeitet {fmtDateTime(r.handled_at)}
          {handler ? ` von ${handler}` : ''}.
        </p>
      )}
    </div>
  );
}
