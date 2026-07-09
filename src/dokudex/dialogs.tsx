import type { SupabaseClient } from '@supabase/supabase-js';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { updateDocumentHead } from './api';
import { TYPE_LABELS, type DocType, type Project } from './types';

/**
 * Dokument-Kopf-Dialog (Bearbeiten) — aus Documents.tsx extrahiert, damit auch
 * die Detailseite denselben Dialog nutzt. Pflegt Titel, Typ, Projekt und
 * Notizen; Scan-Bild und KI-Analyse bleiben unberührt (Read-Modify-Write).
 */

/** Normalisierte Kopf-Werte — aus Listen-Zeile oder vollem Blob befüllbar. */
export interface DocumentHead {
  id: string;
  title: string;
  type: DocType | null;
  projectId: string | null;
  notes: string | null;
}

export function DocumentDialog({
  client,
  editing,
  projects,
  onClose,
  onSaved,
}: {
  client: SupabaseClient;
  editing: DocumentHead;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}) {
  async function onSave(v: FormValues) {
    await updateDocumentHead(client, editing.id, {
      title: s(v.title),
      type: s(v.type) as DocType,
      projectId: orNull(v.projectId),
      notes: orNull(v.notes),
    });
    onSaved();
  }

  return (
    <FormDialog
      title={`${editing.title || 'Dokument'} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'title', label: 'Titel', required: true },
        {
          key: 'type',
          label: 'Typ',
          kind: 'select',
          required: true,
          options: (Object.keys(TYPE_LABELS) as DocType[]).map((t) => ({
            value: t,
            label: TYPE_LABELS[t],
          })),
        },
        {
          key: 'projectId',
          label: 'Projekt',
          kind: 'select',
          hint: 'Leer lassen = ohne Projekt',
          options: projects.map((p) => ({ value: p.id, label: p.name })),
        },
        { key: 'notes', label: 'Notizen', kind: 'textarea' },
      ]}
      initial={{
        title: editing.title,
        type: editing.type ?? 'other',
        projectId: editing.projectId ?? '',
        notes: editing.notes ?? '',
      }}
    />
  );
}
