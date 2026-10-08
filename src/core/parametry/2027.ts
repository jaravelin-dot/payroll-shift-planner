import type { ParametryRoku } from './typy';
import { zmrazit } from './zmrazit';

/** Parametry 2027 — část hodnot je jen vypočtená podle zákona, proto je nese `predbezne`. */
export const parametry2027: ParametryRoku = zmrazit({
  rok: 2027,
  predbezne: [
    'hranice DPP 12 500 Kč',
    'rozhodný příjem 5 000 Kč',
    'redukční hranice náhrady za nemoc',
    'limit stravenkového paušálu',
  ],
  minMzdaMesicKc: 24900,
  minMzdaHodHal: 14830,
  prumernaMzdaKc: 51663,
  hraniceDan23Kc: 154989,
  spZamPromile: 71,
  spFirmaPromile: 248,
  zpCelkemPromile: 135,
  hraniceDppKc: 12500,
  rozhodnyPrijemKc: 5000,
  slevaPoplatnikKc: 2570,
  slevaInvaliditaIaIIKc: 210,
  slevaInvaliditaIIIKc: 420,
  slevaZtppKc: 1345,
  zvyhodneniDetiKc: [1267, 1860, 2320],
  minPrijemBonusKc: 12450,
  minBonusKc: 50,
  stravneLimitHal: 12950,
  redukcniHraniceHal: [30153, 45220, 90423],
  slevaPojistneStropKc: 77495,
  slevaPojistneKcHod: 595,
  dppLimitHodin: 300,
});
