// CSRF: zápis do API jen JSONem ze stejného původu. Formulář z cizího webu (403) ani jiný typ těla (415) neprojde.
import { vytvorApp } from './index';
import { vytvorTestovaciApp } from './test/harness';

const env = () => ({ ALLOWED_EMAILS: 'kancelar@example.cz', DEV_BYPASS: '1' }) as never;
const CIZI = 'https://zly-web.example';
const ZAPISY: [string, string][] = [['POST', '/api/firmy'], ['PUT', '/api/dny'], ['PUT', '/api/vstupy'], ['POST', '/api/demo'], ['POST', '/api/firmy/x/uzaverka/2026/10'], ['POST', '/api/firmy/x/plan/2026/10/prevest']];

test('formulář nebo text z cizího webu → 403, dřív než se API čehokoli dotkne', async () => {
  const app = vytvorApp();
  for (const typ of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain']) {
    for (const [metoda, cesta] of ZAPISY) {
      const r = await app.request(cesta, { method: metoda, headers: { 'Content-Type': typ, Origin: CIZI }, body: 'nazev=X' }, env());
      expect(r.status, `${typ} ${metoda} ${cesta}`).toBe(403);
    }
  }
  // Smazání bez těla z cizího webu, i jen se Sec-Fetch-Site cross-site bez Origin.
  expect((await app.request('/api/firmy/x', { method: 'DELETE', headers: { Origin: CIZI } }, env())).status).toBe(403);
  expect((await app.request('/api/firmy/x', { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } }, env())).status).toBe(403);
});

test('zápis bez JSON těla ze stejného původu → 415 NEPLATNY_VSTUP', async () => {
  const app = vytvorApp();
  const ocekavane = { chyba: 'NEPLATNY_VSTUP', zprava: 'Tělo požadavku musí být JSON (Content-Type: application/json).' };
  for (const [metoda, cesta] of ZAPISY) {
    const r = await app.request(cesta, { method: metoda, headers: { 'Content-Type': 'text/plain', Origin: 'http://localhost' }, body: '{}' }, env());
    expect(r.status, `${metoda} ${cesta}`).toBe(415);
    expect(await r.json()).toEqual(ocekavane);
    const bezTypu = await app.request(cesta, { method: metoda, headers: { 'Sec-Fetch-Site': 'same-origin' } }, env());
    expect(bezTypu.status, `${metoda} ${cesta} bez Content-Type`).toBe(415);
  }
});

test('JSON ze stejného původu projde: appka funguje (demo s {}, firma, smazání)', async () => {
  const t = await vytvorTestovaciApp();
  try {
    const stejny = { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' };
    const demo = await t.fetchApi('/demo', { method: 'POST', headers: { ...stejny, 'Content-Type': 'application/json' }, body: '{}' });
    expect(demo.status).toBe(201);
    const firma = await t.fetchApi('/firmy', { method: 'POST', headers: { ...stejny, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ nazev: 'X' }) });
    expect(firma.status).toBe(201);
    const { id } = await firma.json() as { id: string };
    // Appka posílá Content-Type JSON i u smazání bez těla.
    expect((await t.fetchApi(`/firmy/${id}`, { method: 'DELETE', headers: { ...stejny, 'Content-Type': 'application/json' } })).status).toBe(204);
    // Čtení se kontrola netýká.
    expect((await t.fetchApi('/firmy', { headers: { Origin: CIZI } })).status).toBe(200);
  } finally {
    await t.zavri();
  }
});
