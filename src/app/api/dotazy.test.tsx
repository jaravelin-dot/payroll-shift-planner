import { act, renderHook, waitFor } from '@testing-library/react';
import type { Den, MesicData } from '../../shared/api';
import { firma, json, mockApi, obal, testovaciKlient } from '../test-utils';
import { neulozenaDochazka, odeberNeulozenouDochazku } from '../stav/neulozenaDochazka';
import { ApiChyba } from './klient';
import { useFirmy, useOtevri, useUlozDny, useUzavri } from './dotazy';

afterEach(() => {
  for (const p of neulozenaDochazka()) odeberNeulozenouDochazku(p);
});

function den(datum: string, zmeny: Partial<Den> = {}): Den {
  return { zamestnanecId: 'z1', datum, typ: 'PRACE', minuty: 480, kasa: false, poznamka: null, ...zmeny };
}

function mesicData(rok: number, mesic: number, dny: Den[]): MesicData {
  return {
    firma: firma(), rok, mesic, zamestnanci: [], dny, vstupy: [], uzaverka: null, uzaverkyPredchozihoCtvrtleti: [],
    dppMinutyPredMesicem: {}, dovolenaRok: {}, zustatky: [], plan: [], sablony: [],
  };
}

test('useFirmy načte GET /api/firmy pod klíčem ["firmy"]', async () => {
  mockApi({ 'GET /api/firmy': () => json([firma()]) });
  const klient = testovaciKlient();

  const { result } = renderHook(() => useFirmy(), { wrapper: obal(klient) });

  await waitFor(() => expect(result.current.data).toEqual([firma()]));
  expect(klient.getQueryData(['firmy'])).toEqual([firma()]);
});

test('useUlozDny přepíše cache měsíce hned (optimisticky) a při chybě ji vrátí zpět', async () => {
  let odpovez: (r: Response) => void = () => {};
  let telo: unknown;
  mockApi({
    'PUT /api/dny': (init) => {
      telo = JSON.parse(String(init?.body));
      return new Promise<Response>((resolve) => { odpovez = resolve; });
    },
  });
  const klient = testovaciKlient();
  const rijen = mesicData(2026, 10, [den('2026-09-30'), den('2026-10-01'), den('2026-10-01', { zamestnanecId: 'z2' })]);
  const listopad = mesicData(2026, 11, [den('2026-10-01')]);
  const prosinec = mesicData(2026, 12, []);
  klient.setQueryData(['mesic', 'f1', 2026, 10], rijen);
  klient.setQueryData(['mesic', 'f1', 2026, 11], listopad);
  klient.setQueryData(['mesic', 'f1', 2026, 12], prosinec);
  const { result } = renderHook(() => useUlozDny(), { wrapper: obal(klient) });

  act(() => {
    result.current.mutate({
      firmaId: 'f1', zamestnanecId: 'z1',
      dny: [{ datum: '2026-10-02', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }],
      smazat: ['2026-10-01'],
    });
  });

  await waitFor(() => expect(klient.getQueryData<MesicData>(['mesic', 'f1', 2026, 10])?.dny).toEqual([
    den('2026-09-30'), den('2026-10-01', { zamestnanecId: 'z2' }), den('2026-10-02', { typ: 'DOVOLENA' }),
  ]));
  // Listopad nese říjen jako předchozí měsíc, prosinec už ne.
  expect(klient.getQueryData<MesicData>(['mesic', 'f1', 2026, 11])?.dny).toEqual([den('2026-10-02', { typ: 'DOVOLENA' })]);
  expect(klient.getQueryData<MesicData>(['mesic', 'f1', 2026, 12])?.dny).toEqual([]);
  expect(telo).toEqual({ zamestnanecId: 'z1', dny: [{ datum: '2026-10-02', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }], smazat: ['2026-10-01'] });

  odpovez(json({ chyba: 'MESIC_UZAVREN' }, 409));

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error).toBeInstanceOf(ApiChyba);
  expect((result.current.error as ApiChyba).zprava).toBe('Měsíc je uzavřený. Nejdřív ho otevři.');
  expect(klient.getQueryData<MesicData>(['mesic', 'f1', 2026, 10])).toEqual(rijen);
  expect(klient.getQueryData<MesicData>(['mesic', 'f1', 2026, 11])).toEqual(listopad);
});

