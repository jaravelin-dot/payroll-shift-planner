import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Den, MesicData, MesicniVstup, UlozDny } from '../../shared/api';
import { App } from '../App';
import { neulozenaDochazka, odeberNeulozenouDochazku } from '../stav/neulozenaDochazka';
import { firma, json, mesicData, mockApi, zamestnanec } from '../test-utils';

// Celá appka (router, dotazy, rozvržení); při souběhu s testy workeru je vykreslení pomalejší.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  // Neuložená docházka se drží v paměti modulu; další test musí začít bez hlášky.
  for (const p of neulozenaDochazka()) odeberNeulozenouDochazku(p);
});

const KONTEXT = '?firma=f1&rok=2026&mesic=10';
const prace = (zamestnanecId: string, datum: string, minuty = 480): Den => ({ zamestnanecId, datum, typ: 'PRACE', minuty, kasa: false, poznamka: null });
const telo = <T,>(init: RequestInit | undefined): T => JSON.parse(String(init?.body)) as T;

/** Falešný server: drží data měsíce a promítá do nich uložené dny a vstupy. */
function server(pocatecni: MesicData, navic: Record<string, (init: RequestInit | undefined) => Response> = {}) {
  let data = pocatecni;
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(data),
    'PUT /api/dny': (init) => {
      const z = telo<UlozDny>(init);
      const dotcena = new Set([...(z.smazat ?? []), ...z.dny.map((d) => d.datum)]);
      data = { ...data, dny: [...data.dny.filter((d) => d.zamestnanecId !== z.zamestnanecId || !dotcena.has(d.datum)), ...z.dny.map((d) => ({ ...d, zamestnanecId: z.zamestnanecId }))] };
      return json({ ok: true });
    },
    'PUT /api/vstupy': (init) => {
      const v = telo<MesicniVstup>(init);
      data = { ...data, vstupy: [...data.vstupy.filter((x) => x.zamestnanecId !== v.zamestnanecId), v] };
      return json(v);
    },
    ...navic,
  });
  return { fetchMock, data: () => data };
}

function otevri(id = 'z1') {
  window.history.replaceState(null, '', `/clovek/${id}${KONTEXT}`);
  render(<App />);
  return userEvent.setup({ delay: null });
}

const LIDE = [
  zamestnanec({ id: 'z1' }),
  zamestnanec({ id: 'z2', jmeno: 'Petr', prijmeni: 'Černý', smlouva: 'DPP', uvazekMinTydne: 0, prohlaseni: false }),
  zamestnanec({ id: 'z3', jmeno: 'Eva', prijmeni: 'Adamová' }),
];
const DATA = mesicData({ zamestnanci: LIDE, dny: ['2026-10-01', '2026-10-02'].map((d) => prace('z1', d)) });

const kVyplate = () => screen.getAllByTestId('k-vyplate')[0]!.textContent;

