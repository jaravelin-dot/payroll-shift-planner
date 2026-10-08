import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { vytvorApp } from './index';
const TYM = 'mzdy-test.cloudflareaccess.com';
const AUD = 'aud-123';
async function priprav() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const app = vytvorApp({ jwks: createLocalJWKSet({ keys: [jwk] }) });
  const token = (email: string, aud = AUD) => new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://${TYM}`).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  return { app, token, privateKey };
}
const env = (x: Record<string, string> = {}) => ({ ALLOWED_EMAILS: 'majitel@example.cz,kancelar@example.cz', ...x }) as never;
test('bez nastavení Access je API zavřené (fail-closed)', async () => {
  const { app } = await priprav();
  const r = await app.request('/api/ja', {}, env());
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ chyba: 'PRISTUP_NENASTAVEN' });
});
test('zdraví je dostupné vždy', async () => {
  const { app } = await priprav();
  expect((await app.request('/api/zdravi', {}, env())).status).toBe(200);
});
test('platný token povoleného e-mailu projde', async () => {
  const { app, token } = await priprav();
  const r = await app.request('/api/ja', { headers: { 'Cf-Access-Jwt-Assertion': await token('Kancelar@Example.cz') } }, env({ ACCESS_TEAM_DOMAIN: TYM, ACCESS_AUD: AUD }));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ email: 'kancelar@example.cz' });
});
test('cizí e-mail 403, špatné aud 401, chybějící token 401', async () => {
  const { app, token } = await priprav();
  const e = env({ ACCESS_TEAM_DOMAIN: TYM, ACCESS_AUD: AUD });
  expect((await app.request('/api/ja', { headers: { 'Cf-Access-Jwt-Assertion': await token('cizi@example.com') } }, e)).status).toBe(403);
  expect((await app.request('/api/ja', { headers: { 'Cf-Access-Jwt-Assertion': await token('kancelar@example.cz', 'jine') } }, e)).status).toBe(401);
  expect((await app.request('/api/ja', {}, e)).status).toBe(401);
});
test('DEV_BYPASS pustí lokálně', async () => {
  const { app } = await priprav();
  expect((await app.request('/api/ja', {}, env({ DEV_BYPASS: '1' }))).status).toBe(200);
  expect((await app.request('http://127.0.0.1:5299/api/ja', {}, env({ DEV_BYPASS: '1' }))).status).toBe(200);
});

test('DEV_BYPASS na ostré adrese neplatí: zůstane zamčeno (503 bez Access, 401 bez tokenu)', async () => {
  const { app } = await priprav();
  const ostra = 'https://mzdy.ukazka.example/api/ja';
  const bezAccess = await app.request(ostra, {}, env({ DEV_BYPASS: '1' }));
  expect(bezAccess.status).toBe(503);
  expect(await bezAccess.json()).toEqual({ chyba: 'PRISTUP_NENASTAVEN' });
  expect((await app.request(ostra, {}, env({ DEV_BYPASS: '1', ACCESS_TEAM_DOMAIN: TYM, ACCESS_AUD: AUD }))).status).toBe(401);
  // Ani podstrčená hlavička Host to nezmění: rozhoduje adresa požadavku.
  expect((await app.request(ostra, { headers: { Host: 'localhost' } }, env({ DEV_BYPASS: '1' }))).status).toBe(503);
});

