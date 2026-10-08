import { spayd } from '../../core/platby';
import type { VysledekVypoctu } from '../../core/typy';
import type { RadekVyplaty } from '../radkyVyplat';
import { zamestnanec } from '../test-utils';
import { platbyMesice } from './platby';
import { vysledekA } from './test-scenar';

// Skutečné spayd() obalené špehem: ověří se, že se nevolá pro nulu ani zápornou částku.
vi.mock('../../core/platby', async (puvodni) => {
  const modul = await puvodni<typeof import('../../core/platby')>();
  return { ...modul, spayd: vi.fn(modul.spayd) };
});

const PLATNY = '19-24619/0800';

function radek(zamestnanecId: string, prijmeni: string, kVyplateHal: number): RadekVyplaty {
  const vysledek: VysledekVypoctu = { ...vysledekA(), kVyplateHal };
  return { zamestnanecId, jmeno: 'Jana', prijmeni, smlouva: 'HPP', vysledek };
}

const RADKY = [
  radek('n', 'Nováková', 3396600),
  radek('c', 'Černý', 1200000),
  radek('b', 'Bílá', 800050),
  radek('d', 'Dvořák', 0),
  radek('m', 'Malá', -50000),
  radek('o', 'Odešlý', 500000), // je jen ve snímku uzávěrky, mezi lidmi měsíce už není
];
const LIDE = [
  zamestnanec({ id: 'n', ucet: PLATNY }),
  zamestnanec({ id: 'c', ucet: null }),
  zamestnanec({ id: 'b', ucet: '124/0800' }), // neprojde kontrolním součtem
  zamestnanec({ id: 'd', ucet: PLATNY }),
  zamestnanec({ id: 'm', ucet: PLATNY }),
];

// Složené závorky: funkce vrácená z beforeEach by se brala jako úklid a zavolala se.
beforeEach(() => {
  vi.mocked(spayd).mockClear();
});

test('platný účet a kladná částka: QR Platba se zprávou „Mzda MM/RRRR Příjmení" a VS MMRRRR', () => {
  const { polozky } = platbyMesice({ radky: RADKY, zamestnanci: LIDE, rok: 2026, mesic: 10 });
  expect(polozky[0]).toMatchObject({
    zamestnanecId: 'n', jmeno: 'Jana Nováková', stav: 'QR', ucet: PLATNY, kVyplateHal: 3396600,
    spayd: 'SPD*1.0*ACC:CZ7508000000190000024619*AM:33966.00*CC:CZK*MSG:Mzda 10/2026 Novakova*X-VS:102026',
  });
  const leden = platbyMesice({ radky: RADKY.slice(0, 1), zamestnanci: LIDE, rok: 2027, mesic: 1 });
  expect(leden.polozky[0]!.spayd).toMatch(/\*MSG:Mzda 01\/2027 Novakova\*X-VS:012027$/);
});

test('bez platného účtu hotově, nula a záporná částka bez QR, člověk bez známého účtu mimo hotovost; součty zvlášť pro účty a hotovost', () => {
  const vysledek = platbyMesice({ radky: RADKY, zamestnanci: LIDE, rok: 2026, mesic: 10 });
  const podleId = Object.fromEntries(vysledek.polozky.map((p) => [p.zamestnanecId, p]));
  expect(podleId.c).toMatchObject({ stav: 'HOTOVE', ucet: null, neplatnyUcet: false });
  expect(podleId.b).toMatchObject({ stav: 'HOTOVE', ucet: '124/0800', neplatnyUcet: true });
  // Člověk jen ve snímku uzávěrky: účet neznáme, takže ne „hotově“.
  expect(podleId.o).toMatchObject({ stav: 'NEZNAMY', ucet: null, neplatnyUcet: false });
  expect(podleId.d).toMatchObject({ stav: 'NIC' });
  expect(podleId.m).toMatchObject({ stav: 'ZAPORNA', kVyplateHal: -50000 });
  for (const id of ['c', 'b', 'o', 'd', 'm']) expect(podleId[id]!.spayd).toBeNull();
  // spayd() vyhodí RangeError u záporné částky; nesmí se zavolat ani pro nulu.
  expect(vi.mocked(spayd).mock.calls.map(([a]) => a.castkaHal)).toEqual([3396600]);

  expect(vysledek.naUcet).toEqual({ pocet: 1, castkaHal: 3396600 });
  expect(vysledek.hotove).toEqual({ pocet: 2, castkaHal: 1200000 + 800050 });
  // Člověk bez známého účtu má vlastní součet; dohromady dávají všechny kladné platby.
  expect(vysledek.neznamy).toEqual({ pocet: 1, castkaHal: 500000 });
  const kladne = vysledek.polozky.filter((p) => p.kVyplateHal > 0);
  expect(vysledek.naUcet.pocet + vysledek.hotove.pocet + vysledek.neznamy.pocet).toBe(kladne.length);
  expect(vysledek.naUcet.castkaHal + vysledek.hotove.castkaHal + vysledek.neznamy.castkaHal).toBe(kladne.reduce((a, p) => a + p.kVyplateHal, 0));
});