test('useUlozDny obnoví data měsíců až po poslední rozdělané mutaci (rychlá uložení za sebou neblikají)', async () => {
  const odpovedi: Array<(r: Response) => void> = [];
  mockApi({ 'PUT /api/dny': () => new Promise<Response>((resolve) => odpovedi.push(resolve)) });
  const klient = testovaciKlient();
  klient.setQueryData(['mesic', 'f1', 2026, 10], mesicData(2026, 10, []));
  const obnova = vi.spyOn(klient, 'invalidateQueries');
  const { result } = renderHook(() => useUlozDny(), { wrapper: obal(klient) });
  const dny = (datum: string) => ({ firmaId: 'f1', zamestnanecId: 'z1', dny: [{ datum, typ: 'PRACE' as const, minuty: 480, kasa: false, poznamka: null }] });

  act(() => {
    result.current.mutate(dny('2026-10-01'));
    result.current.mutate(dny('2026-10-02'));
  });
  await waitFor(() => expect(odpovedi).toHaveLength(2));

  odpovedi[0](json({ ok: true }));
  await waitFor(() => expect(klient.isMutating()).toBe(1));
  expect(obnova).not.toHaveBeenCalled();

  odpovedi[1](json({ ok: true }));
  await waitFor(() => expect(obnova).toHaveBeenCalledTimes(1));
  expect(obnova).toHaveBeenCalledWith({ queryKey: ['mesic', 'f1'] });
});

test.each([
  ['useUzavri', useUzavri, 'POST'],
  ['useOtevri', useOtevri, 'DELETE'],
])('%s obnoví všechny měsíce firmy, ne jen ten uzavíraný', async (_nazev, hook, metoda) => {
  mockApi({ [`${metoda} /api/firmy/f1/uzaverka/2026/10`]: () => (metoda === 'POST' ? json({}) : new Response(null, { status: 204 })) });
  const klient = testovaciKlient();
  for (const mesic of [9, 10, 11]) klient.setQueryData(['mesic', 'f1', 2026, mesic], mesicData(2026, mesic, []));
  klient.setQueryData(['mesic', 'f2', 2026, 10], mesicData(2026, 10, []));
  const { result } = renderHook(() => hook(), { wrapper: obal(klient) });

  await act(() => result.current.mutateAsync({ firmaId: 'f1', rok: 2026, mesic: 10 }));

  for (const mesic of [9, 10, 11]) expect(klient.getQueryState(['mesic', 'f1', 2026, mesic])?.isInvalidated).toBe(true);
  expect(klient.getQueryState(['mesic', 'f2', 2026, 10])?.isInvalidated).toBe(false);
});

test('neuložené dny se zapamatují s důvodem; starší chyba nepřebije novější uložení týchž dnů', async () => {
  const odpovedi: Array<(r: Response) => void> = [];
  mockApi({ 'PUT /api/dny': () => new Promise<Response>((resolve) => odpovedi.push(resolve)) });
  const klient = testovaciKlient();
  klient.setQueryData(['mesic', 'f1', 2026, 10], mesicData(2026, 10, []));
  const { result } = renderHook(() => useUlozDny(), { wrapper: obal(klient) });
  const zmena = (datum: string, typ: Den['typ'] = 'PRACE') =>
    ({ firmaId: 'f1', kdo: 'Jana Nováková', zamestnanecId: 'z1', dny: [{ datum, typ, minuty: 480, kasa: false, poznamka: null }] });

  // Starší uložení 1. 10. selže až po novějším, které prošlo: nic k zapamatování.
  act(() => {
    result.current.mutate(zmena('2026-10-01'));
    result.current.mutate(zmena('2026-10-01', 'DOVOLENA'));
  });
  await waitFor(() => expect(odpovedi).toHaveLength(2));
  odpovedi[1](json({ ok: true }));
  odpovedi[0](new Response('chyba', { status: 500 }));
  await waitFor(() => expect(klient.isMutating()).toBe(0));
  expect(neulozenaDochazka()).toEqual([]);

  // Samostatné selhání: v seznamu s českým důvodem, bez firmaId a kdo v těle změny.
  act(() => { result.current.mutate(zmena('2026-10-02')); });
  await waitFor(() => expect(odpovedi).toHaveLength(3));
  odpovedi[2](json({ chyba: 'MESIC_UZAVREN' }, 409));
  await waitFor(() => expect(neulozenaDochazka()).toHaveLength(1));
  expect(neulozenaDochazka()[0]).toMatchObject({
    firmaId: 'f1', kdo: 'Jana Nováková', duvod: 'Měsíc je uzavřený — změnu nejde uložit.',
    zmena: { zamestnanecId: 'z1', dny: [{ datum: '2026-10-02', typ: 'PRACE', minuty: 480, kasa: false, poznamka: null }] },
  });

  // Novější uložení téhož dne prošlo: neuložená změna už neplatí.
  act(() => { result.current.mutate(zmena('2026-10-02', 'DOVOLENA')); });
  await waitFor(() => expect(odpovedi).toHaveLength(4));
  odpovedi[3](json({ ok: true }));
  await waitFor(() => expect(neulozenaDochazka()).toEqual([]));
});
