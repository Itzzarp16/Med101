import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url));

// One ID per build, used by src/lib/versionCheck.js so an already-open
// tab can detect a new deploy and reload itself automatically instead
// of relying on the person to know to refresh. Written to
// public/version.json (served as a plain static file, so it ends up
// at /version.json in the deployed build) and also baked into the JS
// bundle itself via `define`, so the running tab always knows its own
// build ID without an extra request on startup.
const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
writeFileSync(resolve(__dirname, 'public/version.json'), JSON.stringify({ buildId: BUILD_ID }));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
