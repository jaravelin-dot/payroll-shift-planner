import ExcelJS from 'exceljs';
import { firma, mesicData, zamestnanec } from '../test-utils';
import { nazevExcelu, SLOUPCE_SOUHRNU, vytvorExcel } from './excel';
import { DNY_A, vysledekA, vysledekBonus, vysledekNemocSrazky, vysledekSrazkovaDan } from './test-scenar';

vi.setConfig({ testTimeout: 20_000 });

const DATA = mesicData({
  firma: firma({ nazev: 'Ukázková prodejna s.r.o.' }),
  zamestnanci: [zamestnanec({ id: 'z1' })],
  dny: [
    // Den předchozího měsíce (data měsíce ho nesou kvůli nemoci) do docházky nepatří.
    { zamestnanecId: 'z1', datum: '2026-09-30', typ: 'PRACE', minuty: 480, kasa: false, poznamka: null },
    ...DNY_A.map((d) => (d.datum === '2026-10-28' ? { ...d, poznamka: 'Svátek, otevřeno' } : d)),
  ],
});

async function nacti(blob: Blob): Promise<ExcelJS.Workbook> {
  const kniha = new ExcelJS.Workbook();
  await kniha.xlsx.load(await blob.arrayBuffer());
  return kniha;
}

/** Hodnoty řádku listu jako pole (exceljs čísluje sloupce od 1). */
const hodnoty = (list: ExcelJS.Worksheet, radek: number) => (list.getRow(radek).values as unknown[]).slice(1);

test('list Souhrn: hlavička tučně a ukotvená, řádek na člověka s čísly jako čísly', async () => {
  const blob = await vytvorExcel({ firma: DATA.firma, rok: 2026, mesic: 10, data: DATA, vysledky: new Map([['z1', vysledekA()]]) });
  expect(blob).toBeInstanceOf(Blob);
  expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const kniha = await nacti(blob);
  const souhrn = kniha.getWorksheet('Souhrn')!;
  expect(hodnoty(souhrn, 1)).toEqual([
    'Jméno', 'Smlouva', 'Hodiny Po–Pá', 'Dny Po–Pá', 'Hodiny So', 'Dny So', 'Hodiny Ne', 'Dny Ne', 'Hodiny svátky', 'Dny svátky',
    'Neschopenka h', 'Neschopenka dny', 'Dovolená h', 'Dovolená dny', 'Stravenky (nároků)', 'Stravenky Kč',
    'Základ', 'Odměna za den', 'Aktivita', 'Příplatek So', 'Příplatek Ne', 'Kasa', 'Příplatek za svátek', 'Jiné odměny', 'Doplatek do min. mzdy',
    'Náhrada za dovolenou', 'Náhrada za svátek', 'Náhrada za náhradní volno', 'Hrubá mzda',
    'Stravenky zdanitelné', 'SP zaměstnanec', 'ZP zaměstnanec', 'Doplatek ZP', 'Záloha / srážková daň', 'Slevy na dani', 'Daňový bonus', 'Čistá',
    'Náhrada za nemoc', 'Stravenky osvobozené', 'Srážky', 'K výplatě', 'Daň po slevách', 'Odvody firmy', 'Náklad firmy',
  ]);
  expect(SLOUPCE_SOUHRNU.map((s) => s.nadpis)).toEqual(hodnoty(souhrn, 1));
  expect(souhrn.getRow(1).getCell(1).font?.bold).toBe(true);
  // Záhlaví i sloupec Jméno zůstávají při posouvání do stran na místě.
  expect(souhrn.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 1 });

  const v = vysledekA();
  const jana = Object.fromEntries(SLOUPCE_SOUHRNU.map((s, i) => [s.nadpis, hodnoty(souhrn, 2)[i]]));
  expect(jana).toMatchObject({
    'Jméno': 'Nováková Jana', 'Smlouva': 'HPP',
    'Hodiny Po–Pá': 144, 'Dny Po–Pá': 18, 'Hodiny So': 12, 'Dny So': 2, 'Hodiny Ne': 5, 'Dny Ne': 1, 'Hodiny svátky': 8, 'Dny svátky': 1,
    'Neschopenka h': 0, 'Neschopenka dny': 0, 'Dovolená h': 8, 'Dovolená dny': 1, 'Stravenky (nároků)': 22, 'Stravenky Kč': 2849,
    'Hrubá mzda': 35440, 'SP zaměstnanec': v.pojisteni.socialniZamKc, 'ZP zaměstnanec': v.pojisteni.zdravotniZamKc, 'Doplatek ZP': 0,
    'Daň po slevách': 2755, 'Daňový bonus': 0, 'Čistá': 28573, 'K výplatě': 31422, 'Náklad firmy': 50269,
  });
  const slozka = (kod: string) => (v.slozky.find((s) => s.kod === kod)?.castkaHal ?? 0) / 100;
  expect(jana['Odměna za den']).toBe(slozka('ODMENA_ZA_DEN'));
  expect(jana['Příplatek So']).toBe(slozka('PRIPLATEK_SOBOTA'));
  expect(jana['Kasa']).toBe(slozka('KASA'));
  expect(jana['Příplatek za svátek']).toBe(slozka('PRIPLATEK_SVATEK'));
  expect(jana['Náhrada za svátek']).toBe(slozka('NAHRADA_SVATEK'));
  expect(jana['Náhrada za dovolenou']).toBe(slozka('NAHRADA_DOVOLENA'));

  const kVyplate = souhrn.getRow(2).getCell(SLOUPCE_SOUHRNU.findIndex((s) => s.nadpis === 'K výplatě') + 1);
  expect(kVyplate.numFmt).toBe('#,##0.00 "Kč";-#,##0.00 "Kč"');
  expect(souhrn.getRow(2).getCell(3).numFmt).toBe('0.00');
  expect(souhrn.rowCount).toBe(2);
});

