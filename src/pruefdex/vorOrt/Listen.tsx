// „Vor Ort“ (PrüfDex) — die Listen, Reiter wie in der App: Geräte (alle, mit Suche und Kunden-Filter), Fristen
// (überfällig / bald fällig / noch nie geprüft) und Kunden (Kunde bzw. Standort → seine Geräte).
// Gerät antippen → Prüfung dokumentieren. Dringendes steht oben.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, CloudOff, Search, Smartphone } from 'lucide-react';
import { Modal } from '../../components/form';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import type { Customer, Device } from '../types';
import { loadPd, type PdState } from './backend';
import { usePd, usePendingSync, withPending } from './context';
import { dueLabel, dueStatus, type DueStatus } from './dguv';
import { deviceInfo } from './geraet';
import { deletePending, emitPendingChanged, listDrafts, type Pending } from './queue';

const BADGE: Record<DueStatus, { cls: string; label: string }> = {
  overdue: { cls: 'badge red', label: 'Überfällig' },
  none: { cls: 'badge amber', label: 'Noch nie' },
  soon: { cls: 'badge amber', label: 'Bald fällig' },
  ok: { cls: 'badge green', label: 'Gültig' },
};
/** Reihenfolge in den Listen: Dringendes zuerst. */
const ORDER: Record<DueStatus, number> = { overdue: 0, none: 1, soon: 2, ok: 3 };

const OFFLINE = 'Keine Verbindung — Stand vom letzten Laden. Prüfen geht trotzdem, gesendet wird später.';
/** Kunde „ohne“: Geräte, die keinem Kunden zugeordnet sind. */
const NO_CUSTOMER = 'ohne';

const byUrgency = (a: Device, b: Device) =>
  ORDER[dueStatus(a.next_due_date)] - ORDER[dueStatus(b.next_due_date)] ||
  (a.next_due_date ?? '').localeCompare(b.next_due_date ?? '') ||
  a.name.localeCompare(b.name, 'de', { numeric: true });

