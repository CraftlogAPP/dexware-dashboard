// Kasten „wartet auf die Übertragung“: Prüfungen, die noch nicht (ganz) auf dem Server sind.
import { useState } from 'react';
import { CloudOff } from 'lucide-react';
import { Modal } from '../../components/form';
import { wordsOf } from '../config';
import { usePruef } from '../context';
import { fmtDateTime } from '../../lib/format';
import { defectsMissing } from '../send';
import { deletePending, emitPendingChanged, type Pending } from '../store';

export function Wartend({ pending, sending, sendNow }: { pending: Pending[]; sending: boolean; sendNow: () => void }) {
  const [discard, setDiscard] = useState<Pending | null>(null);
  // Wortwahl der App: Prüfung/Inspektion/Kontrolle, Mangel/Schaden
  const { insp: I, defect: D } = wordsOf(usePruef().cfg);
  if (pending.length === 0) return null;
  return (
    <div className="ez-pending" role="status">
      <div className="ez-pending-head">
        <CloudOff className="i" aria-hidden />
        <b>{pending.length === 1 ? `1 ${I.one} wartet` : `${pending.length} ${I.many} warten`} auf die Übertragung</b>
      </div>
      <p className="small">
        Sicher auf diesem Gerät gespeichert. Sie werden automatisch gesendet, sobald wieder Empfang da ist — Zeit, Ort
        und Fotos bleiben die vom Prüfort.
      </p>
      <ul>
        {pending.map((p) => {
          const missing = defectsMissing(p);
          return (
            <li key={p.key}>
              <span>
                {p.unitName} · {p.siteName} · {fmtDateTime(p.inspection.started_at)}
                {p.sent.inspection && missing > 0 && (
                  <span className="muted small" style={{ display: 'block' }}>
                    {I.one} ist übertragen — {missing === 1 ? `1 ${D.one} fehlt` : `${missing} ${D.many} fehlen`} noch
                  </span>
                )}
                {p.lastError && <span className="ez-pending-err">Vom Server nicht angenommen: {p.lastError}</span>}
              </span>
              {p.lastError && (
                <button type="button" className="btn ghost small" onClick={() => setDiscard(p)}>
                  Verwerfen
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn small" onClick={sendNow} disabled={sending}>
        {sending ? 'Sendet …' : 'Jetzt senden'}
      </button>

      {discard && (
        <Modal title="Verwerfen?" onClose={() => setDiscard(null)} dirty={false}>
          <p>
            {discard.unitName} · {discard.siteName} · {fmtDateTime(discard.inspection.started_at)}
          </p>
          <p className="muted">
            {discard.sent.inspection
              ? `Die ${I.one} selbst ist schon auf dem Server und bleibt dort. Verworfen werden nur die noch fehlenden ${D.many} samt Fotos — sie lassen sich nicht wiederherstellen. Trage sie danach bitte unter „${D.many}“ von Hand nach.`
              : `Der Server hat diese ${I.one} nicht angenommen. Beim Verwerfen wird sie samt ${D.manyDative} und Fotos von diesem Gerät gelöscht und lässt sich nicht wiederherstellen.`}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={() => setDiscard(null)}>
              Behalten
            </button>
            <button
              type="button"
              className="btn ez-danger"
              onClick={() => {
                void deletePending(discard.key).then(emitPendingChanged);
                setDiscard(null);
              }}
            >
              Endgültig verwerfen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
