// App-neutraler Druck-Helfer: Bericht-HTML in neuem Fenster öffnen und den
// Browser-Druckdialog starten (dort „Als PDF speichern").

/** Öffnet den Bericht in einem neuen Fenster und startet den Druckdialog. */
export function openReportWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
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
  return true;
}
