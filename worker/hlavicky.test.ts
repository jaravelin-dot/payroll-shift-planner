import { vytvorApp } from './index';
import { vytvorTestovaciApp } from './test/harness';

const env = (x: Record<string, string> = {}) => ({ ALLOWED_EMAILS: 'kancelar@example.cz', ...x }) as never;

const OCEKAVANE: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
};

function zkontroluj(r: Response, popis: string) {
  for (const [nazev, hodnota] of Object.entries(OCEKAVANE)) expect(r.headers.get(nazev), `${popis}: ${nazev}`).toBe(hodnota);
}

test('/api/zdravi má bezpečnostní hlavičky a no-store', async () => {
  const r = await vytvorApp().request('/api/zdravi', {}, env());
  expect(r.status).toBe(200);
  zkontroluj(r, '/api/zdravi');
});

test('hlavičky mají i odpovědi 503, 401, 404 a neošetřená chyba 500', async () => {
  const app = vytvorApp();
  // 503: Access není nastavený.
  const nenastaveno = await app.request('/api/ja', {}, env());
  expect(nenastaveno.status).toBe(503);
  zkontroluj(nenastaveno, '503');
  // 401: Access nastavený, ale chybí token.
  const bezTokenu = await app.request('/api/ja', {}, env({ ACCESS_TEAM_DOMAIN: 'mzdy-test.cloudflareaccess.com', ACCESS_AUD: 'aud' }));
  expect(bezTokenu.status).toBe(401);
  zkontroluj(bezTokenu, '401');
  // 404: neznámá cesta za přihlášením (DEV_BYPASS jen kvůli průchodu ověřením).
  const nenalezeno = await app.request('/api/neexistuje', {}, env({ DEV_BYPASS: '1' }));
  expect(nenalezeno.status).toBe(404);
  zkontroluj(nenalezeno, '404');
  // 500: handler routeru bez D1 v prostředí spadne na neošetřené výjimce.
  const spadlo = await app.request('/api/firmy', {}, env({ DEV_BYPASS: '1' }));
  expect(spadlo.status).toBe(500);
  zkontroluj(spadlo, '500');
});

test('stažení zálohy (200, příloha): hlavičky jsou přidané a Content-Disposition zůstane', async () => {
  const t = await vytvorTestovaciApp();
  try {
    const r = await t.fetchApi('/zaloha');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="mzdy-zaloha-\d{4}-\d{2}-\d{2}\.json"$/);
    zkontroluj(r, 'záloha 200');
  } finally {
    await t.zavri();
  }
});
