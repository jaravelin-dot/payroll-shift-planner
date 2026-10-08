import { dnesniDatum, formatDatum, jeDatum, prvniDenDalsihoMesice } from './datum';

test('dnešní datum v místním čase jako RRRR-MM-DD', () => {
  expect(dnesniDatum(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
  expect(dnesniDatum(new Date(2027, 0, 1, 0, 5))).toBe('2027-01-01');
});

test('jeDatum přijme jen skutečné datum RRRR-MM-DD', () => {
  expect(jeDatum('2026-10-06')).toBe(true);
  expect(jeDatum('2028-02-29')).toBe(true);
  for (const text of ['', '2026-02-30', '2026-13-01', '6. 10. 2026', '2026-1-1']) expect(jeDatum(text)).toBe(false);
});

test('české datum s nezlomitelnými mezerami', () => {
  expect(formatDatum('2026-10-06')).toBe('6. 10. 2026');
});

test('první den dalšího měsíce i přes konec roku', () => {
  expect(prvniDenDalsihoMesice('2026-10-06')).toBe('2026-11-01');
  expect(prvniDenDalsihoMesice('2026-12-31')).toBe('2027-01-01');
});
