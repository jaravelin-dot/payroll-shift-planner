import { den } from '../../core/test-utils';
import type { MesicniVstup } from '../../shared/api';
import { firma, mesicData, zamestnanec } from '../test-utils';
import { radkyVyplat } from '../radkyVyplat';
import { NADPISY_BRIGADNIKU, NADPISY_ZAMESTNANCU, podkladUcetni, pracovniDny, radkyProUcetni } from './podklad';
import { vysledekA, vysledekSrazkovaDan } from './test-scenar';

const PLATNY_UCET = '19-24619/0800';
const poznamka = (zamestnanecId: string, text: string): MesicniVstup => ({
  zamestnanecId, rok: 2026, mesic: 10, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: text,
});

const DATA = mesicData({
  firma: firma({ nazev: 'Ukázková prodejna' }),
  zamestnanci: [
    zamestnanec({ id: 'z1' }), // Jana Nováková, HPP 40 h
    zamestnanec({ id: 'z2', jmeno: 'Daniel', prijmeni: 'Horák', uvazekMinTydne: 1800, nastup: '2026-10-15' }),
    zamestnanec({ id: 'b1', jmeno: 'Karel', prijmeni: 'Beránek', smlouva: 'DPP', uvazekMinTydne: 0, ucet: PLATNY_UCET }),
    zamestnanec({ id: 'b2', jmeno: 'Eva', prijmeni: 'Šimková', smlouva: 'DPP', uvazekMinTydne: 0, ucet: null }),
  ],
  dny: [
    { ...den('2026-09-30', 'NEMOC', 8), zamestnanecId: 'z1' }, // předchozí měsíc
    { ...den('2026-10-17', 'NEMOC', 0), zamestnanecId: 'z1' }, // sobota
    { ...den('2026-10-19', 'NEMOC', 8), zamestnanecId: 'z1' },
    { ...den('2026-10-28', 'NEMOC', 8), zamestnanecId: 'z1' }, // svátek ve středu
    { ...den('2026-10-29', 'NEMOC', 8), zamestnanecId: 'z1' },
    { ...den('2026-10-20', 'NEMOC', 8), zamestnanecId: 'z2' },
  ],
  vstupy: [poznamka('z1', 'čistého aspoň 24 500 Kč bez stravenek'), poznamka('b1', 'na ruku 6 000 Kč'), { ...poznamka('z2', 'jiný měsíc'), mesic: 9 }],
});
const VYSLEDKY = new Map([['z1', vysledekA()], ['z2', vysledekA()], ['b1', vysledekSrazkovaDan()], ['b2', vysledekSrazkovaDan()]]);

test('pracovní dny: Po–Pá včetně svátků, volitelně jen v pracovním poměru', () => {
  expect(pracovniDny(2026, 8)).toBe(21);
  expect(pracovniDny(2026, 10)).toBe(22); // 28. 10. je středa a počítá se
  expect(pracovniDny(2026, 10, { nastup: '2026-10-15', ukonceni: null })).toBe(12);
  expect(pracovniDny(2026, 10, { nastup: '2025-01-01', ukonceni: '2026-10-02' })).toBe(2);
});

test('záhlaví: firma, měsíc, pracovní dny a fond pro úvazky z tabulky + vždy 20 a 40 h', () => {
  const { zahlavi } = podkladUcetni(DATA, VYSLEDKY);
  expect(zahlavi).toMatchObject({ firma: 'Ukázková prodejna', rok: 2026, mesic: 10, nazevMesice: 'říjen 2026', pracovniDny: 22 });
  expect(zahlavi.stav).toMatch(/^Rozpracováno/);
  expect(zahlavi.fond).toEqual([
    { uvazekMin: 1200, denneMin: 240, mesicMin: 240 * 22 },
    { uvazekMin: 1800, denneMin: 360, mesicMin: 360 * 22 },
    { uvazekMin: 2400, denneMin: 480, mesicMin: 480 * 22 },
  ]);
});

