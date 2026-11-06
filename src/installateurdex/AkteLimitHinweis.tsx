// Hinweis über dem Druck-Knopf der Akte — nur wenn sie gekappt wird (Text: akteLimitNote.ts).

import { useAsync } from '../components/ui';
import { akteLimitNote } from './akteLimitNote';
import { useInst } from './context';

export function AkteLimitHinweis({ siteId, itemId }: { siteId?: string; itemId?: string }) {
  const { data } = useInst();
  const counts = useAsync(() => data.reportCounts({ siteId, itemId }), [data, siteId, itemId]);
  const note = counts.data ? akteLimitNote(counts.data) : null;
  if (!note) return null;
  return (
    <div className="info-box" style={{ margin: '8px 0 0' }}>
      ℹ️ {note}
    </div>
  );
}
