import { Link, useLocation } from 'react-router-dom';
import { ClipboardCheck, Monitor } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import { VOR_ORT_PATH } from './Scope';

/**
 * Umschalter oben rechts: vom Dashboard (Büro, großer Bildschirm) in die Handy-Ansicht „Vor Ort“
 * (Prüfung dokumentieren) und zurück. Gleiche Optik wie „Außendienst“ bei WinterDex.
 */
export function VorOrtSwitch() {
  const { app } = useAppAuth();
  const { pathname } = useLocation();
  const field = pathname.startsWith(`/app/${app.id}/${VOR_ORT_PATH}`);
  return field ? (
    <Link className="btn ghost small" to={`/app/${app.id}`} title="Zurück zum Dashboard (Büro)">
      <Monitor className="i" aria-hidden /> Dashboard
    </Link>
  ) : (
    <Link className="btn small mode-field" to={`/app/${app.id}/${VOR_ORT_PATH}`} title="Handy-Ansicht: Prüfung vor Ort dokumentieren">
      <ClipboardCheck className="i" aria-hidden /> Vor Ort
    </Link>
  );
}
