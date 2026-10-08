import { act, renderHook, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { firma, json, mockApi, obal, testovaciKlient } from '../test-utils';
import { useVyber } from './vyber';

const firmy = [firma({ id: 'f1', nazev: 'První' }), firma({ id: 'f2', nazev: 'Druhá' })];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
  mockApi({ 'GET /api/firmy': () => json(firmy) });
});

afterEach(() => {
  vi.useRealTimers();
});

function vykresli(adresa = '/') {
  return renderHook(() => ({ vyber: useVyber(), umisteni: useLocation() }), { wrapper: obal(testovaciKlient(), adresa) });
}

test('výchozí je první firma a aktuální měsíc', async () => {
  const { result } = vykresli();

  await waitFor(() => expect(result.current.vyber.firma?.id).toBe('f1'));
  expect(result.current.vyber).toMatchObject({ firmaId: 'f1', rok: 2026, mesic: 10 });
});

test('firma a měsíc z URL mají přednost a firma se zapamatuje', async () => {
  const { result } = vykresli('/?firma=f2&rok=2027&mesic=1');

  await waitFor(() => expect(result.current.vyber.firma?.id).toBe('f2'));
  expect(result.current.vyber).toMatchObject({ rok: 2027, mesic: 1 });
  expect(localStorage.getItem('mzdy.firma')).toBe('f2');
});

test('bez firmy v URL použije naposledy vybranou z localStorage', async () => {
  localStorage.setItem('mzdy.firma', 'f2');
  const { result } = vykresli();

  await waitFor(() => expect(result.current.vyber.firma?.id).toBe('f2'));
});

test('neexistující firma nebo nesmyslný měsíc v URL spadne na výchozí', async () => {
  const { result } = vykresli('/?firma=smazana&rok=abc&mesic=13');

  await waitFor(() => expect(result.current.vyber.firma?.id).toBe('f1'));
  expect(result.current.vyber).toMatchObject({ rok: 2026, mesic: 10 });
});

test('změna firmy a měsíce se propíše do URL a odkazy ji nesou dál', async () => {
  const { result } = vykresli('/smeny');
  await waitFor(() => expect(result.current.vyber.firma?.id).toBe('f1'));

  act(() => result.current.vyber.nastavFirmu('f2'));
  act(() => result.current.vyber.nastavMesic(2026, 11));

  expect(result.current.umisteni.pathname).toBe('/smeny');
  expect(new URLSearchParams(result.current.umisteni.search).get('firma')).toBe('f2');
  expect(result.current.vyber).toMatchObject({ firmaId: 'f2', rok: 2026, mesic: 11 });
  expect(localStorage.getItem('mzdy.firma')).toBe('f2');
  expect(result.current.vyber.odkaz('/lide')).toEqual({ pathname: '/lide', search: '?firma=f2&rok=2026&mesic=11' });
});
