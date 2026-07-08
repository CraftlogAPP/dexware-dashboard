import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { WinterdexArea } from './winterdex/WinterdexArea';
import { getApp } from './apps/registry';

export default function App() {
  const winterdex = getApp('winterdex')!;

  return (
    <BrowserRouter>
      <div className="bg-decor" aria-hidden />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/app/winterdex/*" element={<WinterdexArea app={winterdex} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