test('hlavička: jméno, smlouva, sazba a šipky na sousedy podle příjmení', async () => {
  server(DATA);
  otevri();
  expect(await screen.findByRole('heading', { name: 'Jana Nováková', level: 1 })).toBeInTheDocument();
  expect(screen.getByText(/HPP · 40 h týdně · 165 Kč\/h/)).toBeInTheDocument();
  // Pořadí Adamová, Černý, Nováková: předchozí je Černý, další není.
  expect(screen.getByRole('link', { name: 'Předchozí: Petr Černý' })).toHaveAttribute('href', '/clovek/z2' + KONTEXT);
  expect(screen.queryByRole('link', { name: /^Další:/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Zpět na výplaty' })).toHaveAttribute('href', '/' + KONTEXT);
});

test('klik na den, „Dovolená" a 8 h zavolá PUT /api/dny a účtenka se hned přepočítá', async () => {
  const { fetchMock } = server(DATA);
  const uzivatel = otevri();
  const den = await screen.findByRole('button', { name: /^Pondělí 5\. října/ });
  const predtim = kVyplate();

  await uzivatel.click(den);
  const panel = screen.getByRole('dialog', { name: 'Pondělí 5. října' });
  await uzivatel.click(within(panel).getByRole('radio', { name: /Dovolená/ }));
  await uzivatel.click(within(panel).getByRole('button', { name: '8 h' }));
  await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const volani = fetchMock.mock.calls.find(([adresa, init]) => String(adresa) === '/api/dny' && init?.method === 'PUT');
  expect(telo(volani![1])).toEqual({ zamestnanecId: 'z1', dny: [{ datum: '2026-10-05', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }] });
  expect(screen.getByRole('button', { name: /^Pondělí 5\. října: dovolená 8 h/ })).toBeInTheDocument();
  expect(kVyplate()).not.toBe(predtim);
});

test('nemoc od–do z tlačítka „Zadat nemoc" uloží každý kalendářní den', async () => {
  const { fetchMock } = server(DATA);
  const uzivatel = otevri();
  await uzivatel.click(await screen.findByRole('button', { name: 'Zadat nemoc' }));
  const panel = screen.getByRole('dialog', { name: 'Zadat nemoc' });
  const od = within(panel).getByLabelText('Nemoc od');
  await uzivatel.clear(od);
  await uzivatel.type(od, '2026-10-09');
  const do_ = within(panel).getByLabelText('Nemoc do');
  await uzivatel.clear(do_);
  await uzivatel.type(do_, '2026-10-12');
  await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit nemoc' }));

  const volani = fetchMock.mock.calls.find(([adresa]) => String(adresa) === '/api/dny');
  expect(telo<UlozDny>(volani![1]).dny.map((d) => [d.datum, d.typ, d.minuty])).toEqual([
    ['2026-10-09', 'NEMOC', 480], ['2026-10-10', 'NEMOC', 0], ['2026-10-11', 'NEMOC', 0], ['2026-10-12', 'NEMOC', 480],
  ]);
});

test('uzavřený měsíc nedovolí otevřít panel a nabídne otevření měsíce s potvrzením', async () => {
  const uzavreny = { ...DATA, uzaverka: { firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z', vysledky: [] } };
  const { fetchMock } = server(uzavreny, { 'DELETE /api/firmy/f1/uzaverka/2026/10': () => new Response(null, { status: 204 }) });
  const uzivatel = otevri();
  const den = await screen.findByRole('button', { name: /^Čtvrtek 1\. října/ });
  expect(screen.getByText('Říjen 2026 je uzavřený.')).toBeInTheDocument();

  await uzivatel.click(den);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Odměna za odpracovaný den' }).closest('fieldset')).toBeDisabled();

  await uzivatel.click(screen.getByRole('button', { name: 'Otevřít měsíc' }));
  const potvrzeni = screen.getByRole('dialog', { name: 'Otevřít říjen 2026?' });
  await uzivatel.click(within(potvrzeni).getByRole('button', { name: 'Otevřít měsíc' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/firmy/f1/uzaverka/2026/10', expect.objectContaining({ method: 'DELETE' })));
});

test('odměna za den: účtenka se přepočítá hned, PUT /api/vstupy odejde jednou po 600 ms s celým vstupem', async () => {
  const { fetchMock } = server(DATA);
  const uzivatel = otevri();
  const odmena = within(await screen.findByRole('group', { name: 'Odměna za odpracovaný den' }));
  const predtim = kVyplate();

  await uzivatel.click(odmena.getByRole('radio', { name: '80 Kč' }));
  await uzivatel.click(odmena.getByRole('radio', { name: '120 Kč' }));
  expect(kVyplate()).not.toBe(predtim);
  const vstupy = () => fetchMock.mock.calls.filter(([adresa]) => String(adresa) === '/api/vstupy');
  expect(vstupy()).toHaveLength(0);

  await waitFor(() => expect(vstupy()).toHaveLength(1));
  expect(telo(vstupy()[0]![1])).toEqual({
    zamestnanecId: 'z1', rok: 2026, mesic: 10, odmenaZaDenHal: 12000, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null,
  });
  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
  expect(vstupy()).toHaveLength(1);
});

test('odměna propadlá nemocí se ukáže v upozorněních s odkazem na porovnání odměn', async () => {
  server({
    ...DATA,
    dny: [...DATA.dny, { zamestnanecId: 'z1', datum: '2026-10-05', typ: 'NEMOC', minuty: 480, kasa: false, poznamka: null }],
    vstupy: [{ zamestnanecId: 'z1', rok: 2026, mesic: 10, odmenaZaDenHal: 18000, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null }],
  });
  otevri();
  const upozorneni = await screen.findByRole('region', { name: /Upozornění/ });
  expect(within(upozorneni).getByText('Odměna propadla')).toBeInTheDocument();
  expect(within(upozorneni).getByRole('link', { name: 'Porovnat odměny' })).toHaveAttribute('href', '/' + KONTEXT);
});

/** Server, kterému jde uložení vstupu vypnout (`selhat`); uložené vstupy promítá do dat měsíce. */
function serverSVypadkem() {
  const stav = { data: DATA, selhat: true };
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(stav.data),
    'PUT /api/vstupy': (init) => {
      if (stav.selhat) return new Response('chyba', { status: 500 });
      const v = telo<MesicniVstup>(init);
      stav.data = { ...stav.data, vstupy: [...stav.data.vstupy.filter((x) => x.zamestnanecId !== v.zamestnanecId), v] };
      return json(v);
    },
  });
  const vstupy = () => fetchMock.mock.calls.filter(([adresa]) => String(adresa) === '/api/vstupy').map(([, init]) => telo<MesicniVstup>(init));
  return { stav, vstupy };
}
const HLASKA = 'Změny odměn se neuložily: Jana Nováková, říjen 2026.';

test('odměna neuložená po rychlém odchodu se neztratí: hláška na další stránce, „Zkusit znovu" ji uloží', async () => {
  const { stav, vstupy } = serverSVypadkem();
  const uzivatel = otevri();
  const odmena = within(await screen.findByRole('group', { name: 'Odměna za odpracovaný den' }));
  await uzivatel.click(odmena.getByRole('radio', { name: '80 Kč' }));
  // Odchod dřív než za 600 ms: uložení odejde hned a selže.
  await uzivatel.click(screen.getByRole('link', { name: 'Zpět na výplaty' }));
  expect(await screen.findByText(HLASKA)).toBeInTheDocument();
  expect(vstupy()).toHaveLength(1);

  await uzivatel.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
  await waitFor(() => expect(vstupy()).toHaveLength(2));
  expect(screen.getByText(HLASKA)).toBeInTheDocument(); // pořád selhává, hláška zůstane

  stav.selhat = false;
  await uzivatel.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
  await waitFor(() => expect(screen.queryByText(HLASKA)).not.toBeInTheDocument());
  expect(stav.data.vstupy.find((v) => v.zamestnanecId === 'z1')?.odmenaZaDenHal).toBe(8000);
});

test('neúspěšné uložení se při odchodu zkusí znovu; návrat k člověku rozpracovanou odměnu převezme a uloží', async () => {
  const { stav, vstupy } = serverSVypadkem();
  const uzivatel = otevri();
  const odmena = within(await screen.findByRole('group', { name: 'Odměna za odpracovaný den' }));
  await uzivatel.click(odmena.getByRole('radio', { name: '80 Kč' }));
  expect(await screen.findByText(/Server teď nefunguje/)).toBeInTheDocument(); // selhalo ještě na stránce

  await uzivatel.click(screen.getByRole('link', { name: 'Zpět na výplaty' }));
  expect(await screen.findByText(HLASKA)).toBeInTheDocument();
  expect(vstupy()).toHaveLength(2); // při odchodu se zkusilo znovu

  stav.selhat = false;
  await uzivatel.click(await screen.findByRole('link', { name: /^Jana Nováková/ }));
  const odmenaZnovu = () => within(screen.getByRole('group', { name: 'Odměna za odpracovaný den' }));
  await screen.findByRole('group', { name: 'Odměna za odpracovaný den' });
  expect(odmenaZnovu().getByRole('radio', { name: '80 Kč' })).toBeChecked();
  await waitFor(() => expect(screen.queryByText(HLASKA)).not.toBeInTheDocument());
  await waitFor(() => expect(stav.data.vstupy.find((v) => v.zamestnanecId === 'z1')?.odmenaZaDenHal).toBe(8000));
  expect(await screen.findByText('Uloženo')).toBeInTheDocument();
  expect(odmenaZnovu().getByRole('radio', { name: '80 Kč' })).toBeChecked();
});

test('člověk, který v měsíci není, dostane srozumitelnou hlášku', async () => {
  server(DATA);
  otevri('neni');
  expect(await screen.findByText('V tomhle měsíci tu tenhle člověk není')).toBeInTheDocument();
  expect(screen.getByText(/^V říjnu 2026 nebyl ve firmě/)).toBeInTheDocument();
});

test('ruční průměr zadaný v dřívějším měsíci čtvrtletí: zdroj česky „v říjnu"', async () => {
  const listopad = mesicData({
    rok: 2026, mesic: 11, zamestnanci: LIDE,
    vstupy: [{ zamestnanecId: 'z1', rok: 2026, mesic: 10, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: 20000, poznamka: null }],
  });
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/11': () => json(listopad),
  });
  window.history.replaceState(null, '', '/clovek/z1?firma=f1&rok=2026&mesic=11');
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /^Jiné odměny, srážky a průměrný výdělek/ }));
  expect(screen.getByText('Zadaný ručně v říjnu, platí pro celé čtvrtletí.')).toBeInTheDocument();
});

test('docházka mimo pracovní poměr: varování a den jde otevřít jen ke smazání', async () => {
  const ukonceny = mesicData({
    zamestnanci: [zamestnanec({ id: 'z1', ukonceni: '2026-10-15' })],
    dny: [prace('z1', '2026-10-12'), prace('z1', '2026-10-20')],
  });
  const { fetchMock } = server(ukonceny);
  const uzivatel = otevri();
  const den = await screen.findByRole('button', { name: /^Úterý 20\. října: mimo pracovní poměr, zapsáno práce 8 h/ });
  const upozorneni = screen.getByRole('region', { name: /Upozornění/ });
  expect(within(upozorneni).getByText('Docházka mimo pracovní poměr')).toBeInTheDocument();
  expect(upozorneni).toHaveTextContent('20. 10. 2026');

  await uzivatel.click(den);
  const panel = screen.getByRole('dialog', { name: 'Úterý 20. října' });
  expect(within(panel).getByText('Mimo pracovní poměr — den se nezapočítá, můžeš ho smazat.')).toBeInTheDocument();
  // Jiné úpravy nejdou: žádná volba typu, hodin ani Uložit.
  expect(within(panel).queryByRole('radio')).not.toBeInTheDocument();
  expect(within(panel).queryByRole('button', { name: 'Uložit' })).not.toBeInTheDocument();
  await uzivatel.click(within(panel).getByRole('button', { name: 'Smazat den' }));

  const volani = fetchMock.mock.calls.find(([adresa, init]) => String(adresa) === '/api/dny' && init?.method === 'PUT');
  expect(telo(volani![1])).toEqual({ zamestnanecId: 'z1', dny: [], smazat: ['2026-10-20'] });
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Úterý 20\. října: mimo pracovní poměr, zapsáno/ })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Úterý 20. října: mimo pracovní poměr' })).toBeInTheDocument();
});

