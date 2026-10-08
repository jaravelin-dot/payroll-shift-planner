import { parametryRoku } from './index';
test('2026', () => {
  const p = parametryRoku(2026);
  expect(p.minMzdaMesicKc).toBe(22400);
  expect(p.minMzdaHodHal).toBe(13440);
  expect(p.hraniceDan23Kc).toBe(146901);
  expect(p.hraniceDppKc).toBe(12000);
  expect(p.rozhodnyPrijemKc).toBe(4500);
  expect(p.slevaPoplatnikKc).toBe(2570);
  expect(p.zvyhodneniDetiKc).toEqual([1267, 1860, 2320]);
  expect(p.minPrijemBonusKc).toBe(11200);
  expect(p.stravneLimitHal).toBe(12950);
  expect(p.redukcniHraniceHal).toEqual([28578, 42858, 85698]);
  expect(p.slevaPojistneStropKc).toBe(73451);
  expect(p.slevaPojistneKcHod).toBe(564);
  expect(p.predbezne).toEqual([]);
});
test('2027 má předběžné hodnoty označené', () => {
  const p = parametryRoku(2027);
  expect(p.minMzdaMesicKc).toBe(24900);
  expect(p.minMzdaHodHal).toBe(14830);
  expect(p.hraniceDan23Kc).toBe(154989);
  expect(p.hraniceDppKc).toBe(12500);
  expect(p.redukcniHraniceHal).toEqual([30153, 45220, 90423]);
  expect(p.predbezne.length).toBeGreaterThanOrEqual(3);
});
test('starší rok použije 2026, novější 2027', () => {
  expect(parametryRoku(2025).rok).toBe(2026);
  expect(parametryRoku(2028).rok).toBe(2027);
  expect(parametryRoku(2028).predbezne.some((t) => t.includes('2028'))).toBe(true);
});
test('rok před 2026 počítá s parametry 2026 a dá to vědět poznámkou', () => {
  const p = parametryRoku(2025);
  expect(p.rok).toBe(2026);
  expect(p.minMzdaHodHal).toBe(parametryRoku(2026).minMzdaHodHal);
  expect(p.predbezne).toContain('Rok 2025 používá parametry 2026 — ověř');
  expect(Object.isFrozen(p)).toBe(true);
  expect(parametryRoku(2026).predbezne).toEqual([]);
});
test('slevy na invaliditu mají jednoznačné názvy', () => {
  const p = parametryRoku(2026);
  expect(p.slevaInvaliditaIaIIKc).toBe(210);
  expect(p.slevaInvaliditaIIIKc).toBe(420);
});
test('parametry jsou neměnné', () => {
  for (const rok of [2026, 2027, 2028]) {
    const p = parametryRoku(rok);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.predbezne)).toBe(true);
    expect(Object.isFrozen(p.zvyhodneniDetiKc)).toBe(true);
    expect(Object.isFrozen(p.redukcniHraniceHal)).toBe(true);
  }
});
test('kopie pro rok nad 2027 nemění parametry 2027', () => {
  const pred = parametryRoku(2027).predbezne.length;
  const p2028 = parametryRoku(2028);
  expect(p2028.predbezne).not.toBe(parametryRoku(2027).predbezne);
  expect(parametryRoku(2027).predbezne).toHaveLength(pred);
  expect(parametryRoku(2027).predbezne.some((t) => t.includes('2028'))).toBe(false);
});
