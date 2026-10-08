import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, sablonaVstup, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
let firmaId: string;
beforeAll(async () => {
  t = await vytvorTestovaciApp();
  api = klient(t.fetchApi);
  firmaId = (await api.post('/firmy', firmaVstup())).body.id;
});
afterAll(async () => { await t.zavri(); });

test('vytvoření zaměstnance vrátí 201 se sazbami s id a aktivni = true', async () => {
  const r = await api.post('/zamestnanci', zamestnanecVstup(firmaId, {
    deti: [{ ztpp: false }, { ztpp: true }],
    sazby: [{ platiOd: '2026-06-01', hodinovaHal: 16000 }, { platiOd: '2026-01-01', hodinovaHal: 15000 }],
  }));
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ firmaId, jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', aktivni: true, deti: [{ ztpp: false }, { ztpp: true }], ucet: null, ukonceni: null });
  expect(r.body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(r.body.sazby.map((s: { platiOd: string; hodinovaHal: number; zamestnanecId: string }) => [s.platiOd, s.hodinovaHal, s.zamestnanecId]))
    .toEqual([['2026-01-01', 15000, r.body.id], ['2026-06-01', 16000, r.body.id]]);
  expect(r.body.sazby.every((s: { id: string }) => /^[0-9a-f-]{36}$/.test(s.id))).toBe(true);
});

test('seznam zaměstnanců firmy obsahuje i neaktivní a jejich sazby', async () => {
  const f = (await api.post('/firmy', firmaVstup({ nazev: 'Seznam' }))).body.id;
  const a = (await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Aktivní' }))).body;
  const n = (await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Neaktivní', aktivni: false }))).body;
  const jina = (await api.post('/firmy', firmaVstup({ nazev: 'Jiná' }))).body.id;
  await api.post('/zamestnanci', zamestnanecVstup(jina, { prijmeni: 'Cizí' }));
  const r = await api.get(`/firmy/${f}/zamestnanci`);
  expect(r.status).toBe(200);
  expect(r.body.map((x: { id: string }) => x.id).sort()).toEqual([a.id, n.id].sort());
  expect(r.body.find((x: { id: string }) => x.id === n.id)).toMatchObject({ aktivni: false });
  expect(r.body.every((x: { sazby: unknown[] }) => x.sazby.length === 1)).toBe(true);
});

test('úprava přepíše pole a sazby se nahradí celé', async () => {
  const z = (await api.post('/zamestnanci', zamestnanecVstup(firmaId, { sazby: [{ platiOd: '2026-01-01', hodinovaHal: 15000 }, { platiOd: '2026-03-01', hodinovaHal: 15500 }] }))).body;
  const r = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId, {
    prijmeni: 'Svobodová', smlouva: 'DPP', uvazekMinTydne: 0, ukonceni: '2026-12-31', ucet: '123456789/0100',
    sazby: [{ platiOd: '2026-02-01', hodinovaHal: 17000 }],
  }));
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ id: z.id, prijmeni: 'Svobodová', smlouva: 'DPP', uvazekMinTydne: 0, ukonceni: '2026-12-31', ucet: '123456789/0100' });
  expect(r.body.sazby).toHaveLength(1);
  expect(r.body.sazby[0]).toMatchObject({ platiOd: '2026-02-01', hodinovaHal: 17000 });
  const seznam = (await api.get(`/firmy/${firmaId}/zamestnanci`)).body.find((x: { id: string }) => x.id === z.id);
  expect(seznam.sazby).toHaveLength(1);
});

