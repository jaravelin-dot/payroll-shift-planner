import type { VitePWAOptions } from 'vite-plugin-pwa';

type WorkboxVolby = NonNullable<VitePWAOptions['workbox']>;

// Nastavení service workeru zvlášť, aby šlo testovat (src/shared/pwa.test.ts).
//
// Stránky se berou NEJDŘÍV ZE SÍTĚ. Kdyby je service worker podával z předpaměti
// (navigateFallback), po vypršení přihlášení Cloudflare Access by se uživatel nikdy nedostal
// na přihlašovací stránku: appka by se zobrazila, ale API by odpovídalo přesměrováním.
// Proto je navigateFallback výslovně null (jen vynechání nestačí: vite-plugin-pwa by doplnil
// výchozí `index.html`) a index.html se nedává do předpaměti (jinak by ho předpaměť podala
// na `/` dřív než síť). Offline se otevře naposledy stažená stránka z cache `stranky`.
export const workbox: WorkboxVolby = {
  navigateFallback: null,
  // Jen statika. TTF fonty pro PDF (public/fonts) se do předpaměti nedávají, načtou se až při tisku.
  globPatterns: ['**/*.{js,css,svg,png,woff2}'],
  runtimeCaching: [
    {
      // Funkce se do sw.js zapisuje jako text, proto nesmí používat nic z okolí.
      // /api se nikdy neukládá (ani když ho uživatel otevře jako stránku, např. stažení zálohy).
      urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'stranky',
        networkTimeoutSeconds: 4,
        // Přesměrování na přihlášení (302, neprůhledná odpověď se stavem 0) se neukládá.
        cacheableResponse: { statuses: [200] },
      },
    },
  ],
};
