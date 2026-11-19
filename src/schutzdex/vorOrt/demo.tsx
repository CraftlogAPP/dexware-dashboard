// „Vor Ort“ (SchutzDex) mit Beispieldaten — NUR im Dev-Server (/app/schutzdex/vor-ort?demo), fehlt im
// Produktions-Build (siehe SchutzdexArea). Damit lässt sich der ganze Ablauf ohne Konto prüfen:
//   ?demo              normaler Ablauf (Speichern klappt)
//   ?demo&netz=aus     Server nicht erreichbar → Nachweis bleibt auf dem Gerät („wartet“)
//   ?demo&netz=nein    Server lehnt ab → „vom Server nicht angenommen“
//   ?demo&pro=0        Gratis-Betrieb: ein dritter aktiver Mitarbeiter lässt sich nicht anlegen
// Der Schalter lässt sich im Banner oben umstellen (Nachsenden testen). Unten steht mit, was „gesendet“ wurde.
import { useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../../apps/registry';
import { VOR_ORT_PATH } from '../../pruefen/Scope';
import type { Member } from '../types';
import type { SdBackend, SdBriefing, SdCompletion } from './backend';
import { SdCtx, type SdCtxValue } from './context';
import { FREE_LIMITS } from './rows';
import { SdVorOrt, type SdVorOrtPages } from './SdVorOrt';

type Netz = 'an' | 'aus' | 'nein';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const NOW = new Date().toISOString();

function createBackend(netz: () => Netz, log: (line: string) => void): SdBackend {
  const m = (n: number, name: string, taetigkeit: string | null, aktiv = true): Member => ({
    id: uuid(100 + n), org_id: ORG, name, taetigkeit, email: null, telefon: null, eintritt_am: null, aktiv, created_at: NOW,
  });
  const members: Member[] = [m(1, 'Max Huber', 'Monteur'), m(2, 'Anna Steiner', 'Lager'), m(3, 'Jonas Gruber', 'Lehrling'), m(4, 'Peter Alt', 'Monteur', false)];
  const b = (n: number, titel: string, taetigkeit: string | null, content: unknown, questions: unknown): SdBriefing => ({
    id: uuid(200 + n), org_id: ORG, titel, thema: null, land: 'AT', branche: 'Bau', taetigkeit, generiert_von: 'ki', version: 1, created_at: NOW, content, questions,
  });
  const briefings: SdBriefing[] = [
    b(
      1,
      'Leitern und Tritte sicher benutzen',
      'Monteur',
      [
        { titel: 'Vor dem Benutzen', text: 'Jede Leiter vor dem Aufstellen auf sichtbare Schäden prüfen.', kernpunkte: ['Holme und Sprossen ohne Risse', 'Spreizsicherung vollständig', 'Füße rutschfest'] },
        { titel: 'Richtig aufstellen', text: 'Anlegeleitern im Winkel von etwa 70° aufstellen und gegen Wegrutschen sichern.', kernpunkte: ['Mindestens 1 m Überstand', 'Nie auf den obersten drei Sprossen stehen'] },
        { titel: 'Beim Arbeiten', text: 'Immer mit dem Gesicht zur Leiter auf- und absteigen. Schweres Werkzeug gehört nicht auf die Leiter.' },
      ],
      [
        { frage: 'In welchem Winkel wird eine Anlegeleiter aufgestellt?', optionen: ['etwa 45°', 'etwa 70°', 'senkrecht'], loesung_index: 1 },
        { frage: 'Was tust du mit einer beschädigten Leiter?', optionen: ['Vorsichtig weiterbenutzen', 'Sofort aussondern und melden'], loesung_index: 1 },
        { frage: 'Wie viel Überstand braucht eine Anlegeleiter am Austritt?', optionen: ['keinen', 'mindestens 1 m', '10 cm'], loesung_index: 1 },
        // kaputte Frage (ohne gültige Lösung) — muss wie in der App entfallen
        { frage: 'Diese Frage hat keine Lösung', optionen: ['a', 'b'], loesung_index: 7 },
      ],
    ),
    b(2, 'Erste Hilfe und Notruf', null, [{ titel: 'Notruf', text: 'Rettung 144, Feuerwehr 122, Euro-Notruf 112.', kernpunkte: ['Wo ist es passiert?', 'Was ist passiert?', 'Wie viele Verletzte?'] }], []),
  ];
  const c = (n: number, member: number, briefing: number, daysBack: number, passed = true): SdCompletion => ({
    id: uuid(300 + n), member_id: uuid(100 + member), briefing_id: uuid(200 + briefing), check_passed: passed, abgeschlossen_am: daysAgo(daysBack),
  });
  const completions: SdCompletion[] = [c(1, 1, 1, 400), c(2, 2, 1, 350), c(3, 1, 2, 20), c(4, 3, 1, 5, false)];
  const ids = new Set<string>();
  const gate = async () => {
    await sleep(350);
    if (netz() === 'aus') throw new TypeError('Failed to fetch');
  };
  return {
    async load() {
      await gate();
      return { members: members.map((x) => ({ ...x })), briefings: briefings.map((x) => ({ ...x })), completions: completions.map((x) => ({ ...x })) };
    },
    async insertCompletion(row) {
      await gate();
      if (netz() === 'nein') throw Object.assign(new Error('new row violates row-level security policy for table "completion"'), { code: '42501' });
      if (ids.has(row.id)) {
        log(`Nachweis ${row.id} gibt es schon (Wiederholung) — nichts doppelt`);
        return { fieldsDropped: false };
      }
      ids.add(row.id);
      completions.unshift({ id: row.id, member_id: row.member_id, briefing_id: row.briefing_id, check_passed: row.check_passed, abgeschlossen_am: row.abgeschlossen_am });
      log(`completion ${JSON.stringify({ ...row, signature_path: `${row.signature_path.slice(0, 22)}… (${row.signature_path.length} Zeichen)` })}`);
      return { fieldsDropped: false };
    },
    async addMember(_orgId, input) {
      await gate();
      members.push(m(members.length + 1, input.name, input.taetigkeit));
      log(`member ${JSON.stringify(input)}`);
    },
    async memberGate() {
      const pro = sessionStorage.getItem('sd-demo-pro') !== '0';
      const count = members.filter((x) => x.aktiv).length;
      return { allowed: pro || count < FREE_LIMITS.members, count, limit: FREE_LIMITS.members };
    },
  };
}

function Stub({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card empty">In den Beispieldaten nicht enthalten — angemeldet erscheint hier die Seite aus dem Dashboard.</div>
    </>
  );
}

const PAGES: SdVorOrtPages = {
  members: <Stub title="Mitarbeiter verwalten" />,
  briefings: <Stub title="Unterweisungen verwalten" />,
  completions: <Stub title="Nachweise" />,
  abo: <Stub title="Abo" />,
};

export function SdVorOrtDemoArea({ app }: { app: AppConfig }) {
  const [netz, setNetz] = useState<Netz>(() => {
    const p = new URLSearchParams(window.location.search);
    // „pro=0“ über die ganze Sitzung merken (die Adresse verliert den Zusatz beim ersten Klick)
    if (p.has('pro')) sessionStorage.setItem('sd-demo-pro', p.get('pro') ?? '');
    const v = p.get('netz');
    return v === 'aus' || v === 'nein' ? v : 'an';
  });
  const [log, setLog] = useState<string[]>([]);
  const netzRef = useMemo(() => ({ current: netz }), []); // eslint-disable-line react-hooks/exhaustive-deps
  netzRef.current = netz;
  const be = useMemo(() => createBackend(() => netzRef.current, (l) => setLog((prev) => [...prev, l])), [netzRef]);
  const base = `/app/${app.id}`;
  const value = useMemo<SdCtxValue>(
    () => ({
      be,
      userId: USER,
      orgId: ORG,
      orgName: 'Beispielbetrieb',
      email: 'beispiel@example.com',
      base: `${base}/${VOR_ORT_PATH}`,
      dashboardUrl: base,
      signOut: () => undefined,
    }),
    [be, base],
  );
  const style = { '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <header className="site-header">
        <span className="app-chip">{app.name} · Beispieldaten</span>
        <div className="spacer" />
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <select
            aria-label="Server (Beispieldaten)"
            value={netz}
            onChange={(e) => setNetz(e.target.value as Netz)}
            style={{ width: 'auto', maxWidth: 130, margin: 0, padding: '4px 8px' }}
            data-testid="demo-netz"
          >
            <option value="an">erreichbar</option>
            <option value="aus">kein Netz</option>
            <option value="nein">lehnt ab</option>
          </select>
        </label>
      </header>
      <SdCtx.Provider value={value}>
        <Routes>
          <Route path={`${VOR_ORT_PATH}/*`} element={<SdVorOrt pages={PAGES} />} />
          <Route
            path="*"
            element={
              <div className="page">
                <Link className="btn" to={`${base}/${VOR_ORT_PATH}`}>
                  Zu „Vor Ort“ (Beispieldaten)
                </Link>
              </div>
            }
          />
        </Routes>
      </SdCtx.Provider>
      <pre data-testid="demo-log" style={{ margin: '16px 16px 120px', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--muted)' }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}
