// Kurzer Stand der eigenen Prüfpunkte für die Einstellungen („3 eigene Punkte · 1 ausgeblendet“).
import { useMemo } from 'react';
import { useAsync } from '../../components/ui';
import { useInst } from '../context';
import { cleanChecks, countCustom } from './logic';
import './pruefpunkte.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function useChecksSummary(): string | null {
  const { ext, org } = useInst();
  const s = useAsync(() => ext.pruefpunkte.load(org.id), [ext, org.id]);
  return useMemo(() => {
    if (!s.data) return null;
    const c = countCustom(cleanChecks(s.data));
    if (!c.own && !c.hidden && !c.fields) return 'Noch keine Anpassungen — es gelten die Standard-Checklisten.';
    return [
      c.own && plural(c.own, 'eigener Punkt', 'eigene Punkte'),
      c.hidden && `${c.hidden} ausgeblendet`,
      c.fields && plural(c.fields, 'eigener Messwert', 'eigene Messwerte'),
    ]
      .filter(Boolean)
      .join(' · ');
  }, [s.data]);
}
