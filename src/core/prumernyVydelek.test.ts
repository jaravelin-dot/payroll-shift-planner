import { vyresPrumernyVydelek } from './prumernyVydelek';
import { vstup } from './test-utils';

const uz = (mesic: number, sumaHal: number, min: number, dny: number) => ({ firmaId: 'f1', rok: 2026, mesic, uzavreno: '', vysledky: [{ zamestnanecId: 'z1', jmeno: 'J', smlouva: 'HPP' as const,
  vysledek: { slozky: [{ kod: 'ZAKLAD', popis: '', vzorec: '', castkaHal: sumaHal }, { kod: 'NAHRADA_DOVOLENA', popis: '', vzorec: '', castkaHal: 999999 }], hodiny: { praceMin: min, odpracovaneDny: dny } } }] });

test('ruční přepis má přednost', () => {
  expect(vyresPrumernyVydelek({ zamestnanecId: 'z1', rok: 2026, mesic: 11, vstupy: [vstup({ mesic: 10, prumernyVydelekHal: 21000 })], uzaverkyPredchozihoCtvrtleti: [], minHodHal: 13440 }))
    .toEqual({ pvHal: 21000, zdroj: 'RUCNE' });
});
test('z uzávěrek předchozího čtvrtletí, bez náhrad', () => {
  const u = [uz(7, 3000000, 10000, 21), uz(8, 3000000, 10000, 21), uz(9, 3000000, 10000, 21)];
  expect(vyresPrumernyVydelek({ zamestnanecId: 'z1', rok: 2026, mesic: 10, vstupy: [], uzaverkyPredchozihoCtvrtleti: u, minHodHal: 13440 }))
    .toEqual({ pvHal: 18000, zdroj: 'Z_UZAVEREK' });
});
test('málo odpracovaných dní → neznámý', () => {
  expect(vyresPrumernyVydelek({ zamestnanecId: 'z1', rok: 2026, mesic: 10, vstupy: [], uzaverkyPredchozihoCtvrtleti: [uz(9, 300000, 1200, 5)], minHodHal: 13440 }).zdroj).toBe('NEZNAMY');
});
test('nejméně minimální mzda', () => {
  expect(vyresPrumernyVydelek({ zamestnanecId: 'z1', rok: 2026, mesic: 10, vstupy: [vstup({ prumernyVydelekHal: 10000 })], uzaverkyPredchozihoCtvrtleti: [], minHodHal: 13440 }).pvHal).toBe(13440);
});

const zaklad = { zamestnanecId: 'z1', rok: 2026, mesic: 10, vstupy: [], uzaverkyPredchozihoCtvrtleti: [], minHodHal: 13440 };

test('ruční přepis: platí poslední nenulový z měsíců čtvrtletí do aktuálního měsíce', () => {
  const vstupy = [
    vstup({ mesic: 10, prumernyVydelekHal: 20000 }),
    vstup({ mesic: 11, prumernyVydelekHal: 21000 }),
    vstup({ mesic: 12, prumernyVydelekHal: 22000 }),
  ];
  expect(vyresPrumernyVydelek({ ...zaklad, mesic: 10, vstupy })).toEqual({ pvHal: 20000, zdroj: 'RUCNE' });
  expect(vyresPrumernyVydelek({ ...zaklad, mesic: 11, vstupy })).toEqual({ pvHal: 21000, zdroj: 'RUCNE' });
  expect(vyresPrumernyVydelek({ ...zaklad, mesic: 12, vstupy })).toEqual({ pvHal: 22000, zdroj: 'RUCNE' });
});
test('ruční přepis: přepis z pozdějšího měsíce neplatí zpětně a prázdná hodnota se přeskočí', () => {
  expect(vyresPrumernyVydelek({ ...zaklad, mesic: 10, vstupy: [vstup({ mesic: 11, prumernyVydelekHal: 21000 })] }).zdroj).toBe('NEZNAMY');
  const vstupy = [vstup({ mesic: 10, prumernyVydelekHal: 20000 }), vstup({ mesic: 11, prumernyVydelekHal: 0 }), vstup({ mesic: 12, prumernyVydelekHal: null })];
  expect(vyresPrumernyVydelek({ ...zaklad, mesic: 12, vstupy })).toEqual({ pvHal: 20000, zdroj: 'RUCNE' });
});
test('ruční přepis: jiné čtvrtletí, jiný rok a jiný zaměstnanec se nepočítají', () => {
  const vstupy = [
    vstup({ mesic: 9, prumernyVydelekHal: 20000 }),
    vstup({ rok: 2025, mesic: 10, prumernyVydelekHal: 20000 }),
    vstup({ zamestnanecId: 'z2', mesic: 10, prumernyVydelekHal: 20000 }),
  ];
  expect(vyresPrumernyVydelek({ ...zaklad, mesic: 10, vstupy }).zdroj).toBe('NEZNAMY');
});
test('ruční přepis má přednost před uzávěrkami', () => {
  const u = [uz(9, 3000000, 10000, 21)];
  expect(vyresPrumernyVydelek({ ...zaklad, vstupy: [vstup({ prumernyVydelekHal: 25000 })], uzaverkyPredchozihoCtvrtleti: u }))
    .toEqual({ pvHal: 25000, zdroj: 'RUCNE' });
});

