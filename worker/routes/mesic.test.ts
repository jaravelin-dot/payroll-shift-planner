import { and, eq } from 'drizzle-orm';
import { VYCHOZI_NASTAVENI } from '../../src/shared/api';
import { db } from '../db/klient';
import { den, mesicniVstup, uzaverka } from '../db/schema';
import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, sablonaVstup, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

const zalozFirmu = async (nazev = 'Měsíc') => (await api.post('/firmy', firmaVstup({ nazev }))).body.id as string;
const zalozZam = async (firmaId: string, prepis = {}) => (await api.post('/zamestnanci', zamestnanecVstup(firmaId, prepis))).body.id as string;
const praceDen = (datum: string, minuty = 480, kasa = false) => ({ datum, typ: 'PRACE' as const, minuty, kasa, poznamka: null });
const uzavri = (firmaId: string, rok: number, mesic: number) =>
  db(t.env).insert(uzaverka).values({ firmaId, rok, mesic, uzavreno: '2026-11-05T10:00:00.000Z', vysledky: [] });
const dnyZaloha = async (zamestnanecId: string) =>
  (await db(t.env).select().from(den).where(eq(den.zamestnanecId, zamestnanecId))).sort((a, b) => a.datum.localeCompare(b.datum));

describe('PUT /dny', () => {
  test('upsert přepíše existující den a smazat ho odstraní', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const r1 = await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-10-01'), praceDen('2026-10-02'), praceDen('2026-10-05')] });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ ok: true });

    const r2 = await api.put('/dny', {
      zamestnanecId: z,
      dny: [{ datum: '2026-10-01', typ: 'DOVOLENA', minuty: 360, kasa: false, poznamka: 'Lékař' }],
      smazat: ['2026-10-02'],
    });
    expect(r2.status).toBe(200);
    const dny = await dnyZaloha(z);
    expect(dny.map((d) => d.datum)).toEqual(['2026-10-01', '2026-10-05']);
    expect(dny[0]).toMatchObject({ typ: 'DOVOLENA', minuty: 360, kasa: false, poznamka: 'Lékař' });
  });

  test('minuty 0–1440, jiné hodnoty, neznámý typ a neplatné datum → 400', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const ok = await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-10-01', 0), praceDen('2026-10-02', 1440), praceDen('2026-10-03', 7)] });
    expect(ok.status).toBe(200);
    for (const dny of [[praceDen('2026-10-01', 1441)], [praceDen('2026-10-01', -1)], [praceDen('2026-10-01', 7.5)], [{ ...praceDen('2026-10-01'), typ: 'JINE' }], [praceDen('2026-13-01')]]) {
      const r = await api.put('/dny', { zamestnanecId: z, dny });
      expect(r.status, JSON.stringify(dny)).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
    expect((await api.put('/dny', { zamestnanecId: z, dny: [], smazat: ['neni-datum'] })).status).toBe(400);
  });

  test('neexistující zaměstnanec → 404', async () => {
    const r = await api.put('/dny', { zamestnanecId: 'neni', dny: [praceDen('2026-10-01')] });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ chyba: 'NENALEZENO' });
  });

  test('uzavřený měsíc → 409 MESIC_UZAVREN pro zápis i smazání, nic se nezapíše', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-09-10')] });
    await uzavri(f, 2026, 9);

    const zapis = await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-10-01'), praceDen('2026-09-11')] });
    expect(zapis.status).toBe(409);
    expect(zapis.body.chyba).toBe('MESIC_UZAVREN');
    const smazani = await api.put('/dny', { zamestnanecId: z, dny: [], smazat: ['2026-09-10'] });
    expect(smazani.status).toBe(409);

    expect((await dnyZaloha(z)).map((d) => d.datum)).toEqual(['2026-09-10']);
    const otevreny = await api.put('/dny', { zamestnanecId: z, dny: [praceDen('2026-10-01')] });
    expect(otevreny.status).toBe(200);
  });

  // 400 různých dat (od 2026-01-01 a od 2027-03-01), aby zápis přesahoval přes mnoho měsíců.
  const datumy = (od: string, pocet: number) => Array.from({ length: pocet }, (_, i) => new Date(Date.parse(`${od}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));

  test('400 dní + 400 dat ke smazání projde v rozpočtu D1 (32 příkazů ≤ 50)', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const stare = datumy('2026-01-01', 400);
    const nove = datumy('2027-03-01', 400);
    expect((await api.put('/dny', { zamestnanecId: z, dny: stare.map((d) => praceDen(d)) })).status).toBe(200);
    expect(await dnyZaloha(z)).toHaveLength(400);

    let r!: Awaited<ReturnType<typeof api.put>>;
    const pocet = await t.prikazy(async () => { r = await api.put('/dny', { zamestnanecId: z, dny: nove.map((d, i) => praceDen(d, 100 + i, i % 2 === 0)), smazat: stare }); });
    expect(r.status).toBe(200);
    expect(pocet).toBe(32); // zaměstnanec + uzávěrky + 5× DELETE (99 dat) + 25× INSERT (16 dní)
    const dny = await dnyZaloha(z);
    expect(dny.map((d) => d.datum)).toEqual(nove);
    expect(dny[399]).toMatchObject({ minuty: 499, kasa: false, typ: 'PRACE', poznamka: null });
    expect(dny[0]).toMatchObject({ minuty: 100, kasa: true });
  });

  test('400 dní bez smazání přepíše existující dny (upsert po blocích), poslední výskyt data vyhrává', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const data = datumy('2026-05-01', 400);
    await api.put('/dny', { zamestnanecId: z, dny: data.map((d) => praceDen(d, 60)) });
    // stejné datum dvakrát v jednom bloku (data[3] na indexech 3 a 4) i v různých blocích (data[5] na indexech 5 a 399)
    const dny = data.map((d, i) => praceDen(d, 200 + i));
    dny[4] = praceDen(data[3]!, 111);
    dny[399] = praceDen(data[5]!, 222);
    const r = await api.put('/dny', { zamestnanecId: z, dny });
    expect(r.status).toBe(200);
    const ulozene = await dnyZaloha(z);
    expect(ulozene).toHaveLength(400);
    expect(ulozene[3]!.minuty).toBe(111);
    expect(ulozene[5]!.minuty).toBe(222);
    expect(ulozene[10]!.minuty).toBe(210);
    expect(ulozene[4]!.minuty).toBe(60); // datum, které v druhém volání už nebylo (index 4 přepsán), zůstává z prvního
    expect(ulozene[399]!.minuty).toBe(60);
  });

  test('400 dní do uzavřeného měsíce → 409 a nic se nezapíše', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    await uzavri(f, 2026, 6);
    const r = await api.put('/dny', { zamestnanecId: z, dny: datumy('2026-01-01', 400).map((d) => praceDen(d)) });
    expect(r.status).toBe(409);
    expect(await dnyZaloha(z)).toHaveLength(0);
  });

  test('uzávěrka jiné firmy zápis neblokuje', async () => {
    const f1 = await zalozFirmu('Uzavřená');
    const f2 = await zalozFirmu('Otevřená');
    const z2 = await zalozZam(f2);
    await uzavri(f1, 2026, 10);
    expect((await api.put('/dny', { zamestnanecId: z2, dny: [praceDen('2026-10-01')] })).status).toBe(200);
  });
});

describe('PUT /vstupy', () => {
  const vstup = (zamestnanecId: string, prepis = {}) => ({
    zamestnanecId, rok: 2026, mesic: 10, odmenaZaDenHal: 18000, aktivitaHal: 9000, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null, ...prepis,
  });

  test('vytvoří a při opakování přepíše měsíční vstup', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const r1 = await api.put('/vstupy', vstup(z));
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual(vstup(z));
    const r2 = await api.put('/vstupy', vstup(z, { odmenaZaDenHal: 13000, prumernyVydelekHal: 18950, poznamka: 'Ručně' }));
    expect(r2.body).toEqual(vstup(z, { odmenaZaDenHal: 13000, prumernyVydelekHal: 18950, poznamka: 'Ručně' }));
    const radky = await db(t.env).select().from(mesicniVstup).where(eq(mesicniVstup.zamestnanecId, z));
    expect(radky).toHaveLength(1);
    expect(radky[0]!.odmenaZaDenHal).toBe(13000);
  });

  test('neplatný vstup → 400, neexistující zaměstnanec → 404', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    for (const telo of [vstup(z, { mesic: 13 }), vstup(z, { mesic: 0 }), vstup(z, { rok: 26 }), vstup(z, { srazkyHal: -5 }), vstup(z, { jineOdmenyHal: 1.5 })]) {
      const r = await api.put('/vstupy', telo);
      expect(r.status, JSON.stringify(telo)).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
    expect((await api.put('/vstupy', vstup('neni'))).status).toBe(404);
  });

  test('uzavřený měsíc → 409 MESIC_UZAVREN', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    await uzavri(f, 2026, 10);
    const r = await api.put('/vstupy', vstup(z));
    expect(r.status).toBe(409);
    expect(r.body.chyba).toBe('MESIC_UZAVREN');
    expect((await api.put('/vstupy', vstup(z, { mesic: 11 }))).status).toBe(200);
    const radky = await db(t.env).select().from(mesicniVstup).where(and(eq(mesicniVstup.zamestnanecId, z), eq(mesicniVstup.mesic, 10)));
    expect(radky).toHaveLength(0);
  });
});

describe('PUT /dovolena', () => {
  test('vytvoří a při opakování přepíše zůstatek dovolené', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const r1 = await api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin: 480, narokNavicMin: 0 });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ zamestnanecId: z, rok: 2026, prevodMin: 480, narokNavicMin: 0 });
    const r2 = await api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin: 960, narokNavicMin: 480 });
    expect(r2.body).toEqual({ zamestnanecId: z, rok: 2026, prevodMin: 960, narokNavicMin: 480 });
    const mesic = (await api.get(`/firmy/${f}/mesic/2026/10`)).body;
    expect(mesic.zustatky).toEqual([r2.body]);
  });

  test('neplatný vstup → 400, neexistující zaměstnanec → 404', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    expect((await api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin: 1.5, narokNavicMin: 0 })).status).toBe(400);
    expect((await api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin: 0, narokNavicMin: -60 })).status).toBe(400);
    expect((await api.put('/dovolena', { zamestnanecId: 'neni', rok: 2026, prevodMin: 0, narokNavicMin: 0 })).status).toBe(404);
  });
});

describe('GET /firmy/:id/mesic/:rok/:mesic', () => {
  test('vrací dny předchozího měsíce, ne ale starší, a dppMinutyPredMesicem z celého roku', async () => {
    const f = await zalozFirmu();
    const dpp = await zalozZam(f, { smlouva: 'DPP', uvazekMinTydne: 0, prijmeni: 'Dpp' });
    const hpp = await zalozZam(f, { prijmeni: 'Hpp' });
    await api.put('/dny', { zamestnanecId: dpp, dny: [praceDen('2026-03-02', 360), praceDen('2026-09-30', 60), praceDen('2026-10-01', 240)] });
    await api.put('/dny', { zamestnanecId: dpp, dny: [{ datum: '2026-04-01', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }, praceDen('2025-12-31', 999)] });
    await api.put('/dny', { zamestnanecId: hpp, dny: [praceDen('2026-03-02', 480), praceDen('2026-08-31', 480)] });

    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.status).toBe(200);
    // 2026-03-02 (360) + 2026-09-30 (60) = 420; 2026-10-01 už je v tomto měsíci, DOVOLENA a rok 2025 se nepočítají.
    expect(r.body.dppMinutyPredMesicem).toEqual({ [dpp]: 420 });
    const dnyDpp = r.body.dny.filter((d: { zamestnanecId: string }) => d.zamestnanecId === dpp).map((d: { datum: string }) => d.datum).sort();
    expect(dnyDpp).toEqual(['2026-09-30', '2026-10-01']);
    expect(r.body.dny.filter((d: { zamestnanecId: string }) => d.zamestnanecId === hpp)).toHaveLength(0);
  });

  test('DPP: 2026-03-02 PRACE 6 h a 2026-10-01 PRACE 4 h → pro říjen 360', async () => {
    const f = await zalozFirmu();
    const dpp = await zalozZam(f, { smlouva: 'DPP', uvazekMinTydne: 0 });
    await api.put('/dny', { zamestnanecId: dpp, dny: [praceDen('2026-03-02', 360), praceDen('2026-10-01', 240)] });
    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.body.dppMinutyPredMesicem).toEqual({ [dpp]: 360 });
  });

  test('v lednu je dppMinutyPredMesicem 0 (předchozí měsíc je v jiném roce)', async () => {
    const f = await zalozFirmu();
    const dpp = await zalozZam(f, { smlouva: 'DPP', uvazekMinTydne: 0 });
    await api.put('/dny', { zamestnanecId: dpp, dny: [praceDen('2025-12-30', 600), praceDen('2026-01-02', 120)] });
    const r = await api.get(`/firmy/${f}/mesic/2026/1`);
    expect(r.body.dppMinutyPredMesicem).toEqual({ [dpp]: 0 });
    expect(r.body.dny.map((d: { datum: string }) => d.datum).sort()).toEqual(['2025-12-30', '2026-01-02']);
  });

  test('dovolenaRok sčítá DOVOLENA a PRACE za celý rok', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const prazdny = await zalozZam(f, { prijmeni: 'Prázdný' });
    await api.put('/dny', {
      zamestnanecId: z,
      dny: [
        praceDen('2026-02-02', 480), praceDen('2026-10-05', 300), praceDen('2026-12-01', 120), praceDen('2025-12-31', 480),
        { datum: '2026-07-01', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null },
        { datum: '2026-10-06', typ: 'DOVOLENA', minuty: 240, kasa: false, poznamka: null },
        { datum: '2026-10-07', typ: 'NEMOC', minuty: 480, kasa: false, poznamka: null },
      ],
    });
    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.body.dovolenaRok[z]).toEqual({ cerpanoMin: 720, praceMin: 900 });
    expect(r.body.dovolenaRok[prazdny]).toEqual({ cerpanoMin: 0, praceMin: 0 });
  });

  test('zaměstnanci jen aktivní v měsíci (nástup ≤ konec, ukončení ≥ začátek nebo null)', async () => {
    const f = await zalozFirmu();
    const bezKonce = await zalozZam(f, { prijmeni: 'A' });
    const konciPrvniho = await zalozZam(f, { prijmeni: 'B', ukonceni: '2026-10-01' });
    const nastupujePosledniho = await zalozZam(f, { prijmeni: 'C', nastup: '2026-10-31' });
    await zalozZam(f, { prijmeni: 'D', ukonceni: '2026-09-30' });
    await zalozZam(f, { prijmeni: 'E', nastup: '2026-11-01' });
    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.body.zamestnanci.map((x: { id: string }) => x.id).sort()).toEqual([bezKonce, konciPrvniho, nastupujePosledniho].sort());
    expect(r.body.zamestnanci[0].sazby).toHaveLength(1);
  });

  test('vstupy všech měsíců čtvrtletí, uzávěrky tohoto měsíce a předchozího čtvrtletí, zůstatky jen daného roku', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const vstup = (rok: number, mesic: number) => ({ zamestnanecId: z, rok, mesic, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null });
    for (const [rok, mesic] of [[2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1]]) await api.put('/vstupy', vstup(rok!, mesic!));
    for (const [rok, mesic] of [[2026, 6], [2026, 7], [2026, 8], [2026, 10]]) await uzavri(f, rok!, mesic!);
    await api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin: 480, narokNavicMin: 0 });
    await api.put('/dovolena', { zamestnanecId: z, rok: 2025, prevodMin: 960, narokNavicMin: 0 });

    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.body.vstupy.map((v: { mesic: number }) => v.mesic).sort((a: number, b: number) => a - b)).toEqual([10, 11, 12]);
    expect(r.body.vstupy.every((v: { rok: number }) => v.rok === 2026)).toBe(true);
    expect(r.body.uzaverka).toMatchObject({ firmaId: f, rok: 2026, mesic: 10, uzavreno: '2026-11-05T10:00:00.000Z', vysledky: [] });
    expect(r.body.uzaverkyPredchozihoCtvrtleti.map((u: { mesic: number }) => u.mesic).sort((a: number, b: number) => a - b)).toEqual([7, 8]);
    expect(r.body.zustatky).toEqual([{ zamestnanecId: z, rok: 2026, prevodMin: 480, narokNavicMin: 0 }]);
  });

  test('předchozí čtvrtletí v lednu je říjen–prosinec předchozího roku', async () => {
    const f = await zalozFirmu();
    await zalozZam(f);
    for (const [rok, mesic] of [[2025, 9], [2025, 10], [2025, 12], [2026, 1]]) await uzavri(f, rok!, mesic!);
    const r = await api.get(`/firmy/${f}/mesic/2026/1`);
    expect(r.body.uzaverka.mesic).toBe(1);
    expect(r.body.uzaverkyPredchozihoCtvrtleti.map((u: { rok: number; mesic: number }) => `${u.rok}-${u.mesic}`).sort()).toEqual(['2025-10', '2025-12']);
  });

  test('bez uzávěrek je uzaverka null a seznam prázdný; plán jen daného měsíce a šablony firmy', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    const sablona = (await api.post('/sablony', sablonaVstup(f))).body;
    await api.put('/plan', { zamestnanecId: z, polozky: [
      { datum: '2026-10-05', typ: 'SMENA', sablonaId: sablona.id, minuty: 480 },
      { datum: '2026-09-30', typ: 'VOLNO', sablonaId: null, minuty: 0 },
      { datum: '2026-11-02', typ: 'VOLNO', sablonaId: null, minuty: 0 },
    ] });
    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.body.uzaverka).toBeNull();
    expect(r.body.uzaverkyPredchozihoCtvrtleti).toEqual([]);
    expect(r.body.plan).toEqual([{ zamestnanecId: z, datum: '2026-10-05', typ: 'SMENA', sablonaId: sablona.id, minuty: 480 }]);
    expect(r.body.sablony).toEqual([sablona]);
    expect(r.body.dny).toEqual([]);
    expect(r.body.vstupy).toEqual([]);
    expect(r.body.zustatky).toEqual([]);
  });

  test('čtení měsíce stojí 11 příkazů D1 (firma + dávka 10 čtení), ať je dat kolik chce', async () => {
    const f = await zalozFirmu();
    const z = await zalozZam(f);
    await api.put('/dny', { zamestnanecId: z, dny: Array.from({ length: 31 }, (_, i) => praceDen(`2026-10-${String(i + 1).padStart(2, '0')}`)) });
    let r!: Awaited<ReturnType<typeof api.get>>;
    expect(await t.prikazy(async () => { r = await api.get(`/firmy/${f}/mesic/2026/10`); })).toBe(11);
    expect(r.body.dny).toHaveLength(31);
  });

  test('firma má nastavení sloučené s výchozím; rok a měsíc v odpovědi', async () => {
    const f = (await api.post('/firmy', firmaVstup({ nastaveni: { priplatekKasaHal: 5000 } }))).body.id as string;
    const r = await api.get(`/firmy/${f}/mesic/2026/10`);
    expect(r.body).toMatchObject({ rok: 2026, mesic: 10 });
    expect(r.body.firma).toMatchObject({ id: f, nastaveni: { ...VYCHOZI_NASTAVENI, priplatekKasaHal: 5000 } });
  });

  test('neexistující firma → 404, neplatný rok nebo měsíc → 400', async () => {
    const f = await zalozFirmu();
    expect((await api.get('/firmy/neni/mesic/2026/10')).body).toEqual({ chyba: 'NENALEZENO' });
    for (const cesta of ['2026/13', '2026/0', 'abc/10', '2026/ab']) {
      const r = await api.get(`/firmy/${f}/mesic/${cesta}`);
      expect(r.status, cesta).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
  });
});
