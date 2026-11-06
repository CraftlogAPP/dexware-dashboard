// Vollständige Listen aus Supabase: PostgREST liefert je Abfrage höchstens max_rows Zeilen (Supabase-Standard 1.000) —
// auch bei Tabellen-Funktionen (rpc). Ein .limit(10000) täuscht dann Vollständigkeit nur vor. Deshalb seitenweise laden.
// Die Abfrage MUSS stabil sortiert sein (zuletzt nach einer eindeutigen Spalte, meist id), sonst können Zeilen zwischen
// zwei Seiten verrutschen (doppelt oder gar nicht).

/** Seitengröße = max_rows des Projekts (Supabase-Standard). Liefert der Server weniger, wird ab dort weitergelesen. */
export const PAGE_SIZE = 1000;
/** Notbremse: höchstens so viele Seiten (200.000 Zeilen) — schützt vor Endlosschleifen. */
const MAX_PAGES = 200;

type PageResult<E> = { data: unknown[] | null; error: E | null };

/**
 * Lädt alle Seiten einer Abfrage. `page(from, to)` baut die Abfrage mit `.range(from, to)`.
 * Fehler werden zurückgegeben (nicht geworfen), damit Aufrufer wie bisher Ersatzwege (fehlende RPC, alte Spalten) wählen können.
 */
export async function fetchAllRows<T, E = { message: string; code?: string }>(
  page: (from: number, to: number) => PromiseLike<PageResult<E>>,
): Promise<{ data: T[]; error: E | null }> {
  const out: T[] = [];
  let from = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: out, error };
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    out.push(...rows);
    // Weiter ab der tatsächlich gelieferten Menge: ist max_rows im Projekt kleiner als PAGE_SIZE eingestellt,
    // geht trotzdem nichts verloren (erst eine leere Seite beendet die Schleife).
    from += rows.length;
  }
  return { data: out, error: null };
}
