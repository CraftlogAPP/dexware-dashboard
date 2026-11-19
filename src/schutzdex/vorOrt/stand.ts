// Gemeinsames der SchutzDex-Listen: Laden mit Auffrischen und der Stand einer Unterweisung über alle Mitarbeiter.
import { useEffect, useRef } from 'react';
import { useAsync, useLiveRefresh } from '../../components/ui';
import type { Member } from '../types';
import { loadSd } from './backend';
import { usePendingSync, useSd } from './context';
import { dueInfo, type DueState } from './due';

/** Laden (mit gemerktem Stand fürs Funkloch) und nach dem Nachsenden auffrischen. */
export function useSdList() {
  const { be, userId } = useSd();
  const state = useAsync(() => loadSd(be, userId), [be, userId]);
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
  return { state, ...sync };
}

const pair = (memberId: string, briefingId: string) => `${memberId}|${briefingId}`;

/** Stand EINER Unterweisung über alle aktiven Mitarbeiter. */
export function briefingStand(briefingId: string, active: Member[], lastPassed: Map<string, string>) {
  const count: Record<DueState, number> = { never: 0, overdue: 0, soon: 0, ok: 0 };
  for (const m of active) count[dueInfo(lastPassed.get(pair(m.id, briefingId))).state]++;
  const current = count.ok + count.soon;
  const tone: 'red' | 'amber' | 'green' | '' = active.length === 0 ? '' : count.overdue > 0 ? 'red' : count.never > 0 || count.soon > 0 ? 'amber' : 'green';
  const label =
    active.length === 0
      ? 'Noch kein aktiver Mitarbeiter'
      : [
          // „bald fällig“ zählt noch als aktuell — deshalb in Klammern dahinter
          `${current} von ${active.length} ${active.length === 1 ? 'Mitarbeiter' : 'Mitarbeitern'} aktuell${count.soon ? ` (${count.soon} bald fällig)` : ''}`,
          count.overdue ? `${count.overdue} abgelaufen` : '',
          count.never ? `${count.never} noch nicht unterwiesen` : '',
        ]
          .filter(Boolean)
          .join(' · ');
  const badge = tone === 'red' ? 'Überfällig' : tone === 'green' ? 'Alle unterwiesen ✓' : tone === 'amber' ? (count.never ? 'Offen' : 'Bald fällig') : '';
  return { count, current, tone, label, badge };
}
