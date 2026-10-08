import { redukovanyPvHal, dnyNahradyNemoci } from './nemoc';
import { den } from './test-utils';
import { parametryRoku } from './parametry';
const H: [number, number, number] = [28578, 42858, 85698];
test('redukce průměrného výdělku', () => {
  expect(redukovanyPvHal(20000, H)).toBe(18000);
  expect(redukovanyPvHal(35000, H)).toBe(29573);
  expect(redukovanyPvHal(90000, H)).toBe(47140);
});
test('epizoda přes hranici měsíce: 25. 9.–10. 10.', () => {
  const zari = ['2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30']
    .map((d) => den(d, 'NEMOC', ['2026-09-26','2026-09-27'].includes(d) ? 0 : 8));
  const rijen = ['01','02','03','04','05','06','07','08','09','10'].map((d) => {
    const datum = `2026-10-${d}`;
    const vikend = ['03','04','10'].includes(d);
    return den(datum, 'NEMOC', vikend ? 0 : 8);
  });
  const r = dnyNahradyNemoci(rijen, zari);
  expect(r.nahrazovane.map((d) => d.datum)).toEqual(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08']);
  expect(r.nadLimit.map((d) => d.datum)).toEqual(['2026-10-09']);
});
test('přerušená nemoc začíná novou epizodu', () => {
  const dny = [den('2026-10-01', 'NEMOC', 8), den('2026-10-02', 'PRACE', 8), den('2026-10-05', 'NEMOC', 8)];
  expect(dnyNahradyNemoci(dny, []).nahrazovane).toHaveLength(2);
});

test('redukce na hranicích a u nuly; funguje i s parametry roku (readonly)', () => {
  expect(redukovanyPvHal(0, H)).toBe(0);
  expect(redukovanyPvHal(28578, H)).toBe(25720); // 0,9 × 285,78 Kč = 257,202 Kč
  expect(redukovanyPvHal(42858, H)).toBe(25720 + 8568); // + 60 % z (428,58 − 285,78) Kč
  expect(redukovanyPvHal(85698, H)).toBe(25720 + 8568 + 12852);
  const p = parametryRoku(2026);
  expect(redukovanyPvHal(35000, p.redukcniHraniceHal)).toBe(29573);
});
test('redukce se zaokrouhluje matematicky na celé haléře', () => {
  // 0,9 × 28578 = 25720,2 → 25720; + 0,6 × 1 = 25720,8 → 25721
  expect(redukovanyPvHal(28579, H)).toBe(25721);
  // 0,9 × 5 = 4,5 → 5 (půl nahoru)
  expect(redukovanyPvHal(5, H)).toBe(5);
});

test('epizoda bez předchozího měsíce: 14. den je ještě náhrada, 15. už ne', () => {
  const dny = Array.from({ length: 16 }, (_, i) => den(`2026-10-${String(i + 1).padStart(2, '0')}`, 'NEMOC', 8));
  const r = dnyNahradyNemoci(dny, []);
  expect(r.nahrazovane).toHaveLength(14);
  expect(r.nahrazovane[13].datum).toBe('2026-10-14');
  expect(r.nadLimit.map((d) => d.datum)).toEqual(['2026-10-15', '2026-10-16']);
});
test('dny s 0 minutami počítají do pořadí, ale samy se neproplácejí', () => {
  const dny = [den('2026-10-01', 'NEMOC', 0), den('2026-10-02', 'NEMOC', 0)];
  const r = dnyNahradyNemoci(dny, []);
  expect(r.nahrazovane).toEqual([]);
  expect(r.nadLimit).toEqual([]);
});
test('přerušení epizody v předchozím měsíci: po práci začíná počítání znovu', () => {
  // 16. 9.–29. 9. = 14 dnů nemoci, 30. 9. práce → 1. 10. je 1. den nové epizody.
  const dlouha = Array.from({ length: 14 }, (_, i) => den(`2026-09-${16 + i}`, 'NEMOC', 8));
  const dny = [den('2026-10-01', 'NEMOC', 8), den('2026-10-02', 'NEMOC', 8)];
  const sPraci = dnyNahradyNemoci(dny, [...dlouha, den('2026-09-30', 'PRACE', 8)]);
  expect(sPraci.nahrazovane.map((d) => d.datum)).toEqual(['2026-10-01', '2026-10-02']);
  expect(sPraci.nadLimit).toEqual([]);
  // Bez přerušení (30. 9. nemoc) je 1. 10. 16. den epizody → už bez náhrady.
  const bezPrace = dnyNahradyNemoci(dny, [...dlouha, den('2026-09-30', 'NEMOC', 8)]);
  expect(bezPrace.nahrazovane).toEqual([]);
  expect(bezPrace.nadLimit.map((d) => d.datum)).toEqual(['2026-10-01', '2026-10-02']);
  // Chybějící 30. 9. (mezera v datech) epizodu také přeruší.
  expect(dnyNahradyNemoci(dny, dlouha).nahrazovane).toHaveLength(2);
});
test('pořadí se počítá od začátku epizody v předchozím měsíci, nezávisle na seřazení vstupu', () => {
  // 20. 9.–30. 9. = 11 dnů nemoci, 1. 10. = 12., 2. 10. = 13., 3. 10. = 14., 4. 10. = 15. den.
  const prev = Array.from({ length: 11 }, (_, i) => den(`2026-09-${20 + i}`, 'NEMOC', 8)).reverse();
  const dny = [den('2026-10-04', 'NEMOC', 8), den('2026-10-01', 'NEMOC', 8), den('2026-10-03', 'NEMOC', 8), den('2026-10-02', 'NEMOC', 8)];
  const r = dnyNahradyNemoci(dny, prev);
  expect(r.nahrazovane.map((d) => d.datum)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  expect(r.nadLimit.map((d) => d.datum)).toEqual(['2026-10-04']);
});
test('jiné typy dnů se do výsledku nedostanou', () => {
  const dny = [den('2026-10-01', 'PRACE', 8), den('2026-10-02', 'DOVOLENA', 8)];
  expect(dnyNahradyNemoci(dny, [])).toEqual({ nahrazovane: [], nadLimit: [] });
});