test('úprava bez aktivni ponechá uloženou hodnotu (neaktivní se nevrátí), výslovné aktivni ji změní', async () => {
  const z = (await api.post('/zamestnanci', zamestnanecVstup(firmaId, { aktivni: false }))).body;
  expect(z.aktivni).toBe(false);
  const bez = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId, { prijmeni: 'Nové' }));
  expect(bez.status).toBe(200);
  expect(bez.body).toMatchObject({ prijmeni: 'Nové', aktivni: false });
  const seznam = (await api.get(`/firmy/${firmaId}/zamestnanci`)).body.find((x: { id: string }) => x.id === z.id);
  expect(seznam.aktivni).toBe(false);

  expect((await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId, { aktivni: true }))).body.aktivni).toBe(true);
  expect((await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId))).body.aktivni).toBe(true); // vynechané = zůstává true
  expect((await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId, { aktivni: false }))).body.aktivni).toBe(false);
  expect((await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId, { aktivni: 'ne' as never }))).status).toBe(400);
});

describe('rozpočet příkazů D1 (max 50 na požadavek)', () => {
  const sazby = (pocet: number, zaklad = 10000) => Array.from({ length: pocet }, (_, i) => ({ platiOd: `${2000 + i}-01-01`, hodinovaHal: zaklad + i }));

  test('založení se 100 sazbami (limit schématu): vícerádkový insert, 8 příkazů', async () => {
    let r!: Awaited<ReturnType<typeof api.post>>;
    const pocet = await t.prikazy(async () => { r = await api.post('/zamestnanci', zamestnanecVstup(firmaId, { sazby: sazby(100) })); });
    expect(r.status).toBe(201);
    expect(r.body.sazby).toHaveLength(100);
    expect(r.body.sazby.map((s: { hodinovaHal: number }) => s.hodinovaHal)).toEqual(sazby(100).map((s) => s.hodinovaHal));
    expect(pocet).toBe(8); // firma + zaměstnanec + 4× sazby + 2× čtení
  });

  test('úprava se 100 sazbami nahradí staré celé: 9 příkazů', async () => {
    const z = (await api.post('/zamestnanci', zamestnanecVstup(firmaId, { sazby: sazby(100) }))).body;
    let r!: Awaited<ReturnType<typeof api.put>>;
    const pocet = await t.prikazy(async () => { r = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(firmaId, { sazby: sazby(100, 20000) })); });
    expect(r.status).toBe(200);
    expect(r.body.sazby.map((s: { hodinovaHal: number }) => s.hodinovaHal)).toEqual(sazby(100, 20000).map((s) => s.hodinovaHal));
    expect(pocet).toBe(9); // původní + update + delete sazeb + 4× sazby + 2× čtení
    const zaloha = (await api.get('/zaloha')).body;
    expect(zaloha.tabulky.sazba.filter((s: { zamestnanecId: string }) => s.zamestnanecId === z.id)).toHaveLength(100);
  });

  test('založení bez sazeb je v pořádku (žádný prázdný příkaz)', async () => {
    const r = await api.post('/zamestnanci', zamestnanecVstup(firmaId, { sazby: [] }));
    expect(r.status).toBe(201);
    expect(r.body.sazby).toEqual([]);
  });
});

test('smazání zaměstnance vrátí 204 a smaže i jeho sazby', async () => {
  const z = (await api.post('/zamestnanci', zamestnanecVstup(firmaId))).body;
  const r = await api.del(`/zamestnanci/${z.id}`);
  expect(r.status).toBe(204);
  const zaloha = (await api.get('/zaloha')).body;
  expect(zaloha.tabulky.zamestnanec.map((x: { id: string }) => x.id)).not.toContain(z.id);
  expect(zaloha.tabulky.sazba.filter((s: { zamestnanecId: string }) => s.zamestnanecId === z.id)).toHaveLength(0);
});

test('neexistující id → 404 NENALEZENO (zaměstnanec i firma)', async () => {
  expect((await api.put('/zamestnanci/neni', zamestnanecVstup(firmaId))).status).toBe(404);
  expect((await api.del('/zamestnanci/neni')).body).toEqual({ chyba: 'NENALEZENO' });
  expect((await api.get('/firmy/neni/zamestnanci')).status).toBe(404);
  const r = await api.post('/zamestnanci', zamestnanecVstup('neni'));
  expect(r.status).toBe(404);
  expect(r.body.chyba).toBe('NENALEZENO');
});

