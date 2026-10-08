import { configure, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MesicData, PlanSmeny, SablonaSmeny, Uzaverka } from '../../shared/api';
import { App } from '../App';
import { firma, json, mesicData, mockApi, zamestnanec } from '../test-utils';

// Celá appka (router, dotazy, rozvržení); při souběhu s testy workeru je vykreslení pomalejší.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 6, 10, 0)); // úterý 6. 10. 2026 → týden 5.–11. 10.
});
afterEach(() => {
  vi.useRealTimers();
});

const RANNI: SablonaSmeny = { id: 's1', firmaId: 'f1', nazev: 'Ranní', zacatek: '08:00', konec: '16:30', prestavkaMin: 30, barva: '#2B3FBF' };
const ODPOLEDNI: SablonaSmeny = { id: 's2', firmaId: 'f1', nazev: 'Odpolední', zacatek: '12:00', konec: '20:00', prestavkaMin: 30, barva: '#0E7C86' };
const LIDE = [
  zamestnanec({ id: 'lenka', jmeno: 'Lenka', prijmeni: 'Dvořáková' }),
  zamestnanec({ id: 'marek', jmeno: 'Marek', prijmeni: 'Beneš', smlouva: 'DPP', uvazekMinTydne: 0 }),
  zamestnanec({ id: 'tomas', jmeno: 'Tomáš', prijmeni: 'Král' }),
  zamestnanec({ id: 'eva', jmeno: 'Eva', prijmeni: 'Čermáková' }),
];
const p = (zamestnanecId: string, datum: string, typ: PlanSmeny['typ'], sablonaId: string | null = null, minuty = 480): PlanSmeny =>
  ({ zamestnanecId, datum, typ, sablonaId, minuty });

const RIJEN_PLAN = [
  p('lenka', '2026-10-01', 'SMENA', 's1'), p('lenka', '2026-10-02', 'VOLNO', null, 0),
  p('lenka', '2026-10-05', 'SMENA', 's1'), p('lenka', '2026-10-06', 'VOLNO', null, 0),
];
const ZARI_PLAN = [p('lenka', '2026-09-29', 'SMENA', 's2', 450), p('lenka', '2026-09-30', 'DOVOLENA')];

type Volani = { metoda: string; cesta: string; telo: unknown };

function otevri({ rijen = {}, zari = {}, navic = {} }: { rijen?: Partial<MesicData>; zari?: Partial<MesicData>; navic?: Record<string, () => Response> } = {}) {
  const volani: Volani[] = [];
  const zapis = (metoda: string, cesta: string, odpoved: () => Response) => (init: RequestInit | undefined) => {
    volani.push({ metoda, cesta, telo: init?.body ? JSON.parse(String(init.body)) : undefined });
    return odpoved();
  };
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([firma()]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(mesicData({ zamestnanci: LIDE, sablony: [ODPOLEDNI, RANNI], plan: RIJEN_PLAN, ...rijen })),
    'GET /api/firmy/f1/mesic/2026/9': () => json(mesicData({ mesic: 9, zamestnanci: LIDE, sablony: [ODPOLEDNI, RANNI], plan: ZARI_PLAN, ...zari })),
    'GET /api/firmy/f1/mesic/2026/11': () => json(mesicData({ mesic: 11, zamestnanci: LIDE, sablony: [ODPOLEDNI, RANNI] })),
    'GET /api/firmy/f1/odkazy-rozpisu': () => json([]),
    'PUT /api/plan': zapis('PUT', '/api/plan', () => json({ ok: true })),
    'POST /api/sablony': zapis('POST', '/api/sablony', () => json({ ...RANNI, id: 'novy' }, 201)),
    ...Object.fromEntries(Object.entries(navic).map(([klic, odpoved]) => [klic, zapis(klic.split(' ')[0]!, klic.split(' ')[1]!, odpoved)])),
  });
  window.history.replaceState(null, '', '/smeny?firma=f1&rok=2026&mesic=10');
  render(<App />);
  return { uzivatel: userEvent.setup({ delay: null }), volani };
}

const tabulka = () => screen.findByRole('table', { name: 'Rozpis týdne' });
const bunka = async (zacatek: string) => within(await tabulka()).getByRole('button', { name: new RegExp(`^${zacatek}`) });

test('rozpis týdne Po–Ne: lidé podle příjmení česky, buňka ukáže šablonu s názvem a časem', async () => {
  localStorage.setItem('mzdy.smeny.razeni', 'JMENO');
  otevri();

  const t = await tabulka();
  const radky = within(t).getAllByRole('rowheader');
  expect(radky.map((r) => r.textContent)).toEqual([
    expect.stringMatching(/^Marek Beneš/), expect.stringMatching(/^Eva Čermáková/), expect.stringMatching(/^Lenka Dvořáková/), expect.stringMatching(/^Tomáš Král/),
  ]);
  const hlavicky = within(t).getAllByRole('columnheader').map((h) => h.textContent);
  expect(hlavicky.slice(1, 8)).toEqual([
    expect.stringMatching(/^Po\s*5\./), expect.stringMatching(/^Út\s*6\./), expect.stringMatching(/^St\s*7\./), expect.stringMatching(/^Čt\s*8\./),
    expect.stringMatching(/^Pá\s*9\./), expect.stringMatching(/^So\s*10\./), expect.stringMatching(/^Ne\s*11\./),
  ]);
  expect(await bunka('Lenka Dvořáková, pondělí 5. 10.: Ranní 8–16:30')).toBeInTheDocument();
  expect(await bunka('Lenka Dvořáková, úterý 6. 10.: Volno')).toBeInTheDocument();
  expect(await bunka('Tomáš Král, středa 7. 10.: nic naplánováno')).toBeInTheDocument();
});