/** Server, kterému jde odpověď na `PUT /api/dny` podržet a pak poslat ručně. */
function serverSOdlozenymiDny() {
  let data = DATA;
  const odpovedi: Array<(r: Response) => void> = [];
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(data),
    'PUT /api/dny': (init) => new Promise<Response>((resolve) => odpovedi.push((r) => {
      if (r.ok) {
        const z = telo<UlozDny>(init);
        data = { ...data, dny: [...data.dny.filter((d) => d.zamestnanecId !== z.zamestnanecId || !z.dny.some((x) => x.datum === d.datum)), ...z.dny.map((d) => ({ ...d, zamestnanecId: z.zamestnanecId }))] };
      }
      resolve(r);
    })),
  });
  const dny = () => fetchMock.mock.calls.filter(([adresa]) => String(adresa) === '/api/dny');
  return { odpovedi, dny, data: () => data };
}

async function zapisDovolenou(uzivatel: ReturnType<typeof otevri>) {
  await uzivatel.click(await screen.findByRole('button', { name: /^Pondělí 5\. října/ }));
  const panel = screen.getByRole('dialog', { name: 'Pondělí 5. října' });
  await uzivatel.click(within(panel).getByRole('radio', { name: /Dovolená/ }));
  await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));
}

test('docházka, která se neuloží až po přechodu na jiného člověka, se neztratí: hláška s dnem a důvodem, „Zkusit znovu"', async () => {
  const { odpovedi, dny, data } = serverSOdlozenymiDny();
  const uzivatel = otevri();
  await zapisDovolenou(uzivatel);
  await waitFor(() => expect(odpovedi).toHaveLength(1));
  await uzivatel.click(screen.getByRole('link', { name: 'Předchozí: Petr Černý' }));
  expect(await screen.findByRole('heading', { name: 'Petr Černý', level: 1 })).toBeInTheDocument();

  odpovedi[0]!(json({ chyba: 'MESIC_UZAVREN' }, 409));
  const hlaska = await screen.findByText('Změny docházky se neuložily:');
  const polozka = hlaska.closest('[role="alert"]')!.querySelector('li')!;
  expect(polozka).toHaveTextContent(/^Jana Nováková: 5\. 10\. Dovolená 8\sh\. Měsíc je uzavřený — změnu nejde uložit\.$/);

  await uzivatel.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
  await waitFor(() => expect(dny()).toHaveLength(2));
  expect(telo(dny()[1]![1])).toEqual({ zamestnanecId: 'z1', dny: [{ datum: '2026-10-05', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }] });
  odpovedi[1]!(json({ ok: true }));
  await waitFor(() => expect(screen.queryByText('Změny docházky se neuložily:')).not.toBeInTheDocument());
  expect(data().dny.find((d) => d.zamestnanecId === 'z1' && d.datum === '2026-10-05')?.typ).toBe('DOVOLENA');
});

