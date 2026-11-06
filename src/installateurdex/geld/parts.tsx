// Kleine Bausteine der Geld-Seiten.

import type { StoredInvoice } from './api';
import { isOverdue } from './util';

/** Abzeichen wie App InvoicesScreen */
export function InvoiceBadge({ x }: { x: StoredInvoice }) {
  if (x.kind === 'credit') return <span className="badge">Storno</span>;
  if (x.status === 'draft') return <span className="badge">Entwurf</span>;
  if (x.status === 'paid') return <span className="badge green">Bezahlt</span>;
  if (x.status === 'canceled') return <span className="badge red">Storniert</span>;
  if (isOverdue(x)) return <span className="badge red">Überfällig</span>;
  if (x.kind === 'quote') return <span className="badge amber">Angebot</span>;
  return <span className="badge amber">Offen</span>;
}
