import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DovolenaZustatek, NovyZamestnanec, ZamestnanecSeSazbami } from '../../shared/api';
import { App } from '../App';
import { formatDatum } from '../datum';
import { firma, json, mesicData, mockApi, zamestnanec } from '../test-utils';

// Testy vykreslují celou appku (router, dotazy, rozvržení). Při souběhu s testy workeru (Miniflare) trvá vykreslení
// i uložení přes sekundu, proto delší čekání než výchozí 1 s / 5 s.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  // Jen Date: časovače zůstanou skutečné, aby fungovaly userEvent i waitFor.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

const KONTEXT = '?firma=f1&rok=2026&mesic=10';

function otevri(cesta: string) {
  window.history.replaceState(null, '', cesta + KONTEXT);
  render(<App />);
  // Bez prodlevy mezi klávesami: formuláře jsou dlouhé a psaní by test zbytečně zdržovalo.
  return userEvent.setup({ delay: null });
}

function zakladApi(lide: () => ZamestnanecSeSazbami[]) {
  return {
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/zamestnanci': () => json(lide()),
  };
}

const telo = <T,>(init: RequestInit | undefined): T => JSON.parse(String(init?.body)) as T;

test('nový člověk: prázdné jméno a neplatný účet formulář odmítne a nic neodešle', async () => {
  const fetchMock = mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  expect(await screen.findByRole('heading', { name: 'Nový člověk', level: 1 })).toBeInTheDocument();
  const ucet = screen.getByLabelText(/Číslo účtu/);
  await uzivatel.type(ucet, '123456789/0100');
  await uzivatel.tab();
  // Okamžitá kontrola: hláška se ukáže hned po opuštění pole, ne až při uložení.
  expect(screen.getByText('Číslo účtu nesedí, zkontroluj ho.')).toBeInTheDocument();

  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(screen.getByText('Napiš jméno.')).toBeInTheDocument();
  expect(screen.getByLabelText(/^Jméno/)).toHaveFocus();
  expect(ucet).toHaveAttribute('aria-invalid', 'true');
  expect(fetchMock.mock.calls.some(([adresa]) => String(adresa) === '/api/zamestnanci')).toBe(false);

  // Vše ostatní vyplněné: samotný neplatný účet uložení pořád zastaví a fokus skočí na něj.
  await uzivatel.type(screen.getByLabelText(/^Jméno/), 'Jana');
  await uzivatel.type(screen.getByLabelText(/^Příjmení/), 'Nováková');
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ucet).toHaveFocus();
  expect(screen.queryByText('Napiš jméno.')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([adresa]) => String(adresa) === '/api/zamestnanci')).toBe(false);

  // Oprava účtu chybu hned schová a ukáže IBAN jako potvrzení.
  await uzivatel.clear(ucet);
  await uzivatel.type(ucet, '19-24619/0800');
  expect(screen.queryByText('Číslo účtu nesedí, zkontroluj ho.')).not.toBeInTheDocument();
  expect(screen.getByText(/CZ75 0800 0000 1900 0002 4619/)).toBeInTheDocument();
});

const bylPost = (fetchMock: ReturnType<typeof mockApi>) => fetchMock.mock.calls.some(([adresa]) => String(adresa) === '/api/zamestnanci');

async function vyplnZaklad(uzivatel: ReturnType<typeof userEvent.setup>) {
  await uzivatel.type(await screen.findByLabelText(/^Jméno/), 'Jana');
  await uzivatel.type(screen.getByLabelText(/^Příjmení/), 'Nováková');
}