test('klik na buňku a výběr šablony uloží směnu s minutami ze šablony (hodiny jdou přepsat)', async () => {
  const { uzivatel, volani } = otevri();

  await uzivatel.click(await bunka('Lenka Dvořáková, středa 7. 10.'));
  const panel = await screen.findByRole('dialog', { name: 'Lenka Dvořáková' });
  await uzivatel.click(within(panel).getByRole('radio', { name: /^Odpolední/ }));
  expect(within(panel).getByLabelText('Hodiny')).toHaveValue('7,5');
  await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));

  await vi.waitFor(() => expect(volani).toHaveLength(1));
  expect(volani[0]).toEqual({ metoda: 'PUT', cesta: '/api/plan', telo: { zamestnanecId: 'lenka', polozky: [{ datum: '2026-10-07', typ: 'SMENA', sablonaId: 's2', minuty: 450 }] } });
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  await uzivatel.click(await bunka('Tomáš Král, čtvrtek 8. 10.'));
  const druhy = await screen.findByRole('dialog', { name: 'Tomáš Král' });
  await uzivatel.click(within(druhy).getByRole('radio', { name: /^Ranní/ }));
  await uzivatel.clear(within(druhy).getByLabelText('Hodiny'));
  await uzivatel.type(within(druhy).getByLabelText('Hodiny'), '6');
  await uzivatel.click(within(druhy).getByRole('button', { name: 'Uložit' }));
  await vi.waitFor(() => expect(volani).toHaveLength(2));
  expect(volani[1]!.telo).toEqual({ zamestnanecId: 'tomas', polozky: [{ datum: '2026-10-08', typ: 'SMENA', sablonaId: 's1', minuty: 360 }] });
});

test('Volno a Vymazat: volno bez minut, vymazání pošle datum ke smazání', async () => {
  const { uzivatel, volani } = otevri();

  await uzivatel.click(await bunka('Lenka Dvořáková, pondělí 5. 10.'));
  const panel = await screen.findByRole('dialog', { name: 'Lenka Dvořáková' });
  expect(within(panel).getByRole('radio', { name: /^Ranní/ })).toBeChecked();
  await uzivatel.click(within(panel).getByRole('button', { name: 'Vymazat' }));
  await vi.waitFor(() => expect(volani).toHaveLength(1));
  expect(volani[0]!.telo).toEqual({ zamestnanecId: 'lenka', polozky: [], smazat: ['2026-10-05'] });

  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await uzivatel.click(await bunka('Eva Čermáková, pátek 9. 10.'));
  const druhy = await screen.findByRole('dialog', { name: 'Eva Čermáková' });
  await uzivatel.click(within(druhy).getByRole('radio', { name: 'Volno' }));
  expect(within(druhy).queryByLabelText('Hodiny')).not.toBeInTheDocument();
  await uzivatel.click(within(druhy).getByRole('button', { name: 'Uložit' }));
  await vi.waitFor(() => expect(volani).toHaveLength(2));
  expect(volani[1]!.telo).toEqual({ zamestnanecId: 'eva', polozky: [{ datum: '2026-10-09', typ: 'VOLNO', sablonaId: null, minuty: 0 }] });
});

test('ve svátek nabídne „Zavřeno (měl by směnu)"; u DPP upozorní, že se nepřevede', async () => {
  const { uzivatel, volani } = otevri();
  await tabulka();
  for (let i = 0; i < 3; i++) await uzivatel.click(screen.getAllByRole('button', { name: 'Další týden' })[0]!);

  const t = await tabulka();
  expect(within(t).getByRole('columnheader', { name: /St\s*28\./ })).toHaveTextContent('svátek');
  await uzivatel.click(await bunka('Marek Beneš, středa 28. 10.'));
  const dpp = await screen.findByRole('dialog', { name: 'Marek Beneš' });
  expect(within(dpp).getByText(/Den vzniku samostatného československého státu/)).toBeInTheDocument();
  await uzivatel.click(within(dpp).getByRole('radio', { name: 'Zavřeno (měl by směnu)' }));
  expect(within(dpp).getByText(/dohoda na náhradu za svátek nárok nemá/i)).toBeInTheDocument();
  await uzivatel.click(within(dpp).getByRole('button', { name: 'Zavřít' }));

  await uzivatel.click(await bunka('Lenka Dvořáková, středa 28. 10.'));
  const hpp = await screen.findByRole('dialog', { name: 'Lenka Dvořáková' });
  // Ve svátek se nic nepředvybírá, ani „Zavřeno“: uložit bez volby nejde a řekne proč.
  expect(within(hpp).getByText(/Když bylo zavřeno a měl by směnu, vyber „Zavřeno/)).toBeInTheDocument();
  for (const radio of within(hpp).getAllByRole('radio')) expect(radio).not.toBeChecked();
  expect(within(hpp).queryByLabelText('Hodiny')).not.toBeInTheDocument();
  await uzivatel.click(within(hpp).getByRole('button', { name: 'Uložit' }));
  expect(within(hpp).getByText('Vyber, co ten den platí.')).toBeInTheDocument();
  expect(volani).toHaveLength(0);
  await uzivatel.click(within(hpp).getByRole('radio', { name: 'Zavřeno (měl by směnu)' }));
  expect(within(hpp).queryByText('Vyber, co ten den platí.')).not.toBeInTheDocument();
  expect(within(hpp).getByLabelText('Hodiny')).toHaveValue('8');
  await uzivatel.click(within(hpp).getByRole('button', { name: 'Uložit' }));
  await vi.waitFor(() => expect(volani).toHaveLength(1));
  expect(volani[0]!.telo).toEqual({ zamestnanecId: 'lenka', polozky: [{ datum: '2026-10-28', typ: 'ZAVRENO', sablonaId: null, minuty: 480 }] });
});