test('neplatný vstup → 400 NEPLATNY_VSTUP', async () => {
  const spatne = [
    zamestnanecVstup(firmaId, { smlouva: 'DPC' as never }),
    zamestnanecVstup(firmaId, { jmeno: '' }),
    zamestnanecVstup(firmaId, { nastup: '2026-02-30' }),
    zamestnanecVstup(firmaId, { nastup: '1.1.2026' }),
    zamestnanecVstup(firmaId, { ukonceni: '2025-12-31' }),
    zamestnanecVstup(firmaId, { invalidita: 'IV' as never }),
    zamestnanecVstup(firmaId, { sazby: [{ platiOd: '2026-01-01', hodinovaHal: 150.5 }] }),
    zamestnanecVstup(firmaId, { sazby: [{ platiOd: '2026-01-01', hodinovaHal: -1 }] }),
    zamestnanecVstup(firmaId, { deti: [{ ztpp: 'ano' as never }] }),
    { ...zamestnanecVstup(firmaId), sazby: undefined } as never,
  ];
  for (const telo of spatne) {
    const r = await api.post('/zamestnanci', telo);
    expect(r.status, JSON.stringify(telo)).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    expect(typeof r.body.zprava).toBe('string');
  }
});

test('zaměstnance nejde úpravou přesunout do jiné firmy', async () => {
  const z = (await api.post('/zamestnanci', zamestnanecVstup(firmaId))).body;
  const jina = (await api.post('/firmy', firmaVstup({ nazev: 'Jiná' }))).body.id;
  const r = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(jina));
  expect(r.status).toBe(400);
  expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
});

describe('plánování směn u zaměstnance', () => {
  test('bez rolí → MIMO_PLAN a prázdné střídání; s rolí a šablonou firmy se uloží', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Plánovač' }))).body.id;
    const bez = await api.post('/zamestnanci', zamestnanecVstup(f));
    expect(bez.body).toMatchObject({ rolePlanu: 'MIMO_PLAN', stridaniSmen: [] });
    const s1 = (await api.post('/sablony', sablonaVstup(f, { nazev: '12–20', zacatek: '12:00', konec: '20:00', prestavkaMin: 0 }))).body.id;
    const s2 = (await api.post('/sablony', sablonaVstup(f, { nazev: '8–16:30', zacatek: '08:00', konec: '16:30', prestavkaMin: 30 }))).body.id;
    const s = await api.post('/zamestnanci', zamestnanecVstup(f, { rolePlanu: 'DOZOR', stridaniSmen: [s1, s2] }));
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ rolePlanu: 'DOZOR', stridaniSmen: [s1, s2] });
  });

  test('šablona jiné firmy nebo neexistující ve střídání → 400', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Plánovač 2' }))).body.id;
    const cizi = (await api.post('/sablony', sablonaVstup(firmaId))).body.id;
    expect((await api.post('/zamestnanci', zamestnanecVstup(f, { stridaniSmen: [cizi] }))).status).toBe(400);
    expect((await api.post('/zamestnanci', zamestnanecVstup(f, { stridaniSmen: ['neni'] }))).status).toBe(400);
  });

  test('úprava bez nových polí (stará appka) ponechá uloženou roli a střídání', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Plánovač 3' }))).body.id;
    const s1 = (await api.post('/sablony', sablonaVstup(f))).body.id;
    const z = (await api.post('/zamestnanci', zamestnanecVstup(f, { rolePlanu: 'KASA', stridaniSmen: [s1] }))).body;
    const upraveno = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { jmeno: 'Zdenka' }));
    expect(upraveno.status).toBe(200);
    expect(upraveno.body).toMatchObject({ jmeno: 'Zdenka', rolePlanu: 'KASA', stridaniSmen: [s1] });
    const zmeneno = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { rolePlanu: 'PRODEJNA', stridaniSmen: [] }));
    expect(zmeneno.body).toMatchObject({ rolePlanu: 'PRODEJNA', stridaniSmen: [] });
  });
});

