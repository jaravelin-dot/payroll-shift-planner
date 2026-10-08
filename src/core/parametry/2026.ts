import type { ParametryRoku } from './typy';
import { zmrazit } from './zmrazit';

/** Parametry 2026 — vše závazně vyhlášené (zdroj: docs/research/2026-10-05-mzdove-parametry-2026.md). */
export const parametry2026: ParametryRoku = zmrazit({
  rok: 2026,
  predbezne: [],
  minMzdaMesicKc: 22400,
  minMzdaHodHal: 13440,
  prumernaMzdaKc: 48967,
  hraniceDan23Kc: 146901,
  spZamPromile: 71,
  spFirmaPromile: 248,
  zpCelkemPromile: 135,
  hraniceDppKc: 12000,
  rozhodnyPrijemKc: 4500,
  slevaPoplatnikKc: 2570,
  slevaInvaliditaIaIIKc: 210,
  slevaInvaliditaIIIKc: 420,
  slevaZtppKc: 1345,
  zvyhodneniDetiKc: [1267, 1860, 2320],
  minPrijemBonusKc: 11200,
  minBonusKc: 50,
  stravneLimitHal: 12950,
  redukcniHraniceHal: [28578, 42858, 85698],
  slevaPojistneStropKc: 73451,
  slevaPojistneKcHod: 564,
  dppLimitHodin: 300,
});