test('„Zkopírovat minulý týden" doplní jen prázdné dny a jen směny a volno (i z předchozího měsíce)', async () => {
  const { uzivatel, volani } = otevri();
  await tabulka();

  await uzivatel.click(screen.getByRole('button', { name: 'Zkopírovat minulý týden' }));
  await vi.waitFor(() => expect(volani).toHaveLength(1));
  // 5. a 6. 10. už něco mají, 7. 10. by byla dovolená ze 30. 9. — ta se nekopíruje.
  expect(volani[0]!.telo).toEqual({ zamestnanecId: 'lenka', polozky: [
    { datum: '2026-10-08', typ: 'SMENA', sablonaId: 's1', minuty: 480 },
    { datum: '2026-10-09', typ: 'VOLNO', sablonaId: null, minuty: 0 },
  ] });
  expect(await screen.findByText(/Zkopírovány 2 dny z minulého týdne\./)).toBeInTheDocument();
});

test('„Vyplnit celý měsíc podle tohoto týdne" vyplní prázdné dny měsíce kromě svátku', async () => {
  const { uzivatel, volani } = otevri({ rijen: { plan: [p('tomas', '2026-10-07', 'SMENA', 's2', 450), p('tomas', '2026-10-21', 'VOLNO', null, 0)] } });
  await tabulka();

  await uzivatel.click(screen.getByRole('button', { name: 'Vyplnit celý měsíc podle tohoto týdne' }));
  await vi.waitFor(() => expect(volani).toHaveLength(1));
  // Středy října: 7. (vzor), 14., 21. (už má volno), 28. (svátek).
  expect(volani[0]!.telo).toEqual({ zamestnanecId: 'tomas', polozky: [{ datum: '2026-10-14', typ: 'SMENA', sablonaId: 's2', minuty: 450 }] });
  expect(await screen.findByText('Vyplněn 1 den v říjnu podle týdne 5.–11. 10.')).toBeInTheDocument();
});

test('„Převést do docházky" se zeptá a pak ukáže, kolik dní vzniklo a co se přeskočilo a proč', async () => {
  const { uzivatel, volani } = otevri({
    navic: { 'POST /api/firmy/f1/plan/2026/10/prevest': () => json({ vytvoreno: 86, preskoceno: 4, preskocenoDpp: 2, mimoPomer: 0 }) },
  });
  await tabulka();

  await uzivatel.click(screen.getByRole('button', { name: 'Převést do docházky' }));
  const potvrzeni = await screen.findByRole('dialog', { name: 'Převést plán do docházky' });
  expect(volani).toHaveLength(0);
  await uzivatel.click(within(potvrzeni).getByRole('button', { name: 'Převést' }));

  await vi.waitFor(() => expect(volani).toHaveLength(1));
  expect(volani[0]).toMatchObject({ metoda: 'POST', cesta: '/api/firmy/f1/plan/2026/10/prevest' });
  expect(await screen.findByText('Vytvořeno 86 dní, 4 už v docházce byly.')).toBeInTheDocument();
  expect(screen.getByText(/2 dny „Zavřeno“ u dohody se nepřevedly: dohoda na náhradu za svátek nárok nemá\./)).toBeInTheDocument();
});

test('uzavřený měsíc: převod do docházky nejde, plán se dál upravovat dá', async () => {
  const uzaverka: Uzaverka = { firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T10:00:00.000Z', vysledky: [] };
  otevri({ rijen: { uzaverka } });
  await tabulka();

  expect(screen.getByRole('button', { name: 'Převést do docházky' })).toBeDisabled();
  expect(screen.getByText(/Říjen je uzavřený/)).toBeInTheDocument();
  expect(await bunka('Tomáš Král, středa 7. 10.')).toBeEnabled();
});

test('šablony: seznam s délkou směny a přidání nové', async () => {
  const { uzivatel, volani } = otevri();
  const sekce = await screen.findByRole('region', { name: 'Šablony směn' });
  expect(within(sekce).getByRole('button', { name: /^Ranní/ })).toHaveTextContent(/8–16:30.*8\s*h/);
  expect(within(sekce).getByRole('button', { name: /^Odpolední/ })).toHaveTextContent(/12–20.*7,5\s*h/);

  await uzivatel.click(within(sekce).getByRole('button', { name: 'Přidat šablonu' }));
  const panel = await screen.findByRole('dialog', { name: 'Nová šablona' });
  // Délka se ukazuje hned podle časů, i když ještě chybí název (výchozí 8–16 s půlhodinovou přestávkou).
  expect(within(panel).getByText(/Délka směny 7,5\s*h/)).toBeInTheDocument();
  await uzivatel.type(within(panel).getByLabelText('Název'), 'Krátká');
  fireEvent.change(within(panel).getByLabelText('Začátek'), { target: { value: '09:00' } });
  fireEvent.change(within(panel).getByLabelText('Konec'), { target: { value: '13:00' } });
  await uzivatel.clear(within(panel).getByLabelText('Přestávka'));
  await uzivatel.type(within(panel).getByLabelText('Přestávka'), '0');
  expect(within(panel).getByText(/Délka směny 4\s*h/)).toBeInTheDocument();
  await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));

  await vi.waitFor(() => expect(volani).toHaveLength(1));
  expect(volani[0]).toEqual({ metoda: 'POST', cesta: '/api/sablony', telo: { firmaId: 'f1', nazev: 'Krátká', zacatek: '09:00', konec: '13:00', prestavkaMin: 0, barva: '#2B3FBF' } });
});

