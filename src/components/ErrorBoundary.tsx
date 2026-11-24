// Fehlergrenze: Statt einer weißen Seite (React räumt bei einem Fehler sonst ALLES ab — Kopf, Reiter, Inhalt) steht eine
// verständliche Meldung mit „Neu laden“ da. Typischer Fall: ein nachgeladener Teil (Karte, App-Bereich) fehlt, weil kein
// Netz da ist oder weil es nach einem Deploy eine neue Fassung gibt — dann wird bei Netz einmal von selbst neu geladen.
// resetKey (z. B. die Adresse): ändert er sich, wird wieder normal angezeigt — ein Reiterwechsel genügt.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { isChunkLoadError, reloadForNewVersion, reloadPending } from '../lib/chunkReload';

interface Props {
  children: ReactNode;
  resetKey?: string;
  /** Ausweg ohne Neuladen, z. B. zurück zu den Objekten */
  home?: { to: string; label: string };
  /** Zusatzsatz, z. B. dass Erfasstes auf dem Gerät gesichert bleibt */
  note?: string;
}

interface State {
  error: unknown;
  key: string | undefined;
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey, reloading: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey, reloading: false } : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Fehlergrenze:', error, info.componentStack);
    if (isChunkLoadError(error)) {
      if (reloadPending()) this.setState({ reloading: true });
      else void reloadForNewVersion().then((r) => r && this.setState({ reloading: true }));
    }
  }

  render(): ReactNode {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="err-boundary" role="alert">
        <div className="card">
          <h2>
            <TriangleAlert className="i" aria-hidden /> {reloading ? 'Neue Fassung wird geladen …' : 'Dieser Teil lässt sich gerade nicht öffnen'}
          </h2>
          {!reloading && (
            <p>
              {chunk
                ? offline
                  ? 'Ohne Internet kann er nicht geladen werden. Sobald wieder Empfang da ist: „Neu laden“.'
                  : 'Meist fehlt gerade das Internet oder es gibt eine neue Fassung — „Neu laden“ holt sie.'
                : 'Es ist ein Fehler aufgetreten. „Neu laden“ hilft meist; bleibt er, bitte über „Fehler melden“ Bescheid geben.'}
              {this.props.note ? ` ${this.props.note}` : ''}
            </p>
          )}
          {!chunk && error instanceof Error && error.message && <p className="muted small mono">{error.message.slice(0, 200)}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              <RotateCw className="i" aria-hidden /> Neu laden
            </button>
            {this.props.home && (
              <Link to={this.props.home.to} className="btn ghost">
                {this.props.home.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }
}
