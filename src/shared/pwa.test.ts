// Kontrola PWA souborů v public/ a index.html. Čte soubory z disku (jen test, proto smí node:fs).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { workbox } from '../../pwa-workbox';

const koren = (cesta: string) => fileURLToPath(new URL(`../../${cesta}`, import.meta.url));
const cti = (cesta: string) => readFileSync(koren(cesta), 'utf8');

interface IkonaManifestu {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(cti('public/manifest.webmanifest')) as {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: IkonaManifestu[];
};

/** Rozměry PNG z hlavičky IHDR (bajty 16–23), bez závislosti na knihovně. */
function rozmeryPng(cesta: string): { sirka: number; vyska: number } {
  const b = readFileSync(koren(cesta));
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { sirka: b.readUInt32BE(16), vyska: b.readUInt32BE(20) };
}

describe('manifest.webmanifest', () => {
  it('má název, jazyk, start a režim standalone', () => {
    expect(manifest.name).toBe('Mzdy');
    expect(manifest.short_name).toBe('Mzdy');
    expect(manifest.lang).toBe('cs');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('používá barvy papíru', () => {
    expect(manifest.background_color).toBe('#F3F5F7');
    expect(manifest.theme_color).toBe('#F3F5F7');
  });

  it('má ikony 192 a 512 a maskovatelnou 512', () => {
    const velikosti = manifest.icons.map((i) => i.sizes);
    expect(velikosti).toContain('192x192');
    expect(velikosti).toContain('512x512');
    const maskable = manifest.icons.filter((i) => i.purpose === 'maskable');
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe('512x512');
  });

  it('ikony existují a mají deklarované rozměry', () => {
    for (const ikona of manifest.icons) {
      const cesta = `public${ikona.src}`;
      expect(existsSync(koren(cesta)), cesta).toBe(true);
      const [sirka, vyska] = ikona.sizes.split('x').map(Number);
      expect(rozmeryPng(cesta), cesta).toEqual({ sirka, vyska });
      expect(ikona.type).toBe('image/png');
    }
  });

  it('apple-touch-icon má 180 px', () => {
    expect(rozmeryPng('public/icons/apple-touch-icon.png')).toEqual({ sirka: 180, vyska: 180 });
  });
});

describe('index.html', () => {
  const html = cti('index.html');

  it('odkazuje na manifest, ikony a barvu motivu', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/ikona.svg"');
    expect(html).toContain('<meta name="theme-color" content="#F3F5F7"');
  });

  it('manifest se načítá s přihlašovacími údaji (jinak ho Cloudflare Access pošle na přihlášení a instalace selže)', () => {
    expect(html).toMatch(/<link rel="manifest"[^>]*crossorigin="use-credentials"/);
  });

  it('má mobile-web-app-capable i apple-mobile-web-app-capable (starší iOS)', () => {
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"');
  });
});

describe('service worker (workbox)', () => {
  const pravidla = workbox.runtimeCaching ?? [];
  const navigace = pravidla.find((p) => p.handler === 'NetworkFirst');

  /** Přesně to, co se stane při generování sw.js: funkce se převede na text a v sw.js znovu vyhodnotí bez okolního kódu. */
  const vyhodnotit = (urlPattern: unknown): ((volby: { request: { mode: string }; url: URL }) => boolean) =>
    new Function(`return (${String(urlPattern)})`)();

  const volani = (mode: string, adresa: string) => ({ request: { mode }, url: new URL(adresa, 'https://mzdy.example') });

  it('stránky nejdou přes navigateFallback (po vypršení přihlášení Access by uživatele zablokoval)', () => {
    // Musí být výslovně null: když klíč chybí, vite-plugin-pwa doplní výchozí 'index.html'.
    expect(workbox).toHaveProperty('navigateFallback', null);
    expect(workbox.navigateFallbackDenylist).toBeUndefined();
  });

  it('index.html se nedává do předpaměti (předpaměť by obsloužila / ještě před sítí)', () => {
    const vzorky = workbox.globPatterns ?? [];
    expect(vzorky.length).toBeGreaterThan(0);
    for (const vzorek of vzorky) expect(vzorek).not.toMatch(/html/);
  });

  it('do předpaměti jde statika (js, css, svg, png, woff2), ne TTF fonty pro PDF', () => {
    expect(workbox.globPatterns).toEqual(['**/*.{js,css,svg,png,woff2}']);
  });

  it('navigace jdou nejdřív přes síť (NetworkFirst, limit 4 s, jen odpovědi 200, cache stranky)', () => {
    expect(pravidla).toHaveLength(1);
    expect(navigace).toBeDefined();
    expect(navigace?.options).toEqual({
      cacheName: 'stranky',
      networkTimeoutSeconds: 4,
      cacheableResponse: { statuses: [200] },
    });
  });

  it('pravidlo platí pro navigace, ale ne pro /api ani pro ostatní požadavky', () => {
    const platí = vyhodnotit(navigace?.urlPattern);
    expect(platí(volani('navigate', '/'))).toBe(true);
    expect(platí(volani('navigate', '/mzdy/2026-09'))).toBe(true);
    expect(platí(volani('navigate', '/api/zaloha'))).toBe(false);
    expect(platí(volani('cors', '/api/ja'))).toBe(false);
    expect(platí(volani('no-cors', '/assets/index.js'))).toBe(false);
  });
});

describe('_headers', () => {
  const text = cti('public/_headers');
  const radky = text.split(/\r?\n/);

  it('platí pro všechny cesty', () => {
    expect(radky[0]).toBe('/*');
  });

  it.each([
    [
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    ],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'no-referrer'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ])('nastavuje %s', (nazev, hodnota) => {
    expect(radky).toContain(`  ${nazev}: ${hodnota}`);
  });
});
