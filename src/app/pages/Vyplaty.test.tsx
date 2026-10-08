import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pripravVstup } from '../../core/priprava';
import { formatKc } from '../../core/penize';
import { vypocitejMzdu } from '../../core/vypocet';
import type { Den, MesicData, MesicniVstup } from '../../shared/api';
import { App } from '../App';
import { neulozenaDochazka, odeberNeulozenouDochazku, pridejNeulozenouDochazku } from '../stav/neulozenaDochazka';
import { firma, json, mesicData, mockApi, zamestnanec } from '../test-utils';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  for (const p of neulozenaDochazka()) odeberNeulozenouDochazku(p);
});

const KONTEXT = '?firma=f1&rok=2026&mesic=10';
const den = (zamestnanecId: string, datum: string, typ: Den['typ'] = 'PRACE', minuty = 480): Den => ({ zamestnanecId, datum, typ, minuty, kasa: false, poznamka: null });
const vstup = (zamestnanecId: string, odmenaZaDenHal: number): MesicniVstup =>
  ({ zamestnanecId, rok: 2026, mesic: 10, odmenaZaDenHal, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: 17000, poznamka: null });
const PRACOVNI = ['01', '02', '05', '06', '07', '08', '09', '12', '13', '14'].map((d) => `2026-10-${d}`);

const DATA = mesicData({
  zamestnanci: [
    zamestnanec({ id: 'n', jmeno: 'Jana', prijmeni: 'Nováková' }),
    zamestnanec({ id: 'c', jmeno: 'Petr', prijmeni: 'Černý', smlouva: 'DPP', uvazekMinTydne: 0, prohlaseni: false }),
    zamestnanec({ id: 'h', jmeno: 'Ivan', prijmeni: 'Chalupa' }),
    zamestnanec({ id: 'b', jmeno: 'Eva', prijmeni: 'Bílá' }),
  ],
  dny: [
    ...PRACOVNI.map((d) => den('n', d)),
    ...PRACOVNI.slice(0, 2).map((d) => den('c', d, 'PRACE', 300)),
    ...PRACOVNI.slice(0, 8).map((d) => den('h', d)), den('h', '2026-10-15', 'NEMOC'), den('h', '2026-10-16', 'NEMOC'),
    ...PRACOVNI.map((d) => den('b', d)),
  ],
  vstupy: [vstup('n', 0), vstup('c', 0), vstup('h', 18000), vstup('b', 0)],
});
const vysledek = (data: MesicData, id: string) => vypocitejMzdu(pripravVstup(data, id));
const soucet = (data: MesicData, pole: 'kVyplateHal' | 'nakladFirmyHal' | 'hrubaHal') => data.zamestnanci.reduce((s, z) => s + vysledek(data, z.id)[pole], 0);
const uzavrena = (data: MesicData): MesicData => ({
  ...data,
  uzaverka: { firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z',
    vysledky: data.zamestnanci.map((z) => ({ zamestnanecId: z.id, jmeno: `${z.jmeno} ${z.prijmeni}`, smlouva: z.smlouva, vysledek: vysledek(data, z.id) })) },
});

function otevri(pocatecni: MesicData, navic: Record<string, (init: RequestInit | undefined) => Response> = {}) {
  let data = pocatecni;
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(data),
    'POST /api/firmy/f1/uzaverka/2026/10': () => { data = uzavrena(data); return json(data.uzaverka, 201); },
    'DELETE /api/firmy/f1/uzaverka/2026/10': () => { data = { ...data, uzaverka: null }; return new Response(null, { status: 204 }); },
    'GET /api/firmy/f1/uzaverky?rok=2026': () => json(data.uzaverka ? [data.uzaverka] : []),
    ...navic,
  });
  window.history.replaceState(null, '', '/' + KONTEXT);
  render(<App />);
  return { fetchMock, uzivatel: userEvent.setup({ delay: null }) };
}

const text = (hal: number) => formatKc(hal).replace(/\s/g, ' ');

test('seznam lidí je podle příjmení (Č za C, Ch za H) a řádek vede na člověka v měsíci', async () => {
  otevri(DATA);
  const seznam = await screen.findByRole('list', { name: 'Výplaty lidí' });
  const odkazy = within(seznam).getAllByRole('link');
  expect(odkazy.map((o) => o.textContent)).toEqual([
    expect.stringMatching(/^Eva Bílá/), expect.stringMatching(/^Petr Černý/), expect.stringMatching(/^Ivan Chalupa/), expect.stringMatching(/^Jana Nováková/),
  ]);
  const jana = odkazy[3]!;
  expect(jana).toHaveAttribute('href', '/clovek/n' + KONTEXT);
  expect(jana).toHaveTextContent('HPP');
  expect(jana).toHaveTextContent('80 h');
  expect(jana).toHaveTextContent(text(vysledek(DATA, 'n').kVyplateHal));
  expect(jana).toHaveTextContent(text(vysledek(DATA, 'n').hrubaHal));
  // Hlavička PC tabulky je jen vizuální: buňky řádku i součtu nesou popisek sloupce pro čtečky.
  for (const sloupec of ['Smlouva', 'Odpracováno', 'Hrubá mzda', 'K výplatě']) expect(within(jana).getByText(sloupec)).toHaveClass('sr-only');
  const celkem = screen.getByText('Celkem').parentElement!;
  for (const sloupec of ['Odpracováno', 'Hrubá mzda', 'K výplatě']) expect(within(celkem).getByText(sloupec)).toHaveClass('sr-only');
});