describe('pořadí v podkladu pro účetního', () => {
  test('uloží se a GET ho vrátí; bez pole je null', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Pořadí 1' }))).body.id;
    const s = await api.post('/zamestnanci', zamestnanecVstup(f, { poradiPodkladu: 3 }));
    expect(s.status).toBe(201);
    expect(s.body.poradiPodkladu).toBe(3);
    const bez = await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Bez' }));
    expect(bez.body.poradiPodkladu).toBeNull();
    const seznam = (await api.get(`/firmy/${f}/zamestnanci`)).body as { id: string; poradiPodkladu: number | null }[];
    expect(seznam.find((x) => x.id === s.body.id)?.poradiPodkladu).toBe(3);
    expect(seznam.find((x) => x.id === bez.body.id)?.poradiPodkladu).toBeNull();
  });

  test('úprava bez pole ponechá uloženou hodnotu, výslovné null ji smaže', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Pořadí 2' }))).body.id;
    const z = (await api.post('/zamestnanci', zamestnanecVstup(f, { poradiPodkladu: 3 }))).body;
    const bez = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { jmeno: 'Zdenka' }));
    expect(bez.status).toBe(200);
    expect(bez.body).toMatchObject({ jmeno: 'Zdenka', poradiPodkladu: 3 });
    const jina = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { poradiPodkladu: 12 }));
    expect(jina.body.poradiPodkladu).toBe(12);
    const smazano = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { poradiPodkladu: null }));
    expect(smazano.status).toBe(200);
    expect(smazano.body.poradiPodkladu).toBeNull();
  });

  test('0, 1000 a 2.5 → 400 NEPLATNY_VSTUP; krajní 1 a 999 projdou', async () => {
    for (const hodnota of [0, 1000, 2.5]) {
      const r = await api.post('/zamestnanci', zamestnanecVstup(firmaId, { poradiPodkladu: hodnota }));
      expect(r.status, String(hodnota)).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
    expect((await api.post('/zamestnanci', zamestnanecVstup(firmaId, { poradiPodkladu: 1 }))).status).toBe(201);
    expect((await api.post('/zamestnanci', zamestnanecVstup(firmaId, { poradiPodkladu: 999 }))).status).toBe(201);
  });
});

describe('zahrnutí do podkladů pro účetního', () => {
  test('nový bez pole je true, s false je false; GET to vrátí', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Podklad 1' }))).body.id;
    const bez = await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Bez' }));
    expect(bez.status).toBe(201);
    expect(bez.body.vPodkladu).toBe(true);
    const vyrazeny = await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Vyřazený', vPodkladu: false }));
    expect(vyrazeny.status).toBe(201);
    expect(vyrazeny.body.vPodkladu).toBe(false);
    const seznam = (await api.get(`/firmy/${f}/zamestnanci`)).body as { id: string; vPodkladu: boolean }[];
    expect(seznam.find((x) => x.id === bez.body.id)?.vPodkladu).toBe(true);
    expect(seznam.find((x) => x.id === vyrazeny.body.id)?.vPodkladu).toBe(false);
  });

  test('úprava bez pole ponechá false, výslovné true ho přepne', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Podklad 2' }))).body.id;
    const z = (await api.post('/zamestnanci', zamestnanecVstup(f, { vPodkladu: false }))).body;
    const bez = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { jmeno: 'Zdenka' }));
    expect(bez.status).toBe(200);
    expect(bez.body).toMatchObject({ jmeno: 'Zdenka', vPodkladu: false });
    const zapnuto = await api.put(`/zamestnanci/${z.id}`, zamestnanecVstup(f, { vPodkladu: true }));
    expect(zapnuto.body.vPodkladu).toBe(true);
  });

  test('"ne" místo boolean → 400 NEPLATNY_VSTUP', async () => {
    const r = await api.post('/zamestnanci', zamestnanecVstup(firmaId, { vPodkladu: 'ne' as unknown as boolean }));
    expect(r.status).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
  });
});