/** Řádek listu Souhrn: částky v haléřích (celé číslo), ať se sčítá přesně; `bunky` jsou všechny hodnoty podle nadpisu. */
function radekSouhrnu(souhrn: ExcelJS.Worksheet, radek: number) {
  const bunky = Object.fromEntries(SLOUPCE_SOUHRNU.map((s, i) => [s.nadpis, hodnoty(souhrn, radek)[i]]));
  const hal = (nadpis: string) => {
    const hodnota = bunky[nadpis];
    if (typeof hodnota !== 'number') throw new Error(`Sloupec ${nadpis} není číslo (${String(hodnota)})`);
    return Math.round(hodnota * 100);
  };
  return { hal, bunky };
}

const SLOZKY_V_HRUBE = [
  'Základ', 'Odměna za den', 'Aktivita', 'Příplatek So', 'Příplatek Ne', 'Kasa', 'Příplatek za svátek', 'Jiné odměny', 'Doplatek do min. mzdy',
  'Náhrada za dovolenou', 'Náhrada za svátek', 'Náhrada za náhradní volno',
];

const SCENARE = [
  { nazev: 'A, plný měsíc HPP se slevami na dani', vysledek: vysledekA() },
  { nazev: 'nemoc, srážky, doplatek ZP, jiné odměny a zdanitelné stravné', vysledek: vysledekNemocSrazky() },
  { nazev: 'dvě děti, daňový bonus', vysledek: vysledekBonus() },
  { nazev: 'DPP, srážková daň', vysledek: vysledekSrazkovaDan() },
];

test('scénáře pro součty mají nemoc, srážky, doplatek ZP, zdanitelné stravné, bonus i srážkovou daň', () => {
  const e = vysledekNemocSrazky();
  expect(e.nahradaNemocHal).toBeGreaterThan(0);
  expect(e.pojisteni.doplatekZpKc).toBeGreaterThan(0);
  expect(e.stravne.zdanitelneHal).toBeGreaterThan(0);
  expect(e.cistaHal + e.nahradaNemocHal + e.stravne.osvobozenoHal - e.kVyplateHal).toBe(50000);
  expect(e.slozky.map((s) => s.kod)).toContain('JINE_ODMENY');
  expect(vysledekBonus().dan.bonusKc).toBeGreaterThan(0);
  expect(vysledekSrazkovaDan().dan.rezim).toBe('SRAZKOVA');
});

