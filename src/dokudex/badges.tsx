// DokuDex-Badges: Dokumenttyp.

import { TYPE_LABELS, type DocType } from './types';

const TYPE_BADGE_CLASS: Record<DocType, string> = {
  contract: 'badge external',
  invoice: 'badge amber',
  doctor: 'badge green',
  authority: 'badge red',
  other: 'badge',
};

export function TypeBadge({ type }: { type: DocType | null }) {
  if (!type || !TYPE_LABELS[type]) {
    return <span className="badge">Dokument</span>;
  }
  return <span className={TYPE_BADGE_CLASS[type]}>{TYPE_LABELS[type]}</span>;
}