describe('řazení rozpisu', () => {
  const KLIC = 'mzdy.smeny.razeni';
  // Tomáš ráno (8–16:30), Lenka odpoledne (12–20) v pondělí i v úterý (dnes), Marek a Eva bez směny.
  const PLAN_CASU = [
    p('tomas', '2026-10-05', 'SMENA', 's1'), p('lenka', '2026-10-05', 'SMENA', 's2'),
    p('tomas', '2026-10-06', 'SMENA', 's1'), p('lenka', '2026-10-06', 'SMENA', 's2'),
  ];
  const poradiTabulky = async () => within(await tabulka()).getAllByRole('rowheader').map((r) => r.textContent!.split(/(?=HPP|DPP)/)[0]);
  const poradiSeznamu = async () => {
    const seznam = await screen.findByRole('region', { name: 'Rozpis na úterý 6. 10.' });
    return within(seznam).getAllByRole('listitem').map((li) => within(li).getByText(/^[^\d]+ [^\d]+$/, { selector: 'span.truncate' }).textContent);
  };
  const PODLE_CASU = ['Tomáš Král', 'Lenka Dvořáková', 'Marek Beneš', 'Eva Čermáková'];
  const PODLE_JMENA = ['Marek Beneš', 'Eva Čermáková', 'Lenka Dvořáková', 'Tomáš Král'];

  test('výchozí je podle času: tabulka i seznam dne začínají tím, kdo jde dřív, bez směny na konci podle jména', async () => {
    otevri({ rijen: { plan: PLAN_CASU } });

    expect(await poradiTabulky()).toEqual(PODLE_CASU);
    expect(await poradiSeznamu()).toEqual(PODLE_CASU);
    const skupina = screen.getByRole('group', { name: 'Řadit' });
    expect(within(skupina).getByRole('radio', { name: 'Podle času' })).toBeChecked();
    expect(within(skupina).getByRole('radio', { name: 'Podle jména' })).not.toBeChecked();
  });

  test('přepnutí na „Podle jména" změní pořadí a zapamatuje volbu; nic se přitom neukládá', async () => {
    const { uzivatel, volani } = otevri({ rijen: { plan: PLAN_CASU } });
    await tabulka();

    await uzivatel.click(within(screen.getByRole('group', { name: 'Řadit' })).getByRole('radio', { name: 'Podle jména' }));

    expect(await poradiTabulky()).toEqual(PODLE_JMENA);
    expect(await poradiSeznamu()).toEqual(PODLE_JMENA);
    expect(localStorage.getItem(KLIC)).toBe('JMENO');
    expect(volani).toHaveLength(0);

    await uzivatel.click(within(screen.getByRole('group', { name: 'Řadit' })).getByRole('radio', { name: 'Podle času' }));
    expect(await poradiTabulky()).toEqual(PODLE_CASU);
    expect(localStorage.getItem(KLIC)).toBe('CAS');
  });

  test('uložená volba se drží i po novém otevření', async () => {
    localStorage.setItem(KLIC, 'JMENO');
    otevri({ rijen: { plan: PLAN_CASU } });

    expect(await poradiTabulky()).toEqual(PODLE_JMENA);
    expect(within(screen.getByRole('group', { name: 'Řadit' })).getByRole('radio', { name: 'Podle jména' })).toBeChecked();
  });

  test('neplatná uložená hodnota znamená podle času', async () => {
    localStorage.setItem(KLIC, 'nesmysl');
    otevri({ rijen: { plan: PLAN_CASU } });

    expect(await poradiTabulky()).toEqual(PODLE_CASU);
  });

  test('řazení nemění plánovač: kontrola obsazení a návrh dostanou lidi jako dřív', async () => {
    const R812: SablonaSmeny = { id: 'r', firmaId: 'f1', nazev: '8–12', zacatek: '08:00', konec: '12:00', prestavkaMin: 0, barva: null };
    const O1418: SablonaSmeny = { id: 'o', firmaId: 'f1', nazev: '14–18', zacatek: '14:00', konec: '18:00', prestavkaMin: 0, barva: null };
    const kasa = [
      zamestnanec({ id: 'daniel', jmeno: 'Daniel', prijmeni: 'K', rolePlanu: 'KASA', stridaniSmen: ['r'] }),
      zamestnanec({ id: 'alena', jmeno: 'Alena', prijmeni: 'A', rolePlanu: 'KASA' }),
    ];
    otevri({ rijen: { zamestnanci: kasa, sablony: [R812, O1418], plan: [p('alena', '2026-10-05', 'SMENA', 'o', 240)] } });
    expect(await screen.findByRole('region', { name: 'Kontrola obsazení' })).toHaveTextContent(/Po 5\. 10\. 08:00–14:00: chybí zodpovědný kasař/);
  });
});

