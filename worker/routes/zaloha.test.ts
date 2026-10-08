import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, sablonaVstup, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

test('záloha obsahuje klíče všech 9 tabulek a hlavičku ke stažení', async () => {
  const r = await api.get('/zaloha');
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toContain('application/json');
  expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="mzdy-zaloha-\d{4}-\d{2}-\d{2}\.json"$/);
  const dnes = new Date().toISOString().slice(0, 10);
  expect(r.headers.get('content-disposition')).toContain(`mzdy-zaloha-${dnes}.json`);
  expect(r.body.verze).toBe(1);
  expect(new Date(r.body.vytvoreno).toISOString()).toBe(r.body.vytvoreno);
  expect(Object.keys(r.body.tabulky).sort()).toEqual(
    ['den', 'dovolenaZustatek', 'firma', 'mesicniVstup', 'planSmeny', 'sablonaSmeny', 'uzaverka', 'zamestnanec', 'sazba'].sort(),
  );
  for (const radky of Object.values(r.body.tabulky)) expect(Array.isArray(radky)).toBe(true);
});

test('záloha stojí 9 příkazů D1 (jedna dávka čtení), ať je dat kolik chce', async () => {
  let r!: Awaited<ReturnType<typeof api.get>>;
  expect(await t.prikazy(async () => { r = await api.get('/zaloha'); })).toBe(9);
  expect(r.status).toBe(200);
});

test('záloha obsahuje uložená data všech tabulek', async () => {
  const f = (await api.post('/firmy', firmaVstup({ nazev: 'Zálohovaná' }))).body.id;
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body.id;
  const s = (await api.post('/sablony', sablonaVstup(f))).body.id;
  await api.put('/dny', { zamestnanecId: z, dny: [{ datum: '2026-10-01', typ: 'PRACE', minuty: 480, kasa: true, poznamka: null }] });
  await api.put('/vstupy', { zamestnanecId: z, rok: 2026, mesic: 10, odmenaZaDenHal: 100, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null });
  await api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin: 0, narokNavicMin: 0 });
  await api.put('/plan', { zamestnanecId: z, polozky: [{ datum: '2026-10-01', typ: 'SMENA', sablonaId: s, minuty: 480 }] });

  const { tabulky } = (await api.get('/zaloha')).body;
  expect(tabulky.firma.map((x: { id: string }) => x.id)).toContain(f);
  expect(tabulky.zamestnanec.find((x: { id: string }) => x.id === z)).toMatchObject({ firmaId: f, deti: [], prohlaseni: true });
  expect(tabulky.sazba.filter((x: { zamestnanecId: string }) => x.zamestnanecId === z)).toHaveLength(1);
  expect(tabulky.den.filter((x: { zamestnanecId: string }) => x.zamestnanecId === z)).toEqual([{ zamestnanecId: z, datum: '2026-10-01', typ: 'PRACE', minuty: 480, kasa: true, poznamka: null }]);
  expect(tabulky.mesicniVstup.filter((x: { zamestnanecId: string }) => x.zamestnanecId === z)).toHaveLength(1);
  expect(tabulky.dovolenaZustatek.filter((x: { zamestnanecId: string }) => x.zamestnanecId === z)).toHaveLength(1);
  expect(tabulky.sablonaSmeny.map((x: { id: string }) => x.id)).toContain(s);
  expect(tabulky.planSmeny.filter((x: { zamestnanecId: string }) => x.zamestnanecId === z)).toEqual([{ zamestnanecId: z, datum: '2026-10-01', typ: 'SMENA', sablonaId: s, minuty: 480 }]);
});
