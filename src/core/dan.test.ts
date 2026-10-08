import { vypocitejDan } from './dan';
import { parametryRoku } from './parametry';
import { zam } from './test-utils';
const p = parametryRoku(2026);
test('scénář A — záloha se slevou na poplatníka', () => {
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 38895, prijemKc: 38895, zamestnanec: zam(), p }))
    .toEqual({ rezim: 'ZALOHA', zakladKc: 38900, zalohaKc: 5835, slevyKc: 2570, zvyhodneniKc: 0, danKc: 3265, bonusKc: 0 });
});
test('scénář B — DPP bez prohlášení pod hranicí: srážková', () => {
  expect(vypocitejDan({ smlouva: 'DPP', vzKc: 7200, prijemKc: 7200, zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }), p }))
    .toEqual({ rezim: 'SRAZKOVA', zakladKc: 7200, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: 1080, bonusKc: 0 });
});
test('scénář C — DPP bez prohlášení nad hranicí: záloha bez slev', () => {
  expect(vypocitejDan({ smlouva: 'DPP', vzKc: 14000, prijemKc: 14000, zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }), p }))
    .toMatchObject({ rezim: 'ZALOHA', zakladKc: 14000, zalohaKc: 2100, slevyKc: 0, danKc: 2100 });
});
test('scénář D — invalidita III. st.: slevy jen do výše zálohy', () => {
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 10200, prijemKc: 10200, zamestnanec: zam({ invalidita: 'III' }), p }))
    .toEqual({ rezim: 'ZALOHA', zakladKc: 10200, zalohaKc: 1530, slevyKc: 1530, zvyhodneniKc: 0, danKc: 0, bonusKc: 0 });
});
test('scénář F — dvě děti: daňový bonus', () => {
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 20000, prijemKc: 20000, zamestnanec: zam({ deti: [{ ztpp: false }, { ztpp: false }] }), p }))
    .toEqual({ rezim: 'ZALOHA', zakladKc: 20000, zalohaKc: 3000, slevyKc: 2570, zvyhodneniKc: 3127, danKc: 0, bonusKc: 2697 });
});
test('bonus se nevyplatí při příjmu pod polovinou minimální mzdy', () => {
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 11000, prijemKc: 11000, zamestnanec: zam({ deti: [{ ztpp: false }] }), p }).bonusKc).toBe(0);
});
test('23 % nad hranicí a zaokrouhlení základu na stovky', () => {
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 160000, prijemKc: 160000, zamestnanec: zam({ prohlaseni: false }), p }).zalohaKc).toBe(25048);
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 12345, prijemKc: 12345, zamestnanec: zam({ prohlaseni: false }), p }))
    .toMatchObject({ zakladKc: 12400, zalohaKc: 1860 });
});
test('dítě se ZTP/P má dvojnásobné zvýhodnění', () => {
  expect(vypocitejDan({ smlouva: 'HPP', vzKc: 40000, prijemKc: 40000, zamestnanec: zam({ deti: [{ ztpp: true }] }), p }).zvyhodneniKc).toBe(2534);
});

// --- Doplňující testy (hranice a pořadí dětí) ---
const dan = (smlouva: 'HPP' | 'DPP', vzKc: number, c: Parameters<typeof zam>[0] = {}, prijemKc = vzKc) =>
  vypocitejDan({ smlouva, vzKc, prijemKc, zamestnanec: zam({ smlouva, ...c }), p });
