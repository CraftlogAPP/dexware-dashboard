// Klick-Test Karte „Streumittel“ (Team-Seite, WinterDex, 26.11.2026) — läuft IN der Seite des Dev-Servers über
// tests/browser/edge-lauf.mjs. Nur Attrappen: Betrieb, Rolle und set_streumittel_aus kommen nicht vom Server.
//   sm=normal       Betrieb hat Sole ausgeblendet → Splitt aus (Aufruf + Meldung), letztes aktives bleibt an, wieder an
//   sm=ohne-spalte  Server-Update fehlt (keine Spalte org.streumittel_aus) → alle an, gesperrt, Hinweis
//   sm=rpc-fehlt    Spalte da, RPC fehlt (PGRST202) → Hinweis statt Fehler
//
//   npx vite --port 5263 --strictPort
//   node tests/browser/edge-lauf.mjs "http://localhost:5263/vorschau?app=winterdex&seite=mitteilungen&teil=glocke&sm=normal" tests/browser/streumittel-karte.js [bild.png 360 760]
const quelle = async (p) => (await fetch(p)).text();
const reactUrl = (await quelle('/src/winterdex/StreumittelKarte.tsx')).match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
const domUrl = (await quelle('/src/main.tsx')).match(/"(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
const React = (await import(reactUrl)).default;
const { createRoot } = (await import(domUrl)).default;
const { StreumittelKarte } = await import('/src/winterdex/StreumittelKarte.tsx');
const { AppAuthProvider } = await import('/src/auth/AppAuthContext.tsx');
const { OrgProvider } = await import('/src/components/OrgContext.tsx');
const { APPS } = await import('/src/apps/registry.ts');
const app = APPS.find((a) => a.id === 'winterdex');
const h = React.createElement;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const erg = [];
const pruefe = (name, cond, extra = '') => erg.push(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`);

for (let i = 0; i < 100 && !document.querySelector('.page'); i++) await warte(100);
const seite = document.querySelector('.page');
seite.style.display = 'none';
const ort = document.createElement('div');
ort.className = 'page';
seite.parentElement.appendChild(ort);

const modus = new URLSearchParams(location.search).get('sm') ?? 'normal';
const aufrufe = [];
const client = {
  rpc: async (name, args) => {
    aufrufe.push({ name, args });
    await warte(150);
    if (modus === 'rpc-fehlt') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.set_streumittel_aus' } };
    return { data: { ok: true, aus: args.p_aus }, error: null };
  },
};
const org = { id: 'o1', name: 'Beispiel-Betrieb', land: 'AT', address: null, created_at: '2025-10-01T00:00:00Z' };
if (modus !== 'ohne-spalte') org.streumittel_aus = ['Sole'];
const holen = async () => ({ org, role: 'owner' });
createRoot(ort).render(h(AppAuthProvider, { app }, h(OrgProvider, { fetch: holen }, h(StreumittelKarte, { client, orgId: 'o1', darf: true }))));
await warte(800);

const chips = () => [...ort.querySelectorAll('.sm-chip')].map((e) => ({ t: e.textContent.trim(), an: e.classList.contains('on'), gedrueckt: e.getAttribute('aria-pressed'), aus: e.disabled === true, h: Math.round(e.getBoundingClientRect().height) }));
const klick = async (t) => {
  [...ort.querySelectorAll('button.sm-chip')].find((b) => b.textContent.trim() === t).click();
  await warte(500);
};

if (modus === 'ohne-spalte') {
  const c = chips();
  pruefe('ohne Spalte: alle an, gesperrt, Hinweis „nächstes Server-Update“', c.length === 5 && c.every((x) => x.an) && c.slice(0, 4).every((x) => x.aus) && /kommt mit dem nächsten Server-Update/.test(ort.textContent), c);
} else {
  let c = chips();
  pruefe('Stand vom Betrieb: Sole aus (durchgestrichen), Rest an, Sonstiges fest, Tippflächen ≥ 44 px',
    c.map((x) => `${x.t}:${x.an ? 'an' : 'aus'}`).join(',') === 'Splitt:an,Salz:an,Sole:aus,Granulat:an,Sonstiges:an' && c.every((x) => x.h >= 44) && c[2].gedrueckt === 'false', c);
  await klick('Splitt');
  if (modus === 'rpc-fehlt') {
    pruefe('RPC fehlt: Hinweis statt Fehler, Chips gesperrt', /kommt mit dem nächsten Server-Update/.test(ort.textContent) && !ort.querySelector('.error-box') && chips().slice(0, 4).every((x) => x.aus), ort.textContent);
  } else {
    pruefe('Splitt aus: RPC set_streumittel_aus {p_org, p_aus}', aufrufe.length === 1 && aufrufe[0].name === 'set_streumittel_aus' && JSON.stringify(aufrufe[0].args) === JSON.stringify({ p_org: 'o1', p_aus: ['Splitt', 'Sole'] }), aufrufe);
    pruefe('… Meldung nennt die aktiven', ort.textContent.includes('Gespeichert – beim Erfassen stehen jetzt: Salz, Granulat und Sonstiges.'), ort.textContent);
    await klick('Salz');
    await klick('Granulat');
    pruefe('letztes aktives: kein Aufruf, Meldung „Mindestens ein Streumittel außer „Sonstiges“ …“', aufrufe.length === 2 && ort.querySelector('.error-box')?.textContent === 'Mindestens ein Streumittel außer „Sonstiges“ muss an bleiben.', { n: aufrufe.length, t: ort.querySelector('.error-box')?.textContent });
    await klick('Splitt');
    c = chips();
    pruefe('wieder an: Splitt + Granulat an, Salz + Sole aus', c.map((x) => `${x.t}:${x.an ? 'an' : 'aus'}`).join(',') === 'Splitt:an,Salz:aus,Sole:aus,Granulat:an,Sonstiges:an', c);
  }
}
pruefe('kein Querscrollen', document.documentElement.scrollWidth <= window.innerWidth, document.documentElement.scrollWidth);
const fehler = erg.filter((x) => x.startsWith('FEHLER')).length;
window.__fertig = erg.join('\n') + `\n${erg.length - fehler} bestanden, ${fehler} fehlgeschlagen`;