describe('neplatný token', () => {
  const e = env({ ACCESS_TEAM_DOMAIN: TYM, ACCESS_AUD: AUD });
  const ja = (app: Awaited<ReturnType<typeof priprav>>['app'], token: string) =>
    app.request('/api/ja', { headers: { 'Cf-Access-Jwt-Assertion': token } }, e);
  const podepis = (claims: Record<string, unknown>, klic: CryptoKey, nastav: (jwt: SignJWT) => SignJWT) =>
    nastav(new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setAudience(AUD).setIssuedAt()).sign(klic);

  test('cizí vydavatel (issuer) → 401', async () => {
    const { app, privateKey } = await priprav();
    const token = await podepis({ email: 'kancelar@example.cz' }, privateKey, (j) => j.setIssuer('https://jiny-tym.cloudflareaccess.com').setExpirationTime('5m'));
    const r = await ja(app, token);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ chyba: 'NEPRIHLASEN' });
  });

  test('vypršelý token → 401', async () => {
    const { app, privateKey } = await priprav();
    const hodinaZpet = Math.floor(Date.now() / 1000) - 3600;
    const token = await podepis({ email: 'kancelar@example.cz' }, privateKey, (j) => j.setIssuer(`https://${TYM}`).setIssuedAt(hodinaZpet - 300).setExpirationTime(hodinaZpet));
    expect((await ja(app, token)).status).toBe(401);
  });

  test('podpis jiným klíčem (stejné kid) → 401', async () => {
    const { app } = await priprav();
    const { privateKey: cizi } = await generateKeyPair('RS256');
    const token = await podepis({ email: 'kancelar@example.cz' }, cizi, (j) => j.setIssuer(`https://${TYM}`).setExpirationTime('5m'));
    expect((await ja(app, token)).status).toBe(401);
  });

  test('token bez e-mailu → 403 ZAKAZANO', async () => {
    const { app, privateKey } = await priprav();
    const token = await podepis({}, privateKey, (j) => j.setIssuer(`https://${TYM}`).setExpirationTime('5m'));
    const r = await ja(app, token);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ chyba: 'ZAKAZANO' });
  });
});
test('nevalidní ACCESS_TEAM_DOMAIN je chyba nastavení (503), ne pád (500) — i bez tokenu', async () => {
  const { app, token } = await priprav();
  const e = env({ ACCESS_TEAM_DOMAIN: 'mzdy test/%zle', ACCESS_AUD: AUD });
  for (const hlavicky of [{}, { 'Cf-Access-Jwt-Assertion': await token('kancelar@example.cz') }]) {
    const r = await app.request('/api/ja', { headers: hlavicky }, e);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ chyba: 'PRISTUP_NENASTAVEN' });
  }
});

// Regresní zámek fail-closed: každá cesta API (všechny routery + neznámá cesta) je za ověřením. Handlery se nesmí ani spustit
// (prostředí nemá D1, takže by případný průchod skončil 500).
const CESTY: [string, string][] = [
  ['GET', '/api/ja'],
  ['GET', '/api/firmy'], ['POST', '/api/firmy'], ['PUT', '/api/firmy/x'], ['DELETE', '/api/firmy/x'],
  ['GET', '/api/firmy/x/zamestnanci'], ['POST', '/api/zamestnanci'], ['PUT', '/api/zamestnanci/x'], ['DELETE', '/api/zamestnanci/x'],
  ['GET', '/api/firmy/x/mesic/2026/10'], ['PUT', '/api/dny'], ['PUT', '/api/vstupy'], ['PUT', '/api/dovolena'],
  ['GET', '/api/firmy/x/sablony'], ['POST', '/api/sablony'], ['PUT', '/api/sablony/x'], ['DELETE', '/api/sablony/x'], ['PUT', '/api/plan'],
  ['POST', '/api/firmy/x/uzaverka/2026/10'], ['DELETE', '/api/firmy/x/uzaverka/2026/10'], ['GET', '/api/firmy/x/uzaverky?rok=2026'],
  ['POST', '/api/firmy/x/plan/2026/10/prevest'],
  ['GET', '/api/zaloha'], ['POST', '/api/demo'],
  ['GET', '/api/neexistuje'], ['POST', '/api/neexistuje/vubec'], ['DELETE', '/api/'],
];
const volej = (app: Awaited<ReturnType<typeof priprav>>['app'], metoda: string, cesta: string, e: never) =>
  app.request(cesta, { method: metoda, headers: { 'Content-Type': 'application/json' }, body: metoda === 'GET' || metoda === 'DELETE' ? undefined : '{}' }, e);

test('fail-closed: bez nastavení Access vrací každá cesta API 503 PRISTUP_NENASTAVEN', async () => {
  const { app } = await priprav();
  for (const [metoda, cesta] of CESTY) {
    const r = await volej(app, metoda, cesta, env());
    expect(r.status, `${metoda} ${cesta}`).toBe(503);
    expect(await r.json(), `${metoda} ${cesta}`).toEqual({ chyba: 'PRISTUP_NENASTAVEN' });
  }
});

test('fail-closed: s nastaveným Access, ale bez tokenu vrací každá cesta API 401 NEPRIHLASEN', async () => {
  const { app } = await priprav();
  const e = env({ ACCESS_TEAM_DOMAIN: TYM, ACCESS_AUD: AUD });
  for (const [metoda, cesta] of CESTY) {
    const r = await volej(app, metoda, cesta, e);
    expect(r.status, `${metoda} ${cesta}`).toBe(401);
    expect(await r.json(), `${metoda} ${cesta}`).toEqual({ chyba: 'NEPRIHLASEN' });
  }
});

test('fail-closed: jen /api/zdravi je veřejné', async () => {
  const { app } = await priprav();
  expect((await volej(app, 'GET', '/api/zdravi', env())).status).toBe(200);
});