test('srážková daň: hranice a zaokrouhlení dolů', () => {
  expect(dan('DPP', 11999, { prohlaseni: false }).rezim).toBe('SRAZKOVA');
  expect(dan('DPP', 12000, { prohlaseni: false }).rezim).toBe('ZALOHA');
  expect(dan('HPP', 4499, { prohlaseni: false }).rezim).toBe('SRAZKOVA');
  expect(dan('HPP', 4500, { prohlaseni: false }).rezim).toBe('ZALOHA');
  expect(dan('DPP', 7777, { prohlaseni: false }).danKc).toBe(1166); // 1166,55 dolů
});
test('s prohlášením se srážková daň nepoužije ani pod hranicí', () => {
  expect(dan('DPP', 7200, { prohlaseni: true })).toMatchObject({ rezim: 'ZALOHA', zalohaKc: 1080, slevyKc: 1080, danKc: 0 });
});
test('základ zálohy: do 100 Kč beze změny, nad nahoru na stovky', () => {
  expect(dan('HPP', 90)).toMatchObject({ zakladKc: 90, zalohaKc: 14 }); // 13,5 nahoru
  expect(dan('HPP', 100)).toMatchObject({ zakladKc: 100, zalohaKc: 15 });
  expect(dan('HPP', 101)).toMatchObject({ zakladKc: 200, zalohaKc: 30 });
  expect(dan('HPP', 200)).toMatchObject({ zakladKc: 200, zalohaKc: 30 });
});
test('sleva na invaliditu I. a II. stupně 210 Kč, III. stupně 420 Kč, ZTP/P 1 345 Kč', () => {
  expect(dan('HPP', 38895, { invalidita: 'I' }).slevyKc).toBe(2780);
  expect(dan('HPP', 38895, { invalidita: 'II' }).slevyKc).toBe(2780);
  expect(dan('HPP', 38895, { invalidita: 'III' }).slevyKc).toBe(2990);
  expect(dan('HPP', 38895, { ztpp: true }).slevyKc).toBe(3915);
  expect(dan('HPP', 38895, { invalidita: 'III', ztpp: true }).slevyKc).toBe(4335);
});
test('zvýhodnění podle pořadí dětí: třetí a další dítě po 2 320 Kč', () => {
  const deti = (n: number) => Array.from({ length: n }, () => ({ ztpp: false }));
  expect(dan('HPP', 100000, { deti: deti(3) }).zvyhodneniKc).toBe(5447);
  expect(dan('HPP', 100000, { deti: deti(4) }).zvyhodneniKc).toBe(7767);
  expect(dan('HPP', 100000, { deti: [{ ztpp: false }, { ztpp: true }, { ztpp: false }] }).zvyhodneniKc).toBe(1267 + 3720 + 2320);
});
test('zvýhodnění se odečte od zbývající daně, bonus 0', () => {
  expect(dan('HPP', 38895, { deti: [{ ztpp: false }] }))
    .toEqual({ rezim: 'ZALOHA', zakladKc: 38900, zalohaKc: 5835, slevyKc: 2570, zvyhodneniKc: 1267, danKc: 1998, bonusKc: 0 });
});
test('bonus se vyplatí od 50 Kč', () => {
  expect(dan('HPP', 25300, { deti: [{ ztpp: false }] })).toMatchObject({ zalohaKc: 3795, danKc: 0, bonusKc: 0 }); // 1 267 − 1 225 = 42 Kč
  expect(dan('HPP', 25200, { deti: [{ ztpp: false }] })).toMatchObject({ zalohaKc: 3780, danKc: 0, bonusKc: 57 }); // 1 267 − 1 210
});
test('bonus se vyplatí od příjmu 11 200 Kč', () => {
  expect(dan('HPP', 11199, { deti: [{ ztpp: false }] }).bonusKc).toBe(0);
  expect(dan('HPP', 11200, { deti: [{ ztpp: false }] }).bonusKc).toBe(1267);
});

// --- Srážková daň a bonus ze skutečného příjmu (dolů na celé Kč), záloha z vyměřovacího základu ---
test('srážková daň vychází ze skutečného příjmu dolů, ne z vyměřovacího základu zaokrouhleného nahoru', () => {
  // příjem 7 319,50 Kč: VZ 7 320 (15 % = 1 098), skutečný příjem dolů 7 319 (15 % = 1 097,85 → 1 097)
  expect(dan('DPP', 7320, { prohlaseni: false }, 7319))
    .toEqual({ rezim: 'SRAZKOVA', zakladKc: 7319, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: 1097, bonusKc: 0 });
});
test('režim srážkové daně se posuzuje podle skutečného příjmu', () => {
  // příjem 11 999,50 Kč: VZ 12 000, ale skutečný příjem je pod 12 000 → srážková
  expect(dan('DPP', 12000, { prohlaseni: false }, 11999).rezim).toBe('SRAZKOVA');
  expect(dan('DPP', 12000, { prohlaseni: false }, 12000).rezim).toBe('ZALOHA');
  expect(dan('HPP', 4500, { prohlaseni: false }, 4499).rezim).toBe('SRAZKOVA');
  expect(dan('HPP', 4500, { prohlaseni: false }, 4500).rezim).toBe('ZALOHA');
});
test('záloha vychází z vyměřovacího základu, ne ze skutečného příjmu', () => {
  expect(dan('HPP', 12345, { prohlaseni: false }, 12344)).toMatchObject({ zakladKc: 12400, zalohaKc: 1860 });
});
test('bonus se vyplatí podle skutečného příjmu dolů (příjem 11 199,50 Kč není ½ minimální mzdy)', () => {
  expect(dan('HPP', 11200, { deti: [{ ztpp: false }] }, 11199).bonusKc).toBe(0);
  expect(dan('HPP', 11200, { deti: [{ ztpp: false }] }, 11200).bonusKc).toBe(1267);
});
test('záporný základ nebo příjem se bere jako nula', () => {
  const nulova = { rezim: 'ZALOHA', zakladKc: 0, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: 0, bonusKc: 0 };
  expect(dan('HPP', -500, {})).toEqual(nulova);
  expect(dan('HPP', -500, { deti: [{ ztpp: false }] })).toEqual({ ...nulova, zvyhodneniKc: 1267, bonusKc: 0 });
  expect(dan('DPP', -500, { prohlaseni: false }))
    .toEqual({ rezim: 'SRAZKOVA', zakladKc: 0, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: 0, bonusKc: 0 });
});
