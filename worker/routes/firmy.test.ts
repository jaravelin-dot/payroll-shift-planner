import { VYCHOZI_NASTAVENI } from '../../src/shared/api';
import { vytvorTestovaciApp } from '../test/harness';
import { firmaVstup, klient, zamestnanecVstup } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

test('vytvoření firmy vrátí 201 a nastavení sloučené s výchozím', async () => {
  const r = await api.post('/firmy', firmaVstup({ nazev: 'Prodejna A', ico: '12345678' }));
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ nazev: 'Prodejna A', ico: '12345678', adresa: null, ucet: null, nastaveni: VYCHOZI_NASTAVENI });
  expect(r.body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(new Date(r.body.vytvoreno).toISOString()).toBe(r.body.vytvoreno);
});

test('částečné nastavení se při čtení slučuje s výchozím', async () => {
  const r = await api.post('/firmy', firmaVstup({ nastaveni: { tydenniPracovniDoba: 37.5, stravneProDpp: false } }));
  expect(r.body.nastaveni).toEqual({ ...VYCHOZI_NASTAVENI, tydenniPracovniDoba: 37.5, stravneProDpp: false });
  const seznam = await api.get('/firmy');
  expect(seznam.body.find((f: { id: string }) => f.id === r.body.id).nastaveni.tydenniPracovniDoba).toBe(37.5);
});

test('nastavení plánovače: výchozí hodnoty a sloučení při úpravě', async () => {
  const f = (await api.post('/firmy', firmaVstup({ nazev: 'Planovac' }))).body;
  expect(f.nastaveni).toMatchObject({ planovacKasaOd: '08:00', planovacKasaDo: '18:00', planovacMinKasaru: 1, planovacOtevrenoOd: '08:00', planovacOtevrenoDo: '18:00', planovacSablony: [], planovacKotva: '2026-01-05' });
  const upravena = await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni: { planovacKasaOd: '09:00', planovacSablony: ['a', 'b'] } });
  expect(upravena.status).toBe(200);
  expect(upravena.body.nastaveni).toMatchObject({ planovacKasaOd: '09:00', planovacKasaDo: '18:00', planovacSablony: ['a', 'b'], stravnePausalHal: 12950 });
  expect((await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni: { planovacKasaOd: '8:00' } })).status).toBe(400);
  expect((await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni: { planovacMinKasaru: 0 } })).status).toBe(400);
});

test('nastavení plánovače: dozor na kase ráno, ranní obsazení a celodenní minimum (okno „aspoň")', async () => {
  const f = (await api.post('/firmy', firmaVstup({ nazev: 'Ranní obsazení' }))).body;
  expect(f.nastaveni).toMatchObject({ planovacDozorNaKaseDo: '10:00' });
  expect(f.nastaveni.planovacObsazeni).toEqual([{ od: '08:00', do: '09:00', lidi: 2 }, { od: '09:00', do: '18:00', lidi: 3, aspon: true }]);
  const obsazeni = [{ od: '08:00', do: '10:00', lidi: 1 }, { od: '10:00', do: '16:00', lidi: 2, aspon: true }, { od: '16:00', do: '18:00', lidi: 2, aspon: false }];
  const upravena = await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni: { planovacDozorNaKaseDo: '08:30', planovacObsazeni: obsazeni } });
  expect(upravena.status).toBe(200);
  expect(upravena.body.nastaveni).toMatchObject({ planovacDozorNaKaseDo: '08:30', planovacObsazeni: obsazeni, planovacKasaOd: '08:00' });
  expect((await api.get('/firmy')).body.find((x: { id: string }) => x.id === f.id).nastaveni.planovacObsazeni).toEqual(obsazeni);
  for (const nastaveni of [
    { planovacDozorNaKaseDo: '9:00' },
    { planovacObsazeni: [{ od: '8:00', do: '09:00', lidi: 2 }] },
    { planovacObsazeni: [{ od: '08:00', do: '09:00', lidi: 51 }] },
    { planovacObsazeni: [{ od: '08:00', do: '09:00', lidi: 1.5 }] },
    { planovacObsazeni: [{ od: '08:00', do: '09:00', lidi: 2, aspon: 'ano' }] },
  ]) expect((await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni })).status).toBe(400);
});

test('seznam firem obsahuje založenou firmu', async () => {
  const f = (await api.post('/firmy', firmaVstup({ nazev: 'Do seznamu' }))).body;
  const r = await api.get('/firmy');
  expect(r.status).toBe(200);
  expect(r.body.map((x: { id: string }) => x.id)).toContain(f.id);
});

test('úprava firmy změní zadaná pole a nastavení sloučí s uloženým', async () => {
  const f = (await api.post('/firmy', firmaVstup({ nazev: 'Stará', nastaveni: { stravneProDpp: false } }))).body;
  const r = await api.put(`/firmy/${f.id}`, firmaVstup({ nazev: 'Nová', adresa: 'Ulice 1', nastaveni: { priplatekKasaHal: 12000 } }));
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ id: f.id, nazev: 'Nová', adresa: 'Ulice 1', vytvoreno: f.vytvoreno });
  expect(r.body.nastaveni).toEqual({ ...VYCHOZI_NASTAVENI, stravneProDpp: false, priplatekKasaHal: 12000 });
});

