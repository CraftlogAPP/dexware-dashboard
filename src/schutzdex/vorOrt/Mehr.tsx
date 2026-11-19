// Reiter „Mehr“ (SchutzDex) — entspricht „Mehr“ in der App: Nachweise, Mitarbeiter und Unterweisungen verwalten, Abo,
// der eigene Name für „Unterwiesen durch“ und Abmelden. Die Zielseiten sind dieselben wie im Dashboard (eine Quelle),
// nur im Handy-Rahmen.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, ChevronRight, CreditCard, LogOut, Monitor, PenLine, Users } from 'lucide-react';
import { loadTrainer, saveTrainer, useSd } from './context';

export function Mehr() {
  const { base, dashboardUrl, userId, orgName, email, signOut } = useSd();
  const stored = loadTrainer(userId);
  const [name, setName] = useState(stored);
  const [saved, setSaved] = useState(false);
  const save = () => {
    saveTrainer(userId, name);
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
        {orgName} · Inhaber
        {email ? ` · ${email}` : ''}
      </p>

      <div className="ad-menu">
        {item(`${base}/nachweise`, <PenLine className="i" aria-hidden />, 'Nachweise (unterschrieben)', 'Alle abgeschlossenen Unterweisungen mit Datum und Ergebnis')}
        {item(`${base}/mitarbeiter`, <Users className="i" aria-hidden />, 'Mitarbeiter verwalten', 'Bearbeiten, inaktiv setzen, löschen')}
        {item(`${base}/unterweisungen`, <BookOpenCheck className="i" aria-hidden />, 'Unterweisungen verwalten', 'Übersicht und Löschen — neue erstellst du in der App')}
        {item(`${base}/abo`, <CreditCard className="i" aria-hidden />, 'Abo & Tarif', 'Gratis oder Pro, Laufzeit')}
        {item(dashboardUrl, <Monitor className="i" aria-hidden />, 'Dashboard fürs Büro', 'Übersicht und Auswertung am großen Bildschirm')}
      </div>

      <div className="card ez" style={{ marginTop: 18 }}>
        <label className="field">
          <span>Dein Name für „Unterwiesen durch“</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" maxLength={120} autoComplete="name" />
        </label>
        <button className="btn small" onClick={save} disabled={!name.trim() || (name.trim() === stored && !saved)}>
          {saved ? '✓ Gespeichert' : 'Namen speichern'}
        </button>
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          Der Name wird bei jeder Unterweisung vorgeschlagen und steht im Nachweis. Gespeichert nur auf diesem Gerät, je Konto.
        </p>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Neue Unterweisungen (KI), die Gefährdungsbeurteilung und das Nachweis-PDF gibt es in der SchutzDex-App.
      </p>

      <button className="btn ghost" style={{ marginTop: 18, width: '100%' }} onClick={signOut}>
        <LogOut className="i" aria-hidden /> Abmelden
      </button>
    </>
  );
}
