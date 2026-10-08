import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/klient';
import { den, uzaverka } from '../db/schema';
import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, sablonaVstup, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

const zalozFirmu = async (nazev = 'Převod') => (await api.post('/firmy', firmaVstup({ nazev }))).body.id as string;
const zalozZam = async (firmaId: string, prepis = {}) => (await api.post('/zamestnanci', zamestnanecVstup(firmaId, prepis))).body.id as string;
const naplanuj = (zamestnanecId: string, polozky: { datum: string; typ: string; sablonaId?: string | null; minuty: number }[]) =>
  api.put('/plan', { zamestnanecId, polozky: polozky.map((p) => ({ sablonaId: null, ...p })) });
const dnyLidi = async (ids: string[]) =>
  (await db(t.env).select().from(den).where(inArray(den.zamestnanecId, ids))).sort((a, b) => a.zamestnanecId.localeCompare(b.zamestnanecId) || a.datum.localeCompare(b.datum));
const prevest = (firmaId: string, rok = 2026, mesic = 10) => api.post(`/firmy/${firmaId}/plan/${rok}/${mesic}/prevest`);

test('vytvoří dny podle plánu, existující den nepřepíše a druhé volání už nic nevytvoří', async () => {
  const f = await zalozFirmu();
  const hpp = await zalozZam(f, { prijmeni: 'Hppová' });
  const dpp = await zalozZam(f, { prijmeni: 'Dppová', smlouva: 'DPP', uvazekMinTydne: 0 });
  const s = (await api.post('/sablony', sablonaVstup(f))).body.id as string;
  await naplanuj(hpp, [
    { datum: '2026-10-05', typ: 'SMENA', sablonaId: s, minuty: 480 },
    { datum: '2026-10-06', typ: 'SMENA', sablonaId: s, minuty: 450 },
    { datum: '2026-10-07', typ: 'VOLNO', minuty: 0 },
    { datum: '2026-10-08', typ: 'DOVOLENA', minuty: 480 },
    { datum: '2026-10-28', typ: 'ZAVRENO', sablonaId: s, minuty: 480 },
    { datum: '2026-11-02', typ: 'SMENA', minuty: 480 }, // jiný měsíc
  ]);
  await naplanuj(dpp, [
    { datum: '2026-10-10', typ: 'SMENA', minuty: 360 },
    { datum: '2026-10-28', typ: 'ZAVRENO', minuty: 360 },
  ]);
  // Ruční záznam v docházce má přednost před plánem.
  await api.put('/dny', { zamestnanecId: hpp, dny: [{ datum: '2026-10-06', typ: 'NEMOC', minuty: 0, kasa: false, poznamka: 'Neschopenka' }] });

  const r = await prevest(f);
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ vytvoreno: 4, preskoceno: 1, preskocenoDpp: 1, mimoPomer: 0 });

  const radek = (zamestnanecId: string, datum: string, typ: string, minuty: number, poznamka: string | null = null) =>
    ({ zamestnanecId, datum, typ, minuty, kasa: false, poznamka });
  const ocekavane = [
    radek(dpp, '2026-10-10', 'PRACE', 360),
    radek(hpp, '2026-10-05', 'PRACE', 480),
    radek(hpp, '2026-10-06', 'NEMOC', 0, 'Neschopenka'),
    radek(hpp, '2026-10-08', 'DOVOLENA', 480),
    radek(hpp, '2026-10-28', 'SVATEK_ZAVRENO', 480),
  ].sort((a, b) => a.zamestnanecId.localeCompare(b.zamestnanecId) || a.datum.localeCompare(b.datum));
  expect(await dnyLidi([hpp, dpp])).toEqual(ocekavane);

  const znovu = await prevest(f);
  expect(znovu.status).toBe(200);
  expect(znovu.body).toEqual({ vytvoreno: 0, preskoceno: 5, preskocenoDpp: 1, mimoPomer: 0 });
  expect(await dnyLidi([hpp, dpp])).toEqual(ocekavane);
});

test('plán před nástupem a po ukončení se nepřevede; jiná firma zůstane netknutá', async () => {
  const f = await zalozFirmu();
  const z = await zalozZam(f, { nastup: '2026-10-12', ukonceni: '2026-10-20', sazby: [{ platiOd: '2026-10-12', hodinovaHal: 15000 }] });
  await naplanuj(z, ['2026-10-09', '2026-10-12', '2026-10-20', '2026-10-21'].map((datum) => ({ datum, typ: 'SMENA', minuty: 480 })));
  const jina = await zalozFirmu('Jiná');
  const cizi = await zalozZam(jina);
  await naplanuj(cizi, [{ datum: '2026-10-12', typ: 'SMENA', minuty: 480 }]);

  const r = await prevest(f);
  expect(r.body).toEqual({ vytvoreno: 2, preskoceno: 0, preskocenoDpp: 0, mimoPomer: 2 });
  expect((await dnyLidi([z])).map((d) => d.datum)).toEqual(['2026-10-12', '2026-10-20']);
  expect(await dnyLidi([cizi])).toEqual([]);
});

test('uzavřený měsíc → 409 MESIC_UZAVREN a nic se nezapíše', async () => {
  const f = await zalozFirmu();
  const z = await zalozZam(f);
  await naplanuj(z, [{ datum: '2026-10-05', typ: 'SMENA', minuty: 480 }]);
  await db(t.env).insert(uzaverka).values({ firmaId: f, rok: 2026, mesic: 10, uzavreno: '2026-11-05T10:00:00.000Z', vysledky: [] });

  const r = await prevest(f);
  expect(r.status).toBe(409);
  expect(r.body).toEqual({ chyba: 'MESIC_UZAVREN' });
  expect(await dnyLidi([z])).toEqual([]);
  // Uzávěrka jiného měsíce převod nebrání.
  await naplanuj(z, [{ datum: '2026-11-02', typ: 'SMENA', minuty: 480 }]);
  expect((await prevest(f, 2026, 11)).body).toMatchObject({ vytvoreno: 1 });
});

test('neexistující firma → 404, neplatný měsíc → 400', async () => {
  expect((await prevest('neni')).body).toEqual({ chyba: 'NENALEZENO' });
  expect((await prevest('neni')).status).toBe(404);
  const f = await zalozFirmu();
  for (const cesta of [`/firmy/${f}/plan/2026/13/prevest`, `/firmy/${f}/plan/26/10/prevest`]) {
    const r = await api.post(cesta);
    expect(r.status, cesta).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
  }
});

test('20 lidí × 31 dní (620 dní) se vejde do rozpočtu D1: 30 příkazů ≤ 50', async () => {
  const f = await zalozFirmu('Velká');
  const lide: string[] = [];
  for (let i = 0; i < 20; i++) lide.push(await zalozZam(f, { prijmeni: `Člověk ${i}` }));
  const datumy = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  for (const z of lide) expect((await naplanuj(z, datumy.map((datum) => ({ datum, typ: 'SMENA', minuty: 480 })))).status).toBe(200);

  let r!: Awaited<ReturnType<typeof api.post>>;
  const pocet = await t.prikazy(async () => { r = await prevest(f); });
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ vytvoreno: 620, preskoceno: 0, preskocenoDpp: 0, mimoPomer: 0 });
  expect(pocet).toBe(30); // dávka 5 čtení + 25× INSERT po 25 dnech
  const vytvorene = await db(t.env).select({ datum: den.datum }).from(den).where(eq(den.zamestnanecId, lide[19]!));
  expect(vytvorene).toHaveLength(31);
});