test('z uzávěrek: počítají se základ, příplatky, odměny a doplatek, náhrady ne', () => {
  const slozky = (kod: string, castkaHal: number) => ({ kod, popis: '', vzorec: '', castkaHal });
  const u = { firmaId: 'f1', rok: 2026, mesic: 9, uzavreno: '', vysledky: [{ zamestnanecId: 'z1', jmeno: 'J', smlouva: 'HPP' as const, vysledek: {
    slozky: [slozky('ZAKLAD', 1000000), slozky('PRIPLATEK_SOBOTA', 100000), slozky('PRIPLATEK_NEDELE', 200000), slozky('PRIPLATEK_SVATEK', 300000),
      slozky('ODMENA_ZA_DEN', 400000), slozky('AKTIVITA', 500000), slozky('KASA', 600000), slozky('JINE_ODMENY', 700000), slozky('DOPLATEK_MIN_MZDA', 800000),
      slozky('NAHRADA_DOVOLENA', 900000), slozky('NAHRADA_SVATEK', 900000), slozky('NAHRADA_NAHRADNI_VOLNO', 900000)],
    hodiny: { praceMin: 36000, odpracovaneDny: 21 } } }] };
  // 4 600 000 haléřů za 600 h = 7666,67 haléře/h → 7667
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: [u], minHodHal: 0 })).toEqual({ pvHal: 7667, zdroj: 'Z_UZAVEREK' });
});
test('z uzávěrek: dny se sčítají přes celé čtvrtletí, hranice je 21', () => {
  const u20 = [uz(7, 3000000, 10000, 10), uz(8, 3000000, 10000, 10)];
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: u20 }).zdroj).toBe('NEZNAMY');
  const u21 = [uz(7, 3000000, 10000, 10), uz(8, 3000000, 10000, 11)];
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: u21 })).toEqual({ pvHal: 18000, zdroj: 'Z_UZAVEREK' });
});
test('z uzávěrek: nulové minuty nejdou dělit, zaokrouhlení je na haléře matematicky', () => {
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: [uz(9, 3000000, 0, 21)] }).zdroj).toBe('NEZNAMY');
  // 2460 × 60 / 7200 = 20,5 → 21;  2459 × 60 / 7200 = 20,49 → 20
  expect(vyresPrumernyVydelek({ ...zaklad, minHodHal: 0, uzaverkyPredchozihoCtvrtleti: [uz(9, 2460, 7200, 21)] }).pvHal).toBe(21);
  expect(vyresPrumernyVydelek({ ...zaklad, minHodHal: 0, uzaverkyPredchozihoCtvrtleti: [uz(9, 2459, 7200, 21)] }).pvHal).toBe(20);
});
test('z uzávěrek: výsledek je vždy celé haléře a aspoň minimální mzda', () => {
  const r = vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: [uz(9, 1000001, 10000, 21)] });
  expect(r).toEqual({ pvHal: 13440, zdroj: 'Z_UZAVEREK' }); // 6000,006 haléře/h je pod minimem
  const r2 = vyresPrumernyVydelek({ ...zaklad, minHodHal: 0, uzaverkyPredchozihoCtvrtleti: [uz(9, 3333333, 9999, 21)] });
  expect(Number.isInteger(r2.pvHal)).toBe(true);
});
test('z uzávěrek: jen předchozí čtvrtletí a jen daný zaměstnanec', () => {
  const jenZ2 = { ...uz(9, 0, 0, 0), vysledky: [{ ...uz(9, 9000000, 10000, 30).vysledky[0], zamestnanecId: 'z2' }] };
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: [jenZ2] }).zdroj).toBe('NEZNAMY');
  // uzávěrka z aktuálního čtvrtletí (10/2026) ani z minulého roku se do PV nepočítá
  const mimo = [{ ...uz(10, 3000000, 10000, 21) }, { ...uz(9, 3000000, 10000, 21), rok: 2025 }];
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: mimo }).zdroj).toBe('NEZNAMY');
});
test('z uzávěrek: čtvrtletí přes přelom roku', () => {
  const u = [10, 11, 12].map((m) => ({ ...uz(m, 3000000, 10000, 21), rok: 2025 }));
  expect(vyresPrumernyVydelek({ ...zaklad, rok: 2026, mesic: 2, uzaverkyPredchozihoCtvrtleti: u })).toEqual({ pvHal: 18000, zdroj: 'Z_UZAVEREK' });
});
test('z uzávěrek: poškozený snímek se přeskočí, nespadne', () => {
  const rozbita = { ...uz(8, 0, 0, 0), vysledky: [{ zamestnanecId: 'z1', jmeno: 'J', smlouva: 'HPP' as const, vysledek: null }] };
  const rozbita2 = { ...uz(7, 0, 0, 0), vysledky: [{ zamestnanecId: 'z1', jmeno: 'J', smlouva: 'HPP' as const, vysledek: { slozky: 'x' } }] };
  expect(vyresPrumernyVydelek({ ...zaklad, uzaverkyPredchozihoCtvrtleti: [rozbita, rozbita2, uz(9, 3000000, 10000, 21)] }))
    .toEqual({ pvHal: 18000, zdroj: 'Z_UZAVEREK' });
});
