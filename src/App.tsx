import type { ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { WinterdexArea } from './winterdex/WinterdexArea';
import { SpieldexArea } from './spieldex/SpieldexArea';
import { RegaldexArea } from './regaldex/RegaldexArea';
import { PruefdexArea } from './pruefdex/PruefdexArea';
import { SchutzdexArea } from './schutzdex/SchutzdexArea';
import { APPS, type AppConfig } from './apps/registry';

// Dashboard-Bereiche je App — neue App: Registry-Eintrag + Zeile hier.
const AREAS: Record<string, ComponentType<{ app: AppConfig }>> = {
  winterdex: WinterdexArea,
  spieldex: SpieldexArea,
  regaldex: RegaldexArea,
  pruefdex: PruefdexArea,
  schutzdex: SchutzdexArea,
};

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-decor" aria-hidden />
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
    </BrowserRouter>
  );
}
