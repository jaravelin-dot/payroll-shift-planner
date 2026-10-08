import { zaokrouhliHalNaKc, zaokrouhliZlomekNaKc, halNaKcNahoru, halNaKcDolu, procentoNahoru, procentoDolu, nasobHal, formatKc, kcNaHal, deleniNahoru, deleniDolu } from './penize';
test('zaokrouhlení na celé Kč matematicky', () => {
  expect(zaokrouhliHalNaKc(15049)).toBe(15000);
  expect(zaokrouhliHalNaKc(15050)).toBe(15100);
  expect(zaokrouhliHalNaKc(-150)).toBe(-200);
});
test('zlomek haléřů na celé Kč: půl koruny nahoru, přesně v integerech', () => {
  expect(zaokrouhliZlomekNaKc(15049, 1)).toBe(15000);
  expect(zaokrouhliZlomekNaKc(15050, 1)).toBe(15100);
  expect(zaokrouhliZlomekNaKc(0, 60)).toBe(0);
  // 6 × 1 minuta při 5 Kč/h: 3000 / 60 = přesně 50 haléřů → 1 Kč; o haléř míň → 0
  expect(zaokrouhliZlomekNaKc(3000, 60)).toBe(100);
  expect(zaokrouhliZlomekNaKc(2999, 60)).toBe(0);
  // 19 000 hal × 480 min / 600 = 15 200 hal přesně
  expect(zaokrouhliZlomekNaKc(19000 * 480, 600)).toBe(15200);
  // 150 / 3 = přesně 50 haléřů → 1 Kč, 149 / 3 = 49,67 haléře → 0
  expect(zaokrouhliZlomekNaKc(150, 3)).toBe(100);
  expect(zaokrouhliZlomekNaKc(149, 3)).toBe(0);
  // velká čísla: 123456789012345 / 600 = 205761315020,575 hal
  expect(zaokrouhliZlomekNaKc(123456789012345, 600)).toBe(205761315000);
});
test('zlomek haléřů na celé Kč: záporné hodnoty symetricky (půl od nuly), nikdy -0', () => {
  expect(zaokrouhliZlomekNaKc(-15049, 1)).toBe(-15000);
  expect(zaokrouhliZlomekNaKc(-15050, 1)).toBe(-15100);
  expect(zaokrouhliZlomekNaKc(-150, 1)).toBe(-200);
  expect(zaokrouhliZlomekNaKc(-3000, 60)).toBe(-100);
  expect(Object.is(zaokrouhliZlomekNaKc(-49, 1), 0)).toBe(true);
  expect(Object.is(zaokrouhliZlomekNaKc(0, 1), 0)).toBe(true);
});
test('zlomek haléřů na celé Kč: neplatný vstup hlásí chybu', () => {
  expect(() => zaokrouhliZlomekNaKc(100, 0)).toThrow(RangeError);
  expect(() => zaokrouhliZlomekNaKc(100, -60)).toThrow(RangeError);
  expect(() => zaokrouhliZlomekNaKc(100, 0.5)).toThrow(RangeError);
  expect(() => zaokrouhliZlomekNaKc(100.5, 60)).toThrow(RangeError);
  expect(() => zaokrouhliZlomekNaKc(NaN, 60)).toThrow(RangeError);
});
test('Kč nahoru a dolů', () => {
  expect(halNaKcNahoru(3889501)).toBe(38896);
  expect(halNaKcNahoru(3889500)).toBe(38895);
  expect(halNaKcDolu(720099)).toBe(7200);
});
test('procenta v celých Kč bez chyb plovoucí čárky', () => {
  expect(procentoNahoru(38895, 71)).toBe(2762);
  expect(procentoNahoru(38895, 135)).toBe(5251);
  expect(procentoNahoru(14000, 135)).toBe(1890);
  expect(procentoNahoru(10200, 50)).toBe(510);
  expect(procentoNahoru(38900, 150)).toBe(5835);
  expect(procentoDolu(7200, 150)).toBe(1080);
  expect(procentoNahoru(100, 71)).toBe(8);
});
test('násobení haléřů', () => {
  expect(nasobHal(16000, 169)).toBe(2704000);
  expect(nasobHal(19000, 0.1 * 6)).toBe(11400);
  expect(kcNaHal(129.5)).toBe(12950);
});
test('formát Kč', () => {
  expect(formatKc(3889500)).toBe('38\u00a0895 Kč');
  expect(formatKc(284900)).toBe('2\u00a0849 Kč');
  expect(formatKc(284950)).toBe('2\u00a0849,50 Kč');
  expect(formatKc(-50000)).toBe('\u2212500 Kč');
});
test('formát Kč: nula, jednotlivé haléře, miliony', () => {
  expect(formatKc(0)).toBe('0 Kč');
  expect(formatKc(5)).toBe('0,05 Kč');
  expect(formatKc(100000000)).toBe('1\u00a0000\u00a0000 Kč');
});
test('celočíselné dělení nahoru a dolů, i pro záporná čísla, nikdy -0', () => {
  expect(deleniNahoru(7, 2)).toBe(4);
  expect(deleniNahoru(6, 2)).toBe(3);
  expect(deleniNahoru(-7, 2)).toBe(-3);
  expect(deleniDolu(7, 2)).toBe(3);
  expect(deleniDolu(-7, 2)).toBe(-4);
  expect(deleniDolu(-6, 2)).toBe(-3);
  expect(Object.is(deleniNahoru(-1, 2), 0)).toBe(true);
  expect(Object.is(deleniNahoru(0, 5), 0)).toBe(true);
  // ⌈10 200 × 13,5 % / 3⌉ bez chyby plovoucí čárky: 1 377 / 3 = 459 přesně
  expect(deleniNahoru(1377, 3)).toBe(459);
});
