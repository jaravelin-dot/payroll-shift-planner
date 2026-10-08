import { pripravVstup } from '../../src/core/priprava';
import { vyresPrumernyVydelek } from '../../src/core/prumernyVydelek';
import { vypocitejMzdu } from '../../src/core/vypocet';
import { denVTydnu, dnyMesice, jeSvatek } from '../../src/core/kalendar';
import type { MesicData, Uzaverka } from '../../src/shared/api';
import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

const demo = async (rok = 2026, mesic = 10) => (await api.post('/demo', { rok, mesic })).body.id as string;
const praceDen = (datum: string, minuty = 480) => ({ datum, typ: 'PRACE' as const, minuty, kasa: false, poznamka: null });

describe('POST /firmy/:id/uzaverka/:rok/:mesic', () => {
  test('uloží snímek s výsledky všech aktivních lidí, stejný jako výpočet z dat měsíce', async () => {
    const f = await demo();
    const data = (await api.get(`/firmy/${f}/mesic/2026/10`)).body as MesicData;
    expect(data.zamestnanci).toHaveLength(4);

    const r = await api.post(`/firmy/${f}/uzaverka/2026/10`);
    expect(r.status).toBe(201);
    const u = r.body as Uzaverka;
    expect(u).toMatchObject({ firmaId: f, rok: 2026, mesic: 10 });
    expect(Number.isNaN(Date.parse(u.uzavreno))).toBe(false);
    expect(u.vysledky).toHaveLength(4);
    for (const z of data.zamestnanci) {
      const radek = u.vysledky.find((x) => x.zamestnanecId === z.id);
      expect(radek, z.prijmeni).toMatchObject({ jmeno: `${z.jmeno} ${z.prijmeni}`, smlouva: z.smlouva });
      // Snímek je přesně to, co spočítá jádro (JSON round-trip).
      expect(radek!.vysledek).toEqual(JSON.parse(JSON.stringify(vypocitejMzdu(pripravVstup(data, z.id)))));
    }

    const poUzavreni = (await api.get(`/firmy/${f}/mesic/2026/10`)).body as MesicData;
    expect(poUzavreni.uzaverka).toEqual(u);
  });

  test('druhé uzavření téhož měsíce → 409 MESIC_UZAVREN a snímek zůstane původní', async () => {
    const f = await demo();
    const prvni = (await api.post(`/firmy/${f}/uzaverka/2026/10`)).body as Uzaverka;
    const druhe = await api.post(`/firmy/${f}/uzaverka/2026/10`);
    expect(druhe.status).toBe(409);
    expect(druhe.body).toEqual({ chyba: 'MESIC_UZAVREN' });
    expect((await api.get(`/firmy/${f}/mesic/2026/10`)).body.uzaverka).toEqual(prvni);
  });

  test('uzavřený měsíc nejde měnit; po DELETE jde znovu uložit den i měsíc znovu uzavřít', async () => {
    const f = await demo();
    const data = (await api.get(`/firmy/${f}/mesic/2026/10`)).body as MesicData;
    const z = data.zamestnanci[0]!.id;
    expect((await api.post(`/firmy/${f}/uzaverka/2026/10`)).status).toBe(201);

    expect((await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-10-31', 300)] })).status).toBe(409);

    const otevreni = await api.del(`/firmy/${f}/uzaverka/2026/10`);
    expect(otevreni.status).toBe(204);
    expect((await api.get(`/firmy/${f}/mesic/2026/10`)).body.uzaverka).toBeNull();

    expect((await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-10-31', 300)] })).status).toBe(200);
    const znovu = await api.post(`/firmy/${f}/uzaverka/2026/10`);
    expect(znovu.status).toBe(201);
    const novaData = (await api.get(`/firmy/${f}/mesic/2026/10`)).body as MesicData;
    const radek = (znovu.body as Uzaverka).vysledky.find((x) => x.zamestnanecId === z)!;
    expect((radek.vysledek as { hodiny: { praceMin: number } }).hodiny.praceMin)
      .toBe(vypocitejMzdu(pripravVstup(novaData, z)).hodiny.praceMin);
  });

  test('snímek obsahuje jen lidi v pracovním poměru v tom měsíci', async () => {
    const f = (await api.post('/firmy', firmaVstup())).body.id as string;
    const aktivni = (await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Aktivní' }))).body.id as string;
    await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Odešla', ukonceni: '2026-09-30' }));
    await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Nastoupí', nastup: '2026-11-01', sazby: [{ platiOd: '2026-11-01', hodinovaHal: 15000 }] }));
    const u = (await api.post(`/firmy/${f}/uzaverka/2026/10`)).body as Uzaverka;
    expect(u.vysledky.map((x) => x.zamestnanecId)).toEqual([aktivni]);
  });

  test('uzavření stojí 12 příkazů D1 (firma + dávka 10 čtení + 1 zápis), odmítnuté 11', async () => {
    const f = await demo(2027, 3); // nejdelší měsíc ukázky: 67 dnů docházky
    let r!: Awaited<ReturnType<typeof api.post>>;
    expect(await t.prikazy(async () => { r = await api.post(`/firmy/${f}/uzaverka/2027/3`); })).toBe(12);
    expect(r.status).toBe(201);
    expect(await t.prikazy(async () => { r = await api.post(`/firmy/${f}/uzaverka/2027/3`); })).toBe(11);
    expect(r.status).toBe(409);
  });

  test('20 lidí × celý měsíc docházky se uzavře do 12 příkazů', async () => {
    const f = (await api.post('/firmy', firmaVstup())).body.id as string;
    const dny = dnyMesice(2026, 10).map((d) => praceDen(d, 480));
    for (let i = 0; i < 20; i++) {
      const z = (await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: `Člověk ${i}` }))).body.id as string;
      await api.put('/dny', { zamestnanecId: z, dny });
    }
    let r!: Awaited<ReturnType<typeof api.post>>;
    expect(await t.prikazy(async () => { r = await api.post(`/firmy/${f}/uzaverka/2026/10`); })).toBe(12);
    expect(r.status).toBe(201);
    expect((r.body as Uzaverka).vysledky).toHaveLength(20);
  });

  test('neexistující firma → 404, neplatný rok nebo měsíc → 400', async () => {
    expect((await api.post('/firmy/neni/uzaverka/2026/10')).body).toEqual({ chyba: 'NENALEZENO' });
    const f = await demo();
    for (const cesta of ['2026/13', '2026/0', 'abc/10']) {
      const r = await api.post(`/firmy/${f}/uzaverka/${cesta}`);
      expect(r.status, cesta).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
  });

  test('snímky uzavřeného čtvrtletí dají průměrný výdělek dalšího čtvrtletí (zdroj „z uzávěrek")', async () => {
    const f = (await api.post('/firmy', firmaVstup())).body.id as string;
    const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body.id as string; // 150 Kč/h
    for (const mesic of [7, 8, 9]) {
      const pracovni = dnyMesice(2026, mesic).filter((d) => denVTydnu(d) <= 5 && !jeSvatek(d));
      await api.put('/dny', { zamestnanecId: z, dny: pracovni.map((d) => praceDen(d)) });
      expect((await api.post(`/firmy/${f}/uzaverka/2026/${mesic}`)).status).toBe(201);
    }
    const rijen = (await api.get(`/firmy/${f}/mesic/2026/10`)).body as MesicData;
    const pv = vyresPrumernyVydelek({
      zamestnanecId: z, rok: 2026, mesic: 10, vstupy: rijen.vstupy,
      uzaverkyPredchozihoCtvrtleti: rijen.uzaverkyPredchozihoCtvrtleti, minHodHal: 13440,
    });
    expect(pv).toEqual({ pvHal: 15000, zdroj: 'Z_UZAVEREK' });
  });
});

describe('DELETE /firmy/:id/uzaverka/:rok/:mesic', () => {
  test('neuzavřený měsíc → 204 (nic se neděje), neexistující firma → 404', async () => {
    const f = await demo();
    expect((await api.del(`/firmy/${f}/uzaverka/2026/9`)).status).toBe(204);
    expect((await api.del('/firmy/neni/uzaverka/2026/9')).body).toEqual({ chyba: 'NENALEZENO' });
    expect((await api.del(`/firmy/${f}/uzaverka/2026/13`)).status).toBe(400);
  });

  test('otevře jen svůj měsíc a svou firmu', async () => {
    const a = await demo();
    const b = await demo();
    for (const [f, m] of [[a, 9], [a, 10], [b, 10]] as const) expect((await api.post(`/firmy/${f}/uzaverka/2026/${m}`)).status).toBe(201);
    expect((await api.del(`/firmy/${a}/uzaverka/2026/10`)).status).toBe(204);
    expect((await api.get(`/firmy/${a}/mesic/2026/9`)).body.uzaverka).not.toBeNull();
    expect((await api.get(`/firmy/${a}/mesic/2026/10`)).body.uzaverka).toBeNull();
    expect((await api.get(`/firmy/${b}/mesic/2026/10`)).body.uzaverka).not.toBeNull();
  });
});

describe('GET /firmy/:id/uzaverky?rok=', () => {
  test('vrátí uzávěrky firmy v daném roce seřazené podle měsíce', async () => {
    const f = await demo();
    const jina = await demo();
    for (const [rok, mesic] of [[2026, 11], [2026, 2], [2025, 12], [2027, 1]] as const) {
      expect((await api.post(`/firmy/${f}/uzaverka/${rok}/${mesic}`)).status).toBe(201);
    }
    expect((await api.post(`/firmy/${jina}/uzaverka/2026/5`)).status).toBe(201);

    const r = await api.get(`/firmy/${f}/uzaverky?rok=2026`);
    expect(r.status).toBe(200);
    expect((r.body as Uzaverka[]).map((u) => [u.firmaId, u.rok, u.mesic])).toEqual([[f, 2026, 2], [f, 2026, 11]]);
    expect((r.body as Uzaverka[])[0]!.vysledky).toHaveLength(4);
    expect((await api.get(`/firmy/${f}/uzaverky?rok=2024`)).body).toEqual([]);
  });

  test('chybějící nebo neplatný rok → 400, neexistující firma → 404', async () => {
    const f = await demo();
    for (const dotaz of ['', '?rok=', '?rok=abc', '?rok=26', '?rok=1999']) {
      const r = await api.get(`/firmy/${f}/uzaverky${dotaz}`);
      expect(r.status, dotaz).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
    expect((await api.get('/firmy/neni/uzaverky?rok=2026')).body).toEqual({ chyba: 'NENALEZENO' });
  });
});
