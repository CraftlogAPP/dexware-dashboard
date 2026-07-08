// TourDex-Badges: Fahrt-Kategorie und Bestätigungs-Status.

import { CATEGORY_LABELS, type TripCategory } from './types';

const CATEGORY_BADGE_CLASS: Record<TripCategory, string> = {
  business: 'badge green',
  private: 'badge',
  commute: 'badge amber',
};

export function CategoryBadge({ category }: { category: TripCategory | null }) {
  if (!category || !CATEGORY_LABELS[category]) {
    return <span className="badge">Fahrt</span>;
  }
  return (
    <span className={CATEGORY_BADGE_CLASS[category]}>{CATEGORY_LABELS[category]}</span>
  );
}

export function ConfirmedBadge({ confirmed }: { confirmed: boolean | null }) {
  return confirmed ? (
    <span className="badge green">bestätigt</span>
  ) : (
    <span className="badge amber">unbestätigt</span>
  );
}
