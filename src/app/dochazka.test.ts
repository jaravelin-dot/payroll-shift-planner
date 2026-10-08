import type { Den, TypDne } from '../shared/api';
import { dnyNemoci, mimoPomer, nazevDne, obvykleMinuty, typyProDny, vMesici, vychoziMinuty, zkopirujMinulyTyden } from './dochazka';
import { zamestnanec } from './test-utils';

const den = (datum: string, typ: TypDne, minuty = 480, kasa = false): Den => ({ zamestnanecId: 'z1', datum, typ, minuty, kasa, poznamka: null });

test('název dne česky: den v týdnu a datum v 2. pádě', () => {
  expect(nazevDne('2026-10-01')).toBe('Čtvrtek 1. října');
  expect(nazevDne('2026-10-28')).toBe('Středa 28. října');
  expect(nazevDne('2027-01-03')).toBe('Neděle 3. ledna');
});

test('Svátek – zavřeno jen ve svátek a jen u HPP', () => {
  const vsechny: TypDne[] = ['PRACE', 'DOVOLENA', 'NEMOC', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE', 'ABSENCE'];
  expect(typyProDny(['2026-10-28'], 'HPP')).toEqual(vsechny);
  expect(typyProDny(['2026-10-27'], 'HPP')).not.toContain('SVATEK_ZAVRENO');
  expect(typyProDny(['2026-10-28', '2026-10-27'], 'HPP')).not.toContain('SVATEK_ZAVRENO');
  expect(typyProDny(['2026-10-28'], 'DPP')).not.toContain('SVATEK_ZAVRENO');
  expect(typyProDny(['2026-10-28'], 'DPP')).toHaveLength(6);
});

test('obvyklá směna: nejčastější délka práce, jinak úvazek / 5, u DPP 8 h', () => {
  const hpp = zamestnanec({ uvazekMinTydne: 1800 });
  expect(obvykleMinuty([den('2026-10-01', 'PRACE', 360), den('2026-10-02', 'PRACE', 480), den('2026-10-05', 'PRACE', 360), den('2026-10-06', 'DOVOLENA', 600)], hpp)).toBe(360);
  expect(obvykleMinuty([], hpp)).toBe(360);
  expect(obvykleMinuty([], zamestnanec({ smlouva: 'DPP', uvazekMinTydne: 0 }))).toBe(480);
});

test('výchozí hodiny = poslední zadaný den téhož typu před datem, jinak obvyklá směna', () => {
  const z = zamestnanec();
  const dny = [den('2026-09-29', 'DOVOLENA', 240), den('2026-10-02', 'DOVOLENA', 300), den('2026-10-20', 'DOVOLENA', 120), den('2026-10-05', 'PRACE', 420)];
  expect(vychoziMinuty('DOVOLENA', '2026-10-10', dny, z)).toBe(300);
  expect(vychoziMinuty('DOVOLENA', '2026-09-01', dny, z)).toBe(120); // před datem nic → poslední vůbec
  expect(vychoziMinuty('NAHRADNI_VOLNO', '2026-10-10', dny, z)).toBe(420); // nic téhož typu → obvyklá směna
  // Nemoc: dny s 0 minutami (víkend) se jako vzor neberou.
  expect(vychoziMinuty('NEMOC', '2026-10-10', [den('2026-10-02', 'NEMOC', 450), den('2026-10-03', 'NEMOC', 0)], z)).toBe(450);
});

test('nemoc od–do zapíše každý kalendářní den: pracovní dny s hodinami, víkendy a svátky s 0', () => {
  const z = zamestnanec();
  const dny = dnyNemoci('2026-10-23', '2026-10-29', 450, z);
  expect(dny.map((d) => [d.datum, d.typ, d.minuty])).toEqual([
    ['2026-10-23', 'NEMOC', 450], ['2026-10-24', 'NEMOC', 0], ['2026-10-25', 'NEMOC', 0], ['2026-10-26', 'NEMOC', 450],
    ['2026-10-27', 'NEMOC', 450], ['2026-10-28', 'NEMOC', 0], ['2026-10-29', 'NEMOC', 450],
  ]);
  expect(dny.every((d) => d.kasa === false && d.poznamka === null)).toBe(true);
});

test('nemoc na jediný den zapíše přesně zadané hodiny (i o víkendu); přes hranici měsíce pokračuje', () => {
  const z = zamestnanec();
  expect(dnyNemoci('2026-10-24', '2026-10-24', 300, z).map((d) => d.minuty)).toEqual([300]);
  expect(dnyNemoci('2026-10-30', '2026-11-02', 480, z).map((d) => d.datum)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  expect(dnyNemoci('2026-10-05', '2026-10-01', 480, z)).toEqual([]); // obrácený rozsah
});

test('nemoc vynechá dny mimo pracovní poměr', () => {
  const z = zamestnanec({ nastup: '2026-10-03', ukonceni: '2026-10-05' });
  expect(dnyNemoci('2026-10-01', '2026-10-07', 480, z).map((d) => d.datum)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
  expect(mimoPomer('2026-10-02', z)).toBe(true);
  expect(mimoPomer('2026-10-03', z)).toBe(false);
  expect(mimoPomer('2026-10-06', z)).toBe(true);
});

test('zkopírovat minulý týden: jen prázdné dny v měsíci, svátek a Svátek – zavřeno vynechá', () => {
  const z = zamestnanec();
  // Týden 26. 10. – 1. 11. 2026; 28. 10. je svátek, 1. 11. už je v listopadu.
  const dny = [
    den('2026-10-19', 'PRACE', 480, true), den('2026-10-20', 'PRACE', 360), den('2026-10-21', 'PRACE', 480),
    den('2026-10-22', 'DOVOLENA', 480), den('2026-10-24', 'PRACE', 300), den('2026-10-25', 'PRACE', 240),
    den('2026-10-27', 'NEMOC', 480), // už vyplněný → zůstane
  ];
  const { dny: kopie, preskocenySvatek } = zkopirujMinulyTyden('2026-10-28', dny, 2026, 10, z);
  expect(kopie.map((d) => [d.datum, d.typ, d.minuty, d.kasa])).toEqual([
    ['2026-10-26', 'PRACE', 480, true], ['2026-10-29', 'DOVOLENA', 480, false], ['2026-10-31', 'PRACE', 300, false],
  ]);
  expect(preskocenySvatek).toEqual(['2026-10-28']);
  expect(kopie.every((d) => d.poznamka === null)).toBe(true);
});

test('zkopírovat minulý týden bere i dny předchozího měsíce', () => {
  const z = zamestnanec();
  const { dny: kopie } = zkopirujMinulyTyden('2026-10-01', [den('2026-09-21', 'PRACE', 480), den('2026-09-24', 'PRACE', 420)], 2026, 10, z);
  // Týden 28. 9. – 4. 10.: září se nevyplňuje, 1. 10. podle 24. 9.
  expect(kopie.map((d) => [d.datum, d.minuty])).toEqual([['2026-10-01', 420]]);
});

test('vMesici: měsíc v 6. pádě („v říjnu", ne „v měsíci říjen")', () => {
  expect([1, 2, 7, 9, 10, 11, 12].map(vMesici)).toEqual(['v lednu', 'v únoru', 'v červenci', 'v září', 'v říjnu', 'v listopadu', 'v prosinci']);
});