describe('nemoc a docházka v rozpisu', () => {
  test('nemoc z plánu je v buňce a jde vybrat v panelu dne; uloží se typ NEMOC s hodinami', async () => {
    const { uzivatel, volani } = otevri({ rijen: { plan: [p('lenka', '2026-10-07', 'NEMOC', null, 240)] } });
    expect(await bunka('Lenka Dvořáková, středa 7. 10.: Nemoc')).toBeInTheDocument();
    await uzivatel.click(await bunka('Lenka Dvořáková, čtvrtek 8. 10.'));
    await uzivatel.click(await screen.findByRole('radio', { name: /Nemoc/ }));
    await uzivatel.click(screen.getByRole('button', { name: 'Uložit' }));
    await vi.waitFor(() => expect(volani).toHaveLength(1));
    const ulozeni = volani.find((v) => v.metoda === 'PUT' && v.cesta === '/api/plan');
    expect(ulozeni?.telo).toMatchObject({ zamestnanecId: 'lenka', polozky: [{ datum: '2026-10-08', typ: 'NEMOC', sablonaId: null }] });
  });

  test('nemoc s „do" přes víkend uloží jedním PUT každý den od–do: pracovní dny s hodinami, So/Ne s 0 min', async () => {
    const { uzivatel, volani } = otevri();
    await uzivatel.click(await bunka('Lenka Dvořáková, čtvrtek 8. 10.'));
    const panel = await screen.findByRole('dialog', { name: 'Lenka Dvořáková' });
    expect(within(panel).queryByLabelText('Nemoc do (včetně)')).not.toBeInTheDocument();
    await uzivatel.click(within(panel).getByRole('radio', { name: /Nemoc/ }));
    const nemocDo = within(panel).getByLabelText('Nemoc do (včetně)');
    expect(nemocDo).toHaveValue('2026-10-08');

    // Před dnem panelu a víc než 62 dní neprojde.
    fireEvent.change(nemocDo, { target: { value: '2026-10-07' } });
    await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));
    expect(within(panel).getByText(/nesmí být před/)).toBeInTheDocument();
    fireEvent.change(nemocDo, { target: { value: '2026-12-09' } });
    await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));
    expect(within(panel).getByText(/nejvýš 62 dní/)).toBeInTheDocument();
    expect(volani).toHaveLength(0);

    fireEvent.change(nemocDo, { target: { value: '2026-10-13' } });
    expect(within(panel).getByLabelText('Hodiny v pracovní dny')).toHaveValue('8');
    await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));
    await vi.waitFor(() => expect(volani).toHaveLength(1));
    const nemoc = (datum: string, minuty: number) => ({ datum, typ: 'NEMOC', sablonaId: null, minuty });
    expect(volani[0]).toEqual({ metoda: 'PUT', cesta: '/api/plan', telo: { zamestnanecId: 'lenka', polozky: [
      nemoc('2026-10-08', 480), nemoc('2026-10-09', 480), nemoc('2026-10-10', 0), nemoc('2026-10-11', 0), nemoc('2026-10-12', 480), nemoc('2026-10-13', 480),
    ] } });
  });

  test('nemoc od–do vynechá dny po ukončení poměru; jediný den má přesně zadané hodiny i o víkendu; rozpis ukáže 0 h', async () => {
    const lenka = { ...LIDE[0]!, ukonceni: '2026-10-12' };
    const { uzivatel, volani } = otevri({ rijen: { zamestnanci: [lenka, ...LIDE.slice(1)], plan: [p('tomas', '2026-10-10', 'NEMOC', null, 0)] } });
    expect(await bunka('Tomáš Král, sobota 10. 10.: Nemoc 0\\sh')).toBeInTheDocument();

    await uzivatel.click(await bunka('Lenka Dvořáková, pátek 9. 10.'));
    const panel = await screen.findByRole('dialog', { name: 'Lenka Dvořáková' });
    await uzivatel.click(within(panel).getByRole('radio', { name: /Nemoc/ }));
    fireEvent.change(within(panel).getByLabelText('Nemoc do (včetně)'), { target: { value: '2026-10-14' } });
    await uzivatel.click(within(panel).getByRole('button', { name: 'Uložit' }));
    await vi.waitFor(() => expect(volani).toHaveLength(1));
    expect((volani[0]!.telo as { polozky: { datum: string; minuty: number }[] }).polozky.map((x) => [x.datum, x.minuty]))
      .toEqual([['2026-10-09', 480], ['2026-10-10', 0], ['2026-10-11', 0], ['2026-10-12', 480]]);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Sobota s nemocí 0 h jde znovu uložit (jediný den = přesně zadané hodiny, i 0).
    await uzivatel.click(await bunka('Tomáš Král, sobota 10. 10.'));
    const sobota = await screen.findByRole('dialog', { name: 'Tomáš Král' });
    expect(within(sobota).getByRole('radio', { name: /Nemoc/ })).toBeChecked();
    expect(within(sobota).getByLabelText('Hodiny')).toHaveValue('0');
    await uzivatel.click(within(sobota).getByRole('button', { name: 'Uložit' }));
    await vi.waitFor(() => expect(volani).toHaveLength(2));
    expect(volani[1]!.telo).toEqual({ zamestnanecId: 'tomas', polozky: [{ datum: '2026-10-10', typ: 'NEMOC', sablonaId: null, minuty: 0 }] });
  });

  test('nepřítomnost z docházky v prázdném dni ukáže „z docházky"', async () => {
    otevri({ rijen: { dny: [{ zamestnanecId: 'tomas', datum: '2026-10-09', typ: 'NEMOC', minuty: 480, kasa: false, poznamka: null }] } });
    expect(await bunka('Tomáš Král, pátek 9. 10.: Nemoc z docházky')).toBeInTheDocument();
  });

  test('pod jménem je smlouva a role', async () => {
    otevri({ rijen: { zamestnanci: [{ ...LIDE[0]!, rolePlanu: 'KASA' }, ...LIDE.slice(1)] } });
    expect((await screen.findAllByText('HPP · kasa')).length).toBeGreaterThan(0);
  });
});

