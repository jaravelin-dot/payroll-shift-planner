import { ucetNaIban, spayd } from './platby';

test('IBAN z českého čísla účtu', () => {
  expect(ucetNaIban('19-24619/0800')).toBe('CZ7508000000190000024619');
  expect(ucetNaIban('24619/0800')).toBe('CZ8908000000000000024619');
  expect(ucetNaIban('19/0800')).toBe('CZ3308000000000000000019');
  expect(ucetNaIban('nesmysl')).toBeNull();
});
test('IBAN odmítne číslo účtu s chybným kontrolním součtem', () => {
  expect(ucetNaIban('123456789/0100')).toBeNull(); // 0123456789: vážený součet 210, 210 mod 11 = 1
  expect(ucetNaIban('24618/0800')).toBeNull(); // chybné číslo
  expect(ucetNaIban('20-24619/0800')).toBeNull(); // chybné předčíslí (2 × 2 + 0 × 1 = 4)
});
test('IBAN toleruje mezery', () => {
  expect(ucetNaIban(' 19 - 24619 / 0800 ')).toBe('CZ7508000000190000024619');
  expect(ucetNaIban('24619 / 0800')).toBe('CZ8908000000000000024619');
});
test('IBAN odmítne špatný tvar účtu', () => {
  expect(ucetNaIban('')).toBeNull();
  expect(ucetNaIban('24619')).toBeNull(); // chybí kód banky
  expect(ucetNaIban('24619/800')).toBeNull(); // kód banky má mít 4 číslice
  expect(ucetNaIban('24619/08000')).toBeNull();
  expect(ucetNaIban('5/0800')).toBeNull(); // číslo účtu aspoň 2 číslice
  expect(ucetNaIban('24619000001/0800')).toBeNull(); // číslo účtu nejvýš 10 číslic
  expect(ucetNaIban('1234567-24619/0800')).toBeNull(); // předčíslí nejvýš 6 číslic
  expect(ucetNaIban('-24619/0800')).toBeNull(); // prázdné předčíslí
  expect(ucetNaIban('19-24619/08A0')).toBeNull();
});

test('SPAYD', () => {
  expect(spayd({ iban: 'CZ7508000000190000024619', castkaHal: 3396600, zprava: 'Mzda 10/2026 Nováková', vs: '102026' }))
    .toBe('SPD*1.0*ACC:CZ7508000000190000024619*AM:33966.00*CC:CZK*MSG:Mzda 10/2026 Novakova*X-VS:102026');
});
test('SPAYD: částka se dvěma desetinnými místy a tečkou', () => {
  const iban = 'CZ7508000000190000024619';
  expect(spayd({ iban, castkaHal: 1234550, zprava: 'x' })).toContain('*AM:12345.50*');
  expect(spayd({ iban, castkaHal: 5, zprava: 'x' })).toContain('*AM:0.05*');
  expect(spayd({ iban, castkaHal: 100, zprava: 'x' })).toContain('*AM:1.00*');
  expect(spayd({ iban, castkaHal: 0, zprava: 'x' })).toContain('*AM:0.00*');
});
test('SPAYD: variabilní symbol jen když je zadaný', () => {
  const iban = 'CZ7508000000190000024619';
  expect(spayd({ iban, castkaHal: 100, zprava: 'x' })).not.toContain('X-VS');
  expect(spayd({ iban, castkaHal: 100, zprava: 'x', vs: '' })).not.toContain('X-VS');
  expect(spayd({ iban, castkaHal: 100, zprava: 'x', vs: '0123456789' })).toMatch(/\*X-VS:0123456789$/);
});
test('SPAYD: zpráva bez diakritiky, bez hvězdičky, nejvýš 60 znaků', () => {
  const iban = 'CZ7508000000190000024619';
  expect(spayd({ iban, castkaHal: 100, zprava: 'Žluťoučký kůň úpěl ďábelské ódy' })).toContain('*MSG:Zlutoucky kun upel dabelske ody');
  expect(spayd({ iban, castkaHal: 100, zprava: 'a*b*c' })).toContain('*MSG:abc');
  const dlouha = spayd({ iban, castkaHal: 100, zprava: 'ž'.repeat(100) });
  expect(dlouha).toBe(`SPD*1.0*ACC:${iban}*AM:1.00*CC:CZK*MSG:${'z'.repeat(60)}`);
  // hvězdičky se odstraní dřív než se krátí, takže zpráva má plných 60 znaků
  expect(spayd({ iban, castkaHal: 100, zprava: `${'*'.repeat(10)}${'b'.repeat(70)}` })).toContain(`*MSG:${'b'.repeat(60)}`);
});
test('SPAYD: zpráva jen z tisknutelného ASCII (Ł → L, jiná nelatinská písmena pryč, řídicí znaky pryč)', () => {
  const iban = 'CZ7508000000190000024619';
  const msg = (zprava: string) => spayd({ iban, castkaHal: 100, zprava }).split('*MSG:')[1];
  expect(msg('Łukasz Wójcik')).toBe('Lukasz Wojcik');
  expect(msg('Mzda\n10/2026\r\n\tNovák')).toBe('Mzda10/2026Novak');
  expect(msg('Ольга Ünal 日本 €5 ß')).toMatch(/^[\x20-\x7e]*$/);
  expect(msg('Ольга Ünal 日本 €5 ß')).toBe(' Unal  5 ss');
  expect(msg('x\u0000y\u007fz')).toBe('xyz');
});
test('IBAN: číslo účtu samé nuly není platný účet', () => {
  expect(ucetNaIban('0000000000/0800')).toBeNull();
  expect(ucetNaIban('00/0800')).toBeNull();
  expect(ucetNaIban('19-0000000000/0800')).toBeNull();
});
test('SPAYD: neplatný vstup je chyba', () => {
  const iban = 'CZ7508000000190000024619';
  expect(() => spayd({ iban, castkaHal: 100.5, zprava: 'x' })).toThrow(RangeError);
  expect(() => spayd({ iban, castkaHal: -100, zprava: 'x' })).toThrow(RangeError);
  expect(() => spayd({ iban, castkaHal: 100, zprava: 'x', vs: '12345678901' })).toThrow(RangeError);
  expect(() => spayd({ iban, castkaHal: 100, zprava: 'x', vs: '12A' })).toThrow(RangeError);
  expect(() => spayd({ iban: 'CZ65*0800', castkaHal: 100, zprava: 'x' })).toThrow(RangeError);
});
