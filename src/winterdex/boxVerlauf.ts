// Browser-Zurück schließt die offene Mitteilungs-Box zuerst (Prüfpunkt Runde 2, 26.11.2026) — vor allem am Handy (Zurück-
// Geste, Außendienst als Web-App): Die Box legt beim Öffnen einen eigenen Verlaufseintrag mit DERSELBEN Adresse an. Zurück
// nimmt nur diesen Eintrag weg → Box zu, Seite bleibt, wo sie ist.
//   · Gleiche Adresse und derselbe Router-Zustand (key/idx bleiben, nur die Marke `mtBox` kommt dazu): React Router sieht
//     beim Zurück keinen Seitenwechsel, nichts wird neu aufgebaut, Eingaben in einem Formular dahinter bleiben stehen.
//   · Box per „OK“ / Escape / Klick daneben zu → den eigenen Eintrag wieder wegnehmen (history.back), damit Zurück danach
//     wie gewohnt die Seite verlässt. Erst nach dem Abbau und nur, wenn er noch obenauf liegt.
//   · „Zur Karte“ ersetzt den Eintrag (Link mit replace, verlassen()) — Zurück führt danach auf die Seite von vorher.
//   · React StrictMode (Dev-Server) baut die Box doppelt auf: Liegt beim Öffnen schon ein Box-Eintrag obenauf (eben
//     abgebaut bzw. nach einem Neuladen übrig), wird er übernommen statt ein zweiter gestapelt.
//   · Der Router-Schutz useUnsavedGuard (components/ui.tsx) bleibt unberührt: Er fängt Link-Klicks ab, nicht die Zurück-
//     Taste — „Zur Karte“ fragt weiter nach („Aufzeichnung läuft“), bei „Abbrechen“ bleibt die Box samt Eintrag offen.
// Rein bis auf das übergebene Fenster — getestet mit einer Verlaufs-Attrappe in tests/mitteilungen.test.mjs.

export const BOX_MARKE = 'mtBox';

export interface VerlaufsFenster {
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'back'>;
  location: { href: string };
  addEventListener: (typ: 'popstate', f: () => void) => void;
  removeEventListener: (typ: 'popstate', f: () => void) => void;
  setTimeout: (f: () => void, ms: number) => unknown;
}

export interface BoxVerlauf {
  /** „Zur Karte“: der Link ersetzt den Eintrag (replace) — danach nichts mehr zurücknehmen */
  verlassen: () => void;
  /** Box wird abgebaut (OK, Escape, daneben, Betriebswechsel): eigenen Eintrag wegnehmen, falls noch obenauf */
  abbauen: () => void;
}

let zaehler = 0;

const marke = (s: unknown): unknown => (s && typeof s === 'object' ? (s as Record<string, unknown>)[BOX_MARKE] : undefined);

/** Eintrag anlegen und auf Zurück horchen; `beiZurueck` schließt die Box. */
export function boxVerlauf(w: VerlaufsFenster, beiZurueck: () => void): BoxVerlauf {
  zaehler += 1;
  const id = `${Date.now().toString(36)}-${zaehler}`;
  const vorher = w.history.state;
  const basis = vorher && typeof vorher === 'object' ? (vorher as Record<string, unknown>) : {};
  const neu = { ...basis, [BOX_MARKE]: id };
  if (marke(vorher) !== undefined) w.history.replaceState(neu, '', w.location.href);
  else w.history.pushState(neu, '', w.location.href);

  let aktiv = true;
  const aus = () => {
    aktiv = false;
    w.removeEventListener('popstate', zurueck);
  };
  function zurueck() {
    if (!aktiv || marke(w.history.state) === id) return;
    aus();
    beiZurueck();
  }
  w.addEventListener('popstate', zurueck);

  return {
    verlassen() {
      if (aktiv) aus();
    },
    abbauen() {
      if (!aktiv) return; // per Zurück geschlossen bzw. per „Zur Karte“ verlassen
      aus();
      w.setTimeout(() => {
        if (marke(w.history.state) === id) w.history.back();
      }, 0);
    },
  };
}