test('součty firmy: K výplatě celkem, náklad firmy a hrubé mzdy; stav Rozpracováno', async () => {
  otevri(DATA);
  const souhrn = await screen.findByRole('region', { name: 'Součty za firmu' });
  expect(within(souhrn).getByText('K výplatě celkem').parentElement).toHaveTextContent(text(soucet(DATA, 'kVyplateHal')));
  expect(within(souhrn).getByText('Náklad firmy').parentElement).toHaveTextContent(text(soucet(DATA, 'nakladFirmyHal')));
  expect(within(souhrn).getByText('Hrubé mzdy').parentElement).toHaveTextContent(text(soucet(DATA, 'hrubaHal')));
  // „Kč" odsazené úzkou nezlomitelnou mezerou (U+202F), ne obyčejnou.
  for (const castka of souhrn.querySelectorAll('data')) expect(castka.textContent).toMatch(/\d\u202fKč$/);
  expect(screen.getByText('Rozpracováno')).toBeInTheDocument();
});

test('štítek u člověka ukáže nejzávažnější upozornění a počet dalších', async () => {
  otevri(DATA);
  const chalupa = await screen.findByRole('link', { name: /^Ivan Chalupa/ });
  expect(within(chalupa).getByText('Odměna propadla')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^Jana Nováková/ })).not.toHaveTextContent('Odměna propadla');
});