test('zaměstnanci: hodiny, dny, odměna ze složek a poznamka; DPP zvlášť', () => {
  const p = podkladUcetni(DATA, VYSLEDKY);
  expect(p.zamestnanci.map((r) => r.jmeno)).toEqual(['Horák Daniel', 'Nováková Jana']);
  expect(p.brigadnici.map((r) => r.jmeno)).toEqual(['Beránek Karel', 'Šimková Eva']);

  const v = vysledekA();
  const odmena = v.slozky
    .filter((s) => ['ODMENA_ZA_DEN', 'AKTIVITA', 'KASA', 'PRIPLATEK_SOBOTA', 'PRIPLATEK_NEDELE', 'JINE_ODMENY'].includes(s.kod))
    .reduce((a, s) => a + s.castkaHal, 0);
  expect(odmena).toBeGreaterThan(0);
  expect(p.zamestnanci[1]).toEqual({
    zamestnanecId: 'z1', jmeno: 'Nováková Jana', uvazekMin: 2400, hodinVMesiciMin: 480 * 22,
    odpracovanoMin: 169 * 60, vikendMin: 17 * 60, svatekMin: 8 * 60, dnyDovolene: 1, dnyNemoci: 2,
    dnyStravenek: 22, odmenaHal: odmena, potrebujeme: 'čistého aspoň 24 500 Kč bez stravenek',
  });
  // Nástup 15. 10.: fond jen za 12 pracovních dnů v poměru; poznámka z jiného měsíce se nebere.
  expect(p.zamestnanci[0]).toMatchObject({ uvazekMin: 1800, hodinVMesiciMin: 360 * 12, dnyNemoci: 1, potrebujeme: '' });
});

test('řazení podle pořadí z karty: čísla vzestupně, bez čísla na konci podle příjmení; DPP zvlášť stejně', () => {
  const data = mesicData({
    zamestnanci: [
      zamestnanec({ id: 'a', jmeno: 'Adam', prijmeni: 'Adámek', poradiPodkladu: 2 }),
      zamestnanec({ id: 'b', jmeno: 'Božena', prijmeni: 'Bílá', poradiPodkladu: null }),
      zamestnanec({ id: 'c', jmeno: 'Cyril', prijmeni: 'Cibulka', poradiPodkladu: 1 }),
      zamestnanec({ id: 'd', jmeno: 'Dana', prijmeni: 'Dolejší', poradiPodkladu: null }),
      zamestnanec({ id: 'x', jmeno: 'Xenie', prijmeni: 'Antošová', smlouva: 'DPP', uvazekMinTydne: 0, poradiPodkladu: 5 }),
      zamestnanec({ id: 'y', jmeno: 'Yvona', prijmeni: 'Zelená', smlouva: 'DPP', uvazekMinTydne: 0, poradiPodkladu: 3 }),
      zamestnanec({ id: 'w', jmeno: 'Wanda', prijmeni: 'Bartoš', smlouva: 'DPP', uvazekMinTydne: 0, poradiPodkladu: null }),
    ],
  });
  const vysledky = new Map(data.zamestnanci.map((z) => [z.id, z.smlouva === 'DPP' ? vysledekSrazkovaDan() : vysledekA()]));
  const p = podkladUcetni(data, vysledky);
  expect(p.zamestnanci.map((r) => r.zamestnanecId)).toEqual(['c', 'a', 'b', 'd']);
  expect(p.brigadnici.map((r) => r.zamestnanecId)).toEqual(['y', 'x', 'w']);
});

test('brigádníci: hodiny, hrubá mzda, způsob platby, poznámka', () => {
  const p = podkladUcetni(DATA, VYSLEDKY);
  const v = vysledekSrazkovaDan();
  expect(p.brigadnici).toEqual([
    { zamestnanecId: 'b1', jmeno: 'Beránek Karel', odpracovanoMin: v.hodiny.praceMin, mzdaHal: v.hrubaHal, zpusobPlatby: 'na účet', potrebujeme: 'na ruku 6 000 Kč' },
    { zamestnanecId: 'b2', jmeno: 'Šimková Eva', odpracovanoMin: v.hodiny.praceMin, mzdaHal: v.hrubaHal, zpusobPlatby: 'hotově', potrebujeme: '' },
  ]);
});

