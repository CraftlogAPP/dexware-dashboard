import type { SupabaseClient } from '@supabase/supabase-js';
import { FormDialog, num, orNull, s, type FormValues } from '../components/form';
import { parseLocalDate, toInputDate } from '../lib/format';
import { insertProject, updateProjectHead, type ProjectHeadInput } from './api';
import { CATEGORY_LABELS, STATUS_LABELS, type ProjectStatus } from './types';

/**
 * Auftrag-Kopf-Dialog (Anlegen + Bearbeiten) — aus Projects.tsx extrahiert,
 * damit auch die Detailseite denselben Dialog nutzt. Die Kopf-Felder sind
 * identisch; Schritte/Material/Kosten/Fotos pflegt die Detailseite separat.
 */

/** Normalisierte Kopf-Werte — sowohl aus der Listen-Zeile als auch aus dem vollen Blob befüllbar. */
export interface ProjectHead {
  id: string;
  title: string;
  category: string | null;
  status: ProjectStatus | null;
  customerName: string | null;
  estimatedHours: number | null;
  budget: number | null;
  deadlineMs: number | null;
  /** Nur aus dem vollen Blob (Detailseite) verfügbar; aus der Liste null. */
  description: string | null;
}

const FIELDS = [
  { key: 'title', label: 'Auftrag', required: true },
  {
    key: 'category',
    label: 'Kategorie',
    kind: 'select' as const,
    required: true,
    options: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ value: id, label })),
  },
  {
    key: 'status',
    label: 'Status',
    kind: 'select' as const,
    required: true,
    options: (Object.keys(STATUS_LABELS) as ProjectStatus[]).map((st) => ({
      value: st,
      label: STATUS_LABELS[st],
    })),
  },
  { key: 'customerName', label: 'Kunde' },
  { key: 'estimatedHours', label: 'Geschätzte Stunden', kind: 'number' as const },
  { key: 'budget', label: 'Budget (€)', kind: 'number' as const },
  { key: 'deadline', label: 'Termin', kind: 'date' as const },
  { key: 'description', label: 'Beschreibung', kind: 'textarea' as const },
];

export function ProjectDialog({
  client,
  userId,
  editing,
  onClose,
  onSaved,
}: {
  client: SupabaseClient;
  /** Für "Anlegen" nötig; bei "Bearbeiten" ungenutzt. */
  userId: string | undefined;
  editing: ProjectHead | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  async function onSave(v: FormValues) {
    const deadline = orNull(v.deadline);
    const input: ProjectHeadInput = {
      title: s(v.title),
      category: s(v.category),
      status: s(v.status) as ProjectStatus,
      description: orNull(v.description) ?? undefined,
      estimatedHours: num(v.estimatedHours),
      budget: num(v.budget),
      customerName: orNull(v.customerName) ?? undefined,
      deadlineMs: deadline ? parseLocalDate(deadline).getTime() : null,
    };
    if (editing === 'new') {
      if (!userId) throw new Error('Nicht angemeldet');
      await insertProject(client, userId, input);
    } else {
      await updateProjectHead(client, editing.id, input);
    }
    onSaved();
  }

  return (
    <FormDialog
      title={
        editing === 'new'
          ? 'Auftrag anlegen'
          : `${editing.title || 'Auftrag'} bearbeiten`
      }
      onClose={onClose}
      onSave={onSave}
      fields={FIELDS}
      initial={
        editing === 'new'
          ? { category: 'handwerk', status: 'quote' }
          : {
              title: editing.title,
              category: editing.category ?? 'handwerk',
              status: editing.status ?? 'quote',
              customerName: editing.customerName ?? '',
              estimatedHours:
                editing.estimatedHours != null ? String(editing.estimatedHours) : '',
              budget: editing.budget != null ? String(editing.budget) : '',
              deadline:
                editing.deadlineMs != null
                  ? toInputDate(new Date(editing.deadlineMs))
                  : '',
              description: editing.description ?? '',
            }
      }
    />
  );
}
