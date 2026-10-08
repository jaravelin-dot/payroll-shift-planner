import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, zamestnanecVstup } from '../test/pomocnici';
import { novyToken } from './odkazyRozpisu';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
let firmaId: string;
beforeAll(async () => {
  t = await vytvorTestovaciApp();
  api = klient(t.fetchApi);
  firmaId = (await api.post('/firmy', firmaVstup())).body.id;
});
afterAll(async () => { await t.zavri(); });

const novaFirma = async (nazev: string) => (await api.post('/firmy', firmaVstup({ nazev }))).body.id as string;

test('tablet: 201, token 32 znaků base64url, bez zaměstnance; další tablety se číslují', async () => {
  const f = await novaFirma('Tablety');
  const prvni = await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: null });
  expect(prvni.status).toBe(201);
  expect(prvni.body).toMatchObject({ firmaId: f, zamestnanecId: null, nazev: 'Tablet v prodejně' });
  expect(prvni.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(prvni.body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(typeof prvni.body.vytvoreno).toBe('string');
  expect(prvni.body).not.toHaveProperty('zruseno');
  const druhy = await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: null });
  expect(druhy.body.nazev).toBe('Tablet v prodejně 2');
  const treti = await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: null });
  expect(treti.body.nazev).toBe('Tablet v prodejně 3');
  expect(new Set([prvni.body.token, druhy.body.token, treti.body.token]).size).toBe(3);
});

test('osobní odkaz: název je jméno a příjmení; nový odkaz téhož člověka zruší starý', async () => {
  const f = await novaFirma('Osobní');
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body;
  const ostatni = (await api.post('/zamestnanci', zamestnanecVstup(f, { jmeno: 'Petr', prijmeni: 'Novák' }))).body;
  const stary = await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: z.id });
  expect(stary.status).toBe(201);
  expect(stary.body).toMatchObject({ zamestnanecId: z.id, nazev: 'Jana Nováková' });
  const cizi = await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: ostatni.id });
  const novy = await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: z.id });
  expect(novy.status).toBe(201);
  expect(novy.body.token).not.toBe(stary.body.token);
  const r = await api.get(`/firmy/${f}/odkazy-rozpisu`);
  expect(r.status).toBe(200);
  expect(r.body.map((o: { id: string }) => o.id).sort()).toEqual([novy.body.id, cizi.body.id].sort());
});

test('seznam: nejdřív tablety, pak osobní odkazy; zrušené se nevrací', async () => {
  const f = await novaFirma('Pořadí');
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body;
  const osobni = (await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: z.id })).body;
  const tablet = (await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: null })).body;
  const zruseny = (await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: null })).body;
  expect((await api.del(`/odkazy-rozpisu/${zruseny.id}`)).status).toBe(204);
  const r = await api.get(`/firmy/${f}/odkazy-rozpisu`);
  expect(r.body.map((o: { id: string }) => o.id)).toEqual([tablet.id, osobni.id]);
  expect(r.body.every((o: object) => !('zruseno' in o))).toBe(true);
});

test('zrušení odkazu: 204, v seznamu už není, druhé zrušení 404', async () => {
  const f = await novaFirma('Zrušení');
  const o = (await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: null })).body;
  const r = await api.del(`/odkazy-rozpisu/${o.id}`);
  expect(r.status).toBe(204);
  expect((await api.get(`/firmy/${f}/odkazy-rozpisu`)).body).toEqual([]);
  const znovu = await api.del(`/odkazy-rozpisu/${o.id}`);
  expect(znovu.status).toBe(404);
  expect(znovu.body).toEqual({ chyba: 'NENALEZENO' });
  expect((await api.del('/odkazy-rozpisu/neni')).status).toBe(404);
});

test('404: zaměstnanec z jiné firmy, neexistující zaměstnanec i firma; seznam neexistující firmy', async () => {
  const f = await novaFirma('Moje');
  const jina = await novaFirma('Jiná');
  const cizi = (await api.post('/zamestnanci', zamestnanecVstup(jina))).body;
  expect((await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: cizi.id })).status).toBe(404);
  expect((await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: 'neni' })).status).toBe(404);
  expect((await api.post('/odkazy-rozpisu', { firmaId: 'neni', zamestnanecId: null })).status).toBe(404);
  expect((await api.get('/firmy/neni/odkazy-rozpisu')).status).toBe(404);
  expect((await api.get(`/firmy/${f}/odkazy-rozpisu`)).body).toEqual([]);
});

test('neplatný vstup → 400 NEPLATNY_VSTUP', async () => {
  for (const telo of [{}, { firmaId }, { firmaId, zamestnanecId: 5 }, { zamestnanecId: null }]) {
    const r = await api.post('/odkazy-rozpisu', telo);
    expect(r.status, JSON.stringify(telo)).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
  }
});

test('smazání zaměstnance smaže i jeho odkazy (kaskáda)', async () => {
  const f = await novaFirma('Kaskáda');
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body;
  await api.post('/odkazy-rozpisu', { firmaId: f, zamestnanecId: z.id });
  expect((await api.del(`/zamestnanci/${z.id}`)).status).toBe(204);
  expect((await api.get(`/firmy/${f}/odkazy-rozpisu`)).body).toEqual([]);
});

test('novyToken(): 32 znaků base64url a sto různých', () => {
  const tokeny = Array.from({ length: 100 }, () => novyToken());
  expect(new Set(tokeny).size).toBe(100);
  for (const token of tokeny) expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
});
