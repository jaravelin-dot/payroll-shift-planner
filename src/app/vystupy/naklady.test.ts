import type { VysledekVypoctu } from '../../core/typy';
import type { Uzaverka } from '../../shared/api';
import { nakladyRoku, soucetNakladu } from './naklady';
import { vysledekA } from './test-scenar';

const A = vysledekA();
/** Výsledek s náhradou za nemoc a slevou na pojistném, ať se ověří všechny části nákladu. */
const S_NEMOCI: VysledekVypoctu = {
  ...A,
  nahradaNemocHal: 120000,
  pojisteni: { ...A.pojisteni, slevaPojistneKc: 500 },
  nakladFirmyHal: A.nakladFirmyHal + 120000 - 50000,
};

const uzaverka = (mesic: number, vysledky: VysledekVypoctu[]): Uzaverka => ({
  firmaId: 'f1', rok: 2026, mesic, uzavreno: `2026-${String(mesic + 1).padStart(2, '0')}-03T10:00:00.000Z`,
  vysledky: vysledky.map((vysledek, i) => ({ zamestnanecId: `z${i}`, jmeno: 'Jana Nováková', smlouva: 'HPP', vysledek })),
});

test('12 měsíců: uzavřené ze snímků, vybraný otevřený měsíc přepočtem, ostatní neuzavřené', () => {
  const mesice = nakladyRoku({ uzaverky: [uzaverka(9, [A, S_NEMOCI]), uzaverka(8, [A])], rozpracovany: { mesic: 10, vysledky: [A] } });
  expect(mesice.map((m) => m.mesic)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(mesice.map((m) => m.stav)).toEqual([
    'NEUZAVRENO', 'NEUZAVRENO', 'NEUZAVRENO', 'NEUZAVRENO', 'NEUZAVRENO', 'NEUZAVRENO', 'NEUZAVRENO',
    'UZAVRENO', 'UZAVRENO', 'ROZPRACOVANO', 'NEUZAVRENO', 'NEUZAVRENO',
  ]);
  expect(mesice[0]).toEqual({ mesic: 1, stav: 'NEUZAVRENO', pocetLidi: 0, hrubeHal: 0, odvodyHal: 0, stravneHal: 0, nemocHal: 0, celkemHal: 0 });

  const odvodyA = (A.pojisteni.socialniFirmaKc + A.pojisteni.zdravotniFirmaKc) * 100;
  expect(mesice[7]).toEqual({
    mesic: 8, stav: 'UZAVRENO', pocetLidi: 1, hrubeHal: 3544000, odvodyHal: odvodyA, stravneHal: 284900, nemocHal: 0, celkemHal: 5026900,
  });
  expect(mesice[8]).toEqual({
    mesic: 9, stav: 'UZAVRENO', pocetLidi: 2, hrubeHal: 2 * 3544000, odvodyHal: 2 * odvodyA - 50000, stravneHal: 2 * 284900, nemocHal: 120000,
    celkemHal: 2 * 5026900 + 120000 - 50000,
  });
  expect(mesice[9]).toMatchObject({ stav: 'ROZPRACOVANO', celkemHal: 5026900 });
  // Části dají dohromady náklad firmy z jádra.
  for (const m of mesice) expect(m.hrubeHal + m.odvodyHal + m.stravneHal + m.nemocHal).toBe(m.celkemHal);
});

test('uzavřený vybraný měsíc se nepřepíše přepočtem; součet roku', () => {
  const mesice = nakladyRoku({ uzaverky: [uzaverka(10, [A])], rozpracovany: null });
  expect(mesice[9]).toMatchObject({ stav: 'UZAVRENO', celkemHal: 5026900 });
  expect(soucetNakladu(mesice)).toMatchObject({ celkemHal: 5026900, hrubeHal: 3544000, pocetMesicu: 1, vcetneRozpracovaneho: false });
  const sRozpracovanym = nakladyRoku({ uzaverky: [uzaverka(9, [A])], rozpracovany: { mesic: 10, vysledky: [A] } });
  expect(soucetNakladu(sRozpracovanym)).toMatchObject({ celkemHal: 2 * 5026900, pocetMesicu: 2, vcetneRozpracovaneho: true });
});