/** Laden (mit gemerktem Stand fürs Funkloch), Wartendes einrechnen und nach dem Nachsenden auffrischen. */
function usePdList() {
  const { be, userId } = usePd();
  const state = useAsync(() => loadPd(be, userId), [be, userId]);
  useLiveRefresh([state.refresh], 60000);
  const sync = usePendingSync();
  const count = sync.pending.length;
  const last = useRef(0);
  useEffect(() => {
    const fewer = count < last.current;
    last.current = count;
    if (fewer) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  // Angefangene Prüfungen auf diesem Gerät (Hinweis in der Liste)
  const [drafts, setDrafts] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    void listDrafts(userId).then((d) => {
      if (alive) setDrafts(new Set(d.map((x) => x.deviceId)));
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return { state, drafts, ...sync };
}

function DeviceRows({
  devices,
  customers,
  failed,
  waitingIds,
  drafts,
  showCustomer,
}: {
  devices: Device[];
  customers: Customer[];
  failed: Set<string>;
  waitingIds: Set<string>;
  drafts: Set<string>;
  showCustomer: boolean;
}) {
  const { base } = usePd();
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return (
    <ul className="ez-list">
      {devices.map((d) => {
        const status = dueStatus(d.next_due_date);
        const where = [showCustomer && d.customer_id ? names.get(d.customer_id) : null, d.location_note].filter(Boolean).join(' · ');
        return (
          <li key={d.id}>
            <Link to={`${base}/pruefen/${d.id}`} className="ez-prop" data-testid="pd-device">
              <span className="ez-prop-text">
                <b>{d.name}</b>
                <span className="muted">{deviceInfo(d)}</span>
                {where && <span className="muted">{where}</span>}
                <span className={status === 'overdue' ? 'pv-bad' : 'muted'}>{dueLabel(d.next_due_date)}</span>
              </span>
              <span className="ez-prop-side">
                {waitingIds.has(d.id) && <span className="badge amber">Wartet auf Netz</span>}
                {drafts.has(d.id) && !waitingIds.has(d.id) && <span className="badge">Angefangen</span>}
                {failed.has(d.id) && <span className="badge red">Mangel</span>}
                <span className={BADGE[status].cls}>{BADGE[status].label}</span>
                <ChevronRight className="i" aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function matches(d: Device, customerName: string | undefined, q: string): boolean {
  return [d.name, d.qr_code, d.device_type, d.manufacturer, d.serial_number, d.location_note, customerName].some((s) =>
    (s ?? '').toLowerCase().includes(q),
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="ez-search">
      <Search className="i" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Gerät suchen" />
    </label>
  );
}

function HomeHint() {
  return (
    <details className="ez-home">
      <summary>
        <Smartphone className="i" aria-hidden /> Wie eine App auf den Startbildschirm legen
      </summary>
      <p>
        <b>iPhone (Safari):</b> unten auf „Teilen“ tippen → „Zum Home-Bildschirm“ → „Hinzufügen“.
        <br />
        <b>Android (Chrome):</b> oben rechts auf ⋮ → „Zum Startbildschirm hinzufügen“.
      </p>
      <p className="muted small">Das Symbol öffnet direkt diese Seite. Einmal anmelden genügt — die Anmeldung bleibt gespeichert.</p>
    </details>
  );
}

// ================================================================ Reiter „Geräte“
export function Geraete() {
  const { base } = usePd();
  const { state, pending, sending, sendNow, drafts } = usePdList();
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const waitingIds = new Set(pending.map((p) => p.inspection.device_id));

  return (
    <div className="ez">
      <h1>Geräte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gerät antippen und die Prüfung dokumentieren — Sichtprüfung, Messwerte, Ergebnis, Unterschrift.
      </p>

      <Wartend pending={pending} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(data: PdState) => {
          const { devices, failed } = withPending(data.devices, data.failed, pending);
          if (devices.length === 0) {
            return (
              <div className="card empty">
                Noch kein Gerät angelegt. <Link to={`${base}/geraete`}>Gerät anlegen</Link> — danach kannst du es hier prüfen.
              </div>
            );
          }
          const names = new Map(data.customers.map((c) => [c.id, c.name]));
          const q = query.trim().toLowerCase();
          const shown = devices
            .filter((d) => !customerId || (customerId === NO_CUSTOMER ? !d.customer_id : d.customer_id === customerId))
            .filter((d) => !q || matches(d, d.customer_id ? names.get(d.customer_id) : undefined, q))
            .sort(byUrgency);
          const n = (s: DueStatus) => devices.filter((d) => dueStatus(d.next_due_date) === s).length;
          const dueParts = [
            n('overdue') ? `${n('overdue')} überfällig` : '',
            n('soon') ? `${n('soon')} bald fällig` : '',
            n('none') ? `${n('none')} noch nie geprüft` : '',
          ].filter(Boolean);
          const usedCustomers = data.customers.filter((c) => devices.some((d) => d.customer_id === c.id));
          const anyWithout = devices.some((d) => !d.customer_id);
          return (
            <>
              {data.offline && <div className="info-box">{OFFLINE}</div>}
              {dueParts.length > 0 && (
                <p style={{ margin: '0 0 12px' }}>
                  <Link to={`${base}/fristen`} className={n('overdue') ? 'pv-bad' : 'pv-soon'}>
                    {dueParts.join(' · ')} — Fristen ansehen ›
                  </Link>
                </p>
              )}
              {(devices.length >= 6 || query) && <SearchField value={query} onChange={setQuery} placeholder="Gerät, Geräte-ID, Hersteller, Kunde …" />}
              {usedCustomers.length > 0 && (devices.length >= 6 || customerId) && (
                <div className="ez-chips" role="group" aria-label="Kunde" style={{ marginBottom: 12 }}>
                  <button type="button" className={`ez-chip${customerId === '' ? ' on' : ''}`} aria-pressed={customerId === ''} onClick={() => setCustomerId('')}>
                    Alle Kunden
                  </button>
                  {usedCustomers.map((c) => (
                    <button key={c.id} type="button" className={`ez-chip${customerId === c.id ? ' on' : ''}`} aria-pressed={customerId === c.id} onClick={() => setCustomerId(c.id)}>
                      {c.name}
                    </button>
                  ))}
                  {anyWithout && (
                    <button
                      type="button"
                      className={`ez-chip${customerId === NO_CUSTOMER ? ' on' : ''}`}
                      aria-pressed={customerId === NO_CUSTOMER}
                      onClick={() => setCustomerId(NO_CUSTOMER)}
                    >
                      Ohne Kunde
                    </button>
                  )}
                </div>
              )}
              <h2 className="ez-section">
                Geräte <span className="muted">· {shown.length === devices.length ? devices.length : `${shown.length} von ${devices.length}`}</span>
              </h2>
              {shown.length === 0 ? (
                <div className="card empty">Kein Gerät passt — anderen Begriff oder „Alle Kunden“ wählen.</div>
              ) : (
                <DeviceRows devices={shown} customers={data.customers} failed={failed} waitingIds={waitingIds} drafts={drafts} showCustomer />
              )}
              <p className="small" style={{ marginTop: 16 }}>
                <Link to={`${base}/geraete`}>Geräte verwalten (anlegen, bearbeiten, aussondern, Prüf-Historie)</Link>
              </p>
            </>
          );
        }}
      </LoadGuard>

      <HomeHint />
    </div>
  );
}

// ================================================================ Reiter „Fristen“
const SECTIONS: { status: DueStatus; title: string; hint: string }[] = [
  { status: 'overdue', title: 'Überfällig', hint: 'Frist abgelaufen — bitte zuerst prüfen' },
  { status: 'soon', title: 'Bald fällig', hint: 'in den nächsten 30 Tagen' },
  { status: 'none', title: 'Noch nie geprüft', hint: 'ohne Prüfung — jetzt fällig' },
];

export function Fristen() {
  const { base } = usePd();
  const { state, pending, sending, sendNow, drafts } = usePdList();
  const [query, setQuery] = useState('');
  const waitingIds = new Set(pending.map((p) => p.inspection.device_id));

  return (
    <div className="ez">
      <h1>Fristen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Was als Nächstes geprüft werden muss — überfällige Geräte stehen oben.
      </p>

      <Wartend pending={pending} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(data: PdState) => {
          const { devices, failed } = withPending(data.devices, data.failed, pending);
          const names = new Map(data.customers.map((c) => [c.id, c.name]));
          const q = query.trim().toLowerCase();
          const due = devices.filter((d) => dueStatus(d.next_due_date) !== 'ok');
          const shown = due.filter((d) => !q || matches(d, d.customer_id ? names.get(d.customer_id) : undefined, q));
          return (
            <>
              {data.offline && <div className="info-box">{OFFLINE}</div>}
              {(due.length >= 6 || query) && <SearchField value={query} onChange={setQuery} placeholder="Gerät, Seriennummer, Kunde …" />}
              {due.length === 0 ? (
                <div className="card empty">
                  {devices.length === 0 ? 'Noch kein Gerät angelegt.' : 'Alles im grünen Bereich — in den nächsten 30 Tagen wird nichts fällig.'}{' '}
                  <Link to={base}>Zu den Geräten</Link>
                </div>
              ) : shown.length === 0 ? (
                <div className="card empty">Kein fälliges Gerät passt zur Suche.</div>
              ) : (
                SECTIONS.map((s) => {
                  const list = shown.filter((d) => dueStatus(d.next_due_date) === s.status).sort(byUrgency);
                  if (list.length === 0) return null;
                  return (
                    <section key={s.status}>
                      <h2 className="ez-section">
                        {s.title} <span className="muted">· {list.length} · {s.hint}</span>
                      </h2>
                      <DeviceRows devices={list} customers={data.customers} failed={failed} waitingIds={waitingIds} drafts={drafts} showCustomer />
                    </section>
                  );
                })
              )}
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}

// ================================================================ Reiter „Kunden“
export function Kunden() {
  const { base } = usePd();
  const { state, pending, sending, sendNow } = usePdList();

  return (
    <div className="ez">
      <h1>Kunden</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Kunde bzw. Standort antippen — dann siehst du seine Geräte mit Fälligkeit und kannst der Reihe nach prüfen.
      </p>

      <Wartend pending={pending} sending={sending} sendNow={sendNow} />

      <LoadGuard state={state}>
        {(data: PdState) => {
          const { devices } = withPending(data.devices, data.failed, pending);
          const row = (id: string, name: string, address: string | null, list: Device[]) => {
            const overdue = list.filter((d) => dueStatus(d.next_due_date) === 'overdue').length;
            const open = list.filter((d) => ['soon', 'none'].includes(dueStatus(d.next_due_date))).length;
            return (
              <li key={id}>
                <Link to={`${base}/standort/${id}`} className="ez-prop" data-testid="pd-customer">
                  <span className="ez-prop-text">
                    <b>{name}</b>
                    {address && <span className="muted">{address}</span>}
                    <span className={overdue ? 'pv-bad' : 'muted'}>
                      {list.length === 1 ? '1 Gerät' : `${list.length} Geräte`}
                      {overdue ? ` · ${overdue} überfällig` : ''}
                      {open ? ` · ${open} bald fällig oder ungeprüft` : ''}
                      {list.length > 0 && !overdue && !open ? ' · alle Fristen gültig' : ''}
                    </span>
                  </span>
                  <span className="ez-prop-side">
                    {overdue > 0 ? <span className="badge red">Überfällig</span> : open > 0 ? <span className="badge amber">Fällig</span> : list.length > 0 ? <span className="badge green">Gültig</span> : null}
                    <ChevronRight className="i" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          };
          const without = devices.filter((d) => !d.customer_id || !data.customers.some((c) => c.id === d.customer_id));
          return (
            <>
              {data.offline && <div className="info-box">{OFFLINE}</div>}
              {data.customers.length === 0 && without.length === 0 ? (
                <div className="card empty">
                  Noch kein Kunde angelegt. <Link to={`${base}/kunden`}>Kunde anlegen</Link> — Geräte lassen sich auch ohne Kunde prüfen.
                </div>
              ) : (
                <ul className="ez-list">
                  {data.customers
                    .map((c) => ({ c, list: devices.filter((d) => d.customer_id === c.id) }))
                    .sort((a, b) => a.c.name.localeCompare(b.c.name, 'de', { numeric: true }))
                    .map(({ c, list }) => row(c.id, c.name, c.address, list))}
                  {without.length > 0 && row(NO_CUSTOMER, 'Ohne Kunde', 'Geräte ohne Zuordnung', without)}
                </ul>
              )}
              <p className="small" style={{ marginTop: 16 }}>
                <Link to={`${base}/kunden`}>Kunden verwalten (anlegen, bearbeiten)</Link>
              </p>
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}

/** Ein Kunde bzw. Standort mit seinen Geräten. */
export function Standort() {
  const { id } = useParams();
  const { base } = usePd();
  const { state, pending, sending, sendNow, drafts } = usePdList();
  const [query, setQuery] = useState('');
  const waitingIds = new Set(pending.map((p) => p.inspection.device_id));
  const back = (
    <Link to={`${base}/standorte`} className="ez-back">
      <ArrowLeft className="i" aria-hidden /> Kunden
    </Link>
  );

  return (
    <div className="ez">
      {back}
      <LoadGuard state={state}>
        {(data: PdState) => {
          const customer = data.customers.find((c) => c.id === id) ?? null;
          if (!customer && id !== NO_CUSTOMER) return <div className="error-box">Kunde nicht gefunden — gelöscht oder aus einem anderen Betrieb?</div>;
          const { devices, failed } = withPending(data.devices, data.failed, pending);
          const mine = devices.filter((d) => (customer ? d.customer_id === customer.id : !d.customer_id || !data.customers.some((c) => c.id === d.customer_id)));
          const q = query.trim().toLowerCase();
          const shown = mine.filter((d) => !q || matches(d, undefined, q)).sort(byUrgency);
          const due = mine.filter((d) => dueStatus(d.next_due_date) !== 'ok').length;
          return (
            <>
              <h1>{customer?.name ?? 'Ohne Kunde'}</h1>
              <p className="muted" style={{ marginTop: -6 }}>
                {customer?.address ? `${customer.address} · ` : ''}
                {mine.length === 1 ? '1 Gerät' : `${mine.length} Geräte`}
                {due > 0 ? ` · ${due} fällig` : mine.length > 0 ? ' · alle Fristen gültig' : ''}
              </p>
              <Wartend pending={pending} sending={sending} sendNow={sendNow} />
              {data.offline && <div className="info-box">{OFFLINE}</div>}
              {(mine.length >= 6 || query) && <SearchField value={query} onChange={setQuery} placeholder="Gerät, Geräte-ID, Hersteller …" />}
              {mine.length === 0 ? (
                <div className="card empty">
                  Für diesen Kunden ist noch kein Gerät angelegt. <Link to={`${base}/geraete`}>Gerät anlegen</Link>
                </div>
              ) : shown.length === 0 ? (
                <div className="card empty">Kein Gerät passt zur Suche.</div>
              ) : (
                <DeviceRows devices={shown} customers={data.customers} failed={failed} waitingIds={waitingIds} drafts={drafts} showCustomer={false} />
              )}
            </>
          );
        }}
      </LoadGuard>
    </div>
  );
}

// ================================================================ Wartende Prüfungen
/** Kasten „wartet auf die Übertragung“: Prüfungen, die noch nicht auf dem Server sind. */
export function Wartend({ pending, sending, sendNow }: { pending: Pending[]; sending: boolean; sendNow: () => void }) {
  const [discard, setDiscard] = useState<Pending | null>(null);
  if (pending.length === 0) return null;
  const line = (p: Pending) => `${p.deviceName}${p.customerName ? ` · ${p.customerName}` : ''} · ${fmtDate(p.inspection.inspected_at)}`;
  return (
    <div className="ez-pending" role="status">
      <div className="ez-pending-head">
        <CloudOff className="i" aria-hidden />
        <b>{pending.length === 1 ? '1 Prüfung wartet' : `${pending.length} Prüfungen warten`} auf die Übertragung</b>
      </div>
      <p className="small">
        Sicher auf diesem Gerät gespeichert. Sie werden automatisch gesendet, sobald wieder Empfang da ist — Datum, Ort,
        Fotos und Unterschrift bleiben die vom Prüfort.
      </p>
      <ul>
        {pending.map((p) => (
          <li key={p.key}>
            <span>
              {line(p)}
              {p.lastError && <span className="ez-pending-err">Vom Server nicht angenommen: {p.lastError}</span>}
            </span>
            {p.lastError && (
              <button type="button" className="btn ghost small" onClick={() => setDiscard(p)}>
                Verwerfen
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" onClick={sendNow} disabled={sending}>
        {sending ? 'Sendet …' : 'Jetzt senden'}
      </button>

      {discard && (
        <Modal title="Verwerfen?" onClose={() => setDiscard(null)} dirty={false}>
          <p>{line(discard)}</p>
          <p className="muted">
            Der Server hat diese Prüfung nicht angenommen. Beim Verwerfen wird sie samt Fotos und Unterschrift von diesem
            Gerät gelöscht und lässt sich nicht wiederherstellen.
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
