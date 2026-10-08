import type { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Firma } from '../shared/api';
import { App } from './App';
import { firma, json, mesicData, mockApi } from './test-utils';

// Klient dotazů vzniká uvnitř `App`; test si ho zachytí, aby mohl vyvolat obnovu dat na pozadí.
let klient: QueryClient;
vi.mock('./api/dotazy', async (puvodni) => {
  const modul = await puvodni<typeof import('./api/dotazy')>();
  return {
    ...modul,
    vytvorKlientaDotazu: () => {
      klient = modul.vytvorKlientaDotazu();
      return klient;
    },
  };
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

test('bez firem ukáže první spuštění a „Vyzkoušet na ukázkových datech" zavolá POST /api/demo', async () => {
  let firmy: Firma[] = [];
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json(firmy),
    'POST /api/demo': () => {
      firmy = [firma()];
      return json(firmy[0], 201);
    },
  });
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Začneme firmou' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Vyzkoušet na ukázkových datech' }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/demo', expect.objectContaining({ method: 'POST' })));
  expect(await screen.findByRole('heading', { name: 'Výplaty', level: 1 })).toBeInTheDocument();
  // Zapamatování firmy obstará efekt ve `useVyber` (po zrušení formuláře by callback u `mutate` už neběžel).
  await waitFor(() => expect(localStorage.getItem('mzdy.firma')).toBe('f1'));
});

test('„Zpět" z formuláře firmy vrátí fokus na tlačítko, které formulář otevřelo', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([]),
  });
  render(<App />);

  await userEvent.click(await screen.findByRole('button', { name: 'Založit firmu' }));
  expect(screen.getByLabelText(/Název firmy/)).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Zpět' }));

  expect(screen.getByRole('button', { name: 'Založit firmu' })).toHaveFocus();
});

test('založení firmy formulářem pošle POST /api/firmy jen s vyplněnými údaji', async () => {
  let firmy: Firma[] = [];
  let telo: unknown;
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json(firmy),
    'POST /api/firmy': (init) => {
      telo = JSON.parse(String(init?.body));
      firmy = [firma({ id: 'f9', nazev: 'Ukázková pekárna s.r.o.' })];
      return json(firmy[0], 201);
    },
  });
  render(<App />);

  await userEvent.click(await screen.findByRole('button', { name: 'Založit firmu' }));
  await userEvent.click(screen.getByRole('button', { name: 'Založit firmu' }));
  expect(await screen.findByText('Napiš název firmy.')).toBeInTheDocument();
  expect(screen.getByLabelText(/Název firmy/)).toHaveFocus();

  await userEvent.type(screen.getByLabelText(/Název firmy/), '  Ukázková pekárna s.r.o. ');
  await userEvent.type(screen.getByLabelText(/IČO/), '123');
  await userEvent.click(screen.getByRole('button', { name: 'Založit firmu' }));
  expect(await screen.findByText('IČO má 8 číslic.')).toBeInTheDocument();
  expect(screen.getByLabelText(/IČO/)).toHaveFocus();

  await userEvent.clear(screen.getByLabelText(/IČO/));
  await userEvent.type(screen.getByLabelText(/IČO/), '12345678');
  await userEvent.click(screen.getByRole('button', { name: 'Založit firmu' }));

  expect(await screen.findByRole('heading', { name: 'Výplaty', level: 1 })).toBeInTheDocument();
  expect(telo).toEqual({ nazev: 'Ukázková pekárna s.r.o.', ico: '12345678', adresa: null, ucet: null });
  expect(localStorage.getItem('mzdy.firma')).toBe('f9');
});

test('503 PRISTUP_NENASTAVEN z /api/ja ukáže návod se zapnutím Cloudflare Access', async () => {
  mockApi({
    'GET /api/ja': () => json({ chyba: 'PRISTUP_NENASTAVEN' }, 503),
    'GET /api/firmy': () => json({ chyba: 'PRISTUP_NENASTAVEN' }, 503),
  });
  render(<App />);

  expect(await screen.findByText(/Enable Cloudflare Access/)).toBeInTheDocument();
  expect(screen.getByText('npx wrangler secret put ACCESS_AUD')).toBeInTheDocument();
  expect(screen.getByText('npx wrangler secret put ACCESS_TEAM_DOMAIN')).toBeInTheDocument();
  // Obrazovka je veřejná ještě před zapnutím Access, proto v ní nesmí být žádné konkrétní e-maily.
  expect(document.body.textContent).not.toMatch(/@/);
});

