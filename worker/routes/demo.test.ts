import { VYCHOZI_NASTAVENI, type Den } from '../../src/shared/api';
import { denVTydnu } from '../../src/core/kalendar';
import { vytvorTestovaciApp } from '../test/harness';
import { klient } from '../test/pomocnici';

let t: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
let api: ReturnType<typeof klient>;
beforeAll(async () => { t = await vytvorTestovaciApp(); api = klient(t.fetchApi); });
afterAll(async () => { await t.zavri(); });

async function vytvorDemo(telo?: unknown) {
  const r = await api.post('/demo', telo);
  expect(r.status).toBe(201);
  return r.body as { id: string; nazev: string; nastaveni: unknown };
}

test('POST /demo vytvoří firmu se čtyřmi lidmi, sazbami a šablonami (měsíc z těla)', async () => {
  const firma = await vytvorDemo({ rok: 2026, mesic: 10 });
  expect(firma).toMatchObject({ nazev: 'Ukázková prodejna s.r.o.', nastaveni: VYCHOZI_NASTAVENI });

  const lide = (await api.get(`/firmy/${firma.id}/zamestnanci`)).body;
  expect(lide).toHaveLength(4);
  const podleJmena = (jmeno: string) => lide.find((x: { jmeno: string }) => x.jmeno === jmeno);
  expect(podleJmena('Hana')).toMatchObject({ prijmeni: 'Svobodová', smlouva: 'HPP', uvazekMinTydne: 2400, prohlaseni: true, deti: [{ ztpp: false }], nastup: '2025-01-01' });
  expect(podleJmena('Hana').sazby.map((s: { hodinovaHal: number }) => s.hodinovaHal)).toEqual([16500]);
  expect(podleJmena('Tomáš')).toMatchObject({ prijmeni: 'Král', smlouva: 'HPP', uvazekMinTydne: 1800, invalidita: 'III', slevaNaPojistnem: true });
  expect(podleJmena('Tomáš').sazby[0].hodinovaHal).toBe(15800);
  expect(podleJmena('Lenka')).toMatchObject({ prijmeni: 'Dvořáková', smlouva: 'HPP', uvazekMinTydne: 2400, prohlaseni: true });
  expect(podleJmena('Lenka').sazby[0].hodinovaHal).toBe(17200);
  expect(podleJmena('Marek')).toMatchObject({ prijmeni: 'Beneš', smlouva: 'DPP', prohlaseni: false });
  expect(podleJmena('Marek').sazby[0].hodinovaHal).toBe(15000);

  const sablony = (await api.get(`/firmy/${firma.id}/sablony`)).body;
  expect(sablony.map((s: { nazev: string; zacatek: string; konec: string; prestavkaMin: number }) => [s.nazev, s.zacatek, s.konec, s.prestavkaMin]).sort())
    .toEqual([['Odpolední', '12:00', '20:00', 30], ['Ranní', '08:00', '16:30', 30]]);
});