test('neplatný účet = hotově', () => {
  const data = { ...DATA, zamestnanci: DATA.zamestnanci.map((z) => (z.id === 'b1' ? { ...z, ucet: '124/0800' } : z)) };
  expect(podkladUcetni(data, VYSLEDKY).brigadnici[0]!.zpusobPlatby).toBe('hotově');
});

test('uzavřený měsíc: člověk, který už v datech není, má prázdný úvazek, fond i způsob platby', () => {
  const data = mesicData({
    zamestnanci: [],
    uzaverka: {
      firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z',
      vysledky: [
        { zamestnanecId: 'x1', jmeno: 'Petr Odešlý', smlouva: 'HPP', vysledek: vysledekA() },
        { zamestnanecId: 'x2', jmeno: 'Ota Brigádník', smlouva: 'DPP', vysledek: vysledekSrazkovaDan() },
      ],
    },
  });
  const p = podkladUcetni(data, new Map([['x1', vysledekA()], ['x2', vysledekSrazkovaDan()]]));
  expect(p.zahlavi.stav).toBe('Uzavřeno 5. 11. 2026'); // formatDatum dává nezlomitelné mezery
  expect(p.zahlavi.fond.map((f) => f.uvazekMin)).toEqual([1200, 2400]);
  expect(p.zamestnanci[0]).toMatchObject({ jmeno: 'Odešlý Petr', uvazekMin: null, hodinVMesiciMin: null });
  expect(p.brigadnici[0]).toMatchObject({ jmeno: 'Brigádník Ota', zpusobPlatby: '' });
});

test('vyřazený člověk (vPodkladu false) chybí v podkladu: HPP mezi zaměstnanci i DPP mezi brigádníky', () => {
  const data = { ...DATA, zamestnanci: DATA.zamestnanci.map((z) => (z.id === 'z1' || z.id === 'b1' ? { ...z, vPodkladu: false } : z)) };
  const p = podkladUcetni(data, VYSLEDKY);
  expect(p.zamestnanci.map((r) => r.jmeno)).toEqual(['Horák Daniel']);
  expect(p.brigadnici.map((r) => r.jmeno)).toEqual(['Šimková Eva']);
  expect(radkyProUcetni(data, VYSLEDKY).map((r) => r.zamestnanecId).sort()).toEqual(['b2', 'z2']);
});

test('radkyProUcetni: bez vyřazených je stejné jako radkyVyplat; člověk z uzávěrky mimo data zůstává', () => {
  expect(radkyProUcetni(DATA, VYSLEDKY)).toEqual(radkyVyplat(DATA, VYSLEDKY).radky);
  const data = mesicData({
    zamestnanci: [zamestnanec({ id: 'z1', vPodkladu: false })],
    uzaverka: {
      firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z',
      vysledky: [
        { zamestnanecId: 'z1', jmeno: 'Jana Nováková', smlouva: 'HPP', vysledek: vysledekA() },
        { zamestnanecId: 'x1', jmeno: 'Petr Odešlý', smlouva: 'HPP', vysledek: vysledekA() },
      ],
    },
  });
  expect(radkyProUcetni(data, new Map([['z1', vysledekA()], ['x1', vysledekA()]])).map((r) => r.zamestnanecId)).toEqual(['x1']);
});

test('nadpisy sloupců odpovídají ručnímu přehledu pro účetní', () => {
  expect(NADPISY_ZAMESTNANCU).toEqual([
    'Jméno', 'Úvazek týdně (h)', 'Hod. v měsíci', 'Odpracováno (h)', 'z toho So–Ne (h)', 'z toho svátek (h)',
    'Dny dovolené', 'Prac. dny nemoc', 'Strav. paušál dny', 'Odměna', 'Potřebujeme mzdu',
  ]);
  expect(NADPISY_BRIGADNIKU).toEqual(['Jméno', 'Hodiny', 'Mzda (hrubá)', 'Způsob platby', 'Potřebujeme mzdu']);
});
