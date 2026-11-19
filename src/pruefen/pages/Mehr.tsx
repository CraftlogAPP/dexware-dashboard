// Reiter „Mehr“ — entspricht „Einstellungen“ in der App: Prüfbericht-PDF, Standorte verwalten, Team, Abo,
// die eigenen Angaben fürs Protokoll (Name, Qualifikation, Unterschrift) und Abmelden.
// Die Zielseiten sind dieselben wie im Dashboard (eine Quelle), nur im Handy-Rahmen.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, CreditCard, FileDown, LogOut, Monitor, Users } from 'lucide-react';
import { usePruef } from '../context';
import { getPrefs, setPrefs } from '../data';
import { Unterschrift } from '../Unterschrift';

export function Mehr() {
  const { cfg, base, dashboardUrl, userId, owner, orgName, email, signOut } = usePruef();
  const [prefs, setLocal] = useState(() => getPrefs(cfg.appId, userId));
  const [saved, setSaved] = useState(false);
  const S = cfg.labels.site;
  const U = cfg.labels.unit;

  const stored = getPrefs(cfg.appId, userId);
  const changed = prefs.name.trim() !== stored.name || prefs.qualification.trim() !== stored.qualification;
  const save = () => {
    setPrefs(cfg.appId, userId, { name: prefs.name.trim(), qualification: prefs.qualification.trim() });
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
        <Link to={`${base}/bericht`}>
          <FileDown className="i" aria-hidden />
          <span>
            <b>Prüfbericht-PDF</b>
            <small>Je {S.one} und Zeitraum, mit Fotos und Unterschrift</small>
          </span>
          <ChevronRight className="i go" aria-hidden />
        </Link>
        <Link to={`${base}/standorte`}>
          <Building2 className="i" aria-hidden />
          <span>
            <b>{S.many} verwalten</b>
            <small>
              {S.many} und {U.many} anlegen und bearbeiten
            </small>
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
          <span>Dein Name für „Geprüft von“</span>
          <input
            value={prefs.name}
            onChange={(e) => setLocal({ ...prefs, name: e.target.value })}
            placeholder="Vor- und Nachname"
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <label className="field">
          <span>Qualifikation (optional, erscheint im Bericht)</span>
          <input
            value={prefs.qualification}
            onChange={(e) => setLocal({ ...prefs, qualification: e.target.value })}
            placeholder={cfg.labels.qualificationExample}
            maxLength={120}
          />
        </label>
        <button className="btn small" onClick={save} disabled={!changed && !saved}>
          {saved ? '✓ Gespeichert' : 'Angaben speichern'}
        </button>
        <div style={{ marginTop: 18 }}>
          <Unterschrift
            value={prefs.signature}
            onChange={(sig) => {
              setLocal((p) => ({ ...p, signature: sig }));
              setPrefs(cfg.appId, userId, { signature: sig });
            }}
          />
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Name, Qualifikation und Unterschrift werden bei jeder neuen Prüfung vorgeschlagen. Gespeichert nur auf diesem
          Gerät, je Konto.
        </p>
      </div>

      <button className="btn ghost" style={{ marginTop: 18, width: '100%' }} onClick={signOut}>
        <LogOut className="i" aria-hidden /> Abmelden
      </button>
    </>
  );
}
