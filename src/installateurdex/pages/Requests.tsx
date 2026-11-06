import { useSearchParams } from 'react-router-dom';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useInst } from '../context';
import { RequestCard } from '../parts';
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  byRequestRank,
  type Asset,
  type RequestKind,
  type RequestStatus,
  type Site,
} from '../types';

const KINDS: RequestKind[] = ['fault', 'quote', 'maintenance'];

type Tab = RequestStatus | 'all';
type KindFilter = RequestKind | '';

const TABS: Tab[] = [...REQUEST_STATUSES, 'all'];
const TAB_LABEL: Record<Tab, string> = { ...REQUEST_STATUS_LABELS, all: 'Alle' };

export function Requests() {
  const { data, base, requestsVersion } = useInst();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as string[]).includes(params.get('status') ?? '') ? (params.get('status') as Tab) : 'new';
  const kind = ((KINDS as string[]).includes(params.get('art') ?? '') ? params.get('art') : '') as KindFilter;

  const state = useAsync(async () => {
    const [requests, sites, assets] = await Promise.all([data.requests(), data.sites(), data.assets()]);
    return { requests, sites, assets };
  }, [data, requestsVersion]);
  useLiveRefresh([state.refresh]);

  function set(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <>
      <h1>Anfragen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        „Störung melden", „Angebot anfragen" und „Wartung anfragen" vom QR-Anlagenpass. Status setzen, Notiz für das
        Team festhalten — der Kunde sieht davon nichts.
      </p>

      <LoadGuard state={state}>
        {({ requests, sites, assets }) => {
          const siteById = new Map<string, Site>(sites.map((s) => [s.id, s]));
          const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));
          const byKind = requests.filter((r) => !kind || r.kind === kind);
          const count = (t: Tab) => (t === 'all' ? byKind.length : byKind.filter((r) => r.status === t).length);
          // Neue Störungen → neue Angebote → neue Wartungen → Rest (wie die App), je neueste zuerst.
          const list = byKind.filter((r) => tab === 'all' || r.status === tab).sort(byRequestRank);

          return (
            <>
              <div className="idx-tabs" role="tablist" aria-label="Status">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? 'on' : ''}
                    onClick={() => set('status', t, 'new')}
                  >
                    {TAB_LABEL[t]} <span className="n">{count(t)}</span>
                  </button>
                ))}
              </div>
              <div className="filter-bar" style={{ marginTop: 0 }}>
                <label className="field" style={{ minWidth: 200 }}>
                  Art
                  <select value={kind} onChange={(e) => set('art', e.target.value, '')}>
                    <option value="">Alle Arten</option>
                    <option value="fault">Nur Störungen</option>
                    <option value="quote">Nur Angebote</option>
                    <option value="maintenance">Nur Wartungsanfragen</option>
                  </select>
                </label>
              </div>

              {list.length === 0 ? (
                <div className="card empty">
                  {requests.length === 0
                    ? 'Noch keine Anfragen. Sobald ein Kunde über den QR-Anlagenpass eine Wartung anfragt oder eine Störung meldet, steht sie hier.'
                    : `Keine Anfragen mit Status „${TAB_LABEL[tab]}".`}
                </div>
              ) : (
                <div className="idx-req-list">
                  {list.map((r) => {
                    const a = r.asset_id ? assetById.get(r.asset_id) : undefined;
                    const s = siteById.get(r.site_id ?? a?.site_id ?? '');
                    return <RequestCard key={r.id} r={r} asset={a} site={s} base={base} />;
                  })}
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
