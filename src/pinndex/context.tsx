// PinnDex — gemeinsamer Kontext der Seiten: Datenquelle (echt oder Beispieldaten), Betrieb, eigene Rolle, Team.
// Rechte wie die Datenbank-Regeln (KONZEPT.md Abschnitt 2/6): Chef alles, Büro (dispatcher) Karten + Kunden (kein Team/Abo),
// Monteur nur eigene Karten und nur Zustand (keine Stammdaten). Der Server prüft das ohnehin selbst (RLS + RPCs).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppConfig } from '../apps/registry';
import { useAsync } from '../components/ui';
import type { PinnData } from './data';
import type { PinnMember, PinnOrg, PinnRole } from './types';

export interface PinnCtx {
  app: AppConfig;
  data: PinnData;
  org: PinnOrg;
  me: PinnMember;
  role: PinnRole;
  /** Chef oder Büro: Karten anlegen, zuweisen, Kunden pflegen, Zeiten korrigieren */
  canManage: boolean;
  /** Nur Chef: Team, Rollen, Betrieb */
  isOwner: boolean;
  /** Chef oder Verwalter (member.is_admin, 13.11.): Team-Code sehen, kopieren, erneuern. Ernennen nur in der App. */
  canTeamCode: boolean;
  demo: boolean;
  /** Absoluter Pfad des Bereichs, z. B. /app/pinndex */
  base: string;
  members: PinnMember[];
  reloadMembers: () => void;
  refreshOrg: () => void;
  /** Steigt nach eigenen Änderungen (Speichern, Ziehen, Zustand) — Seiten laden dann still neu. */
  version: number;
  bump: () => void;
  /** Live-Verbindung (Realtime) steht */
  live: boolean;
  /** Zeitpunkt der letzten Änderungsmeldung (Realtime oder eigene) */
  changedAt: number;
}

const Ctx = createContext<PinnCtx | null>(null);

export function usePinn(): PinnCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePinn außerhalb des Laufzettel-Bereichs');
  return v;
}

export function PinnProvider({
  app,
  data,
  org,
  me,
  demo,
  refreshOrg,
  children,
}: {
  app: AppConfig;
  data: PinnData;
  org: PinnOrg;
  me: PinnMember;
  demo: boolean;
  refreshOrg: () => void;
  children: ReactNode;
}) {
  const members = useAsync(() => data.members(), [data, me.user_id]);
  const [version, setVersion] = useState(0);
  const [changedAt, setChangedAt] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    setChangedAt(Date.now());
  }, []);

  // Realtime auf job (Filter org_id): jede Änderung zählt die Version hoch — gebündelt, damit 10 Meldungen = 1 Neuladen
  useEffect(() => {
    let t: number | null = null;
    const off = data.subscribe(
      () => {
        if (t !== null) window.clearTimeout(t);
        t = window.setTimeout(() => {
          t = null;
          bump();
        }, 350);
      },
      (on) => setLive(on),
    );
    return () => {
      if (t !== null) window.clearTimeout(t);
      off();
    };
  }, [data, bump]);

  const role = me.role;
  const value = useMemo<PinnCtx | null>(
    () =>
      members.data
        ? {
            app,
            data,
            org,
            me,
            role,
            canManage: role === 'owner' || role === 'dispatcher',
            isOwner: role === 'owner',
            canTeamCode: role === 'owner' || (!!me.is_admin && me.active),
            demo,
            base: `/app/${app.id}`,
            members: members.data,
            reloadMembers: members.refresh,
            refreshOrg,
            version,
            bump,
            live,
            changedAt,
          }
        : null,
    [app, data, org, me, role, demo, members.data, members.refresh, refreshOrg, version, bump, live, changedAt],
  );

  if (members.error && !members.data) {
    return (
      <div className="page">
        <div className="error-box">{members.error}</div>
        <button className="btn ghost" onClick={members.reload}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hell / Dunkel / wie das System — gemerkt je Browser. */
export type ThemeChoice = 'dark' | 'light' | 'system';
const THEME_KEY = 'pinn-theme';

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  const [systemLight, setSystemLight] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setSystemLight(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const set = useCallback((c: ThemeChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(THEME_KEY, c);
    } catch {
      /* privates Fenster — dann eben nicht gemerkt */
    }
  }, []);
  const effective: 'dark' | 'light' = choice === 'system' ? (systemLight ? 'light' : 'dark') : choice;
  return { choice, effective, set };
}

const ThemeCtx = createContext<{ choice: ThemeChoice; set: (c: ThemeChoice) => void } | null>(null);
export const ThemeProvider = ThemeCtx.Provider;
export function useTheme() {
  return useContext(ThemeCtx);
}