test('neuloženou docházku jde vědomě zahodit', async () => {
  const { odpovedi } = serverSOdlozenymiDny();
  const uzivatel = otevri();
  await zapisDovolenou(uzivatel);
  await waitFor(() => expect(odpovedi).toHaveLength(1));
  odpovedi[0]!(new Response('chyba', { status: 500 }));
  const hlaska = (await screen.findByText('Změny docházky se neuložily:')).closest('[role="alert"]')!;
  expect(hlaska).toHaveTextContent('Server teď nefunguje');
  // Karta ukazuje zase stav serveru, změna je jen v hlášce.
  expect(screen.getByRole('button', { name: 'Pondělí 5. října: nevyplněno' })).toBeInTheDocument();
  await uzivatel.click(within(hlaska as HTMLElement).getByRole('button', { name: 'Zahodit' }));
  expect(screen.queryByText('Změny docházky se neuložily:')).not.toBeInTheDocument();
});

test('uzavřít měsíc nejde, dokud se ukládá docházka; po uložení zase jde', async () => {
  const { odpovedi } = serverSOdlozenymiDny();
  const uzivatel = otevri();
  await zapisDovolenou(uzivatel);
  await uzivatel.click(screen.getByRole('link', { name: 'Zpět na výplaty' }));
  const uzavrit = await screen.findByRole('button', { name: 'Uzavřít měsíc' });
  expect(uzavrit).toBeDisabled();
  expect(screen.getByText(/Uzavřít měsíc zatím nejde\. Ještě se ukládají změny/)).toBeInTheDocument();

  await waitFor(() => expect(odpovedi).toHaveLength(1));
  odpovedi[0]!(json({ ok: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Uzavřít měsíc' })).toBeEnabled());
  expect(screen.queryByText(/Uzavřít měsíc zatím nejde/)).not.toBeInTheDocument();
});