test('uzavření: potvrzení s upozorněními, POST a pak stav Uzavřeno s datem', async () => {
  const { fetchMock, uzivatel } = otevri(DATA);
  await uzivatel.click(await screen.findByRole('button', { name: 'Uzavřít měsíc' }));
  const panel = screen.getByRole('dialog', { name: 'Uzavřít říjen 2026?' });
  expect(within(panel).getByRole('link', { name: 'Ivan Chalupa' })).toBeInTheDocument();
  expect(within(panel).getByText(/Odměna propadla/)).toBeInTheDocument();
  await uzivatel.click(within(panel).getByRole('button', { name: 'Uzavřít měsíc' }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/firmy/f1/uzaverka/2026/10', expect.objectContaining({ method: 'POST' })));
  expect(await screen.findByText('Uzavřeno 5. 11. 2026')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Otevřít měsíc' })).toBeInTheDocument();
});

test('neuložená docházka tohoto měsíce blokuje uzavření; jiný měsíc ani jiná firma ne', async () => {
  const zmena = (datum: string) => ({ zamestnanecId: 'n', dny: [{ datum, typ: 'PRACE' as const, minuty: 480, kasa: false, poznamka: null }] });
  pridejNeulozenouDochazku({ firmaId: 'f1', kdo: 'Jana Nováková', zmena: zmena('2026-09-30'), duvod: 'Bez připojení.' });
  pridejNeulozenouDochazku({ firmaId: 'f2', kdo: 'Jana Nováková', zmena: zmena('2026-10-05'), duvod: 'Bez připojení.' });
  const { uzivatel } = otevri(DATA);
  expect(await screen.findByRole('button', { name: 'Uzavřít měsíc' })).toBeEnabled();

  pridejNeulozenouDochazku({ firmaId: 'f1', kdo: 'Jana Nováková', zmena: zmena('2026-10-05'), duvod: 'Bez připojení.' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Uzavřít měsíc' })).toBeDisabled());
  expect(screen.getByText(/Uzavřít měsíc zatím nejde\. Některé změny tohoto měsíce se neuložily/)).toBeInTheDocument();

  const hlaska = screen.getByText('Změny docházky se neuložily:').closest('[role="alert"]') as HTMLElement;
  await uzivatel.click(within(hlaska).getByRole('button', { name: 'Zahodit' }));
  expect(screen.getByRole('button', { name: 'Uzavřít měsíc' })).toBeEnabled();
});

test('když server spočítá při uzavření jiný součet K výplatě, appka to řekne', async () => {
  const { uzivatel } = otevri(DATA, {
    'POST /api/firmy/f1/uzaverka/2026/10': () => {
      const snimek = uzavrena(DATA).uzaverka!;
      (snimek.vysledky[0]!.vysledek as { kVyplateHal: number }).kVyplateHal += 10000;
      return json(snimek, 201);
    },
  });
  await uzivatel.click(await screen.findByRole('button', { name: 'Uzavřít měsíc' }));
  await uzivatel.click(within(screen.getByRole('dialog', { name: 'Uzavřít říjen 2026?' })).getByRole('button', { name: 'Uzavřít měsíc' }));

  const panel = await screen.findByRole('dialog', { name: 'Říjen 2026 je uzavřený' });
  const upozorneni = within(panel).getByRole('alert');
  expect(upozorneni).toHaveTextContent('Součet v uzávěrce nesedí s tím, co ukazovala appka.');
  expect(upozorneni).toHaveTextContent(`K výplatě v uzávěrce: ${text(soucet(DATA, 'kVyplateHal') + 10000)}`);
  expect(upozorneni).toHaveTextContent(`Appka před uzavřením: ${text(soucet(DATA, 'kVyplateHal'))}`);
  await uzivatel.click(within(panel).getByRole('button', { name: 'Rozumím' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('uzavřený měsíc ukazuje výsledky ze snímku; otevření po potvrzení zavolá DELETE', async () => {
  const data = uzavrena(DATA);
  // Snímek se od přepočtu liší: přehled musí ukázat uloženou částku.
  (data.uzaverka!.vysledky[0]!.vysledek as { kVyplateHal: number }).kVyplateHal = 1234500;
  const { fetchMock, uzivatel } = otevri(data);
  expect(await screen.findByRole('link', { name: /^Jana Nováková/ })).toHaveTextContent('12 345 Kč');
  await uzivatel.click(screen.getByRole('button', { name: 'Otevřít měsíc' }));
  await uzivatel.click(within(screen.getByRole('dialog', { name: 'Otevřít říjen 2026?' })).getByRole('button', { name: 'Otevřít měsíc' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/firmy/f1/uzaverka/2026/10', expect.objectContaining({ method: 'DELETE' })));
  expect(await screen.findByText('Rozpracováno')).toBeInTheDocument();
});

test('porovnání odměn: dnes × bez podmínky × rozdíl a součet za firmu', async () => {
  const { uzivatel } = otevri(DATA);
  await uzivatel.click(await screen.findByRole('button', { name: 'Porovnat odměny' }));
  const panel = screen.getByRole('dialog', { name: 'Porovnat odměny za den' });
  const radek = within(panel).getByRole('row', { name: /Ivan Chalupa/ });
  const dnes = vysledek(DATA, 'h').kVyplateHal;
  const bez = vypocitejMzdu({ ...pripravVstup(DATA, 'h'), nastaveni: { ...DATA.firma.nastaveni, odmenaZaDenPropadaPriNemoci: false } }).kVyplateHal;
  expect(bez).toBeGreaterThan(dnes);
  expect(radek).toHaveTextContent(text(dnes));
  expect(radek).toHaveTextContent(text(bez));
  expect(radek).toHaveTextContent(`+${text(bez - dnes)}`);
  expect(radek.textContent).toMatch(/\u202fKč/);
  expect(radek.textContent).not.toMatch(/ Kč/);
  expect(within(panel).getByText(/Bez podmínky by firma tento měsíc vyplatila o/)).toHaveTextContent(text(bez - dnes));
  expect(within(panel).queryByText(/Měsíc je uzavřený/)).not.toBeInTheDocument();
});

test('porovnání odměn v uzavřeném měsíci řekne, že se počítá z dnešních údajů, ne ze snímku', async () => {
  const { uzivatel } = otevri(uzavrena(DATA));
  await uzivatel.click(await screen.findByRole('button', { name: 'Porovnat odměny' }));
  const panel = screen.getByRole('dialog', { name: 'Porovnat odměny za den' });
  expect(within(panel).getByText(/^Měsíc je uzavřený\. Porovnání se počítá z dnešních údajů/)).toBeInTheDocument();
});

test('odkaz „Porovnat odměny" z upozornění otevře porovnání rovnou', async () => {
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(DATA),
  });
  window.history.replaceState(null, '', '/clovek/h' + KONTEXT);
  render(<App />);
  await userEvent.click(await screen.findByRole('link', { name: 'Porovnat odměny' }));
  expect(await screen.findByRole('dialog', { name: 'Porovnat odměny za den' })).toBeInTheDocument();
});

test('bez lidí ukáže prázdný stav s cestou do Lidé', async () => {
  otevri(mesicData());
  expect(await screen.findByText('V tomhle měsíci zatím nikdo nepracuje')).toBeInTheDocument();
  expect(screen.getByText(/Přidej lidi v sekci Lidé/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Otevřít Lidé' })).toHaveAttribute('href', '/lide' + KONTEXT);
  expect(screen.queryByRole('button', { name: 'Uzavřít měsíc' })).not.toBeInTheDocument();
});
