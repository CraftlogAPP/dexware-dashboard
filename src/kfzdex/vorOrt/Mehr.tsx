// Reiter „Mehr“ (KfzDex) — entspricht „Mehr“ in der App: Nachweise und Verwaltung (Fahrzeuge, Fahrer), Team, Abo,
// der eigene Name für „Geprüft von“ und Abmelden. Die Zielseiten sind dieselben wie im Dashboard, nur im Handy-Rahmen.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CreditCard, IdCard, LogOut, Monitor, Truck, Users } from 'lucide-react';
import { useKfz } from './context';

const nameKey = (userId: string) => `dexware-kfzdex-pruefername:${userId}`;

export function Mehr() {
  const { base, dashboardUrl, userId, owner, orgName, email, signOut } = useKfz();
  const stored = (() => {
    try {
      return localStorage.getItem(nameKey(userId)) ?? '';
    } catch {
      return '';
    }
  })();
  const [name, setName] = useState(stored);
  const [saved, setSaved] = useState(false);
  const save = () => {
    try {
      localStorage.setItem(nameKey(userId), name.trim());
    } catch {
      /* nur Komfort */
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      <h1>Mehr</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {orgName} · {owner ? 'Inhaber' : 'Mitarbeiter'}
        {email ? ` · ${email}` : ''}
      </p>

      <div className="ad-menu">
        <Link to={`${base}/fahrzeuge`}>
          <Truck className="i" aria-hidden />
          <span>
            <b>Fahrzeuge &amp; Prüf-Historie</b>
            <small>Fahrzeuge anlegen und bearbeiten, alle UVV-Nachweise je Fahrzeug</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={`${base}/fahrer`}>
          <IdCard className="i" aria-hidden />
          <span>
            <b>Fahrer &amp; Kontroll-Historie</b>
            <small>Fahrer anlegen und bearbeiten, alle Führerscheinkontrollen je Fahrer</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={`${base}/team`}>
          <Users className="i" aria-hidden />
          <span>
            <b>Team</b>
            <small>Mitarbeiter einladen, Team-Code</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={`${base}/abo`}>
          <CreditCard className="i" aria-hidden />
          <span>
            <b>Abo &amp; Tarif</b>
            <small>Gratis oder Pro, Laufzeit</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={dashboardUrl}>
          <Monitor className="i" aria-hidden />
          <span>
            <b>Dashboard fürs Büro</b>
            <small>Übersicht und Auswertung am großen Bildschirm</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
      </div>

      <div className="card ez" style={{ marginTop: 18 }}>
        <label className="field">
          <span>Dein Name für „Geprüft von“ und „Kontrolliert von“</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" maxLength={80} autoComplete="name" />
        </label>
        <button className="btn small" onClick={save} disabled={name.trim() === stored && !saved}>
          {saved ? '✓ Gespeichert' : 'Namen speichern'}
        </button>
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          Der Name wird bei jeder neuen Prüfung und Kontrolle vorgeschlagen. Gespeichert nur auf diesem Gerät, je Konto.
        </p>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Das PDF-Protokoll einer Prüfung gibt es in der KfzDex-App. Hier findest du alle Nachweise in der Historie je
        Fahrzeug bzw. Fahrer.
      </p>

      <button className="btn ghost" style={{ marginTop: 18, width: '100%' }} onClick={signOut}>
        <LogOut className="i" aria-hidden /> Abmelden
      </button>
    </>
  );
}
