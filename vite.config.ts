import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import { workbox } from './pwa-workbox';

const pwa = VitePWA({
  registerType: 'autoUpdate',
  // Registraci service workeru vloží plugin do index.html sám (registerSW.js),
  // takže src/app/main.tsx se jí nemusí týkat.
  injectRegister: 'auto',
  // Manifest je ručně v public/manifest.webmanifest a odkazuje na něj index.html.
  manifest: false,
  // Stránky nejdřív ze sítě, /api se nikdy necachuje; podrobně v pwa-workbox.ts.
  workbox,
});

// @cloudflare/vite-plugin staví dvě prostředí (client a Worker). Service worker patří jen
// do klienta, jinak by se registerSW.js dostal i do výstupu Workeru (dist/mzdy).
for (const plugin of pwa) {
  Object.assign(plugin, { applyToEnvironment: (env: { name: string }) => env.name === 'client' });
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), pwa],
});