test('dvě sazby od stejného dne: hláška je vidět, fokus skočí na „Platí od" a nic se neodešle', async () => {
  const fetchMock = mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  await vyplnZaklad(uzivatel);
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165');
  await uzivatel.click(screen.getByRole('button', { name: 'Přidat sazbu' }));
  await uzivatel.type(screen.getAllByLabelText(/^Hodinová sazba/)[1], '170');
  // Nová sazba platí od 1. 11.; přepsaná na stejný den jako první vznikne duplicita.
  fireEvent.change(screen.getAllByLabelText(/^Platí od/)[1], { target: { value: '2026-10-06' } });
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  const zprava = screen.getByText('Dvě sazby nemůžou platit od stejného dne.');
  const [prvni, druhe] = screen.getAllByLabelText(/^Platí od/);
  expect(prvni).toHaveFocus();
  expect(prvni).toHaveAttribute('aria-invalid', 'true');
  expect(prvni).toHaveAccessibleDescription(expect.stringContaining('Dvě sazby nemůžou platit od stejného dne.'));
  expect(prvni.getAttribute('aria-describedby')).toContain(zprava.id);
  expect(druhe).not.toHaveAttribute('aria-invalid');
  expect(bylPost(fetchMock)).toBe(false);

  // Oprava jednoho dne hlášku hned schová.
  fireEvent.change(screen.getAllByLabelText(/^Platí od/)[1], { target: { value: '2026-11-01' } });
  expect(screen.queryByText('Dvě sazby nemůžou platit od stejného dne.')).not.toBeInTheDocument();
  expect(screen.getAllByLabelText(/^Platí od/)[0]).not.toHaveAttribute('aria-invalid');
});

test('první sazba až po nástupu: hláška je vidět, fokus skočí na „Platí od" a nic se neodešle; změna nástupu hlášku schová', async () => {
  const fetchMock = mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  await vyplnZaklad(uzivatel);
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165');
  const platiOd = screen.getByLabelText(/^Platí od/);
  fireEvent.change(platiOd, { target: { value: '2026-10-20' } });
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  // Testing Library skládá bílé znaky (i nezlomitelné mezery z formatDatum) do obyčejných mezer, proto i očekávaný text.
  const ocekavana = `První sazba platí až od ${formatDatum('2026-10-20')}, ale nástup je ${formatDatum('2026-10-06')}`.replace(/\s/g, ' ');
  const zprava = screen.getByText((text) => text.includes(ocekavana));
  expect(platiOd).toHaveFocus();
  expect(platiOd).toHaveAttribute('aria-invalid', 'true');
  expect(platiOd.getAttribute('aria-describedby')).toContain(zprava.id);
  expect(platiOd).toHaveAccessibleDescription(expect.stringContaining('První sazba platí až od'));
  expect(bylPost(fetchMock)).toBe(false);

  // Hláška závisí i na nástupu: jeho oprava ji schová, i když se v poli sazby nic nezměnilo.
  fireEvent.change(screen.getByLabelText(/^Nástup/), { target: { value: '2026-10-20' } });
  expect(screen.queryByText(/První sazba platí až od/)).not.toBeInTheDocument();
  expect(platiOd).not.toHaveAttribute('aria-invalid');
});

test('ukončení před nástupem: změna nástupu hlášku u ukončení schová', async () => {
  mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  await vyplnZaklad(uzivatel);
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165');
  fireEvent.change(screen.getByLabelText(/^Ukončení/), { target: { value: '2026-10-01' } });
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(screen.getByText('Ukončení nesmí být před nástupem.')).toBeInTheDocument();
  expect(screen.getByLabelText(/^Ukončení/)).toHaveFocus();

  fireEvent.change(screen.getByLabelText(/^Nástup/), { target: { value: '2026-09-01' } });
  expect(screen.queryByText('Ukončení nesmí být před nástupem.')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Ukončení/)).not.toHaveAttribute('aria-invalid');
});

test('chyba úvazku po přepnutí na dohodu a zpět nezůstane viset', async () => {
  mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  await vyplnZaklad(uzivatel);
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165');
  const uvazek = screen.getByLabelText(/^Úvazek/);
  await uzivatel.clear(uvazek);
  await uzivatel.type(uvazek, '45');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(screen.getByText('Úvazek musí být víc než 0 a nejvýš 40 hodin týdně.')).toBeInTheDocument();

  await uzivatel.click(screen.getByRole('radio', { name: 'Dohoda (DPP)' }));
  await uzivatel.click(screen.getByRole('radio', { name: 'Pracovní poměr (HPP)' }));
  expect(screen.queryByText('Úvazek musí být víc než 0 a nejvýš 40 hodin týdně.')).not.toBeInTheDocument();
});

