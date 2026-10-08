import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VYCHOZI_NASTAVENI, type Firma, type NastaveniVypoctu, type NovaFirma } from '../../shared/api';
import { App } from '../App';
import { firma, json, mockApi } from '../test-utils';

// Testy vykreslují celou appku (router, dotazy, rozvržení). Při souběhu s testy workeru (Miniflare) trvá vykreslení
// i uložení přes sekundu, proto delší čekání než výchozí 1 s / 5 s.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

/** Formulář firmy posílá jen nastavení výpočtu; plánovač se nastavuje jinde a na serveru se slučuje. */
const VYCHOZI_VYPOCTU = Object.fromEntries(Object.entries(VYCHOZI_NASTAVENI).filter(([klic]) => !klic.startsWith('planovac'))) as NastaveniVypoctu;

const KONTEXT = '?firma=f1&rok=2026&mesic=10';

function otevri(cesta: string) {
  window.history.replaceState(null, '', cesta + KONTEXT);
  render(<App />);
  // Bez prodlevy mezi klávesami: formuláře jsou dlouhé a psaní by test zbytečně zdržovalo.
  return userEvent.setup({ delay: null });
}

const telo = <T,>(init: RequestInit | undefined): T => JSON.parse(String(init?.body)) as T;

test('nastavení firmy pošle priplatekSobotaHal: 35000 při zadání „350" a vrátí se na Nastavení s „Uloženo"', async () => {
  const puvodni = firma({ nastaveni: { ...VYCHOZI_NASTAVENI, priplatekSobotaHal: 25000 } });
  let poslano: NovaFirma | undefined;
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([puvodni]),
    'PUT /api/firmy/f1': (init) => {
      poslano = telo(init);
      return json(puvodni);
    },
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  expect(await screen.findByRole('heading', { name: 'Ukázková prodejna s.r.o.', level: 1 })).toBeInTheDocument();
  const sobota = screen.getByLabelText(/Příplatek za sobotu/);
  expect(sobota).toHaveValue('250');
  await uzivatel.clear(sobota);
  await uzivatel.type(sobota, '350');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/nastaveni');
  expect(poslano).toEqual({ nazev: 'Ukázková prodejna s.r.o.', ico: null, adresa: null, ucet: null, nastaveni: { ...VYCHOZI_VYPOCTU, priplatekSobotaHal: 35000 } });
});

test('částky, pracovní doba a úrovně odměn se z češtiny převedou správně', async () => {
  let poslano: NovaFirma | undefined;
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'PUT /api/firmy/f1': (init) => {
      poslano = telo(init);
      return json(firma());
    },
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  const doba = await screen.findByLabelText(/Stanovená týdenní pracovní doba/);
  expect(doba).toHaveValue('40');
  await uzivatel.clear(doba);
  await uzivatel.type(doba, '37,5');
  const stravne = screen.getByLabelText(/Stravenkový paušál/);
  expect(stravne).toHaveValue('129,50');
  await uzivatel.clear(stravne);
  await uzivatel.type(stravne, '140');
  const odmena = within(screen.getByRole('group', { name: 'Odměna za den' }));
  await uzivatel.click(odmena.getByRole('button', { name: 'Přidat úroveň' }));
  await uzivatel.type(odmena.getByLabelText('4. úroveň'), '190');
  await uzivatel.click(screen.getByRole('switch', { name: /Odměna za den propadá při nemoci/ }));
  await uzivatel.click(screen.getByRole('radio', { name: 'Náhradní volno' }));
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano?.nastaveni).toEqual({
    ...VYCHOZI_VYPOCTU,
    tydenniPracovniDoba: 37.5,
    stravnePausalHal: 14000,
    urovneOdmenyZaDenHal: [8000, 12000, 16000, 19000],
    odmenaZaDenPropadaPriNemoci: false,
    praceVeSvatek: 'NAHRADNI_VOLNO',
  });
});

test('neplatná částka a neplatný účet firmy se neodešlou', async () => {
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  const nedele = await screen.findByLabelText(/Příplatek za neděli/);
  await uzivatel.clear(nedele);
  await uzivatel.type(nedele, '40,555');
  const ucet = screen.getByLabelText(/Číslo účtu/);
  await uzivatel.type(ucet, '1234567890/0100');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(screen.getByText('Zadej částku v Kč, nejvýš s haléři, např. 300 nebo 129,50.')).toBeInTheDocument();
  expect(nedele).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('Číslo účtu nesedí, zkontroluj ho.')).toBeInTheDocument();
  // Fokus skočí na první chybné pole v pořadí formuláře: účet je v Údajích firmy nad příplatky.
  expect(ucet).toHaveFocus();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});

test('IČO vložené s mezerami se nezkrátí a uloží se bez mezer', async () => {
  let poslano: NovaFirma | undefined;
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'PUT /api/firmy/f1': (init) => {
      poslano = telo(init);
      return json(firma());
    },
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  const ico = await screen.findByLabelText(/^IČO/);
  await uzivatel.click(ico);
  await uzivatel.paste('123 456 78');
  expect(ico).toHaveValue('123 456 78');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano?.ico).toBe('12345678');
});

