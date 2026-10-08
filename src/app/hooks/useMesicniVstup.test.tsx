import { act, renderHook, waitFor } from '@testing-library/react';
import { odesliCekajici } from '../stav/neulozeneVstupy';
import { json, mesicData, mockApi, obal, testovaciKlient, zamestnanec } from '../test-utils';
import { useMesicniVstup } from './useMesicniVstup';

test('uzávěrka nečeká na prodlevu: čekající odměna se odešle hned a uzávěrka počká, až doběhne', async () => {
  let odpovez: (r: Response) => void = () => {};
  const fetchMock = mockApi({ 'PUT /api/vstupy': () => new Promise<Response>((resolve) => { odpovez = resolve; }) });
  const data = mesicData({ zamestnanci: [zamestnanec({ id: 'z1' })] });
  const { result } = renderHook(() => useMesicniVstup('f1', data, 'z1'), { wrapper: obal(testovaciKlient()) });
  const vstupy = () => fetchMock.mock.calls.filter(([adresa]) => String(adresa) === '/api/vstupy');

  act(() => result.current.zmen({ odmenaZaDenHal: 13000 }));
  expect(vstupy()).toHaveLength(0); // čeká na 600 ms klidu

  let hotovo = false;
  const odeslani = odesliCekajici().then(() => { hotovo = true; });
  await waitFor(() => expect(vstupy()).toHaveLength(1));
  expect(JSON.parse(String(vstupy()[0]![1]?.body))).toMatchObject({ zamestnanecId: 'z1', odmenaZaDenHal: 13000 });
  expect(hotovo).toBe(false);
  odpovez(json({}));
  await odeslani;
  expect(hotovo).toBe(true);

  // Odeslané uložení už nečeká: další volání nic neposílá a časovač se neodpálí podruhé.
  await odesliCekajici();
  await new Promise((r) => setTimeout(r, 700));
  expect(vstupy()).toHaveLength(1);
});
