import { eq } from 'drizzle-orm';
import { db } from '../db/klient';
import { planSmeny } from '../db/schema';
import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, sablonaVstup, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
let firmaId: string;
let zamestnanecId: string;
beforeAll(async () => {
  t = await vytvorTestovaciApp();
  api = klient(t.fetchApi);
  firmaId = (await api.post('/firmy', firmaVstup())).body.id;
  zamestnanecId = (await api.post('/zamestnanci', zamestnanecVstup(firmaId))).body.id;
});
afterAll(async () => { await t.zavri(); });

const planRadky = () => db(t.env).select().from(planSmeny).where(eq(planSmeny.zamestnanecId, zamestnanecId));

describe('šablony směn', () => {
  test('vytvoření (201), seznam, úprava a smazání (204)', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Šablony' }))).body.id;
    const vytvorena = await api.post('/sablony', sablonaVstup(f, { barva: '#2B3FBF' }));
    expect(vytvorena.status).toBe(201);
    expect(vytvorena.body).toMatchObject({ firmaId: f, nazev: 'Ranní', zacatek: '08:00', konec: '16:30', prestavkaMin: 30, barva: '#2B3FBF' });
    expect(vytvorena.body.id).toMatch(/^[0-9a-f-]{36}$/);
    await api.post('/sablony', sablonaVstup(firmaId, { nazev: 'Cizí firma' }));

    const seznam = await api.get(`/firmy/${f}/sablony`);
    expect(seznam.status).toBe(200);
    expect(seznam.body).toEqual([vytvorena.body]);

    const upravena = await api.put(`/sablony/${vytvorena.body.id}`, sablonaVstup(f, { nazev: 'Odpolední', zacatek: '12:00', konec: '20:00', barva: null }));
    expect(upravena.status).toBe(200);
    expect(upravena.body).toEqual({ id: vytvorena.body.id, firmaId: f, nazev: 'Odpolední', zacatek: '12:00', konec: '20:00', prestavkaMin: 30, barva: null });
    expect((await api.get(`/firmy/${f}/sablony`)).body).toEqual([upravena.body]);

    expect((await api.del(`/sablony/${vytvorena.body.id}`)).status).toBe(204);
    expect((await api.get(`/firmy/${f}/sablony`)).body).toEqual([]);
  });

  test('smazání šablony ji odebere ze střídání lidí firmy (pořadí zůstane) i z šablon plánovače; uložení člověka pak projde', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nazev: 'Mazání šablony' }))).body.id;
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(async (nazev) => (await api.post('/sablony', sablonaVstup(f, { nazev }))).body.id as string));
    const jina = (await api.post('/firmy', firmaVstup({ nazev: 'Jiná firma' }))).body.id;
    const cizi = (await api.post('/sablony', sablonaVstup(jina))).body.id as string;
    const pepa = (await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Pepa', rolePlanu: 'KASA', stridaniSmen: [a, b, c, b] }))).body.id;
    const bez = (await api.post('/zamestnanci', zamestnanecVstup(f, { prijmeni: 'Bez', stridaniSmen: [c] }))).body.id;
    const ciziClovek = (await api.post('/zamestnanci', zamestnanecVstup(jina, { stridaniSmen: [cizi] }))).body.id;
    expect((await api.put(`/firmy/${f}`, { nazev: 'Mazání šablony', nastaveni: { planovacSablony: [b, a, c] } })).status).toBe(200);
    expect((await api.put(`/firmy/${jina}`, { nazev: 'Jiná firma', nastaveni: { planovacSablony: [cizi] } })).status).toBe(200);

    expect((await api.del(`/sablony/${b}`)).status).toBe(204);

    const lide = (await api.get(`/firmy/${f}/zamestnanci`)).body as { id: string; stridaniSmen: string[] }[];
    expect(lide.find((z) => z.id === pepa)?.stridaniSmen).toEqual([a, c]);
    expect(lide.find((z) => z.id === bez)?.stridaniSmen).toEqual([c]);
    const firmy = (await api.get('/firmy')).body as { id: string; nastaveni: { planovacSablony: string[] } }[];
    expect(firmy.find((x) => x.id === f)?.nastaveni.planovacSablony).toEqual([a, c]);
    expect(firmy.find((x) => x.id === jina)?.nastaveni.planovacSablony).toEqual([cizi]);
    expect((await api.get(`/firmy/${jina}/zamestnanci`)).body.find((z: { id: string }) => z.id === ciziClovek).stridaniSmen).toEqual([cizi]);

    // Appka posílá člověka tak, jak ho načetla (i se střídáním); bez nových polí musí uložení projít.
    const { id: _id, aktivni: _aktivni, sazby, ...ulozeny } = lide.find((z) => z.id === pepa) as unknown as Record<string, unknown> & { sazby: { platiOd: string; hodinovaHal: number }[] };
    const r = await api.put(`/zamestnanci/${pepa}`, { ...ulozeny, sazby: sazby.map(({ platiOd, hodinovaHal }) => ({ platiOd, hodinovaHal })) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.stridaniSmen).toEqual([a, c]);
  });

  test('neplatný vstup → 400 NEPLATNY_VSTUP', async () => {
    for (const telo of [
      sablonaVstup(firmaId, { zacatek: '25:00' }), sablonaVstup(firmaId, { konec: '8:00' }), sablonaVstup(firmaId, { zacatek: 'ráno' }),
      sablonaVstup(firmaId, { nazev: '' }), sablonaVstup(firmaId, { prestavkaMin: -1 }), sablonaVstup(firmaId, { prestavkaMin: 30.5 }),
    ]) {
      const r = await api.post('/sablony', telo);
      expect(r.status, JSON.stringify(telo)).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
  });

  test('neexistující firma nebo šablona → 404 NENALEZENO', async () => {
    expect((await api.get('/firmy/neni/sablony')).status).toBe(404);
    expect((await api.post('/sablony', sablonaVstup('neni'))).body).toEqual({ chyba: 'NENALEZENO' });
    expect((await api.put('/sablony/neni', sablonaVstup(firmaId))).status).toBe(404);
    expect((await api.del('/sablony/neni')).status).toBe(404);
  });

  test('šablonu nejde úpravou přesunout do jiné firmy', async () => {
    const s = (await api.post('/sablony', sablonaVstup(firmaId))).body;
    const jina = (await api.post('/firmy', firmaVstup({ nazev: 'Jiná' }))).body.id;
    expect((await api.put(`/sablony/${s.id}`, sablonaVstup(jina))).status).toBe(400);
  });
});

