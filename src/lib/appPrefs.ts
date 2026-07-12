// Personalisierte Startseite: welche App-Kacheln ausgeblendet sind.
// Bewusst localStorage statt Backend — die Apps haben getrennte Supabase-
// Projekte, einen suite-weiten User gibt es nicht; pro Browser reicht.
// Die Fällig-Glocke (DueBell) zählt weiterhin ALLE Apps (Fristen-Relevanz).
import { useCallback, useState } from 'react';

const KEY = 'dexware.hiddenApps';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function save(hidden: Set<string>) {
  try {
    if (hidden.size === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify([...hidden]));
  } catch {
    // Speicherung ist Komfort — Anzeige funktioniert auch ohne (z. B. Private Mode)
  }
}

export function useHiddenApps() {
  const [hidden, setHidden] = useState<Set<string>>(load);

  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setHidden(() => {
      const next = new Set<string>();
      save(next);
      return next;
    });
  }, []);

  return { hidden, toggle, reset };
}
