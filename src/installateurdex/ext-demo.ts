// Beispieldaten der Zusatz-Bereiche — NUR über DemoArea (Dev-Server) geladen, nie im Produktions-Build.
import type { ExtData } from './ext';
import { demoPlanung } from './planung/demo';
import { demoAuswertung } from './auswertung/demo';
import { demoGeld } from './geld/demo';
// @ext-demo-import

export function demoExt(): ExtData {
  return {
    planung: demoPlanung(),
    auswertung: demoAuswertung(),
    geld: demoGeld(),
    // @ext-demo
  };
}