test('chyba poznámky je propojená s polem popisem a pole dostane fokus', async () => {
  const fetchMock = mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  await vyplnZaklad(uzivatel);
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165');
  const poznamka = screen.getByRole('textbox', { name: 'Poznámka' });
  fireEvent.change(poznamka, { target: { value: 'x'.repeat(501) } });
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(poznamka).toHaveFocus();
  expect(poznamka).toHaveAttribute('aria-invalid', 'true');
  expect(poznamka).toHaveAccessibleDescription('Poznámka může mít nejvýš 500 znaků.');
  expect(bylPost(fetchMock)).toBe(false);
});

test('chyba účtu, která naskočí při opuštění pole, se čtečce ohlásí (role alert)', async () => {
  mockApi(zakladApi(() => []));
  const uzivatel = otevri('/lide/novy');

  await uzivatel.type(await screen.findByLabelText(/Číslo účtu/), '123456789/0100');
  await uzivatel.tab();

  expect(screen.getByText('Číslo účtu nesedí, zkontroluj ho.')).toHaveAttribute('role', 'alert');
});

test('jednotky h týdně a Kč/h jsou v popisu polí', async () => {
  mockApi(zakladApi(() => []));
  otevri('/lide/novy');

  expect(await screen.findByLabelText(/^Úvazek/)).toHaveAccessibleDescription(expect.stringMatching(/^h týdně/));
  expect(screen.getByLabelText(/^Hodinová sazba/)).toHaveAccessibleDescription('Kč/h');
});

test('uložení nového člověka pošle úvazek „30" jako 1800 minut a sazbu v haléřích, pak seznam ukáže „Uloženo"', async () => {
  let lide: ZamestnanecSeSazbami[] = [];
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => lide),
    'POST /api/zamestnanci': (init) => {
      poslano = telo(init);
      lide = [zamestnanec({ id: 'z9', uvazekMinTydne: 1800 })];
      return json(lide[0], 201);
    },
  });
  const uzivatel = otevri('/lide/novy');

  await uzivatel.type(await screen.findByLabelText(/^Jméno/), ' Jana ');
  await uzivatel.type(screen.getByLabelText(/^Příjmení/), 'Nováková');
  const uvazek = screen.getByLabelText(/^Úvazek/);
  await uzivatel.clear(uvazek);
  await uzivatel.type(uvazek, '30');
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '165,50');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/lide');
  expect(window.location.search).toBe(KONTEXT);
  expect(poslano).toEqual({
    firmaId: 'f1', jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 1800, nastup: '2026-10-06', ukonceni: null,
    prohlaseni: false, invalidita: 'ZADNA', ztpp: false, deti: [], statniPojistenec: false, slevaNaPojistnem: false, ucet: null, poznamka: null,
    aktivni: true, sazby: [{ platiOd: '2026-10-06', hodinovaHal: 16550 }], rolePlanu: 'MIMO_PLAN', stridaniSmen: [], poradiPodkladu: null, vPodkladu: true,
  });
});

test('pořadí v podkladu: číslo se pošle jako číslo, smazané pole jako null, neplatná hodnota ukáže chybu', async () => {
  const jana = zamestnanec({ poradiPodkladu: 4 });
  let poslano: NovyZamestnanec | undefined;
  const fetchMock = mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json(jana);
    },
  });
  const uzivatel = otevri('/lide/z1');

  const poradi = await screen.findByLabelText(/Pořadí v podkladu pro účetního/);
  expect(poradi).toHaveValue('4');
  expect(screen.getByText('Číslo řádku v podkladu pro účetního. Kdo ho nemá, je na konci podle příjmení.')).toBeInTheDocument();

  // Neplatná hodnota: hláška u pole, fokus na něm, nic se neodešle.
  await uzivatel.clear(poradi);
  await uzivatel.type(poradi, '1000');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(screen.getByText('Celé číslo od 1 do 999.')).toBeInTheDocument();
  expect(poradi).toHaveAttribute('aria-invalid', 'true');
  expect(poradi).toHaveFocus();
  expect(fetchMock.mock.calls.some(([adresa]) => String(adresa) === '/api/zamestnanci/z1')).toBe(false);

  // Oprava hlášku schová a uloží se číslo.
  await uzivatel.clear(poradi);
  await uzivatel.type(poradi, '12');
  expect(screen.queryByText('Celé číslo od 1 do 999.')).not.toBeInTheDocument();
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));
  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano?.poradiPodkladu).toBe(12);
});

