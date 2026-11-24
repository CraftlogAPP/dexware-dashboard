import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installChunkReload } from './lib/chunkReload'

// Nach einem Deploy fehlen die alten nachgeladenen Teile → bei Netz einmal neu laden (statt weißer Seite)
installChunkReload()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
