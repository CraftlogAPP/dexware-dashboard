// Reiter „Mehr“ (PrüfDex) — entspricht „Mehr“ in der App: Prüfungen und Protokolle, Geräte und Kunden verwalten,
// Sammelbericht, Abo, die eigenen Angaben fürs Protokoll (Prüfer, Qualifikation, Unterschrift) und Abmelden.
// Die Zielseiten sind dieselben wie im Dashboard (eine Quelle), nur im Handy-Rahmen.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, ClipboardCheck, CreditCard, FileDown, LogOut, Monitor, Plug } from 'lucide-react';
import { getPrefs, setPrefs } from '../../pruefen/data';
import { Unterschrift } from '../../pruefen/Unterschrift';
import { usePd } from './context';

const APP = 'pruefdex';

export function Mehr() {
  const { base, dashboardUrl, userId, owner, orgName, email, signOut } = usePd();
  const [prefs, setLocal] = useState(() => getPrefs(APP, userId));
  const [saved, setSaved] = useState(false);

  const stored = getPrefs(APP, userId);
  const changed = prefs.name.trim() !== stored.name || prefs.qualification.trim() !== stored.qualification;
  const save = () => {
    setPrefs(APP, userId, { name: prefs.name.trim(), qualification: prefs.qualification.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };
  const item = (to: string, icon: React.ReactNode, title: string, sub: string) => (
    <Link to={to}>
      {icon}
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <ChevronRight className="i go" aria-hidden />
    </Link>
  );

  return (
    <>
      <h1>Mehr</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {orgName} · {owner ? 'Inhaber' : 'Prüfer'}
        {email ? ` · ${email}` : ''}
      </p>

      <div className="ad-menu">
        {item(`${base}/pruefungen`, <ClipboardCheck className="i" aria-hidden />, 'Prüfungen & Protokolle', 'Alle Prüfungen mit Messwerten, Fotos und Unterschrift, Stornieren')}
        {item(`${base}/geraete`, <Plug className="i" aria-hidden />, 'Geräte verwalten', 'Geräte anlegen, bearbeiten, aussondern, Prüf-Historie')}
        {item(`${base}/kunden`, <Building2 className="i" aria-hidden />, 'Kunden verwalten', 'Kunden bzw. Standorte anlegen und bearbeiten')}
        {item(`${base}/bericht`, <FileDown className="i" aria-hidden />, 'Sammelbericht-PDF', 'Prüfliste je Kunde und Zeitraum')}
        {item(`${base}/abo`, <CreditCard className="i" aria-hidden />, 'Abo & Tarif', 'Gratis oder Pro, Laufzeit')}
        {item(dashboardUrl, <Monitor className="i" aria-hidden />, 'Dashboard fürs Büro', 'Übersicht und Auswertung am großen Bildschirm')}
      </div>

      <div className="card ez" style={{ marginTop: 18 }}>
        <label className="field">
          <span>Dein Name für „Prüfer“</span>
          <input value={prefs.name} onChange={(e) => setLocal({ ...prefs, name: e.target.value })} placeholder="Vor- und Nachname" maxLength={80} autoComplete="name" />
        </label>
        <label className="field">
          <span>Qualifikation (optional, erscheint im Protokoll)</span>
          <input value={prefs.qualification} onChange={(e) => setLocal({ ...prefs, qualification: e.target.value })} placeholder="z. B. Elektrofachkraft" maxLength={120} />
        </label>
        <button className="btn small" onClick={save} disabled={!changed && !saved}>
          {saved ? '✓ Gespeichert' : 'Angaben speichern'}
        </button>
        <div style={{ marginTop: 18 }}>
          <Unterschrift
            value={prefs.signature}
            onChange={(sig) => {
              setLocal((p) => ({ ...p, signature: sig }));
              setPrefs(APP, userId, { signature: sig });
            }}
          />
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Name, Qualifikation und Unterschrift werden bei jeder neuen Prüfung vorgeschlagen. Gespeichert nur auf diesem Gerät,
          je Konto.
        </p>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Typenschild-Erkennung, QR-Scan und Prüfplakette gibt es in der PrüfDex-App.
      </p>

      <button className="btn ghost" style={{ marginTop: 18, width: '100%' }} onClick={signOut}>
        <LogOut className="i" aria-hidden /> Abmelden
      </button>
    </>
  );
}