test('pořadí v podkladu: smazané pole se pošle jako výslovné null', async () => {
  const jana = zamestnanec({ poradiPodkladu: 4 });
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json(jana);
    },
  });
  const uzivatel = otevri('/lide/z1');

  await uzivatel.clear(await screen.findByLabelText(/Pořadí v podkladu pro účetního/));
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano).toHaveProperty('poradiPodkladu', null);
});

test('zahrnutí do podkladů: výchozí zapnuté, odškrtnutí pošle vPodkladu false, nápověda je u přepínače', async () => {
  const jana = zamestnanec({ vPodkladu: true });
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json(jana);
    },
  });
  const uzivatel = otevri('/lide/z1');

  const prepinac = await screen.findByRole('switch', { name: /Zahrnout do podkladů pro účetního/ });
  expect(prepinac).toBeChecked();
  expect(screen.getByText('Když je vypnuté, člověk není v PDF podkladu ani v Excelu pro účetního. Směny, docházka a výplaty zůstávají.')).toBeInTheDocument();
  await uzivatel.click(prepinac);
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano).toHaveProperty('vPodkladu', false);
});

test('zahrnutí do podkladů: u člověka s vypnutým příznakem je přepínač vypnutý a pošle se false', async () => {
  const jana = zamestnanec({ vPodkladu: false });
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json(jana);
    },
  });
  const uzivatel = otevri('/lide/z1');

  expect(await screen.findByRole('switch', { name: /Zahrnout do podkladů pro účetního/ })).not.toBeChecked();
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano).toHaveProperty('vPodkladu', false);
});

test('dohoda (DPP) skryje úvazek i slevu na pojistném a pošle úvazek 0 a slevu vypnutou', async () => {
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => []),
    'POST /api/zamestnanci': (init) => {
      poslano = telo(init);
      return json(zamestnanec({ id: 'z9', smlouva: 'DPP' }), 201);
    },
  });
  const uzivatel = otevri('/lide/novy');

  await uzivatel.type(await screen.findByLabelText(/^Jméno/), 'Marek');
  await uzivatel.type(screen.getByLabelText(/^Příjmení/), 'Beneš');
  await uzivatel.click(screen.getByRole('switch', { name: /Sleva na pojistném/ }));
  await uzivatel.click(screen.getByRole('radio', { name: 'Dohoda (DPP)' }));
  expect(screen.queryByLabelText(/^Úvazek/)).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: /Sleva na pojistném/ })).not.toBeInTheDocument();
  await uzivatel.type(screen.getByLabelText(/^Hodinová sazba/), '150');
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano).toMatchObject({ smlouva: 'DPP', uvazekMinTydne: 0, slevaNaPojistnem: false });
});

test('úprava pošle PUT s celým zaměstnancem (i s null poli) a sazby z historie', async () => {
  const jana = zamestnanec({ uvazekMinTydne: 2250, deti: [{ ztpp: false }], ucet: '19-24619/0800' });
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json(jana);
    },
  });
  const uzivatel = otevri('/lide/z1');

  expect(await screen.findByRole('heading', { name: 'Jana Nováková', level: 1 })).toBeInTheDocument();
  expect(screen.getByLabelText(/^Úvazek/)).toHaveValue('37,5');
  expect(screen.getByLabelText(/^Hodinová sazba/)).toHaveValue('165');
  await uzivatel.click(within(screen.getByRole('group', { name: '1. dítě' })).getByRole('switch', { name: /Průkaz ZTP\/P/ }));
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano).toEqual({
    firmaId: 'f1', jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 2250, nastup: '2025-01-01', ukonceni: null,
    prohlaseni: true, invalidita: 'ZADNA', ztpp: false, deti: [{ ztpp: true }], statniPojistenec: false, slevaNaPojistnem: false,
    ucet: '19-24619/0800', poznamka: null, aktivni: true, sazby: [{ platiOd: '2025-01-01', hodinovaHal: 16500 }],
    rolePlanu: 'MIMO_PLAN', stridaniSmen: [], poradiPodkladu: null, vPodkladu: true,
  });
  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
});