describe('PUT /firmy/:id nepřepisuje vynechaná pole', () => {
  const zaloz = async () => (await api.post('/firmy', firmaVstup({
    nazev: 'Původní', ico: '12345678', adresa: 'Hlavní 1', ucet: '123/0100', nastaveni: { stravneProDpp: false, urovneAktivityHal: [5000] },
  }))).body;

  test('přejmenování samo (jen nazev) ponechá ico, adresu, účet i nastavení', async () => {
    const f = await zaloz();
    const r = await api.put(`/firmy/${f.id}`, { nazev: 'Přejmenovaná' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ...f, nazev: 'Přejmenovaná' });
    const ulozeno = (await api.get('/firmy')).body.find((x: { id: string }) => x.id === f.id);
    expect(ulozeno).toEqual(r.body);
    expect(ulozeno.nastaveni).toEqual({ ...VYCHOZI_NASTAVENI, stravneProDpp: false, urovneAktivityHal: [5000] });
  });

  test('částečné nastavení se sloučí přes uložené, pole (úrovně) se nahradí celé', async () => {
    const f = await zaloz();
    const r = await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni: { priplatekKasaHal: 12000, urovneAktivityHal: [7000, 9000] } });
    expect(r.body.nastaveni).toEqual({ ...VYCHOZI_NASTAVENI, stravneProDpp: false, priplatekKasaHal: 12000, urovneAktivityHal: [7000, 9000] });
    const dalsi = await api.put(`/firmy/${f.id}`, { nazev: f.nazev, nastaveni: { tydenniPracovniDoba: 37.5 } });
    expect(dalsi.body.nastaveni).toEqual({ ...VYCHOZI_NASTAVENI, stravneProDpp: false, priplatekKasaHal: 12000, urovneAktivityHal: [7000, 9000], tydenniPracovniDoba: 37.5 });
  });

  test('výslovné null (a prázdný text) vymaže ico/adresu/účet, vynechané zůstane', async () => {
    const f = await zaloz();
    const r = await api.put(`/firmy/${f.id}`, { nazev: f.nazev, ico: null, adresa: '   ' });
    expect(r.body).toMatchObject({ ico: null, adresa: null, ucet: '123/0100' });
    expect((await api.put(`/firmy/${f.id}`, { nazev: f.nazev, ucet: null })).body).toMatchObject({ ico: null, adresa: null, ucet: null });
  });

  test('zadané ico/adresa se přepíše a ořízne', async () => {
    const f = await zaloz();
    expect((await api.put(`/firmy/${f.id}`, { nazev: f.nazev, ico: ' 87654321 ' })).body).toMatchObject({ ico: '87654321', adresa: 'Hlavní 1', ucet: '123/0100' });
  });

  test('neznámé typy se i při úpravě odmítnou (400) a nic se nezmění', async () => {
    const f = await zaloz();
    for (const telo of [
      { nazev: f.nazev, ico: 123 }, { nazev: f.nazev, adresa: false }, { nazev: f.nazev, nastaveni: { praceVeSvatek: 'JINAK' } },
      { nazev: f.nazev, nastaveni: { tydenniPracovniDoba: -1 } }, { nazev: f.nazev, nastaveni: { stravneProDpp: 'ano' } }, { nazev: f.nazev, nastaveni: null },
      { nazev: '' }, {}, { nazev: f.nazev, nastaveni: { priplatekKasaHal: 10.5 } },
    ]) {
      const r = await api.put(`/firmy/${f.id}`, telo);
      expect(r.status, JSON.stringify(telo)).toBe(400);
      expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    }
    expect((await api.get('/firmy')).body.find((x: { id: string }) => x.id === f.id)).toEqual(f);
  });
});

test('smazání firmy vrátí 204 a smaže i její zaměstnance', async () => {
  const f = (await api.post('/firmy', firmaVstup())).body;
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f.id))).body;
  const r = await api.del(`/firmy/${f.id}`);
  expect(r.status).toBe(204);
  expect((await api.get('/firmy')).body.map((x: { id: string }) => x.id)).not.toContain(f.id);
  const zaloha = (await api.get('/zaloha')).body;
  expect(zaloha.tabulky.zamestnanec.map((x: { id: string }) => x.id)).not.toContain(z.id);
  expect(zaloha.tabulky.sazba.filter((s: { zamestnanecId: string }) => s.zamestnanecId === z.id)).toHaveLength(0);
});

test('neexistující firma → 404 NENALEZENO u úpravy i smazání', async () => {
  expect((await api.put('/firmy/neni', firmaVstup())).body).toEqual({ chyba: 'NENALEZENO' });
  expect((await api.put('/firmy/neni', firmaVstup())).status).toBe(404);
  const r = await api.del('/firmy/neni');
  expect(r.status).toBe(404);
  expect(r.body).toEqual({ chyba: 'NENALEZENO' });
});

test('neplatný vstup → 400 NEPLATNY_VSTUP se zprávou', async () => {
  for (const telo of [{}, { nazev: '' }, { nazev: 'X', nastaveni: { tydenniPracovniDoba: -1 } }, { nazev: 'X', nastaveni: { praceVeSvatek: 'JINAK' } }]) {
    const r = await api.post('/firmy', telo);
    expect(r.status).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
    expect(typeof r.body.zprava).toBe('string');
  }
});

test('tělo, které není JSON → 400 NEPLATNY_VSTUP', async () => {
  const res = await t.fetchApi('/firmy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nejde' });
  expect(res.status).toBe(400);
  expect((await res.json() as { chyba: string }).chyba).toBe('NEPLATNY_VSTUP');
});