test.each(SCENARE)('řádek jde sečíst na haléř: složky → Hrubá, Hrubá → Čistá, Čistá → K výplatě ($nazev)', async ({ vysledek }) => {
  const data = { ...DATA, dny: [] };
  const kniha = await nacti(await vytvorExcel({ firma: DATA.firma, rok: 2026, mesic: 10, data, vysledky: new Map([['z1', vysledek]]) }));
  const { hal } = radekSouhrnu(kniha.getWorksheet('Souhrn')!, 2);

  expect(SLOZKY_V_HRUBE.reduce((soucet, nadpis) => soucet + hal(nadpis), 0)).toBe(hal('Hrubá mzda'));
  expect(hal('Hrubá mzda')).toBe(vysledek.hrubaHal);

  const cista = hal('Hrubá mzda') + hal('Stravenky zdanitelné') - hal('SP zaměstnanec') - hal('ZP zaměstnanec') - hal('Doplatek ZP')
    - hal('Záloha / srážková daň') + hal('Slevy na dani') + hal('Daňový bonus');
  expect(cista).toBe(hal('Čistá'));
  expect(hal('Čistá')).toBe(vysledek.cistaHal);

  expect(hal('Čistá') + hal('Náhrada za nemoc') + hal('Stravenky osvobozené') - hal('Srážky')).toBe(hal('K výplatě'));
  expect(hal('K výplatě')).toBe(vysledek.kVyplateHal);

  // Souhrnné údaje mimo součty se s nimi shodují.
  expect(hal('Stravenky zdanitelné') + hal('Stravenky osvobozené')).toBe(hal('Stravenky Kč'));
  expect(hal('Záloha / srážková daň') - hal('Slevy na dani')).toBe(hal('Daň po slevách'));
  expect(hal('Hrubá mzda') + hal('Náhrada za nemoc') + hal('Stravenky Kč') + hal('Odvody firmy')).toBe(hal('Náklad firmy'));
});

test('nemoc, srážky, doplatek ZP, jiné odměny a zdanitelné stravné mají vlastní sloupce se správnou částkou', async () => {
  const v = vysledekNemocSrazky();
  const kniha = await nacti(await vytvorExcel({ firma: DATA.firma, rok: 2026, mesic: 10, data: { ...DATA, dny: [] }, vysledky: new Map([['z1', v]]) }));
  const { hal } = radekSouhrnu(kniha.getWorksheet('Souhrn')!, 2);
  expect(hal('Náhrada za nemoc')).toBe(v.nahradaNemocHal);
  expect(hal('Srážky')).toBe(50000);
  expect(hal('Doplatek ZP')).toBe(v.pojisteni.doplatekZpKc * 100);
  expect(hal('ZP zaměstnanec')).toBe(v.pojisteni.zdravotniZamKc * 100);
  expect(hal('Jiné odměny')).toBe(30000);
  expect(hal('Stravenky zdanitelné')).toBe(v.stravne.zdanitelneHal);
});