describe('plánovač', () => {
  const R812: SablonaSmeny = { id: 'r', firmaId: 'f1', nazev: '8–12', zacatek: '08:00', konec: '12:00', prestavkaMin: 0, barva: null };
  const O1418: SablonaSmeny = { id: 'o', firmaId: 'f1', nazev: '14–18', zacatek: '14:00', konec: '18:00', prestavkaMin: 0, barva: null };
  const KASA = [
    zamestnanec({ id: 'daniel', jmeno: 'Daniel', prijmeni: 'K', rolePlanu: 'KASA', stridaniSmen: ['r'] }),
    zamestnanec({ id: 'alena', jmeno: 'Alena', prijmeni: 'A', rolePlanu: 'KASA' }),
  ];
  const firmaSPlanovacem = () => firma({ nastaveni: { ...firma().nastaveni, planovacSablony: ['r', 'o'] } });

  test('Navrhnout týden uloží směny do prázdných dnů Po–Pá a ukáže výsledek kontroly', async () => {
    const { uzivatel, volani } = otevri({
      rijen: { zamestnanci: KASA, sablony: [R812, O1418], plan: [] },
      zari: { zamestnanci: KASA, sablony: [R812, O1418], plan: [] },
      navic: { 'GET /api/firmy': () => json([firmaSPlanovacem()]) },
    });
    await uzivatel.click(await screen.findByRole('button', { name: 'Navrhnout týden' }));
    await vi.waitFor(() => expect(volani.some((v) => v.metoda === 'PUT' && v.cesta === '/api/plan')).toBe(true));
    const ulozeni = volani.filter((v) => v.metoda === 'PUT' && v.cesta === '/api/plan');
    const daniel = ulozeni.find((v) => (v.telo as { zamestnanecId: string }).zamestnanecId === 'daniel');
    expect((daniel?.telo as { polozky: unknown[] }).polozky).toHaveLength(5);
    const zprava = (await screen.findByText(/^Navržen/)).parentElement!;
    // Dvě kasařky na 8–12 a 14–18 nepokryjí 12–14 ani dva kasaře: kontrola něco najde.
    expect([...zprava.querySelectorAll('p')].map((x) => x.textContent)).toEqual([
      'Navrženo 10 směn na 5.–11. 10.',
      expect.stringMatching(/^Kontrola obsazení má \d+ upozornění, najdeš je nad rozpisem\.$/),
    ]);
  });

  test('bez šablon plánovače je tlačítko vypnuté a odkazuje na nastavení', async () => {
    otevri({ rijen: { zamestnanci: KASA, sablony: [R812, O1418] } });
    expect(await screen.findByRole('button', { name: 'Navrhnout týden' })).toBeDisabled();
    expect(screen.getByText(/Vyber šablony plánovače/)).toBeInTheDocument();
  });

  test('kontrola obsazení ukáže chybějícího kasaře', async () => {
    otevri({ rijen: { zamestnanci: KASA, sablony: [R812, O1418], plan: [p('alena', '2026-10-05', 'SMENA', 'o', 240)] } });
    expect(await screen.findByRole('region', { name: 'Kontrola obsazení' })).toHaveTextContent(/Po 5\. 10\. 08:00–14:00: chybí zodpovědný kasař/);
  });

  test('firma bez plánovače (všichni mimo plán, žádné šablony plánovače) kontrolu obsazení nevidí', async () => {
    otevri();
    await tabulka();
    expect(screen.queryByRole('region', { name: 'Kontrola obsazení' })).not.toBeInTheDocument();
  });

  test('šablony plánovače vybrané, všichni mimo plán: kontrola obsazení se ukáže', async () => {
    otevri({ navic: { 'GET /api/firmy': () => json([firmaSPlanovacem()]) } });
    expect(await screen.findByRole('region', { name: 'Kontrola obsazení' })).toBeInTheDocument();
  });

  test('konce úseků mají jedinečné popisky „Kasaře hlídat do" a „Otevřeno do"', async () => {
    const { uzivatel, volani } = otevri({
      rijen: { zamestnanci: KASA, sablony: [R812, O1418] },
      navic: { 'PUT /api/firmy/f1': () => json(firmaSPlanovacem()) },
    });
    const sekce = await screen.findByRole('region', { name: 'Plánovač směn' });
    fireEvent.change(within(sekce).getByLabelText('Kasaře hlídat do'), { target: { value: '16:00' } });
    fireEvent.change(within(sekce).getByLabelText('Otevřeno do'), { target: { value: '18:00' } });
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Uložit nastavení plánovače' }));
    await vi.waitFor(() => expect(volani.some((v) => v.metoda === 'PUT' && v.cesta === '/api/firmy/f1')).toBe(true));
    expect(volani.find((v) => v.cesta === '/api/firmy/f1')?.telo).toMatchObject({ nastaveni: { planovacKasaDo: '16:00', planovacOtevrenoDo: '18:00' } });
  });

  test('nastavení plánovače se uloží do firmy', async () => {
    const { uzivatel, volani } = otevri({
      rijen: { zamestnanci: KASA, sablony: [R812, O1418] },
      navic: { 'PUT /api/firmy/f1': () => json(firmaSPlanovacem()) },
    });
    await uzivatel.click(await screen.findByRole('checkbox', { name: /8–12/ }));
    await uzivatel.click(screen.getByRole('button', { name: 'Uložit nastavení plánovače' }));
    await vi.waitFor(() => expect(volani.some((v) => v.metoda === 'PUT' && v.cesta === '/api/firmy/f1')).toBe(true));
    const ulozeni = volani.find((v) => v.metoda === 'PUT' && v.cesta === '/api/firmy/f1');
    expect(ulozeni?.telo).toMatchObject({ nazev: 'Ukázková prodejna s.r.o.', nastaveni: { planovacSablony: ['r'], planovacKasaOd: '08:00', planovacMinKasaru: 1 } });
  });

  test('dozor na kase do a ranní obsazení (přidat, upravit, odebrat okno) se uloží s ostatním nastavením', async () => {
    const { uzivatel, volani } = otevri({
      rijen: { zamestnanci: KASA, sablony: [R812, O1418] },
      navic: { 'PUT /api/firmy/f1': () => json(firmaSPlanovacem()) },
    });
    const sekce = await screen.findByRole('region', { name: 'Plánovač směn' });
    expect(within(sekce).getByLabelText('Dozor se počítá na kasu do')).toHaveValue('10:00');
    expect([1, 2].map((i) => (within(sekce).getByLabelText(`Okno ${i} lidí`) as HTMLInputElement).value)).toEqual(['2', '3']);
    fireEvent.change(within(sekce).getByLabelText('Dozor se počítá na kasu do'), { target: { value: '09:30' } });
    await uzivatel.clear(within(sekce).getByLabelText('Okno 1 lidí'));
    await uzivatel.type(within(sekce).getByLabelText('Okno 1 lidí'), '1');
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Přidat okno' }));
    fireEvent.change(within(sekce).getByLabelText('Okno 3 od'), { target: { value: '16:00' } });
    fireEvent.change(within(sekce).getByLabelText('Okno 3 do'), { target: { value: '17:00' } });
    await uzivatel.type(within(sekce).getByLabelText('Okno 3 lidí'), '2');
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Odebrat okno 2' }));
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Uložit nastavení plánovače' }));
    await vi.waitFor(() => expect(volani.some((v) => v.metoda === 'PUT' && v.cesta === '/api/firmy/f1')).toBe(true));
    const telo = volani.find((v) => v.cesta === '/api/firmy/f1')?.telo as { nastaveni: Record<string, unknown> };
    expect(telo.nastaveni).toMatchObject({ planovacDozorNaKaseDo: '09:30', planovacKasaOd: '08:00' });
    expect(telo.nastaveni.planovacObsazeni).toEqual([{ od: '08:00', do: '09:00', lidi: 1 }, { od: '16:00', do: '17:00', lidi: 2 }]);
  });

  test('okno „aspoň": zaškrtávátko u každého okna (výchozí denní okno zaškrtnuté, nové ne) se uloží', async () => {
    const { uzivatel, volani } = otevri({
      rijen: { zamestnanci: KASA, sablony: [R812, O1418] },
      navic: { 'PUT /api/firmy/f1': () => json(firmaSPlanovacem()) },
    });
    const sekce = await screen.findByRole('region', { name: 'Plánovač směn' });
    const aspon = (i: number) => within(sekce).getByRole('checkbox', { name: new RegExp(`^Okno ${i} aspoň`, 'i') });
    expect([1, 2].map((i) => (aspon(i) as HTMLInputElement).checked)).toEqual([false, true]);
    await uzivatel.click(aspon(1));
    await uzivatel.click(aspon(2));
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Přidat okno' }));
    expect(aspon(3)).not.toBeChecked();
    fireEvent.change(within(sekce).getByLabelText('Okno 3 do'), { target: { value: '19:00' } });
    await uzivatel.type(within(sekce).getByLabelText('Okno 3 lidí'), '2');
    await uzivatel.click(aspon(3));
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Uložit nastavení plánovače' }));
    await vi.waitFor(() => expect(volani.some((v) => v.metoda === 'PUT' && v.cesta === '/api/firmy/f1')).toBe(true));
    expect((volani.find((v) => v.cesta === '/api/firmy/f1')?.telo as { nastaveni: Record<string, unknown> }).nastaveni.planovacObsazeni).toEqual([
      { od: '08:00', do: '09:00', lidi: 2, aspon: true }, { od: '09:00', do: '18:00', lidi: 3 }, { od: '18:00', do: '19:00', lidi: 2, aspon: true },
    ]);
  });

  test('ranní obsazení: neplatný čas, konec před začátkem a počet mimo 0–50 se neuloží', async () => {
    const { uzivatel, volani } = otevri({
      rijen: { zamestnanci: KASA, sablony: [R812, O1418] },
      navic: { 'PUT /api/firmy/f1': () => json(firmaSPlanovacem()) },
    });
    const sekce = await screen.findByRole('region', { name: 'Plánovač směn' });
    fireEvent.change(within(sekce).getByLabelText('Okno 1 do'), { target: { value: '06:00' } });
    await uzivatel.clear(within(sekce).getByLabelText('Okno 2 lidí'));
    await uzivatel.type(within(sekce).getByLabelText('Okno 2 lidí'), '51');
    await uzivatel.clear(within(sekce).getByLabelText('Okno 1 lidí'));
    await uzivatel.type(within(sekce).getByLabelText('Okno 1 lidí'), '1,5');
    fireEvent.change(within(sekce).getByLabelText('Dozor se počítá na kasu do'), { target: { value: '' } });
    await uzivatel.click(within(sekce).getByRole('button', { name: 'Uložit nastavení plánovače' }));
    expect(within(sekce).getByLabelText('Okno 1 do')).toHaveAccessibleDescription('Konec musí být po začátku.');
    expect(within(sekce).getByLabelText('Okno 2 lidí')).toHaveAccessibleDescription('Celé číslo od 0 do 50.');
    expect(within(sekce).getByLabelText('Okno 1 lidí')).toHaveAccessibleDescription('Celé číslo od 0 do 50.');
    expect(within(sekce).getByLabelText('Dozor se počítá na kasu do')).toHaveAccessibleDescription(/Čas ve tvaru HH:MM, např\. 08:00\./);
    expect(volani.some((v) => v.cesta === '/api/firmy/f1')).toBe(false);
  });
});

