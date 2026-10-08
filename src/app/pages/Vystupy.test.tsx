import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { pripravVstup } from '../../core/priprava';
import { formatKc } from '../../core/penize';
import { vypocitejMzdu } from '../../core/vypocet';
import type { Den, MesicData } from '../../shared/api';
import { App } from '../App';
import { firma, json, mesicData, mockApi, zamestnanec } from '../test-utils';
import { vytvorExcel } from '../vystupy/excel';
import { vytvorPodkladPdf } from '../vystupy/podkladPdf';

// exceljs je velký balík a jeho první načtení pod zátěží trvá desítky sekund (test pak padal na časový limit). Tady se
// ověřuje jen stránka (tlačítko, data, jméno souboru); skutečný sešit z exceljs testuje src/app/vystupy/excel.test.ts.
vi.mock('../vystupy/excel', async (puvodni) => ({
  ...(await puvodni<typeof import('../vystupy/excel')>()),
  vytvorExcel: vi.fn(async () => new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
}));

// PDF podkladu se tu jen volá; skutečné PDF testuje src/app/vystupy/podkladPdf.test.ts.
vi.mock('../vystupy/podkladPdf', async (puvodni) => ({
  ...(await puvodni<typeof import('../vystupy/podkladPdf')>()),
  vytvorPodkladPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

configure({ asyncUtilTimeout: 10_000 });
vi.setConfig({ testTimeout: 30_000 });

const KONTEXT = '?firma=f1&rok=2026&mesic=10';
const FIRMA = firma({ nazev: 'Ukázková prodejna s.r.o.', ico: '12345678' });
const den = (zamestnanecId: string, datum: string): Den => ({ zamestnanecId, datum, typ: 'PRACE', minuty: 480, kasa: false, poznamka: null });
const PRACOVNI = ['01', '02', '05', '06', '07', '08', '09', '12', '13', '14'].map((d) => `2026-10-${d}`);

const DATA = mesicData({
  firma: FIRMA,
  zamestnanci: [
    zamestnanec({ id: 'n', jmeno: 'Jana', prijmeni: 'Nováková', ucet: '19-24619/0800' }),
    zamestnanec({ id: 'c', jmeno: 'Petr', prijmeni: 'Černý', smlouva: 'DPP', uvazekMinTydne: 0, prohlaseni: false }),
  ],
  dny: [...PRACOVNI.map((d) => den('n', d)), ...PRACOVNI.slice(0, 2).map((d) => den('c', d))],
});
const vysledek = (data: MesicData, id: string) => vypocitejMzdu(pripravVstup(data, id));
const uzavrena = (data: MesicData): MesicData => ({
  ...data,
  uzaverka: { firmaId: 'f1', rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z',
    vysledky: data.zamestnanci.map((z) => ({ zamestnanecId: z.id, jmeno: `${z.jmeno} ${z.prijmeni}`, smlouva: z.smlouva, vysledek: vysledek(data, z.id) })) },
});
const ZARI = { ...uzavrena({ ...DATA, mesic: 9 }).uzaverka!, mesic: 9, uzavreno: '2026-10-03T09:00:00.000Z' };
const font = (vaha: string) => readFileSync(join(process.cwd(), 'public', 'fonts', `Onest-${vaha}.ttf`));
const text = (hal: number) => formatKc(hal).replace(/\s/g, ' ');

/** Stažené soubory: Blob a jméno z `<a download>`. */
function zachytStahovani() {
  const stazene: { blob: Blob; nazev: string }[] = [];
  let posledni: Blob | null = null;
  // jsdom adresy blobů nemá; každý test soubor má vlastní prostředí, takže přepsání nikam neuteče.
  URL.createObjectURL = vi.fn((blob: Blob) => { posledni = blob; return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (this.href.startsWith('blob:') && posledni) stazene.push({ blob: posledni, nazev: this.download });
  });
  return stazene;
}

/** `uzaverkyRoku` nahradí odpověď se seznamem uzávěrek roku (pomalá nebo chybná). */
function otevri(data: MesicData, uzaverkyRoku?: () => Response | Promise<Response>) {
  const fetchMock = mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([FIRMA]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(data),
    'GET /api/firmy/f1/uzaverky?rok=2026': uzaverkyRoku ?? (() => json([ZARI, ...(data.uzaverka ? [data.uzaverka] : [])])),
    'GET /fonts/Onest-Regular.ttf': () => new Response(font('Regular')),
    'GET /fonts/Onest-SemiBold.ttf': () => new Response(font('SemiBold')),
  });
  window.history.replaceState(null, '', '/vystupy' + KONTEXT);
  render(<App />);
  return { fetchMock, uzivatel: userEvent.setup({ delay: null }) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('rozpracovaný měsíc: stav je vidět, pásky všech jako jedno PDF a páska jednoho člověka', async () => {
  const stazene = zachytStahovani();
  const { uzivatel } = otevri(DATA);
  expect(await screen.findByRole('heading', { name: 'Výstupy', level: 1 })).toBeInTheDocument();
  expect(await screen.findByText(/Měsíc není uzavřený/)).toBeInTheDocument();

  const pasky = screen.getByRole('region', { name: 'Výplatní pásky' });
  await uzivatel.click(within(pasky).getByRole('button', { name: 'Stáhnout pásky všech (2)' }));
  await waitFor(() => expect(stazene).toHaveLength(1));
  expect(stazene[0]!.nazev).toBe('vyplatni-pasky-ukazkova-prodejna-s-r-o-2026-10.pdf');
  expect(stazene[0]!.blob.type).toBe('application/pdf');
  const pdf = await PDFDocument.load(await stazene[0]!.blob.arrayBuffer());
  expect(pdf.getPageCount()).toBe(2);

  await uzivatel.click(within(pasky).getByRole('button', { name: 'Páska PDF: Jana Nováková' }));
  await waitFor(() => expect(stazene).toHaveLength(2));
  expect(stazene[1]!.nazev).toBe('vyplatni-paska-novakova-jana-2026-10.pdf');
  expect((await PDFDocument.load(await stazene[1]!.blob.arrayBuffer())).getPageCount()).toBe(1);
});

test('Excel pro účetního, náklady (graf z uzávěrek + rozpracovaný měsíc) a platby', async () => {
  const stazene = zachytStahovani();
  const { uzivatel } = otevri(DATA);
  const ucetni = await screen.findByRole('region', { name: 'Pro účetního' });
  await uzivatel.click(within(ucetni).getByRole('button', { name: 'Stáhnout Excel' }));
  await waitFor(() => expect(stazene).toHaveLength(1));
  expect(stazene[0]!.nazev).toBe('mzdy-ukazkova-prodejna-s-r-o-2026-10.xlsx');
  expect(vytvorExcel).toHaveBeenCalledWith(expect.objectContaining({ firma: FIRMA, rok: 2026, mesic: 10, data: DATA }));
  const vysledky = vi.mocked(vytvorExcel).mock.calls[0]![0].vysledky;
  expect([...vysledky.keys()].sort()).toEqual(['c', 'n']);

  const naklady = screen.getByRole('region', { name: 'Náklady firmy' });
  const soucet = DATA.zamestnanci.reduce((s, z) => s + vysledek(DATA, z.id).nakladFirmyHal, 0);
  expect(await within(naklady).findByRole('img', { name: /^Září 2026, uzavřeno/ })).toBeInTheDocument();
  expect(within(naklady).getByRole('img', { name: new RegExp(`^Říjen 2026, rozpracováno: náklad ${text(soucet).replace(/ /g, '\\s')}`) })).toBeInTheDocument();

  const platby = screen.getByRole('region', { name: 'Platby' });
  expect(await within(platby).findByRole('img', { name: /QR platba pro Jana Nováková/ })).toBeInTheDocument();
  expect(within(platby).getByText('Petr Černý').closest('li')).toHaveTextContent('Hotově');

  expect(screen.getByRole('link', { name: /Stáhnout zálohu/ })).toHaveAttribute('href', '/api/zaloha');
});

test('podklad pro účetního v PDF: tabulka ve tvaru ručního přehledu pro účetní', async () => {
  const stazene = zachytStahovani();
  const { uzivatel } = otevri(DATA);
  const ucetni = await screen.findByRole('region', { name: 'Pro účetního' });
  await uzivatel.click(within(ucetni).getByRole('button', { name: 'Podklad pro účetního (PDF)' }));
  await waitFor(() => expect(stazene).toHaveLength(1));
  expect(stazene[0]!.nazev).toBe('podklad-ucetni-ukazkova-prodejna-s-r-o-2026-10.pdf');
  const { podklad } = vi.mocked(vytvorPodkladPdf).mock.calls[0]![0];
  expect(podklad.zahlavi).toMatchObject({ firma: 'Ukázková prodejna s.r.o.', rok: 2026, mesic: 10, pracovniDny: 22 });
  expect(podklad.zamestnanci.map((r) => r.jmeno)).toEqual(['Nováková Jana']);
  expect(podklad.brigadnici.map((r) => r.jmeno)).toEqual(['Černý Petr']);
});

test('uzavřený měsíc: výstupy ze snímku uzávěrky a je to napsané', async () => {
  otevri(uzavrena(DATA));
  expect(await screen.findByText('Uzavřeno 5. 11. 2026')).toBeInTheDocument();
  expect(screen.getByText(/ze snímku uzávěrky/)).toBeInTheDocument();
  expect(screen.queryByText(/Měsíc není uzavřený/)).not.toBeInTheDocument();
});

test('chyba při tvorbě PDF se ukáže a jde zkusit znovu', async () => {
  zachytStahovani();
  mockApi({
    'GET /api/ja': () => json({ email: 'dev@localhost' }),
    'GET /api/firmy': () => json([FIRMA]),
    'GET /api/firmy/f1/mesic/2026/10': () => json(DATA),
    'GET /api/firmy/f1/uzaverky?rok=2026': () => json([]),
    'GET /fonts/Onest-Regular.ttf': () => new Response('nenalezeno', { status: 404 }),
    'GET /fonts/Onest-SemiBold.ttf': () => new Response('nenalezeno', { status: 404 }),
  });
  window.history.replaceState(null, '', '/vystupy' + KONTEXT);
  render(<App />);
  const uzivatel = userEvent.setup({ delay: null });
  const pasky = await screen.findByRole('region', { name: 'Výplatní pásky' });
  await uzivatel.click(within(pasky).getByRole('button', { name: 'Stáhnout pásky všech (2)' }));
  expect(await within(pasky).findByRole('alert')).toHaveTextContent('PDF se nepodařilo vytvořit');
});

test('měsíc bez lidí: prázdný stav místo výstupů', async () => {
  otevri(mesicData({ firma: FIRMA }));
  expect(await screen.findByText('V tomhle měsíci nejsou žádné výplaty')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Výplatní pásky' })).not.toBeInTheDocument();
});

describe('uzávěrky roku se načítají nebo se nenačetly', () => {
  test('než dorazí, v nákladech není roční součet ani graf (měl by jen vybraný měsíc) a je vidět načítání', async () => {
    otevri(DATA, () => new Promise<Response>(() => {}));
    const naklady = await screen.findByRole('region', { name: 'Náklady firmy' });
    expect(await within(naklady).findByText('Načítám uzávěrky roku…')).toBeInTheDocument();
    const rok = within(naklady).getByText('Za rok 2026').parentElement!;
    expect(rok).toHaveTextContent('načítám uzávěrky…');
    expect(rok).not.toHaveTextContent('Kč');
    expect(within(naklady).queryByRole('table')).not.toBeInTheDocument();
    expect(within(naklady).queryAllByRole('img')).toHaveLength(0);
    // Náklad vybraného měsíce je z jeho vlastních dat, ten se ukáže hned.
    expect(within(naklady).getByText(/Náklad firmy, říjen 2026/)).toBeInTheDocument();
  });

  test('když se nenačtou, je chybová hláška se „Zkusit znovu“ a místo ročního součtu stojí, že není k dispozici', async () => {
    otevri(DATA, () => json({ chyba: 'ZAKAZANO' }, 403));
    const naklady = await screen.findByRole('region', { name: 'Náklady firmy' });
    expect(await within(naklady).findByRole('alert')).toHaveTextContent('nemá do appky přístup');
    expect(within(naklady).getByRole('button', { name: 'Zkusit znovu' })).toBeInTheDocument();
    const rok = within(naklady).getByText('Za rok 2026').parentElement!;
    expect(rok).toHaveTextContent('nedostupné');
    expect(rok).not.toHaveTextContent('Kč');
    expect(within(naklady).queryByRole('table')).not.toBeInTheDocument();
    expect(within(naklady).queryAllByRole('img')).toHaveLength(0);
  });
});

test('člověk, který je jen ve snímku uzávěrky: platby „Účet neznámý“ mimo hotovost, páska „Způsob výplaty neznámý“', async () => {
  const stazene = zachytStahovani();
  const kresli = vi.spyOn(PDFPage.prototype, 'drawText');
  // Petr Černý z firmy odešel: snímek uzávěrky ho má, mezi lidmi měsíce už není.
  const snimek = uzavrena(DATA);
  const { uzivatel } = otevri({ ...snimek, zamestnanci: snimek.zamestnanci.filter((z) => z.id === 'n') });

  const platby = await screen.findByRole('region', { name: 'Platby' });
  const odesly = (await within(platby).findByText('Petr Černý')).closest('li')!;
  expect(odesly).toHaveTextContent('Účet neznámý');
  expect(odesly).not.toHaveTextContent('Hotově');
  const hotove = within(within(platby).getByRole('region', { name: 'Součty plateb' })).getByText('Hotově').parentElement!;
  expect(hotove).toHaveTextContent('0 Kč');
  expect(hotove).toHaveTextContent('0 lidí');
  expect(within(platby).getByText('Jana Nováková').closest('li')).toHaveTextContent('QR platba');

  await uzivatel.click(within(screen.getByRole('region', { name: 'Výplatní pásky' })).getByRole('button', { name: 'Páska PDF: Petr Černý' }));
  await waitFor(() => expect(stazene).toHaveLength(1));
  const texty = kresli.mock.calls.map((c) => String(c[0]));
  expect(texty).toContain('Dohoda o provedení práce (DPP) · Způsob výplaty neznámý');
  expect(texty.join(' | ')).not.toContain('Vyplácí se hotově');
});