test('chyba účtu firmy, která naskočí při opuštění pole, se čtečce ohlásí (role alert)', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  await uzivatel.type(await screen.findByLabelText(/Číslo účtu/), '1234567890/0100');
  await uzivatel.tab();

  expect(screen.getByText('Číslo účtu nesedí, zkontroluj ho.')).toHaveAttribute('role', 'alert');
});

test('jednotky Kč a h týdně jsou v popisu polí nastavení', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  otevri('/nastaveni/firma/f1');

  expect(await screen.findByLabelText(/Stanovená týdenní pracovní doba/)).toHaveAccessibleDescription(expect.stringMatching(/^h týdně/));
  expect(screen.getByLabelText(/Příplatek za sobotu/)).toHaveAccessibleDescription(expect.stringMatching(/^Kč/));
});

test('u „Odměna za den propadá při nemoci" je trvalé upozornění na pokuty od inspekce práce', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  const upozorneni = await screen.findByText(/Inspekce práce tuhle podmínku pokutuje/);
  expect(upozorneni).toHaveTextContent('doporučujeme ji vypnout');
  await uzivatel.click(screen.getByRole('switch', { name: /Odměna za den propadá při nemoci/ }));
  expect(screen.getByText(/Inspekce práce tuhle podmínku pokutuje/)).toBeInTheDocument();
});

test('stránka Nastavení: seznam firem, přidání firmy a záloha ke stažení', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma(), firma({ id: 'f2', nazev: 'Ukázková pekárna s.r.o.', ico: '12345678' })]),
  });
  otevri('/nastaveni');

  expect(await screen.findByRole('heading', { name: 'Nastavení', level: 1 })).toBeInTheDocument();
  const firmy = screen.getByRole('list', { name: 'Firmy' });
  const ukazkova = within(firmy).getByRole('link', { name: /Ukázková prodejna s\.r\.o\./ });
  expect(ukazkova).toHaveAttribute('href', '/nastaveni/firma/f1' + KONTEXT);
  expect(ukazkova).toHaveTextContent('40 h týdně · So a Ne 300 Kč · stravné 129,50 Kč');
  expect(within(firmy).getByRole('link', { name: /Ukázková pekárna s\.r\.o\./ })).toHaveTextContent('IČO 12345678');
  expect(screen.getByRole('link', { name: 'Přidat firmu' })).toHaveAttribute('href', '/nastaveni/firma/nova' + KONTEXT);
  const zaloha = screen.getByRole('link', { name: 'Stáhnout zálohu' });
  expect(zaloha).toHaveAttribute('href', '/api/zaloha');
  expect(zaloha).toHaveAttribute('download');
});

test('nová firma se založí přes POST a appka na ni přepne', async () => {
  let firmy: Firma[] = [firma()];
  let poslano: NovaFirma | undefined;
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json(firmy),
    'POST /api/firmy': (init) => {
      poslano = telo(init);
      const nova = firma({ id: 'f2', nazev: 'Ukázková pekárna s.r.o.' });
      firmy = [...firmy, nova];
      return json(nova, 201);
    },
  });
  const uzivatel = otevri('/nastaveni/firma/nova');

  expect(await screen.findByRole('heading', { name: 'Nová firma', level: 1 })).toBeInTheDocument();
  await uzivatel.type(screen.getByLabelText(/Název firmy/), 'Ukázková pekárna s.r.o.');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(await screen.findByText('Firma založena')).toBeInTheDocument();
  expect(poslano).toEqual({ nazev: 'Ukázková pekárna s.r.o.', ico: null, adresa: null, ucet: null, nastaveni: VYCHOZI_VYPOCTU });
  expect(window.location.pathname).toBe('/nastaveni');
  expect(new URLSearchParams(window.location.search).get('firma')).toBe('f2');
  expect(localStorage.getItem('mzdy.firma')).toBe('f2');
});

test('smazání firmy chce potvrzení s názvem a DELETE pošle až po něm', async () => {
  let firmy: Firma[] = [firma(), firma({ id: 'f2', nazev: 'Ukázková pekárna s.r.o.' })];
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json(firmy),
    'DELETE /api/firmy/f1': () => {
      firmy = firmy.filter((f) => f.id !== 'f1');
      return new Response(null, { status: 204 });
    },
  });
  const uzivatel = otevri('/nastaveni/firma/f1');

  await uzivatel.click(await screen.findByRole('button', { name: 'Smazat firmu' }));
  const dialog = screen.getByRole('dialog', { name: 'Smazat firmu natrvalo?' });
  expect(dialog).toHaveTextContent('Ukázková prodejna s.r.o. se smaže se všemi lidmi, docházkou a uzávěrkami. Nejde to vrátit.');
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

  await uzivatel.click(within(dialog).getByRole('button', { name: 'Smazat natrvalo' }));

  expect(await screen.findByText('Firma smazána')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/nastaveni');
  expect(screen.queryByRole('link', { name: /Ukázková prodejna/ })).not.toBeInTheDocument();
});
