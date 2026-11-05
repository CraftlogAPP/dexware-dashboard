// Impressum + Datenschutz auf jeder öffentlich erreichbaren Seite (§ 5 ECG:
// „leicht und unmittelbar zugänglich“). Die Texte liegen zentral auf dexware.app.
export function LegalLinks() {
  return (
    <p className="muted small" style={{ textAlign: 'center', margin: '18px 0 8px' }}>
      <a href="https://dexware.app/impressum.html" target="_blank" rel="noreferrer">
        Impressum
      </a>
      {' · '}
      <a href="https://dexware.app/datenschutz.html" target="_blank" rel="noreferrer">
        Datenschutz
      </a>
    </p>
  );
}
