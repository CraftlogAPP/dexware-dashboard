// App-neutraler Druck-Helfer: Bericht-HTML in neuem Fenster öffnen und den
// Browser-Druckdialog starten (dort „Als PDF speichern").

function writeAndPrint(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Nicht nur aufs load-Event verlassen — je nach Browser hat es nach
  // document.close() bereits gefeuert und der Listener käme zu spät.
  const printOnce = (() => {
    let done = false;
    return () => {
      if (done || win.closed) return;
      done = true;
      // kurze Pause, damit eingebettete Base64-Fotos gerendert sind
      setTimeout(() => win.print(), 300);
    };
  })();
  if (win.document.readyState === 'complete') {
    printOnce();
  } else {
    win.addEventListener('load', printOnce);
    setTimeout(printOnce, 1500); // Fallback, falls load nie feuert
  }
}

/** Öffnet den Bericht in einem neuen Fenster und startet den Druckdialog. Nur verwenden, wenn das HTML schon fertig ist. */
export function openReportWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  writeAndPrint(win, html);
  return true;
}

/**
 * Für Berichte, deren Daten erst geladen werden: Das Fenster geht SOFORT beim Klick auf („Bericht wird erstellt …“),
 * der Bericht kommt nach. Öffnete man es erst nach dem Laden, blockten Browser es als Pop-up — Safari am iPhone schon
 * nach kurzer Zeit, Chrome nach wenigen Sekunden (viele Fotos, langsames Netz).
 * MUSS direkt im Klick aufgerufen werden (vor dem ersten await). false = vom Browser blockiert.
 * Scheitert `build`, schließt sich das Fenster wieder und der Fehler geht an den Aufrufer.
 */
export async function openReportWindowAfter(build: () => Promise<string>): Promise<boolean> {
  const win = window.open('', '_blank');
  if (!win) return false;
  try {
    win.document.write(
      '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bericht wird erstellt …</title></head>' +
        '<body style="font:16px -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:32px;color:#16202b">Bericht wird erstellt …</body></html>',
    );
    win.document.close();
  } catch {
    /* nur Anzeige */
  }
  let html: string;
  try {
    html = await build();
  } catch (e) {
    try {
      win.close();
    } catch {
      /* schon zu */
    }
    throw e;
  }
  if (!win.closed) writeAndPrint(win, html);
  return true;
}
