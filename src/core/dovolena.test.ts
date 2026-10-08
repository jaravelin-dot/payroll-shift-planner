import { narokDovoleneHppMin, narokDovoleneDppMin, zustatekDovolene } from './dovolena';
import { zam } from './test-utils';

test('HPP celý rok a poměrně', () => {
  expect(narokDovoleneHppMin(zam(), 2026)).toBe(160 * 60);
  expect(narokDovoleneHppMin(zam({ nastup: '2026-07-01' }), 2026)).toBe(81 * 60);
  expect(narokDovoleneHppMin(zam({ uvazekMinTydne: 1200 }), 2026)).toBe(80 * 60);
});
test('HPP: poměrně k ukončení, přestupný rok a pracovní poměr mimo rok', () => {
  // 1. 1.–30. 6. = 181 dní z 365: 9600 × 181 / 365 = 4760,5 min = 79,3 h → 80 h
  expect(narokDovoleneHppMin(zam({ ukonceni: '2026-06-30' }), 2026)).toBe(80 * 60);
  // nástup i ukončení v roce, včetně obou krajních dnů: 1. 3.–31. 3. = 31 dní → 9600 × 31 / 365 = 815,3 min = 13,6 h → 14 h
  expect(narokDovoleneHppMin(zam({ nastup: '2026-03-01', ukonceni: '2026-03-31' }), 2026)).toBe(14 * 60);
  // přestupný rok má 366 dní a celý rok pořád dává plný nárok
  expect(narokDovoleneHppMin(zam(), 2028)).toBe(160 * 60);
  expect(narokDovoleneHppMin(zam({ nastup: '2028-07-01' }), 2028)).toBe(81 * 60); // 184 dní z 366: 4825,2 min = 80,4 h → 81 h
  // jediný den (31. 12.): 9600 / 365 = 26,3 min = 0,44 h → 1 h
  expect(narokDovoleneHppMin(zam({ nastup: '2026-12-31' }), 2026)).toBe(60);
  // pracovní poměr, který v roce neexistoval, nárok nedává
  expect(narokDovoleneHppMin(zam({ nastup: '2027-01-01' }), 2026)).toBe(0);
  expect(narokDovoleneHppMin(zam({ nastup: '2019-01-01', ukonceni: '2025-12-31' }), 2026)).toBe(0);
});
test('HPP: přesně dělitelný nárok se nezaokrouhluje nahoru', () => {
  // 4 × 2400 min × 365 / 365 / 60 = 160 h přesně, nesmí vyjít 161
  expect(narokDovoleneHppMin(zam({ uvazekMinTydne: 2400, nastup: '2026-01-01', ukonceni: '2026-12-31' }), 2026)).toBe(160 * 60);
});

test('HPP: neexistující kalendářní datum je chyba (2026-02-30, 2026-13-01, 2026-04-31)', () => {
  expect(() => narokDovoleneHppMin(zam({ nastup: '2026-02-30' }), 2026)).toThrow(RangeError);
  expect(() => narokDovoleneHppMin(zam({ nastup: '2026-02-30' }), 2026)).toThrow('Neplatné datum: 2026-02-30');
  expect(() => narokDovoleneHppMin(zam({ ukonceni: '2026-04-31' }), 2026)).toThrow(RangeError);
  expect(() => narokDovoleneHppMin(zam({ nastup: '2026-13-01' }), 2026)).toThrow(RangeError);
  expect(() => narokDovoleneHppMin(zam({ nastup: '2026-2-3' }), 2026)).toThrow(RangeError);
  // 29. 2. existuje jen v přestupném roce
  expect(() => narokDovoleneHppMin(zam({ nastup: '2026-02-29' }), 2026)).toThrow(RangeError);
  expect(narokDovoleneHppMin(zam({ nastup: '2028-02-29' }), 2028)).toBeGreaterThan(0);
});

test('DPP po celých 20 h', () => {
  expect(narokDovoleneDppMin(79 * 60)).toBe(5 * 60);
  expect(narokDovoleneDppMin(80 * 60)).toBe(7 * 60);
  expect(narokDovoleneDppMin(300 * 60)).toBe(24 * 60);
});
test('DPP: pod 20 h nárok není', () => {
  expect(narokDovoleneDppMin(0)).toBe(0);
  expect(narokDovoleneDppMin(19 * 60 + 59)).toBe(0);
  expect(narokDovoleneDppMin(20 * 60)).toBe(2 * 60); // 20 × 4 / 52 = 1,54 → 2 h
});

test('zůstatek HPP: nárok + navíc + převod − čerpáno', () => {
  const r = zustatekDovolene({ z: zam(), rok: 2026, cerpanoMin: 40 * 60, praceMin: 0,
    zustatek: { zamestnanecId: 'z1', rok: 2026, prevodMin: 16 * 60, narokNavicMin: 8 * 60 } });
  expect(r).toEqual({ narokMin: (160 + 8 + 16) * 60, cerpanoMin: 40 * 60, zbyvaMin: (184 - 40) * 60 });
});
test('zůstatek HPP bez záznamu zůstatku', () => {
  expect(zustatekDovolene({ z: zam(), rok: 2026, cerpanoMin: 0, praceMin: 123456, zustatek: null }))
    .toEqual({ narokMin: 160 * 60, cerpanoMin: 0, zbyvaMin: 160 * 60 });
});
test('zůstatek HPP může být záporný, když čerpal víc než nárok', () => {
  expect(zustatekDovolene({ z: zam(), rok: 2026, cerpanoMin: 168 * 60, praceMin: 0, zustatek: null }).zbyvaMin).toBe(-8 * 60);
});
test('zůstatek DPP: nárok z odpracovaných hodin v roce', () => {
  const dpp = zam({ smlouva: 'DPP' });
  expect(zustatekDovolene({ z: dpp, rok: 2026, cerpanoMin: 2 * 60, praceMin: 80 * 60, zustatek: null }))
    .toEqual({ narokMin: 7 * 60, cerpanoMin: 2 * 60, zbyvaMin: 5 * 60 });
  expect(zustatekDovolene({ z: dpp, rok: 2026, cerpanoMin: 0, praceMin: 10 * 60, zustatek: null }).narokMin).toBe(0);
});
test('zůstatek DPP: převod a nárok navíc se přičtou stejně jako u HPP', () => {
  const r = zustatekDovolene({ z: zam({ smlouva: 'DPP' }), rok: 2026, cerpanoMin: 0, praceMin: 80 * 60,
    zustatek: { zamestnanecId: 'z1', rok: 2026, prevodMin: 60, narokNavicMin: 120 } });
  expect(r.narokMin).toBe(7 * 60 + 60 + 120);
});