test('docházka a vstupy demo firmy v zadaném měsíci (říjen 2026)', async () => {
  const firma = await vytvorDemo({ rok: 2026, mesic: 10 });
  const mesic = (await api.get(`/firmy/${firma.id}/mesic/2026/10`)).body;
  const id = (jmeno: string) => mesic.zamestnanci.find((x: { jmeno: string }) => x.jmeno === jmeno).id as string;
  const dnyOsoby = (jmeno: string): Den[] => mesic.dny.filter((d: Den) => d.zamestnanecId === id(jmeno));

  // Říjen 2026 má 22 všedních dnů a 17 dnů Po–Čt; státní svátky se v ukázce neřeší.
  const hana = dnyOsoby('Hana');
  expect(hana.filter((d) => d.typ === 'PRACE')).toHaveLength(21);
  expect(hana.filter((d) => d.typ === 'DOVOLENA')).toHaveLength(1);
  expect(hana.every((d) => d.minuty === 480 && denVTydnu(d.datum) <= 5)).toBe(true);
  expect(hana.filter((d) => d.kasa)).toHaveLength(11);
  expect(hana.filter((d) => d.kasa).every((d) => d.typ === 'PRACE')).toBe(true);

  const lenka = dnyOsoby('Lenka');
  expect(lenka.filter((d) => d.typ === 'PRACE')).toHaveLength(20);
  expect(lenka.filter((d) => d.typ === 'NEMOC')).toHaveLength(2);
  expect(lenka.every((d) => d.minuty === 480 && denVTydnu(d.datum) <= 5 && !d.kasa)).toBe(true);

  const tomas = dnyOsoby('Tomáš');
  expect(tomas).toHaveLength(17);
  expect(tomas.every((d) => d.typ === 'PRACE' && d.minuty === 360 && denVTydnu(d.datum) <= 4)).toBe(true);

  const marek = dnyOsoby('Marek');
  expect(marek).toHaveLength(2);
  expect(marek.every((d) => d.typ === 'PRACE' && d.minuty === 360 && denVTydnu(d.datum) === 6)).toBe(true);

  expect(mesic.dny.every((d: Den) => d.datum.startsWith('2026-10-'))).toBe(true);

  expect(mesic.vstupy).toHaveLength(2);
  const vstup = (jmeno: string) => mesic.vstupy.find((v: { zamestnanecId: string }) => v.zamestnanecId === id(jmeno));
  expect(vstup('Hana')).toMatchObject({ rok: 2026, mesic: 10, odmenaZaDenHal: 12000, aktivitaHal: 6000, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null });
  expect(vstup('Lenka')).toMatchObject({ rok: 2026, mesic: 10, odmenaZaDenHal: 8000, aktivitaHal: 0 });
});

test('bez těla se použije aktuální měsíc (UTC) a GET mesic vrací dny', async () => {
  const ted = new Date();
  const rok = ted.getUTCFullYear();
  const mesicCislo = ted.getUTCMonth() + 1;
  const firma = await vytvorDemo();
  const mesic = (await api.get(`/firmy/${firma.id}/mesic/${rok}/${mesicCislo}`)).body;
  expect(mesic.zamestnanci).toHaveLength(4);
  expect(mesic.dny.length).toBeGreaterThan(40);
  const prefix = `${rok}-${String(mesicCislo).padStart(2, '0')}-`;
  expect(mesic.dny.every((d: Den) => d.datum.startsWith(prefix))).toBe(true);
  expect(mesic.vstupy.every((v: { rok: number; mesic: number }) => v.rok === rok && v.mesic === mesicCislo)).toBe(true);
});

test('celé demo (i nejdelší měsíc: 31 dní od pondělí, 67 dnů docházky) stojí 10 příkazů D1 z povolených 50', async () => {
  let firma!: { id: string };
  const pocet = await t.prikazy(async () => { firma = await vytvorDemo({ rok: 2027, mesic: 3 }); });
  expect(pocet).toBe(10); // firma + lidé + sazby + 5× docházka + vstupy + šablony
  const mesic = (await api.get(`/firmy/${firma.id}/mesic/2027/3`)).body;
  expect(mesic.dny).toHaveLength(67);
  expect(mesic.zamestnanci).toHaveLength(4);
  expect(mesic.vstupy).toHaveLength(2);
  expect(mesic.sablony).toHaveLength(2);
  expect(mesic.zamestnanci.every((x: { sazby: unknown[] }) => x.sazby.length === 1)).toBe(true);
});

test('demo jde vytvořit opakovaně a smazat jako obyčejná firma', async () => {
  const a = await vytvorDemo({ rok: 2026, mesic: 3 });
  const b = await vytvorDemo({ rok: 2026, mesic: 3 });
  expect(a.id).not.toBe(b.id);
  expect((await api.del(`/firmy/${a.id}`)).status).toBe(204);
  expect((await api.get(`/firmy/${b.id}/zamestnanci`)).body).toHaveLength(4);
});

test('neplatné tělo → 400 NEPLATNY_VSTUP', async () => {
  for (const telo of [{ rok: 2026, mesic: 13 }, { rok: 2026 }, { rok: 'abc', mesic: 1 }]) {
    const r = await api.post('/demo', telo);
    expect(r.status, JSON.stringify(telo)).toBe(400);
    expect(r.body.chyba).toBe('NEPLATNY_VSTUP');
  }
  const res = await t.fetchApi('/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nejde' });
  expect(res.status).toBe(400);
});