describe('rozpis týdne do WhatsAppu', () => {
  const nemocnyTomas = { dny: [{ zamestnanecId: 'tomas', datum: '2026-10-07', typ: 'NEMOC' as const, minuty: 480, kasa: false, poznamka: null }], plan: [...RIJEN_PLAN, p('tomas', '2026-10-07', 'SMENA', 's2', 450)] };
  const textTydne = 'Rozpis směn 5.–11. 10.\nPo 5. 10.: Lenka 8–16:30\nÚt 6. 10.: nikdo\nSt 7. 10.: nikdo\nČt 8. 10.: nikdo\nPá 9. 10.: nikdo\nSo 10. 10.: nikdo\nNe 11. 10.: nikdo';

  const waUrl = `https://wa.me/?text=${encodeURIComponent(textTydne)}`;
  const nastavDotyk = (dotykove: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn((query: string) => ({ matches: dotykove && query === '(pointer: coarse)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(window, 'matchMedia');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('na dotykovém zařízení s Web Share API pošle text týdne bez nepřítomnosti (nemoc se nikde neobjeví)', async () => {
    nastavDotyk(true);
    const sdilet = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: sdilet, configurable: true });
    const otevrit = vi.spyOn(window, 'open').mockReturnValue(null);
    const { uzivatel } = otevri({ rijen: nemocnyTomas });

    await uzivatel.click(await screen.findByRole('button', { name: 'Poslat rozpis do WhatsAppu' }));

    expect(sdilet).toHaveBeenCalledTimes(1);
    const { text } = sdilet.mock.calls[0]![0] as { text: string };
    expect(text).toBe(textTydne);
    expect(text).not.toMatch(/Nemoc|Tomáš/);
    expect(otevrit).not.toHaveBeenCalled();
  });

  test('na počítači (jemný ukazatel) otevře rovnou wa.me, i když Web Share API existuje', async () => {
    nastavDotyk(false);
    const sdilet = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: sdilet, configurable: true });
    const otevrit = vi.spyOn(window, 'open').mockReturnValue(null);
    const { uzivatel } = otevri({ rijen: nemocnyTomas });

    await uzivatel.click(await screen.findByRole('button', { name: 'Poslat rozpis do WhatsAppu' }));

    expect(otevrit).toHaveBeenCalledWith(waUrl, '_blank', 'noopener');
    expect(sdilet).not.toHaveBeenCalled();
  });

  test('bez Web Share API otevře wa.me s přesně zakódovaným textem týdne', async () => {
    nastavDotyk(true);
    const otevrit = vi.spyOn(window, 'open').mockReturnValue(null);
    const { uzivatel } = otevri({ rijen: nemocnyTomas });

    await uzivatel.click(await screen.findByRole('button', { name: 'Poslat rozpis do WhatsAppu' }));

    expect(otevrit).toHaveBeenCalledWith(waUrl, '_blank', 'noopener');
  });

  test('selhání sdílení (jiné než zrušení) přesměruje na wa.me přes location.href', async () => {
    nastavDotyk(true);
    const sdilet = vi.fn().mockRejectedValue(new DOMException('zakázáno', 'NotAllowedError'));
    Object.defineProperty(navigator, 'share', { value: sdilet, configurable: true });
    const otevrit = vi.spyOn(window, 'open').mockReturnValue(null);
    const poloha = { href: 'http://localhost/' };
    const { uzivatel } = otevri();
    const tlacitko = await screen.findByRole('button', { name: 'Poslat rozpis do WhatsAppu' });
    vi.stubGlobal('location', poloha);

    await uzivatel.click(tlacitko);

    await vi.waitFor(() => expect(poloha.href).not.toBe('http://localhost/'));
    const { text } = sdilet.mock.calls[0]![0] as { text: string };
    expect(poloha.href).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    expect(otevrit).not.toHaveBeenCalled();
  });

  test('zavřené sdílení (uživatel zruší) nic dalšího neotevře', async () => {
    nastavDotyk(true);
    const sdilet = vi.fn().mockRejectedValue(new DOMException('zrušeno', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: sdilet, configurable: true });
    const otevrit = vi.spyOn(window, 'open').mockReturnValue(null);
    const poloha = { href: 'http://localhost/' };
    const { uzivatel } = otevri();
    const tlacitko = await screen.findByRole('button', { name: 'Poslat rozpis do WhatsAppu' });
    vi.stubGlobal('location', poloha);

    await uzivatel.click(tlacitko);

    await vi.waitFor(() => expect(sdilet).toHaveBeenCalled());
    await Promise.resolve();
    expect(otevrit).not.toHaveBeenCalled();
    expect(poloha.href).toBe('http://localhost/');
  });

  test('sekce „Rozpis pro zaměstnance“ je ve Směnách pod šablonami', async () => {
    otevri();
    const sekce = await screen.findByRole('region', { name: 'Rozpis pro zaměstnance' });
    const sablony = screen.getByRole('region', { name: 'Šablony směn' });
    expect(sablony.compareDocumentPosition(sekce) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
