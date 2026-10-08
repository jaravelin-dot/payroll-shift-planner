// Horní meze vstupů na serveru odpovídají formulářům appky: peníze nejvýš 10 000 000 Kč, týdenní doba a úvazek nejvýš 40 h
// (doba aspoň 1 h, jinak by hodinová minimální mzda vyšla nesmyslně), dovolená ±1 000 h.
import { vytvorTestovaciApp } from './test/harness';
import { firmaVstup, klient, zamestnanecVstup } from './test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

const MAX_HAL = 1_000_000_000;
const zalozFirmu = async () => (await api.post('/firmy', firmaVstup())).body.id as string;
const vstup = (zamestnanecId: string, prepis = {}) => ({
  zamestnanecId, rok: 2026, mesic: 10, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null, ...prepis,
});

test('týdenní pracovní doba firmy 1–40 h', async () => {
  for (const doba of [0, 0.004, 0.5, 40.01, 168]) {
    const r = await api.post('/firmy', firmaVstup({ nastaveni: { tydenniPracovniDoba: doba } }));
    expect(r.status, String(doba)).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
  }
  for (const doba of [1, 37.5, 40]) expect((await api.post('/firmy', firmaVstup({ nastaveni: { tydenniPracovniDoba: doba } }))).status, String(doba)).toBe(201);
});

test('peníze v nastavení firmy nejvýš 10 000 000 Kč', async () => {
  for (const nastaveni of [{ stravnePausalHal: MAX_HAL + 1 }, { priplatekSobotaHal: MAX_HAL + 1 }, { priplatekKasaHal: MAX_HAL + 1 }, { urovneOdmenyZaDenHal: [MAX_HAL + 1] }, { urovneAktivityHal: [MAX_HAL + 1] }]) {
    expect((await api.post('/firmy', firmaVstup({ nastaveni }))).status, JSON.stringify(nastaveni)).toBe(400);
  }
  expect((await api.post('/firmy', firmaVstup({ nastaveni: { stravnePausalHal: MAX_HAL, urovneOdmenyZaDenHal: [MAX_HAL] } }))).status).toBe(201);
});

test('úvazek zaměstnance nejvýš 40 h týdně, sazba nejvýš 10 000 000 Kč', async () => {
  const f = await zalozFirmu();
  expect((await api.post('/zamestnanci', zamestnanecVstup(f, { uvazekMinTydne: 2401 }))).status).toBe(400);
  expect((await api.post('/zamestnanci', zamestnanecVstup(f, { sazby: [{ platiOd: '2026-01-01', hodinovaHal: MAX_HAL + 1 }] }))).status).toBe(400);
  expect((await api.post('/zamestnanci', zamestnanecVstup(f, { uvazekMinTydne: 2400, sazby: [{ platiOd: '2026-01-01', hodinovaHal: MAX_HAL }] }))).status).toBe(201);
});

test('odměny, srážky a průměr v měsíčním vstupu nejvýš 10 000 000 Kč', async () => {
  const f = await zalozFirmu();
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body.id as string;
  for (const pole of ['odmenaZaDenHal', 'aktivitaHal', 'jineOdmenyHal', 'srazkyHal', 'prumernyVydelekHal']) {
    expect((await api.put('/vstupy', vstup(z, { [pole]: MAX_HAL + 1 }))).status, pole).toBe(400);
  }
  expect((await api.put('/vstupy', vstup(z, { jineOdmenyHal: MAX_HAL, srazkyHal: MAX_HAL }))).status).toBe(200);
});

test('převod dovolené ±1 000 h, nárok navíc 0–1 000 h', async () => {
  const f = await zalozFirmu();
  const z = (await api.post('/zamestnanci', zamestnanecVstup(f))).body.id as string;
  const dovolena = (prevodMin: number, narokNavicMin: number) => api.put('/dovolena', { zamestnanecId: z, rok: 2026, prevodMin, narokNavicMin });
  expect((await dovolena(60_001, 0)).status).toBe(400);
  expect((await dovolena(-60_001, 0)).status).toBe(400);
  expect((await dovolena(0, 60_001)).status).toBe(400);
  expect((await dovolena(-60_000, 60_000)).status).toBe(200);
  expect((await dovolena(60_000, 0)).status).toBe(200);
});