describe('PUT /plan', () => {
  test('upsert přepíše existující den a smazat ho odstraní', async () => {
    const s = (await api.post('/sablony', sablonaVstup(firmaId))).body;
    const r1 = await api.put('/plan', { zamestnanecId, polozky: [
      { datum: '2026-10-05', typ: 'SMENA', sablonaId: s.id, minuty: 480 },
      { datum: '2026-10-06', typ: 'SMENA', sablonaId: s.id, minuty: 480 },
      { datum: '2026-10-07', typ: 'VOLNO', sablonaId: null, minuty: 0 },
    ] });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ ok: true });

    const r2 = await api.put('/plan', { zamestnanecId, polozky: [{ datum: '2026-10-05', typ: 'DOVOLENA', sablonaId: null, minuty: 480 }], smazat: ['2026-10-06'] });
    expect(r2.status).toBe(200);
    const radky = (await planRadky()).sort((a, b) => a.datum.localeCompare(b.datum));
    expect(radky.map((x) => [x.datum, x.typ, x.sablonaId, x.minuty])).toEqual([
      ['2026-10-05', 'DOVOLENA', null, 480],
      ['2026-10-07', 'VOLNO', null, 0],
    ]);
  });

  test('400 položek + 400 dat ke smazání projde v rozpočtu D1 (27 příkazů ≤ 50)', async () => {
    const s = (await api.post('/sablony', sablonaVstup(firmaId))).body;
    const datumy = (od: string, pocet: number) => Array.from({ length: pocet }, (_, i) => new Date(Date.parse(`${od}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
    const stare = datumy('2028-01-01', 400);
    const nove = datumy('2029-03-01', 400);
    expect((await api.put('/plan', { zamestnanecId, polozky: stare.map((datum) => ({ datum, typ: 'VOLNO', sablonaId: null, minuty: 0 })) })).status).toBe(200);

    let r!: Awaited<ReturnType<typeof api.put>>;
    const pocet = await t.prikazy(async () => {
      r = await api.put('/plan', { zamestnanecId, polozky: nove.map((datum, i) => ({ datum, typ: 'SMENA', sablonaId: i % 2 === 0 ? s.id : null, minuty: 300 + i })), smazat: stare });
    });
    expect(r.status).toBe(200);
    expect(pocet).toBe(27); // zaměstnanec + šablony firmy + 5× DELETE (99 dat) + 20× INSERT (20 položek)
    const radky = (await planRadky()).filter((x) => x.datum >= '2028-01-01').sort((a, b) => a.datum.localeCompare(b.datum));
    expect(radky.map((x) => x.datum)).toEqual(nove);
    expect(radky[0]).toMatchObject({ typ: 'SMENA', sablonaId: s.id, minuty: 300 });
    expect(radky[399]).toMatchObject({ typ: 'SMENA', sablonaId: null, minuty: 699 });
  });

  test('typ NEMOC se uloží', async () => {
    const r = await api.put('/plan', { zamestnanecId, polozky: [{ datum: '2026-10-19', typ: 'NEMOC', sablonaId: null, minuty: 240 }] });
    expect(r.status).toBe(200);
    expect((await planRadky()).find((p) => p.datum === '2026-10-19')).toMatchObject({ typ: 'NEMOC', minuty: 240 });
  });

  test('smazání šablony zruší jen odkaz v plánu', async () => {
    const s = (await api.post('/sablony', sablonaVstup(firmaId))).body;
    await api.put('/plan', { zamestnanecId, polozky: [{ datum: '2026-11-02', typ: 'SMENA', sablonaId: s.id, minuty: 480 }] });
    await api.del(`/sablony/${s.id}`);
    const radek = (await planRadky()).find((x) => x.datum === '2026-11-02');
    expect(radek).toMatchObject({ typ: 'SMENA', sablonaId: null, minuty: 480 });
  });

  test('neplatný vstup → 400, neexistující zaměstnanec nebo šablona → 404', async () => {
    const polozka = { datum: '2026-10-05', typ: 'SMENA', sablonaId: null, minuty: 480 };
    for (const polozky of [[{ ...polozka, typ: 'JINE' }], [{ ...polozka, minuty: 1441 }], [{ ...polozka, minuty: 7.5 }], [{ ...polozka, datum: '2026-02-30' }]]) {
      const r = await api.put('/plan', { zamestnanecId, polozky });
      expect(r.status, JSON.stringify(polozky)).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
    expect((await api.put('/plan', { zamestnanecId: 'neni', polozky: [polozka] })).status).toBe(404);
    expect((await api.put('/plan', { zamestnanecId, polozky: [{ ...polozka, sablonaId: 'neni' }] })).body).toEqual({ chyba: 'NENALEZENO' });
  });

  test('šablona jiné firmy se nepřijme', async () => {
    const jina = (await api.post('/firmy', firmaVstup({ nazev: 'Jiná' }))).body.id;
    const cizi = (await api.post('/sablony', sablonaVstup(jina))).body;
    const r = await api.put('/plan', { zamestnanecId, polozky: [{ datum: '2026-10-05', typ: 'SMENA', sablonaId: cizi.id, minuty: 480 }] });
    expect(r.status).toBe(404);
  });
});
