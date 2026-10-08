import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import type { Podklad, RadekZamestnance } from './podklad';
import { bunkyBrigadnika, bunkyFondu, bunkyZamestnance, nazevPodkladuPdf, vytvorPodkladPdf } from './podkladPdf';

vi.setConfig({ testTimeout: 20_000 });

const font = (vaha: string) => new Uint8Array(readFileSync(join(process.cwd(), 'public', 'fonts', `Onest-${vaha}.ttf`)));
const FONTY = { regular: font('Regular'), bold: font('SemiBold') };
const bez = (t: string) => t.replace(/\s/g, ' ');

const JANA: RadekZamestnance = {
  zamestnanecId: 'z1', jmeno: 'Nováková Jana', uvazekMin: 1200, hodinVMesiciMin: 84 * 60, odpracovanoMin: 62.5 * 60,
  vikendMin: 13 * 60, svatekMin: 0, dnyDovolene: 5, dnyNemoci: 0, dnyStravenek: 16, odmenaHal: 636500,
  potrebujeme: 'čistého aspoň 24 500 Kč bez stravenek',
};
const PODKLAD = (lidi: number): Podklad => ({
  zahlavi: {
    firma: 'Ukázková prodejna', rok: 2026, mesic: 8, nazevMesice: 'srpen 2026', pracovniDny: 21, stav: 'Uzavřeno 5. 9. 2026',
    fond: [{ uvazekMin: 1200, denneMin: 240, mesicMin: 84 * 60 }, { uvazekMin: 2400, denneMin: 480, mesicMin: 168 * 60 }],
  },
  zamestnanci: Array.from({ length: lidi }, (_, i) => ({ ...JANA, zamestnanecId: `z${i}` })),
  brigadnici: [{ zamestnanecId: 'b1', jmeno: 'Beránek Karel', odpracovanoMin: 20 * 60, mzdaHal: 1175000, zpusobPlatby: 'hotově', potrebujeme: '' }],
});

test('buňky: hodiny česky s čárkou, Kč, prázdné místo null', () => {
  expect(bunkyZamestnance(JANA).map(bez)).toEqual([
    'Nováková Jana', '20', '84', '62,5', '13', '0', '5', '0', '16', '6 365 Kč', 'čistého aspoň 24 500 Kč bez stravenek',
  ]);
  expect(bunkyZamestnance({ ...JANA, uvazekMin: null, hodinVMesiciMin: null }).slice(1, 3)).toEqual(['', '']);
  expect(bunkyBrigadnika(PODKLAD(0).brigadnici[0]!).map(bez)).toEqual(['Beránek Karel', '20', '11 750 Kč', 'hotově', '']);
  expect(bunkyFondu({ uvazekMin: 1800, denneMin: 360, mesicMin: 126 * 60 })).toEqual(['úvazek 30 h týdně', '6', '126']);
});

test('PDF: A4 na šířku, název, jde znovu načíst', async () => {
  const pdf = await vytvorPodkladPdf({ podklad: PODKLAD(8), fonty: FONTY });
  const nacteny = await PDFDocument.load(pdf);
  expect(nacteny.getPageCount()).toBe(1);
  expect([Math.round(nacteny.getPage(0).getWidth()), Math.round(nacteny.getPage(0).getHeight())]).toEqual([842, 595]);
  expect(nacteny.getTitle()).toBe('Podklad pro účetního 08/2026');
});

test('hodně lidí pokračuje na další stranu', async () => {
  const pdf = await vytvorPodkladPdf({ podklad: PODKLAD(60), fonty: FONTY });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
});

/** Počet příkazů pro vykreslení textu na straně (pdf-lib neumí text číst, ale obsah strany jde rozbalit). */
const pocetTextu = (pdf: PDFDocument, strana: number) => {
  const obsah = pdf.getPage(strana).node.Contents();
  const proudy = obsah instanceof PDFArray ? obsah.asArray().map((o) => pdf.context.lookup(o, PDFRawStream)) : [pdf.context.lookup(obsah, PDFRawStream)];
  return proudy.map((p) => Buffer.from(decodePDFRawStream(p as PDFRawStream).decode()).toString('latin1').split('> Tj').length - 1).reduce((a, b) => a + b, 0);
};

test('řádek vyšší než celá strana se nezahodí, nakreslí se na novou stranu', async () => {
  const velky: Podklad = { ...PODKLAD(1), zamestnanci: [JANA, { ...JANA, zamestnanecId: 'z2', potrebujeme: 'slovo '.repeat(2000) }], brigadnici: [] };
  const nacteny = await PDFDocument.load(await vytvorPodkladPdf({ podklad: velky, fonty: FONTY }));
  expect(nacteny.getPageCount()).toBe(2);
  // Druhá strana nese zopakované záhlaví a obří řádek; zahozený řádek by tu nechal jen záhlaví a patičku (19 textů).
  expect(pocetTextu(nacteny, 1)).toBeGreaterThan(300);
});

test('záhlaví tabulky nezůstane samo dole na straně, když se první řádek už nevejde', async () => {
  // Při tolika lidech se brigádníci vešli do druhé strany a jejich záhlaví by mohlo zůstat osamělé.
  const LIDI = 13;
  const s = await PDFDocument.load(await vytvorPodkladPdf({ podklad: PODKLAD(LIDI), fonty: FONTY }));
  const bez = await PDFDocument.load(await vytvorPodkladPdf({ podklad: { ...PODKLAD(LIDI), brigadnici: [] }, fonty: FONTY }));
  expect(s.getPageCount()).toBe(bez.getPageCount() + 1);
  // Brigádníci začali na nové straně; předchozí strana nesmí nést jejich osamělé záhlaví navíc.
  const posledni = s.getPageCount() - 2;
  expect(pocetTextu(s, posledni)).toBe(pocetTextu(bez, posledni));
});

test('bez brigádníků se PDF vytvoří taky', async () => {
  const pdf = await vytvorPodkladPdf({ podklad: { ...PODKLAD(3), brigadnici: [] }, fonty: FONTY });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
});

test('název souboru', () => {
  expect(nazevPodkladuPdf('Ukázková prodejna s.r.o.', 2026, 8)).toBe('podklad-ucetni-ukazkova-prodejna-s-r-o-2026-08.pdf');
});
