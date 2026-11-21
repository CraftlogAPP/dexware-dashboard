// Browser-Test des WinterDex-Gerätespeichers (IndexedDB) im echten Browser (Edge headless) — NIE gegen echte Daten:
// ein eigener Browser-Ordner, die Speicher-Datenbank wird am Anfang gelöscht, der Server ist ein Nachbau.
// Läuft im Dev-Server (der übersetzt die .ts-Dateien):
//   npx vite --port 5197          (frisch starten: nach Code-Änderungen lädt der laufende Dev-Server Module sonst doppelt)
//   node tests/browser/edge-lauf.mjs http://localhost:5197/ tests/browser/winterdex-speicher.js
// Prüft: Altbestand mit eingebetteten Fotos, Fotos im eigenen Eintrag, Listen ohne Fotos, Wartezeit für abgelehnte
// Einträge, kein zweites Hochladen, „Jetzt senden“, Funkloch, fehlende Fotos, Fahrten, Entwürfe, Abmelde-Zählung.
const out = [];
let fail = 0;
const ok = (cond, name) => { out.push(`${cond ? 'ok  ' : 'FAIL'}  ${name}`); if (!cond) fail++; };
try {
  const store = await import('/src/winterdex/einsatz/store.ts');
  const send = await import('/src/winterdex/einsatz/send.ts');
  const runs = await import('/src/winterdex/aussendienst/runStore.ts');
  const guard = await import('/src/lib/logoutGuard.ts');
  await import('/src/winterdex/WinterdexArea.tsx'); // meldet die Abmelde-Zählung an

  // sauberer Start
  await new Promise((r) => { const q = indexedDB.deleteDatabase('dexware-winterdex-einsatz'); q.onsuccess = q.onerror = q.onblocked = () => r(); });

  const USER = 'u-1', ORG = 'o-1';
  const PH = 'data:image/jpeg;base64,' + btoa('x'.repeat(3000));
  const calls = { upload: 0, insert: 0, insertRun: 0 };
  let mode = 'ok'; // ok | net | nein
  const be = {
    async uploadPhoto() { calls.upload++; if (mode === 'net') throw new TypeError('Failed to fetch'); },
    async insertOperation(row, urls) { calls.insert++; be.lastUrls = urls; be.lastRow = row; if (mode === 'net') throw new TypeError('Failed to fetch'); if (mode === 'nein') throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' }); },
    async insertRun(row, urls) { calls.insertRun++; be.lastUrls = urls; if (mode === 'net') throw new TypeError('Failed to fetch'); if (mode === 'nein') throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' }); },
    async weather() { return { weather: null, netError: false }; },
  };
  const row = (id) => ({ id, org_id: ORG, property_id: 'p-1', started_at: new Date().toISOString(), ended_at: null, lat: null, lng: null, gps_accuracy_m: null, gps_at: null, gps_mocked: null, end_lat: null, end_lng: null, end_accuracy_m: null, end_gps_at: null, end_mocked: null, action: 'cleared', grit_material: null, grit_amount: null, weather: { t: 1 }, notes: null, performed_by: USER, performer_name: 'A', created_at: new Date().toISOString() });
  const reset = () => { calls.upload = calls.insert = calls.insertRun = 0; };

  // 1) Altbestand mit eingebetteten Fotos (Format bis 20.11.)
  await store.kvPut({ key: 'pending:alt-1', kind: 'pending', userId: USER, propertyName: 'Alt', row: row('alt-1'), photos: [PH, PH] });
  let list = await store.listPending(USER);
  ok(list.length === 1 && list[0].photos?.length === 2, 'Altbestand wird gelesen (mit eingebetteten Fotos)');
  mode = 'ok'; reset();
  ok((await send.flushPending(be, USER)) === 1, 'Altbestand wird nachgesendet');
  ok(calls.upload === 2 && calls.insert === 1, `Altbestand: 2 Fotos hochgeladen, 1 Einsatz (upload ${calls.upload}, insert ${calls.insert})`);
  ok((await store.kvKeys('')).length === 0, 'danach ist der Speicher leer (auch kein Foto-Eintrag)');

  // 2) Neuer Einsatz, Server lehnt ab
  mode = 'nein'; reset();
  let r = await send.submit(be, { key: store.pendingKey('neu-1'), kind: 'pending', userId: USER, propertyName: 'Neu', row: row('neu-1'), photos: [PH, PH] });
  ok(typeof r.result === 'object' && r.onDevice, 'Ablehnung wird gemeldet, Einsatz liegt dauerhaft auf dem Gerät');
  list = await store.listPending(USER);
  ok(list.length === 1 && !list[0].photos && list[0].photoCount === 2, 'Liste kommt OHNE Fotos (nur Anzahl)');
  ok(list[0].tries === 1 && !!list[0].failedAt && !!list[0].lastError, 'Ablehnung mit Zeitpunkt und Zähler vermerkt');
  ok(list[0].photoUrls?.length === 2 && list[0].photoUrls.every((u) => u.startsWith('storage:')), 'hochgeladene Foto-Pfade gemerkt');
  ok((await store.photosOf(list[0])).length === 2, 'Fotos liegen im eigenen Eintrag');
  const keys = await store.kvKeys('');
  ok(keys.includes('fotos:pending:neu-1') && keys.includes('pending:neu-1'), 'Haupt- und Foto-Eintrag vorhanden');

  // 3) Automatik sofort danach: wartet (keine Fotos, kein Einsatz gesendet)
  reset();
  await send.flushPending(be, USER);
  ok(calls.upload === 0 && calls.insert === 0, 'abgelehnter Einsatz wird nicht jede Minute neu gesendet');

  // 4) „Jetzt senden“: sofort, aber ohne die Fotos erneut hochzuladen
  reset();
  await send.flushPending(be, USER, { force: true });
  ok(calls.upload === 0 && calls.insert === 1, `„Jetzt senden“ versucht sofort, ohne Fotos neu zu laden (upload ${calls.upload}, insert ${calls.insert})`);
  list = await store.listPending(USER);
  ok(list[0].tries === 2, 'Zähler steigt auf 2');

  // 5) Server nimmt an → weg, samt Fotos
  mode = 'ok'; reset();
  await send.flushPending(be, USER, { force: true });
  ok(calls.insert === 1 && be.lastUrls.length === 2 && be.lastUrls.every((u) => u.startsWith('storage:')), 'Einsatz geht mit den gemerkten Foto-Pfaden raus');
  ok((await store.kvKeys('')).length === 0, 'danach leer (Foto-Eintrag mit gelöscht)');

  // 6) Funkloch: wartet, später gesendet
  mode = 'net'; reset();
  r = await send.submit(be, { key: store.pendingKey('net-1'), kind: 'pending', userId: USER, propertyName: 'Net', row: row('net-1'), photos: [PH] });
  ok(r.result === 'queued', 'ohne Netz: wartet');
  list = await store.listPending(USER);
  ok(list.length === 1 && !list[0].lastError && !list[0].photos && list[0].photoCount === 1, 'wartender Eintrag klein, ohne Ablehnung');
  mode = 'ok'; reset();
  ok((await send.flushPending(be, USER)) === 1 && calls.upload === 1, 'mit Netz automatisch nachgesendet (Foto hochgeladen)');

  // 7) Fehlender Foto-Eintrag → Hinweis in der Notiz statt still weglassen
  await store.kvPut({ key: 'pending:miss-1', kind: 'pending', userId: USER, propertyName: 'Miss', row: row('miss-1'), photoCount: 2 });
  reset();
  await send.flushPending(be, USER);
  ok(calls.insert === 1 && /nicht mehr lesbar/.test(be.lastRow.notes ?? ''), 'fehlende Fotos stehen ehrlich in der Notiz');

  // 8) Fahrten: gleiche Regeln
  mode = 'nein'; reset();
  const runRow = { id: 'run-1', org_id: ORG, route_id: null, started_at: new Date().toISOString(), ended_at: new Date().toISOString(), track: [[[47, 15, 0, 5], [47.001, 15, 10, 5]]], gaps: [], gps_mocked: null, action: 'cleared', grit_material: null, grit_amount: null, weather: { t: 1 }, notes: null, performed_by: USER, performer_name: 'A', created_at: new Date().toISOString() };
  const rr = await runs.submitRun(be, { userId: USER, routeName: null, row: runRow, photos: [PH] });
  ok(typeof rr.result === 'object', 'Fahrt: Ablehnung gemeldet');
  let pr = await runs.listPendingRuns(USER);
  ok(pr.length === 1 && !pr[0].photos && pr[0].photoCount === 1 && pr[0].tries === 1, 'Fahrt: klein gelistet, Ablehnung vermerkt');
  reset();
  await runs.flushPendingRuns(be, USER);
  ok(calls.insertRun === 0 && calls.upload === 0, 'Fahrt: Automatik wartet');
  mode = 'ok'; reset();
  await runs.flushPendingRuns(be, USER, { force: true });
  ok(calls.insertRun === 1 && calls.upload === 0, 'Fahrt: „Jetzt senden“ ohne erneutes Hochladen');
  ok((await runs.listPendingRuns(USER)).length === 0 && (await store.kvKeys('fotos:')).length === 0, 'Fahrt: danach leer');

  // 9) Entwürfe + laufende Aufzeichnung + Abmelde-Zählung (gilt jetzt überall, nicht nur im Außendienst)
  await store.saveDraft({ key: store.draftKey(USER, 'p-9'), kind: 'draft', userId: USER, propertyId: 'p-9', opId: 'x', openedAt: new Date().toISOString(), start: null, weather: null, form: {}, photos: [PH], updatedAt: '' });
  ok((await store.listDraftPropertyIds(USER)).join() === 'p-9', 'Entwurf-Markierung nur aus den Schlüsseln');
  ok((await store.getDraft(USER, 'p-9'))?.photos.length === 1, 'Entwurf per Schlüssel geladen');
  await runs.saveActiveRun({ userId: USER, id: 'a', mode: 'run', routeId: null, routeName: null, plan: null, startedAt: new Date().toISOString(), stoppedAt: null, track: [[]], gaps: [], lengthM: 0, weather: null, form: null, photos: [] });
  ok(await runs.hasActiveRun(USER), 'laufende Aufzeichnung erkannt');
  mode = 'net';
  await send.submit(be, { key: store.pendingKey('cnt-1'), kind: 'pending', userId: USER, propertyName: 'C', row: row('cnt-1'), photos: [PH] });
  const n = await guard.countOnDevice('winterdex', USER);
  ok(n === 3, `Abmelde-Zählung: Entwurf + Aufzeichnung + wartender Einsatz = 3 (gezählt ${n}; Schlüssel: ${(await store.kvKeys('')).join(', ')})`);
  ok((await guard.countOnDevice('leiterdex', USER)) === 0, 'Abmelde-Zählung gilt nur für WinterDex');
  ok((await guard.countOnDevice('winterdex', 'anderes-konto')) === 0, 'anderes Konto sieht nichts');
} catch (e) {
  out.push('FEHLER ' + (e && e.stack || e));
  fail++;
}
out.push(fail ? `\n${fail} fehlgeschlagen` : '\nalle bestanden');
window.__fertig = out.join('\n');