test('„Ukončit pracovní poměr" uloží datum ukončení a aktivni: false', async () => {
  const jana = zamestnanec();
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json({ ...jana, ukonceni: '2026-10-31', aktivni: false });
    },
  });
  const uzivatel = otevri('/lide/z1');

  await uzivatel.click(await screen.findByRole('button', { name: 'Ukončit pracovní poměr' }));
  const dialog = screen.getByRole('dialog', { name: 'Ukončit pracovní poměr' });
  const posledniDen = within(dialog).getByLabelText(/Poslední den/);
  expect(posledniDen).toHaveValue('2026-10-06');
  fireEvent.change(posledniDen, { target: { value: '2026-10-31' } });
  await uzivatel.click(within(dialog).getByRole('button', { name: 'Ukončit pracovní poměr' }));

  expect(await screen.findByText('Pracovní poměr ukončen')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/lide');
  expect(poslano).toMatchObject({ ukonceni: '2026-10-31', aktivni: false, jmeno: 'Jana', sazby: [{ platiOd: '2025-01-01', hodinovaHal: 16500 }] });
});

test('„Ukončit pracovní poměr" s chybou ve formuláři nic neuloží, zavře panel a fokus pošle na chybné pole', async () => {
  const jana = zamestnanec();
  const fetchMock = mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
  });
  const uzivatel = otevri('/lide/z1');

  await uzivatel.clear(await screen.findByLabelText(/^Jméno/));
  await uzivatel.click(screen.getByRole('button', { name: 'Ukončit pracovní poměr' }));
  const dialog = screen.getByRole('dialog', { name: 'Ukončit pracovní poměr' });
  await uzivatel.click(within(dialog).getByRole('button', { name: 'Ukončit pracovní poměr' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Napiš jméno.')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText(/^Jméno/)).toHaveFocus());
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});

test('smazání chce potvrzení se jménem člověka a DELETE pošle až po něm', async () => {
  const jana = zamestnanec();
  let lide = [jana];
  const fetchMock = mockApi({
    ...zakladApi(() => lide),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'DELETE /api/zamestnanci/z1': () => {
      lide = [];
      return new Response(null, { status: 204 });
    },
  });
  const uzivatel = otevri('/lide/z1');

  await uzivatel.click(await screen.findByRole('button', { name: 'Smazat natrvalo' }));
  const dialog = screen.getByRole('dialog', { name: 'Smazat natrvalo?' });
  expect(dialog).toHaveTextContent('Jana Nováková se smaže včetně docházky, sazeb a dovolené. Nejde to vrátit.');
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

  await uzivatel.click(within(dialog).getByRole('button', { name: 'Smazat natrvalo' }));

  expect(await screen.findByText('Smazáno')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/lide');
  expect(fetchMock).toHaveBeenCalledWith('/api/zamestnanci/z1', expect.objectContaining({ method: 'DELETE' }));
});

test('dovolená ukáže nárok, čerpáno a zbývá a změněný převod uloží přes PUT /api/dovolena', async () => {
  const jana = zamestnanec();
  const zustatek: DovolenaZustatek = { zamestnanecId: 'z1', rok: 2026, prevodMin: 600, narokNavicMin: 0 };
  let dovolena: DovolenaZustatek | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 480, praceMin: 9000 } }, zustatky: [zustatek] })),
    'PUT /api/zamestnanci/z1': () => json(jana),
    'PUT /api/dovolena': (init) => {
      dovolena = telo(init);
      return json(dovolena);
    },
  });
  const uzivatel = otevri('/lide/z1');

  const sekce = await screen.findByRole('region', { name: 'Dovolená 2026' });
  // HPP 40 h celý rok: 4 × 40 = 160 h + převod 10 h = 170 h; čerpáno 8 h.
  await waitFor(() => expect(within(sekce).getByText('Nárok').parentElement).toHaveTextContent(/Nárok\s*170\sh/));
  expect(within(sekce).getByText('Čerpáno').parentElement).toHaveTextContent(/Čerpáno\s*8\sh/);
  expect(within(sekce).getByText('Zbývá').parentElement).toHaveTextContent(/Zbývá\s*162\sh/);

  const prevod = within(sekce).getByLabelText(/Převod z minulého roku/);
  expect(prevod).toHaveValue('10');
  await uzivatel.clear(prevod);
  await uzivatel.type(prevod, '16');
  // Přepočet hned při psaní.
  expect(within(sekce).getByText('Zbývá').parentElement).toHaveTextContent(/Zbývá\s*168\sh/);
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
  expect(dovolena).toEqual({ zamestnanecId: 'z1', rok: 2026, prevodMin: 960, narokNavicMin: 0 });
});

