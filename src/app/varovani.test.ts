import type { Varovani } from '../core/typy';
import { INFO_VAROVANI, seradVarovani } from './varovani';

const v = (kod: Varovani['kod']): Varovani => ({ kod, text: kod });

test('varování se řadí od nejzávažnějšího, při shodě podle pořadí z výpočtu', () => {
  const serazena = seradVarovani([v('PV_ODHADNUT'), v('SLEVA_POJISTNE_NESPLNENA'), v('ODMENA_PROPADLA_NEMOC'), v('VYPLATA_ZAPORNA'), v('ZP_DOPLATEK_MINIMUM')]);
  expect(serazena.map((x) => x.kod)).toEqual(['VYPLATA_ZAPORNA', 'ODMENA_PROPADLA_NEMOC', 'ZP_DOPLATEK_MINIMUM', 'PV_ODHADNUT', 'SLEVA_POJISTNE_NESPLNENA']);
});

test('každý kód má krátký název a tón', () => {
  expect(INFO_VAROVANI.VYPLATA_ZAPORNA).toEqual({ nazev: 'Záporná výplata', ton: 'chyba' });
  expect(INFO_VAROVANI.ODMENA_PROPADLA_NEMOC.ton).toBe('varovani');
  expect(INFO_VAROVANI.PV_ODHADNUT.ton).toBe('info');
});
