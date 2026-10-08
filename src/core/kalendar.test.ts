import { svatky, jeSvatek, denVTydnu, dnyMesice, ctvrtleti, predchoziCtvrtleti, mesiceCtvrtleti, posunDatum, hodinovaMinMzdaHal, predchoziMesic, hodinovaMinimalniMzdaProZamestnance } from './kalendar';
import { parametryRoku } from './parametry';
import { VYCHOZI_NASTAVENI } from '../shared/api';
test('svátky 2026', () => {
  expect([...svatky(2026).keys()].sort()).toEqual([
    '2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-05-08','2026-07-05','2026-07-06',
    '2026-09-28','2026-10-28','2026-11-17','2026-12-24','2026-12-25','2026-12-26']);
});
test('Velikonoce 2027', () => {
  expect(jeSvatek('2027-03-26')).toBe(true);
  expect(jeSvatek('2027-03-29')).toBe(true);
  expect(jeSvatek('2027-03-30')).toBe(false);
});
test('dny v týdnu a měsíce', () => {
  expect(denVTydnu('2026-10-01')).toBe(4);
  expect(denVTydnu('2026-10-04')).toBe(7);
  expect(dnyMesice(2026, 2)).toHaveLength(28);
  expect(dnyMesice(2028, 2)).toHaveLength(29);
  expect(posunDatum('2026-10-01', -1)).toBe('2026-09-30');
});
test('čtvrtletí', () => {
  expect(ctvrtleti(10)).toBe(4);
  expect(mesiceCtvrtleti(2026, 11)).toEqual([{ rok: 2026, mesic: 10 }, { rok: 2026, mesic: 11 }, { rok: 2026, mesic: 12 }]);
  expect(predchoziCtvrtleti(2026, 2)).toEqual([{ rok: 2025, mesic: 10 }, { rok: 2025, mesic: 11 }, { rok: 2025, mesic: 12 }]);
});
test('hodinová minimální mzda podle týdenní doby', () => {
  const p = parametryRoku(2026);
  expect(hodinovaMinMzdaHal(p, 40)).toBe(13440);
  expect(hodinovaMinMzdaHal(p, 37.5)).toBe(14340);
  expect(hodinovaMinMzdaHal(p, 38.75)).toBe(13880);
});
test('svátky 2027 — celý seznam', () => {
  expect([...svatky(2027).keys()]).toEqual([
    '2027-01-01','2027-03-26','2027-03-29','2027-05-01','2027-05-08','2027-07-05','2027-07-06',
    '2027-09-28','2027-10-28','2027-11-17','2027-12-24','2027-12-25','2027-12-26']);
});
test.each([
  ['2008-03-24'],
  ['2024-04-01'],
  ['2025-04-21'],
  ['2038-04-26'],
])('Velikonoční pondělí %s', (datum) => {
  expect(svatky(Number(datum.slice(0, 4))).get(datum)).toBe('Velikonoční pondělí');
});
test('předchozí měsíc', () => {
  expect(predchoziMesic(2026, 1)).toEqual({ rok: 2025, mesic: 12 });
  expect(predchoziMesic(2026, 10)).toEqual({ rok: 2026, mesic: 9 });
});
test('hodinová minimální mzda při týdenní době nad 40 h je základní sazba', () => {
  expect(hodinovaMinMzdaHal(parametryRoku(2026), 45)).toBe(13440);
});
test('hodinová minimální mzda: nulová, záporná nebo nepatrná týdenní doba je chyba, nikdy nekonečno', () => {
  const p = parametryRoku(2026);
  for (const doba of [0, -1, 0.004, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => hodinovaMinMzdaHal(p, doba), String(doba)).toThrow(RangeError);
  }
  // Nejmenší doba, kterou jde zadat (0,01 h), dá konečnou sazbu.
  expect(Number.isFinite(hodinovaMinMzdaHal(p, 0.01))).toBe(true);
});
test('neexistující datum je chyba', () => {
  expect(() => denVTydnu('2026-02-30')).toThrow(RangeError);
});
test('hodinová minimální mzda zaměstnance: HPP podle týdenní doby firmy, DPP vždy základní', () => {
  const p = parametryRoku(2026);
  expect(hodinovaMinimalniMzdaProZamestnance(p, { ...VYCHOZI_NASTAVENI, tydenniPracovniDoba: 37.5 }, 'HPP')).toBe(14340);
  expect(hodinovaMinimalniMzdaProZamestnance(p, { ...VYCHOZI_NASTAVENI, tydenniPracovniDoba: 37.5 }, 'DPP')).toBe(13440);
  expect(hodinovaMinimalniMzdaProZamestnance(p, VYCHOZI_NASTAVENI, 'HPP')).toBe(13440);
});
