import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Teile, die der WinterDex-Außendienst ohne Netz braucht (Einstieg kommt automatisch dazu) — samt allen statisch
// geladenen Teilen, CSS und eingebundenen Dateien. Alles andere legt der Service Worker erst bei Nutzung ab.
const SHELL_MODULES = ['/src/winterdex/WinterdexArea.tsx', '/src/winterdex/aussendienst/Karte.tsx']
// Dateien aus public/, die zur Hülle gehören (Schrift, Symbole, Manifest)
const SHELL_STATIC = [
  '/fonts/inter-latin-var.woff2',
  '/favicon.png',
  '/dexware.webp',
  '/icons/winterdex.png',
  '/icons/winterdex-180.png',
  '/icons/winterdex-192.png',
  '/icons/winterdex-512.png',
  '/winterdex.webmanifest',
]
const SW_TEMPLATE = new URL('./pwa/sw.js', import.meta.url)

/**
 * Service Worker ohne Zusatzpaket: Vorlage pwa/sw.js + Dateiliste der App-Hülle + Fassungskennung → dist/sw.js.
 * Die Fassung ist ein Fingerabdruck über Dateinamen (mit Inhalts-Kennung), index.html, Manifest und Vorlage — jeder
 * Deploy mit Änderung ergibt einen neuen Service Worker, der Browser holt ihn beim nächsten Öffnen.
 */
function serviceWorker(): Plugin {
  return {
    name: 'dex-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle)
      const chunks = new Map(files.flatMap((f) => (f.type === 'chunk' ? [[f.fileName, f] as const] : [])))
      const css = new Map(files.flatMap((f) => (f.type === 'asset' ? [[f.fileName, f] as const] : [])))
      const want = new Set<string>()
      const addAsset = (name: string) => {
        if (want.has(name)) return
        want.add(name)
        for (const a of css.get(name)?.viteMetadata?.importedAssets ?? []) want.add(a)
      }
      const visit = (name: string) => {
        const c = chunks.get(name)
        if (!c || want.has(name)) return
        want.add(name)
        for (const f of c.viteMetadata?.importedCss ?? []) addAsset(f)
        for (const f of c.viteMetadata?.importedAssets ?? []) addAsset(f)
        for (const f of c.imports) visit(f)
      }
      for (const c of chunks.values()) {
        const id = c.facadeModuleId?.replace(/\\/g, '/') ?? ''
        if (c.isEntry || SHELL_MODULES.some((m) => id.endsWith(m))) visit(c.fileName)
      }
      const found = SHELL_MODULES.filter((m) => [...chunks.values()].some((c) => (c.facadeModuleId ?? '').replace(/\\/g, '/').endsWith(m)))
      if (found.length !== SHELL_MODULES.length) this.error(`Service Worker: Teil nicht im Build gefunden (${SHELL_MODULES.join(', ')})`)

      const precache = ['/index.html', ...[...want].sort().map((f) => `/${f}`), ...SHELL_STATIC]
      const template = readFileSync(SW_TEMPLATE, 'utf8')
      const html = css.get('index.html')?.source ?? ''
      const manifest = readFileSync(new URL('./public/winterdex.webmanifest', import.meta.url), 'utf8')
      const version = createHash('sha256').update([precache.join('\n'), String(html), manifest, template].join('\0')).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace("'__DEX_VERSION__'", JSON.stringify(version)).replace('self.__DEX_PRECACHE__', JSON.stringify(precache)),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
})
