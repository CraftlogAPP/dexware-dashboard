import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { APPS, type AppConfig } from './apps/registry';

// Dashboard-Bereiche je App, lazy geladen (Code-Splitting: der Entry-Screen
// bleibt klein, jeder Bereich wird erst beim Öffnen geladen).
// Neue App: Registry-Eintrag + Zeile hier.
const AREAS: Record<string, ComponentType<{ app: AppConfig }>> = {
  winterdex: lazy(() =>
    import('./winterdex/WinterdexArea').then((m) => ({ default: m.WinterdexArea })),
  ),
  spieldex: lazy(() =>
    import('./spieldex/SpieldexArea').then((m) => ({ default: m.SpieldexArea })),
  ),
  regaldex: lazy(() =>
    import('./regaldex/RegaldexArea').then((m) => ({ default: m.RegaldexArea })),
  ),
  pruefdex: lazy(() =>
    import('./pruefdex/PruefdexArea').then((m) => ({ default: m.PruefdexArea })),
  ),
  schutzdex: lazy(() =>
    import('./schutzdex/SchutzdexArea').then((m) => ({ default: m.SchutzdexArea })),
  ),
  craftdex: lazy(() =>
    import('./craftdex/CraftdexArea').then((m) => ({ default: m.CraftdexArea })),
  ),
};

const loading = (
  <div className="empty">
    <span className="spinner" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-decor" aria-hidden />
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<Home />} />
          {APPS.filter((a) => a.status === 'dashboard' && AREAS[a.id]).map((app) => {
            const Area = AREAS[app.id];
            return (
              <Route
                key={app.id}
                path={`/app/${app.id}/*`}
                element={<Area app={app} />}
              />
            );
          })}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