test('list Docházka: dny měsíce po řádcích (datum jako datum, hodiny jako číslo)', async () => {
  const kniha = await nacti(await vytvorExcel({ firma: DATA.firma, rok: 2026, mesic: 10, data: DATA, vysledky: new Map([['z1', vysledekA()]]) }));
  const dochazka = kniha.getWorksheet('Docházka')!;
  expect(hodnoty(dochazka, 1)).toEqual(['Datum', 'Jméno', 'Typ', 'Hodiny', 'Kasa', 'Poznámka']);
  expect(dochazka.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  expect(dochazka.views[0].xSplit ?? 0).toBe(0); // 6 úzkých sloupců, zmrazuje se jen záhlaví
  expect(dochazka.rowCount).toBe(1 + DNY_A.length);
  const prvni = hodnoty(dochazka, 2);
  expect((prvni[0] as Date).toISOString().slice(0, 10)).toBe('2026-10-01');
  expect(prvni.slice(1, 5)).toEqual(['Nováková Jana', 'Práce', 8, 'ano']);
  const svatek = Array.from({ length: dochazka.rowCount - 1 }, (_, i) => hodnoty(dochazka, i + 2)).find((r) => r[5] === 'Svátek, otevřeno')!;
  expect((svatek[0] as Date).toISOString().slice(0, 10)).toBe('2026-10-28');
  const dovolena = Array.from({ length: dochazka.rowCount - 1 }, (_, i) => hodnoty(dochazka, i + 2)).find((r) => r[2] === 'Dovolená')!;
  expect(dovolena.slice(1, 4)).toEqual(['Nováková Jana', 'Dovolená', 8]);
  expect(dochazka.getRow(2).getCell(1).numFmt).toBe('d. m. yyyy');
});

test('uzavřený měsíc: lidé a čísla ze snímku uzávěrky, i když člověk mezitím z firmy zmizel', async () => {
  const snimek = { ...vysledekA(), kVyplateHal: 1234500 };
  const data = { ...DATA, zamestnanci: [], dny: [],
    uzaverka: { firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z', vysledky: [{ zamestnanecId: 'x', jmeno: 'Petr Černý', smlouva: 'DPP' as const, vysledek: snimek }] } };
  const kniha = await nacti(await vytvorExcel({ firma: data.firma, rok: 2026, mesic: 10, data, vysledky: new Map([['x', snimek]]) }));
  const radek = hodnoty(kniha.getWorksheet('Souhrn')!, 2);
  expect(radek[0]).toBe('Černý Petr');
  expect(radek[1]).toBe('DPP');
  expect(radek[SLOUPCE_SOUHRNU.findIndex((s) => s.nadpis === 'K výplatě')]).toBe(12345);
});

test('vyřazený člověk (vPodkladu false) chybí na listech Podklad, Souhrn i Docházka, ostatní zůstávají', async () => {
  const data = mesicData({
    firma: DATA.firma,
    zamestnanci: [
      zamestnanec({ id: 'z1' }),
      zamestnanec({ id: 'z2', jmeno: 'Daniel', prijmeni: 'Horák', vPodkladu: false }),
      zamestnanec({ id: 'b1', jmeno: 'Karel', prijmeni: 'Beránek', smlouva: 'DPP', uvazekMinTydne: 0, vPodkladu: false }),
    ],
    dny: ['z1', 'z2', 'b1'].map((id) => ({ zamestnanecId: id, datum: '2026-10-05', typ: 'PRACE' as const, minuty: 480, kasa: false, poznamka: null })),
  });
  const vysledky = new Map([['z1', vysledekA()], ['z2', vysledekA()], ['b1', vysledekSrazkovaDan()]]);
  const kniha = await nacti(await vytvorExcel({ firma: data.firma, rok: 2026, mesic: 10, data, vysledky }));
  const vse = (list: ExcelJS.Worksheet) => Array.from({ length: list.rowCount }, (_, i) => hodnoty(list, i + 1).join('|')).join(' // ');
  for (const list of ['Podklad', 'Souhrn', 'Docházka']) {
    const text = vse(kniha.getWorksheet(list)!);
    expect(text, list).toContain('Nováková Jana');
    expect(text, list).not.toContain('Horák');
    expect(text, list).not.toContain('Beránek');
  }
  expect(kniha.getWorksheet('Souhrn')!.rowCount).toBe(2);
  expect(kniha.getWorksheet('Docházka')!.rowCount).toBe(2);
});

test('název souboru: mzdy-<firma bez diakritiky>-RRRR-MM.xlsx', () => {
  expect(nazevExcelu(firma({ nazev: 'Ukázková prodejna s.r.o.' }), 2026, 3)).toBe('mzdy-ukazkova-prodejna-s-r-o-2026-03.xlsx');
  expect(nazevExcelu(firma({ nazev: '  Řeznictví & Uzenářství ' }), 2027, 12)).toBe('mzdy-reznictvi-uzenarstvi-2027-12.xlsx');
});

test('list Podklad je první: záhlaví, fond pracovní doby, zaměstnanci a brigádníci jako čísla', async () => {
  const data = {
    ...DATA,
    zamestnanci: [...DATA.zamestnanci, zamestnanec({ id: 'b1', jmeno: 'Karel', prijmeni: 'Beránek', smlouva: 'DPP', uvazekMinTydne: 0, ucet: null })],
  };
  const blob = await vytvorExcel({ firma: data.firma, rok: 2026, mesic: 10, data, vysledky: new Map([['z1', vysledekA()], ['b1', vysledekSrazkovaDan()]]) });
  const kniha = await nacti(blob);
  expect(kniha.worksheets.map((l) => l.name)).toEqual(['Podklad', 'Souhrn', 'Docházka']);

  const list = kniha.getWorksheet('Podklad')!;
  expect(hodnoty(list, 1)).toEqual(['Ukázková prodejna s.r.o. — podklad pro mzdy']);
  expect(hodnoty(list, 2)).toEqual(['měsíc: říjen 2026, 22 pracovních dní']);
  expect(hodnoty(list, 3)[0]).toMatch(/^Rozpracováno/);
  expect(hodnoty(list, 5)).toEqual(['Fond pracovní doby', 'Denně (h)', 'Za měsíc (h)']);
  expect(hodnoty(list, 6)).toEqual(['úvazek 20 h týdně', 4, 88]);
  expect(hodnoty(list, 7)).toEqual(['úvazek 40 h týdně', 8, 176]);
  expect(hodnoty(list, 9)[0]).toBe('Jméno');
  expect(hodnoty(list, 9)).toHaveLength(11);
  const jana = hodnoty(list, 10);
  expect(jana.slice(0, 9)).toEqual(['Nováková Jana', 40, 176, 169, 17, 8, 1, 0, 22]);
  expect(typeof jana[9]).toBe('number');
  expect(hodnoty(list, 12)).toEqual(['Brigádníci (DPP)', 'Hodiny', 'Mzda (hrubá)', 'Způsob platby', 'Potřebujeme mzdu']);
  const v = vysledekSrazkovaDan();
  expect(hodnoty(list, 13).slice(0, 4)).toEqual(['Beránek Karel', v.hodiny.praceMin / 60, v.hrubaHal / 100, 'hotově']);
  expect(list.getRow(10).getCell(10).numFmt).toBe('#,##0.00 "Kč";-#,##0.00 "Kč"');
});

test('list Podklad: šířky 11 sloupců sedí a hodiny jsou zaokrouhlené na 2 místa jako v PDF (štítek s českou čárkou)', async () => {
  const data = {
    ...DATA,
    zamestnanci: [
      ...DATA.zamestnanci,
      zamestnanec({ id: 'z2', jmeno: 'Eva', prijmeni: 'Půlová', uvazekMinTydne: 2250 }),
      zamestnanec({ id: 'z3', jmeno: 'Ota', prijmeni: 'Třetinový', uvazekMinTydne: 2200 }),
    ],
  };
  const vysledky = new Map([['z1', vysledekA()], ['z2', vysledekA()], ['z3', vysledekA()]]);
  const kniha = await nacti(await vytvorExcel({ firma: data.firma, rok: 2026, mesic: 10, data, vysledky }));
  const list = kniha.getWorksheet('Podklad')!;

  // 11 sloupců tabulky: Jméno 26, 8 číselných 11, Odměna 14, Potřebujeme mzdu 40 (nic navíc).
  expect(list.getColumn(1).width).toBe(26);
  expect(list.getColumn(2).width).toBe(11);
  expect(list.getColumn(9).width).toBe(11);
  expect(list.getColumn(10).width).toBe(14);
  expect(list.getColumn(11).width).toBe(40);
  expect(list.getColumn(12).width).toBeUndefined();

  const radky = Array.from({ length: list.rowCount }, (_, i) => hodnoty(list, i + 1));
  const fond = (stitek: string) => radky.find((r) => r[0] === stitek);
  expect(fond('úvazek 37,5 h týdně')).toEqual(['úvazek 37,5 h týdně', 7.5, 165]);
  expect(fond('úvazek 36,67 h týdně')).toEqual(['úvazek 36,67 h týdně', 7.33, 161.33]);

  const clovek = (jmeno: string) => radky.find((r) => r[0] === jmeno)!;
  const pulova = clovek('Půlová Eva');
  expect(pulova[1]).toBe(37.5);
  expect(pulova[2]).toBe(165);
  const tretinovy = clovek('Třetinový Ota');
  expect(tretinovy[1]).toBe(36.67);
  expect(tretinovy[2]).toBe(161.33);
});
