import { api, ApiChyba } from './klient';
import { json, mockApi } from '../test-utils';

async function chybaZ(slib: Promise<unknown>): Promise<ApiChyba> {
  try {
    await slib;
  } catch (e) {
    if (e instanceof ApiChyba) return e;
    throw e;
  }
  throw new Error('Požadavek měl skončit chybou.');
}

test('volá /api + cesta se same-origin cookies a JSON hlavičkou a vrátí data', async () => {
  const fetchMock = mockApi({ 'POST /api/firmy': () => json({ id: 'f1' }, 201) });

  const vysledek = await api<{ id: string }>('/firmy', { method: 'POST', body: '{"nazev":"A"}' });

  expect(vysledek).toEqual({ id: 'f1' });
  expect(fetchMock).toHaveBeenCalledWith('/api/firmy', expect.objectContaining({
    method: 'POST', body: '{"nazev":"A"}', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
  }));
});

test('204 bez těla vrátí undefined', async () => {
  mockApi({ 'DELETE /api/firmy/f1': () => new Response(null, { status: 204 }) });
  await expect(api('/firmy/f1', { method: 'DELETE' })).resolves.toBeUndefined();
});

test.each([
  [409, 'MESIC_UZAVREN', 'Měsíc je uzavřený. Nejdřív ho otevři.'],
  [401, 'NEPRIHLASEN', 'Přihlášení vypršelo. Obnov stránku.'],
  [503, 'PRISTUP_NENASTAVEN', 'Přihlašování do appky ještě není nastavené.'],
  [404, 'NENALEZENO', 'Záznam se nenašel. Možná už je smazaný, obnov stránku.'],
] as const)('%i %s → ApiChyba s českou zprávou', async (status, kod, zprava) => {
  mockApi({ 'GET /api/x': () => json({ chyba: kod }, status) });

  const chyba = await chybaZ(api('/x'));

  expect(chyba).toMatchObject({ status, kod, zprava });
});

test('400 NEPLATNY_VSTUP převezme zprávu serveru', async () => {
  mockApi({ 'PUT /api/x': () => json({ chyba: 'NEPLATNY_VSTUP', zprava: 'Ukončení nesmí být před nástupem.' }, 400) });

  const chyba = await chybaZ(api('/x', { method: 'PUT', body: '{}' }));

  expect(chyba).toMatchObject({ status: 400, kod: 'NEPLATNY_VSTUP', zprava: 'Ukončení nesmí být před nástupem.' });
});

test('výpadek sítě → kód SIT', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

  const chyba = await chybaZ(api('/firmy'));

  expect(chyba).toMatchObject({ status: 0, kod: 'SIT', zprava: 'Bez připojení. Zkontroluj síť a zkus to znovu.' });
});

test('chyba serveru bez JSON těla → kód NEZNAMA se statusem', async () => {
  mockApi({ 'GET /api/x': () => new Response('Internal Server Error', { status: 500 }) });

  const chyba = await chybaZ(api('/x'));

  expect(chyba).toMatchObject({ status: 500, kod: 'NEZNAMA' });
  expect(chyba.zprava).toMatch(/chyba 500/);
});

test('přesměrování na přihlášení Cloudflare Access → NEPRIHLASEN', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response));

  const chyba = await chybaZ(api('/firmy'));

  expect(chyba).toMatchObject({ kod: 'NEPRIHLASEN', zprava: 'Přihlášení vypršelo. Obnov stránku.' });
});
