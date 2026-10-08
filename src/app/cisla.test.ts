import { formatHodin, formatSazby, halNaText, minutyNaText, textNaCislo, textNaHal, textNaMinuty } from './cisla';

test('Kč zapsané česky se převedou na celé haléře', () => {
  expect(textNaHal('300')).toBe(30000);
  expect(textNaHal('129,50')).toBe(12950);
  expect(textNaHal('129,5')).toBe(12950);
  expect(textNaHal('129.5')).toBe(12950);
  expect(textNaHal(' 1 200 ')).toBe(120000);
  expect(textNaHal('1 200,05')).toBe(120005);
  expect(textNaHal('0')).toBe(0);
});

test('neplatné částky dají null: prázdné, text, tři desetinná místa, záporné', () => {
  for (const text of ['', '   ', 'abc', '12a', '1,234', '1,', ',5', '-5', '1.2.3', '12 Kč']) expect(textNaHal(text)).toBeNull();
});

test('hodiny zapsané česky se převedou na minuty', () => {
  expect(textNaMinuty('30')).toBe(1800);
  expect(textNaMinuty('37,5')).toBe(2250);
  expect(textNaMinuty('38,75')).toBe(2325);
  expect(textNaMinuty('7.25')).toBe(435);
  // 0,01 h = 0,6 min → na celou minutu
  expect(textNaMinuty('0,01')).toBe(1);
  expect(textNaMinuty('abc')).toBeNull();
});

test('záporné hodiny jen tam, kde to dává smysl (převod dovolené)', () => {
  expect(textNaMinuty('-8')).toBeNull();
  expect(textNaMinuty('-8', { zaporne: true })).toBe(-480);
  expect(textNaMinuty('−7,5', { zaporne: true })).toBe(-450);
  expect(textNaMinuty('-0', { zaporne: true })).toBe(0);
});

test('desetinné číslo (týdenní pracovní doba)', () => {
  expect(textNaCislo('40')).toBe(40);
  expect(textNaCislo('37,5')).toBe(37.5);
  expect(textNaCislo('38,75')).toBe(38.75);
  expect(textNaCislo('x')).toBeNull();
});

test('předvyplnění polí: haléře a minuty zpět na text', () => {
  expect(halNaText(30000)).toBe('300');
  expect(halNaText(12950)).toBe('129,50');
  expect(halNaText(5)).toBe('0,05');
  // Záporná částka s nulou celých Kč neztratí minus.
  expect(halNaText(-50)).toBe('-0,50');
  expect(halNaText(-150)).toBe('-1,50');
  expect(halNaText(-100)).toBe('-1');
  expect(halNaText(0)).toBe('0');
  expect(minutyNaText(1800)).toBe('30');
  expect(minutyNaText(2250)).toBe('37,5');
  expect(minutyNaText(465)).toBe('7,75');
  expect(minutyNaText(20)).toBe('0,33');
  expect(minutyNaText(-480)).toBe('-8');
  expect(minutyNaText(0)).toBe('0');
});

test('zobrazení sazby a hodin s úzkou nezlomitelnou mezerou', () => {
  expect(formatSazby(16500)).toBe('165 Kč/h');
  expect(formatSazby(16550)).toBe('165,50 Kč/h');
  // Tisíce jako u všech částek (formatKc): nezlomitelná mezera.
  expect(formatSazby(120050)).toBe('1 200,50 Kč/h');
  expect(formatHodin(2250)).toBe('37,5 h');
  expect(formatHodin(-480)).toBe('−8 h');
});
