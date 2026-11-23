import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

/**
 * Base path for production builds.
 *
 * - Local development (`npm run dev`) always serves from `/`.
 * - Production builds use `/roomform/`, the GitHub Pages project path of
 *   https://mohammed-hossam11.github.io/roomform/. Roomform is a single page
 *   with no client-side routes, so a page refresh always loads index.html.
 * - To build for a different path, set VITE_BASE, e.g. VITE_BASE=/other-repo/
 *   (or VITE_BASE=./ for a relative build that works under any path).
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : (process.env.VITE_BASE || '/roomform/'),
  plugins: [tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 2000, target: ['es2020', 'safari14'] },
}))