test('jiná chyba přihlášení ukáže srozumitelnou hlášku', async () => {
  mockApi({
    'GET /api/ja': () => json({ chyba: 'ZAKAZANO' }, 403),
    'GET /api/firmy': () => json({ chyba: 'ZAKAZANO' }, 403),
  });
  render(<App />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Tenhle e-mail nemá do appky přístup.');
});

test('navigace označí aktivní sekci a odkazy drží vybranou firmu a měsíc', async () => {
  window.history.replaceState(null, '', '/?firma=f1&rok=2026&mesic=10');
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Výplaty', level: 1 })).toBeInTheDocument();
  for (const odkaz of screen.getAllByRole('link', { name: 'Výplaty' })) expect(odkaz).toHaveAttribute('aria-current', 'page');

  await userEvent.click(screen.getAllByRole('link', { name: 'Lidé' })[0]);

  expect(await screen.findByRole('heading', { name: 'Lidé', level: 1 })).toBeInTheDocument();
  for (const odkaz of screen.getAllByRole('link', { name: 'Lidé' })) expect(odkaz).toHaveAttribute('aria-current', 'page');
  for (const odkaz of screen.getAllByRole('link', { name: 'Výplaty' })) expect(odkaz).not.toHaveAttribute('aria-current');
  expect(window.location.pathname).toBe('/lide');
  expect(window.location.search).toBe('?firma=f1&rok=2026&mesic=10');
});

test('na mobilní stránce Více jsou Výstupy, Nastavení a záloha', async () => {
  window.history.replaceState(null, '', '/vice');
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Více', level: 1 })).toBeInTheDocument();
  for (const odkaz of screen.getAllByRole('link', { name: 'Více' })) expect(odkaz).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: /Stáhnout zálohu/ })).toHaveAttribute('href', '/api/zaloha');
});

test('selhání obnovy dat na pozadí nepřekryje appku: navigace i načtená data zůstanou', async () => {
  let selhat = false;
  const odpoved = (data: unknown) => (selhat ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(json(data)));
  // Výplaty načítají i data měsíce (aktuálního, datum tu není podvržené); ani jejich selhání při obnově nesmí nic překrýt.
  const ted = new Date();
  mockApi({
    'GET /api/ja': () => odpoved({ email: 'dev@localhost' }),
    'GET /api/firmy': () => odpoved([firma()]),
    [`GET /api/firmy/f1/mesic/${ted.getFullYear()}/${ted.getMonth() + 1}`]: () => odpoved(mesicData({ rok: ted.getFullYear(), mesic: ted.getMonth() + 1 })),
  });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Výplaty', level: 1 })).toBeInTheDocument();

  selhat = true;
  klient.setDefaultOptions({ queries: { retry: false } });
  await klient.refetchQueries();
  await waitFor(() => expect(klient.getQueryState(['firmy'])?.status).toBe('error'));
  expect(klient.getQueryState(['ja'])?.status).toBe('error');

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getAllByRole('navigation', { name: 'Hlavní navigace' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { name: 'Výplaty', level: 1 })).toBeInTheDocument();
});

test('vypršené přihlášení při obnově dat na pozadí ukáže chybu přes celou obrazovku', async () => {
  let vyprselo = false;
  mockApi({
    'GET /api/ja': () => (vyprselo ? json({ chyba: 'NEPRIHLASEN' }, 401) : json({ email: 'dev@localhost' })),
    'GET /api/firmy': () => json([firma()]),
  });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Výplaty', level: 1 })).toBeInTheDocument();

  vyprselo = true;
  klient.setDefaultOptions({ queries: { retry: false } });
  await klient.refetchQueries({ queryKey: ['ja'] });

  expect(await screen.findByRole('alert')).toHaveTextContent('Přihlášení vypršelo. Obnov stránku.');
  expect(screen.queryByRole('navigation', { name: 'Hlavní navigace' })).not.toBeInTheDocument();
});

test('stavy načítání a chyby přes celou obrazovku jsou zabalené v <main>', async () => {
  mockApi({
    'GET /api/ja': () => json({ chyba: 'ZAKAZANO' }, 403),
    'GET /api/firmy': () => json({ chyba: 'ZAKAZANO' }, 403),
  });
  render(<App />);

  expect(screen.getByRole('main')).toContainElement(screen.getByRole('status'));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('main')).toContainElement(screen.getByRole('alert'));
});

test('hlavní navigace PC není postranní <aside>, ale jen navigace', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
  });
  render(<App />);

  await screen.findByRole('heading', { name: 'Výplaty', level: 1 });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(screen.getAllByRole('main')).toHaveLength(1);
});
