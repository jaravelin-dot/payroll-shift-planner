import { renderHook } from '@testing-library/react';
import { pripravVstup } from '../../core/priprava';
import { vypocitejMzdu } from '../../core/vypocet';
import type { Den, MesicData } from '../../shared/api';
import { mesicData, zamestnanec } from '../test-utils';
import { useVypocet } from './useVypocet';

const prace = (zamestnanecId: string, datum: string, minuty = 480): Den => ({ zamestnanecId, datum, typ: 'PRACE', minuty, kasa: false, poznamka: null });

const data = mesicData({
  zamestnanci: [zamestnanec({ id: 'a' }), zamestnanec({ id: 'b', jmeno: 'Petr', prijmeni: 'Dvořák', smlouva: 'DPP', uvazekMinTydne: 0, prohlaseni: false })],
  dny: [prace('a', '2026-10-01'), prace('a', '2026-10-02', 360), prace('b', '2026-10-03', 300)],
});

test('otevřený měsíc: výsledek každého člověka spočítá jádro z dat měsíce', () => {
  const { result } = renderHook(() => useVypocet(data));
  expect([...result.current.keys()]).toEqual(['a', 'b']);
  expect(result.current.get('a')).toEqual(vypocitejMzdu(pripravVstup(data, 'a')));
  expect(result.current.get('b')).toEqual(vypocitejMzdu(pripravVstup(data, 'b')));
});

test('stejná data → stejná mapa (bez zbytečného přepočtu); bez dat prázdná mapa', () => {
  const { result, rerender } = renderHook(({ d }: { d: MesicData | undefined }) => useVypocet(d), { initialProps: { d: data } });
  const prvni = result.current;
  rerender({ d: data });
  expect(result.current).toBe(prvni);
  rerender({ d: undefined });
  expect(result.current.size).toBe(0);
});

test('uzavřený měsíc: výsledky ze snímku uzávěrky, ne z přepočtu', () => {
  const snimek = { ...vypocitejMzdu(pripravVstup(data, 'a')), kVyplateHal: 123400 };
  const uzavreny: MesicData = {
    ...data,
    uzaverka: { firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z', vysledky: [{ zamestnanecId: 'a', jmeno: 'Jana Nováková', smlouva: 'HPP', vysledek: snimek }] },
  };
  const { result } = renderHook(() => useVypocet(uzavreny));
  expect([...result.current.keys()]).toEqual(['a']);
  expect(result.current.get('a')!.kVyplateHal).toBe(123400);
});
