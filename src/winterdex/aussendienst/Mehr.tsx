// Reiter „Mehr“ im Außendienst — entspricht „Einstellungen“ in der App: Nachweis-PDF, Team, Abo, Objekte verwalten,
// der eigene Name für „Dokumentiert von“ und Abmelden. Die Zielseiten sind dieselben wie im Dashboard (eine Quelle),
// nur im Handy-Rahmen des Außendienstes.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, CreditCard, FileDown, LogOut, MessageSquare, Monitor, Users } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { roleLabel } from '../../lib/orgApi';
import { useEinsatz } from '../einsatz/context';
import { getPerformerName, setPerformerName } from '../einsatz/data';

export function Mehr() {
  const { base, dashboardUrl, userId, owner } = useEinsatz();
  const { session, signOut } = useAppAuth();
  const { data } = useOrg();
  const [name, setName] = useState(() => getPerformerName(userId));
  const [saved, setSaved] = useState(false);

  const saveName = () => {
    setPerformerName(userId, name.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      <h1>Mehr</h1>
      {data && (
        <p className="muted" style={{ marginTop: 4 }}>
          {data.org.name} · {roleLabel(data.role)}
          {session?.user.email ? ` · ${session.user.email}` : ''}
        </p>
      )}

      <div className="ad-menu">
        <Link to={`${base}/bericht`}>
          <FileDown className="i" aria-hidden />
          <span>
            <b>Nachweis-PDF</b>
            <small>Je Objekt: dieser Monat, Vormonat, ganze Saison oder frei wählbar</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={`${base}/objekte`}>
          <Building2 className="i" aria-hidden />
          <span>
            <b>{owner ? 'Objekte verwalten' : 'Objekte'}</b>
            <small>{owner ? 'Anlegen, bearbeiten, pausieren, Standort setzen' : 'Adressen, Pflichtzeiten, Einsatz-Historie'}</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={`${base}/team`}>
          <Users className="i" aria-hidden />
          <span>
            <b>Team</b>
            <small>{owner || data?.role === 'admin' ? 'Mitarbeiter einladen, Team-Code' : 'Wer gehört zum Betrieb'}</small>
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
        <Link to={`${base}/rueckmeldung`}>
          <MessageSquare className="i" aria-hidden />
          <span>
            <b>Fehler melden · Verbesserung vorschlagen</b>
            <small>Für hilfreiche Hinweise gibt es 3 Tage Pro</small>
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

      <div className="card" style={{ marginTop: 18 }}>
        <label className="field">
          <span>Dein Name für „Dokumentiert von“</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vor- und Nachname"
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <p className="muted small" style={{ margin: '6px 0 12px' }}>
          Wird bei jedem neuen Einsatz und jeder Fahrt vorgeschlagen. Gespeichert auf diesem Gerät.
        </p>
        <button className="btn small" onClick={saveName} disabled={name.trim() === getPerformerName(userId) && !saved}>
          {saved ? '✓ Gespeichert' : 'Namen speichern'}
        </button>
      </div>

      <button className="btn ghost" style={{ marginTop: 18, width: '100%' }} onClick={() => void signOut()}>
        <LogOut className="i" aria-hidden /> Abmelden
      </button>
    </>
  );
}
