// PinnDex — Datentypen genau nach KONZEPT.md Abschnitt 6 (Tabellen org, member, customer, job, job_event).
// Zustandswechsel und Zeit-Korrektur laufen NUR über RPCs (job_set_status, job_fix_time) — nie direkt auf status/work_seconds.

export type PinnRole = 'owner' | 'dispatcher' | 'worker';
export type JobStatus = 'new' | 'seen' | 'running' | 'paused' | 'done' | 'canceled';
export type JobOutcome = 'ok' | 'not_met' | 'follow_up' | 'problem';
export type EventKind =
  | 'created'
  | 'assigned'
  | 'seen'
  | 'start'
  | 'pause'
  | 'resume'
  | 'done'
  | 'canceled'
  | 'edited'
  | 'time_fix';

export interface PinnOrg {
  id: string;
  name: string;
  owner_id: string;
  team_code: string | null;
  team_code_expires: string | null;
  seat_limit: number;
  seat_override: number | null;
  allow_open_pool: boolean;
  /** Ergänzung 11.11.: Standort beim Starten/Beenden mitschicken (nur Chef schaltet) */
  share_location?: boolean;
  created_at: string;
}

export interface PinnMember {
  org_id: string;
  user_id: string;
  role: PinnRole;
  display_name: string | null;
  color: string | null;
  active: boolean;
  /** Zusatz laut SCHEMA-ABWEICHUNGEN.md: Chef/Büro-Mitteilung bei „fertig“ abschaltbar */
  notify_done?: boolean;
  /** Nachtrag 13.11. (Laufzettel NACHTRAG-VERWALTER): Verwalter — sieht/teilt/erneuert den Team-Code. Fehlt ohne Nachtrag. */
  is_admin?: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  org_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  /** Ergänzung 11.11.: Koordinaten der Adresse (einmalig gesucht, beim Kunden gemerkt) */
  lat?: number | null;
  lng?: number | null;
  note: string | null;
  deleted_at: string | null;
  updated_at: string;
}

export interface Job {
  id: string;
  org_id: string;
  title: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  note: string | null;
  scheduled_at: string | null;
  duration_min: number | null;
  urgent: boolean;
  assignee_id: string | null;
  helper_ids: string[] | null;
  status: JobStatus;
  seen_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  work_seconds: number;
  /** Zusatz laut SCHEMA-ABWEICHUNGEN.md: Beginn der laufenden Strecke (nur bei status running), sonst null */
  running_since: string | null;
  /** Ergänzung 11.11.: Koordinaten der Adresse (Pin auf der Live-Karte) */
  lat?: number | null;
  lng?: number | null;
  done_note: string | null;
  outcome: JobOutcome | null;
  photos: string[] | null;
  result_photos: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JobEvent {
  id: string;
  org_id: string;
  job_id: string;
  actor_id: string | null;
  kind: EventKind;
  at: string;
  data: Record<string, unknown> | null;
  /** Zusatz laut SCHEMA-ABWEICHUNGEN.md: feste Reihenfolge bei gleichem Zeitpunkt (order by at, seq) */
  seq?: number;
}

/** Was Chef/Büro beim Anlegen/Bearbeiten setzen darf (Stammdaten — nie status/work_seconds). */
export interface JobInput {
  title: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  note: string | null;
  scheduled_at: string | null;
  duration_min: number | null;
  urgent: boolean;
  assignee_id: string | null;
  helper_ids: string[];
  lat: number | null;
  lng: number | null;
}

export interface CustomerInput {
  name: string;
  phone: string | null;
  address: string | null;
  lat?: number | null;
  lng?: number | null;
  note: string | null;
}

export interface TeamCodeInfo {
  code: string;
  expires_at: string | null;
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  new: 'Neu',
  seen: 'Gesehen',
  running: 'Läuft',
  paused: 'Pause',
  done: 'Erledigt',
  canceled: 'Abgesagt',
};

export const OUTCOME_LABEL: Record<JobOutcome, string> = {
  ok: 'Erledigt',
  not_met: 'Kunde nicht angetroffen',
  follow_up: 'Folgetermin nötig',
  problem: 'Problem gemeldet',
};

export const EVENT_LABEL: Record<EventKind, string> = {
  created: 'angelegt',
  assigned: 'zugewiesen',
  seen: 'gesehen',
  start: 'gestartet',
  pause: 'Pause',
  resume: 'weiter',
  done: 'fertig',
  canceled: 'abgesagt',
  edited: 'bearbeitet',
  time_fix: 'Zeit korrigiert',
};

export const ROLE_LABEL: Record<PinnRole, string> = {
  owner: 'Chef',
  dispatcher: 'Büro',
  worker: 'Monteur',
};

export const OPEN_STATUSES: JobStatus[] = ['new', 'seen', 'running', 'paused'];
