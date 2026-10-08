import { configure, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ZamestnanecSeSazbami } from '../../shared/api';
import { App } from '../App';
import { firma, json, mockApi, zamestnanec } from '../test-utils';

// Testy vykreslují celou appku (router, dotazy, rozvržení). Při souběhu s testy workeru (Miniflare) trvá vykreslení
// i uložení přes sekundu, proto delší čekání než výchozí 1 s / 5 s.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

const KONTEXT = '?firma=f1&rok=2026&mesic=10';

function otevri(lide: ZamestnanecSeSazbami[]) {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/zamestnanci': () => json(lide),
  });
  window.history.replaceState(null, '', '/lide' + KONTEXT);
  render(<App />);
  // Bez prodlevy mezi klávesami: formuláře jsou dlouhé a psaní by test zbytečně zdržovalo.
  return userEvent.setup({ delay: null });
}

const sazba = (id: string, platiOd: string, hodinovaHal: number) => ({ id: `${id}-${platiOd}`, zamestnanecId: id, platiOd, hodinovaHal });

const LIDE = [
  zamestnanec({ id: 'a', jmeno: 'Petr', prijmeni: 'Chalupa', smlouva: 'DPP', uvazekMinTydne: 0, prohlaseni: false, sazby: [sazba('a', '2025-01-01', 15000)] }),
  zamestnanec({
    id: 'b', jmeno: 'Eva', prijmeni: 'Čermáková', invalidita: 'II', ztpp: true,
    sazby: [sazba('b', '2025-01-01', 15000), sazba('b', '2026-10-01', 16000), sazba('b', '2026-11-01', 17000)],
  }),
  zamestnanec({ id: 'c', jmeno: 'Jan', prijmeni: 'Hrubý', uvazekMinTydne: 2250 }),
  zamestnanec({ id: 'd', jmeno: 'Ivana', prijmeni: 'Cibulková' }),
  zamestnanec({ id: 'e', jmeno: 'Karel', prijmeni: 'Adámek', aktivni: false, ukonceni: '2026-08-31' }),
];

test('seznam aktivních lidí je seřazený podle příjmení česky (Č za C, Ch za H)', async () => {
  otevri(LIDE);

  const seznam = await screen.findByRole('list', { name: 'Současní' });
  const odkazy = within(seznam).getAllByRole('link');
  const poradi = ['Ivana Cibulková', 'Eva Čermáková', 'Jan Hrubý', 'Petr Chalupa'];
  expect(odkazy).toHaveLength(poradi.length);
  poradi.forEach((jmeno, i) => expect(odkazy[i]).toHaveTextContent(new RegExp(`^${jmeno}`)));
  expect(screen.queryByText('Karel Adámek')).not.toBeInTheDocument();
});

test('řádek ukáže smlouvu, úvazek, sazbu platnou dnes a štítky', async () => {
  otevri(LIDE);

  const eva = await screen.findByRole('link', { name: /Eva Čermáková/ });
  expect(eva).toHaveAttribute('href', '/lide/b' + KONTEXT);
  // toHaveTextContent sjednotí všechny mezery (i úzké nezlomitelné) na obyčejné.
  expect(eva).toHaveTextContent('160 Kč/h');
  expect(eva).toHaveTextContent('40 h týdně');
  expect(within(eva).getByText('Invalidita II')).toBeInTheDocument();
  expect(within(eva).getByText('ZTP/P')).toBeInTheDocument();
  expect(within(eva).getByText('Prohlášení')).toBeInTheDocument();

  const jan = screen.getByRole('link', { name: /Jan Hrubý/ });
  expect(jan).toHaveTextContent('37,5 h týdně');

  const petr = screen.getByRole('link', { name: /Petr Chalupa/ });
  expect(petr).toHaveTextContent('DPP');
  expect(petr).toHaveTextContent('150 Kč/h');
  expect(within(petr).queryByText('Prohlášení')).not.toBeInTheDocument();
});

test('přepínač „Zobrazit i bývalé" ukáže ukončené lidi zvlášť', async () => {
  const uzivatel = otevri(LIDE);

  await uzivatel.click(await screen.findByRole('switch', { name: /Zobrazit i bývalé/ }));

  const byvali = screen.getByRole('list', { name: 'Bývalí' });
  const karel = within(byvali).getByRole('link', { name: /Karel Adámek/ });
  expect(karel).toHaveTextContent('Ukončeno 31. 8. 2026');
});

test('tlačítko „Přidat člověka" vede na prázdný formulář a nese firmu a měsíc', async () => {
  otevri(LIDE);

  expect(await screen.findByRole('link', { name: 'Přidat člověka' })).toHaveAttribute('href', '/lide/novy' + KONTEXT);
});

test('bez lidí ukáže prázdný stav s nabídkou přidat prvního', async () => {
  otevri([]);

  expect(await screen.findByText('Zatím tu nikdo není')).toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: /Zobrazit i bývalé/ })).not.toBeInTheDocument();
});