test('záporný převod dovolené „-8" se uloží jako −480 minut a pole nabízí klávesnici se znaménkem', async () => {
  const jana = zamestnanec();
  const zustatek: DovolenaZustatek = { zamestnanecId: 'z1', rok: 2026, prevodMin: 600, narokNavicMin: 0 };
  let dovolena: DovolenaZustatek | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 480, praceMin: 9000 } }, zustatky: [zustatek] })),
    'PUT /api/zamestnanci/z1': () => json(jana),
    'PUT /api/dovolena': (init) => {
      dovolena = telo(init);
      return json(dovolena);
    },
  });
  const uzivatel = otevri('/lide/z1');

  const sekce = await screen.findByRole('region', { name: 'Dovolená 2026' });
  const prevod = await within(sekce).findByLabelText(/Převod z minulého roku/);
  // Desetinná klávesnice na iOS nemá minus, proto jen u tohoto pole běžná.
  expect(prevod).toHaveAttribute('inputmode', 'text');
  expect(within(sekce).getByLabelText(/Dovolená navíc/)).toHaveAttribute('inputmode', 'decimal');
  await uzivatel.clear(prevod);
  await uzivatel.type(prevod, '-8');
  // 4 × 40 h − 8 h = 152 h nároku, čerpáno 8 h, zbývá 144 h.
  expect(within(sekce).getByText('Zbývá').parentElement).toHaveTextContent(/Zbývá\s*144\sh/);
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
  expect(dovolena).toEqual({ zamestnanecId: 'z1', rok: 2026, prevodMin: -480, narokNavicMin: 0 });
});

test('neznámý člověk (např. po přepnutí firmy) ukáže srozumitelný stav a odkaz zpět', async () => {
  mockApi(zakladApi(() => []));
  otevri('/lide/nikdo');

  expect(await screen.findByText('Tenhle člověk tu není')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Zpět na lidi' })).toHaveAttribute('href', '/lide' + KONTEXT);
});

test('role a pevné směny se uloží; pořadí jde změnit', async () => {
  const jana = zamestnanec();
  let poslano: NovyZamestnanec | undefined;
  mockApi({
    ...zakladApi(() => [jana]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: [jana], dovolenaRok: { z1: { cerpanoMin: 0, praceMin: 0 } } })),
    'GET /api/firmy/f1/sablony': () => json([
      { id: 's1220', firmaId: 'f1', nazev: '12–20', zacatek: '12:00', konec: '20:00', prestavkaMin: 0, barva: null },
      { id: 's816', firmaId: 'f1', nazev: '8–16:30', zacatek: '08:00', konec: '16:30', prestavkaMin: 30, barva: null },
    ]),
    'PUT /api/zamestnanci/z1': (init) => {
      poslano = telo(init);
      return json(jana);
    },
  });
  const uzivatel = otevri('/lide/z1');

  await uzivatel.click(await screen.findByRole('radio', { name: 'Dozor' }));
  const vyber = await screen.findByRole('combobox', { name: 'Přidat pevnou směnu' });
  await waitFor(() => expect(within(vyber).getAllByRole('option')).toHaveLength(2));
  await uzivatel.selectOptions(vyber, 's816');
  await uzivatel.click(screen.getByRole('button', { name: 'Přidat směnu' }));
  await uzivatel.selectOptions(screen.getByRole('combobox', { name: 'Přidat pevnou směnu' }), 's1220');
  await uzivatel.click(screen.getByRole('button', { name: 'Přidat směnu' }));
  await uzivatel.click(screen.getByRole('button', { name: 'Posunout 12–20 výš' }));
  await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));

  await waitFor(() => expect(poslano).toBeDefined());
  expect(poslano).toMatchObject({ rolePlanu: 'DOZOR', stridaniSmen: ['s1220', 's816'] });
});
