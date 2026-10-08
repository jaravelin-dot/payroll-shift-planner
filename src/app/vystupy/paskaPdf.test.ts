import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { formatKc } from '../../core/penize';
import { formatHodin } from '../cisla';
import { formatDatum } from '../datum';
import { firma, zamestnanec } from '../test-utils';
import { obsahPasky, ocistiText, vytvorPaskyPdf, type ObsahPasky } from './paskaPdf';
import { vysledekA } from './test-scenar';

vi.setConfig({ testTimeout: 20_000 });

const font = (vaha: string) => new Uint8Array(readFileSync(join(process.cwd(), 'public', 'fonts', `Onest-${vaha}.ttf`)));
const FONTY = { regular: font('Regular'), bold: font('SemiBold') };
const FIRMA = firma({ nazev: 'Ukázková prodejna s.r.o.', ico: '12345678' });
const JANA = zamestnanec({ id: 'z1', ucet: '19-24619/0800' });
const h = (hodiny: number) => formatHodin(hodiny * 60);

/** Všechny texty obsahu pásky (popisy, částky i vzorce) v jednom poli. */
function texty(o: ObsahPasky): string[] {
  const radky = [...o.slozky, o.hruba, ...o.radky, o.cista];
  return [
    o.firma, ...o.firmaUdaje, o.nadpis, o.obdobi, o.stav, o.jmeno, o.smlouva, o.ucet, o.pv,
    ...o.hodiny.flatMap((h) => [h.popis, h.hodiny, h.dny]),
    ...radky.flatMap((r) => [r.popis, r.castka, r.vzorec]),
    o.kVyplate.popis, o.kVyplate.castka,
  ];
}

test('scénář A: PDF jde znovu načíst, má jednu stranu A4, název a vložený font', async () => {
  const pdf = await vytvorPaskyPdf({ firma: FIRMA, rok: 2026, mesic: 10, radky: [{ zamestnanec: JANA, vysledek: vysledekA() }], fonty: FONTY });
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  expect(pdf.byteLength).toBeGreaterThan(5000);
  const nacteny = await PDFDocument.load(pdf);
  expect(nacteny.getPageCount()).toBe(1);
  expect(nacteny.getTitle()).toBe('Výplatní pásky 10/2026');
  const [sirka, vyska] = [nacteny.getPage(0).getWidth(), nacteny.getPage(0).getHeight()];
  expect([Math.round(sirka), Math.round(vyska)]).toEqual([595, 842]);
});

test('každý člověk má vlastní stranu', async () => {
  const petr = zamestnanec({ id: 'z2', jmeno: 'Petr', prijmeni: 'Černý' });
  const pdf = await vytvorPaskyPdf({
    firma: FIRMA, rok: 2026, mesic: 10, fonty: FONTY,
    radky: [{ zamestnanec: JANA, vysledek: vysledekA() }, { zamestnanec: petr, vysledek: vysledekA() }],
  });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
});

test('obsah pásky: firma, období, člověk, hodiny po typech, složky se vzorcem, odvody, daň, slevy, K výplatě', () => {
  const v = vysledekA();
  const o = obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: JANA, vysledek: v });
  expect(o.firma).toBe('Ukázková prodejna s.r.o.');
  expect(o.firmaUdaje).toContain('IČO 12345678');
  expect(o.obdobi).toBe('Říjen 2026');
  expect(o.jmeno).toBe('Jana Nováková');
  expect(o.smlouva).toBe('Pracovní poměr (HPP)');
  expect(o.ucet).toBe('Na účet 19-24619/0800');
  expect(o.stav).toMatch(/^Rozpracováno/);

  // 18 všedních dnů po 8 h, dvě soboty po 6 h, neděle 5 h, 28. října 8 h; dovolená 30. 10.
  expect(o.hodiny).toEqual([
    { popis: 'Odpracováno', hodiny: h(169), dny: '22 dní' },
    { popis: 'z toho Po–Pá', hodiny: h(144), dny: '18 dní' },
    { popis: 'z toho sobota', hodiny: h(12), dny: '2 dny' },
    { popis: 'z toho neděle', hodiny: h(5), dny: '1 den' },
    { popis: 'z toho svátek', hodiny: h(8), dny: '1 den' },
    { popis: 'Dovolená', hodiny: h(8), dny: '1 den' },
  ]);
  expect(o.pv).toBe('Průměrný hodinový výdělek 190 Kč');

  // Každá složka mzdy se vzorcem a částkou z jádra.
  expect(o.slozky.map((s) => s.popis)).toEqual(v.slozky.map((s) => s.popis));
  for (const [i, s] of v.slozky.entries()) {
    expect(o.slozky[i]).toMatchObject({ castka: formatKc(s.castkaHal), vzorec: s.vzorec });
  }
  expect(o.hruba).toMatchObject({ popis: 'Hrubá mzda', castka: formatKc(3544000) });
  const popisy = o.radky.map((r) => r.popis);
  expect(popisy).toEqual(['Stravenkový paušál', 'Sociální pojištění', 'Zdravotní pojištění', 'Záloha na daň', 'Slevy na dani']);
  expect(o.radky.find((r) => r.popis === 'Sociální pojištění')!.castka).toBe(`−${formatKc(v.pojisteni.socialniZamKc * 100)}`);
  expect(o.radky.find((r) => r.popis === 'Stravenkový paušál')!.castka).toBe(`+${formatKc(284900)}`);
  expect(o.kVyplate).toEqual({ popis: 'K výplatě', castka: formatKc(3142200) });
  expect(o.cista.castka).toBe(formatKc(2857300));
});

test('náklad firmy na pásce není (je interní, patří jen do podkladů pro účetního)', () => {
  const o = obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: JANA, vysledek: vysledekA() });
  const vse = texty(o).join('\n');
  expect(vse).not.toMatch(/Náklad firmy/i);
  expect(vse).not.toContain(formatKc(5026900));
});

test('uzavřený měsíc, dohoda bez účtu, doplatek ZP, srážky a náhrada za nemoc', () => {
  const v = vysledekA();
  const s = {
    ...v,
    nahradaNemocHal: 120000, nahradaNemocVzorec: '2 dny × 8 h × 75 Kč',
    pojisteni: { ...v.pojisteni, doplatekZpKc: 105 },
    kVyplateHal: v.kVyplateHal + 120000 - 10500 - 50000,
    cistaHal: v.cistaHal - 10500,
  };
  const o = obsahPasky({
    firma: firma({ ico: null }), rok: 2026, mesic: 10, uzavreno: '2026-11-05T09:00:00.000Z',
    zamestnanec: zamestnanec({ smlouva: 'DPP', ucet: null }), vysledek: s,
  });
  expect(o.firmaUdaje).toEqual([]);
  expect(o.stav).toBe(`Uzavřeno ${formatDatum('2026-11-05')}`);
  expect(o.smlouva).toBe('Dohoda o provedení práce (DPP)');
  expect(o.ucet).toBe('Vyplácí se hotově');
  // Neplatné číslo účtu (kontrolní součet) se na pásku nedostane, stejně jako do plateb.
  expect(obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: zamestnanec({ ucet: '124/0800' }), vysledek: v }).ucet).toBe('Vyplácí se hotově');
  const popisy = o.radky.map((r) => r.popis);
  expect(popisy).toEqual(expect.arrayContaining(['Náhrada za nemoc', 'Doplatek zdravotního do minima', 'Srážky']));
  expect(o.radky.find((r) => r.popis === 'Srážky')!.castka).toBe(`−${formatKc(50000)}`);
  // Na pásce nejsou upozornění appky, proto vzorec na ně neodkazuje.
  expect(o.radky.find((r) => r.popis === 'Doplatek zdravotního do minima')!.vzorec).not.toMatch(/upozornění/);
});

test('srážková daň u dohody bez prohlášení', () => {
  const v = vysledekA();
  const s = { ...v, dan: { rezim: 'SRAZKOVA' as const, zakladKc: 7200, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: 1080, bonusKc: 0 } };
  const o = obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: zamestnanec({ smlouva: 'DPP' }), vysledek: s });
  expect(o.radky.find((r) => r.popis === 'Srážková daň')!.castka).toBe(`−${formatKc(108000)}`);
});

test('znaky, které písmo nemá, se z textu vypustí (jinak by v PDF byly prázdné čtverečky)', () => {
  const maGlyf = (znak: string) => !'⌈⌉∞'.includes(znak);
  expect(ocistiText('⌈VZ × 7,1 %⌉ ∞', maGlyf)).toBe('VZ × 7,1 % ');
  expect(ocistiText('Příliš žluťoučký kůň', maGlyf)).toBe('Příliš žluťoučký kůň');
});

test('PDF vznikne i s textem mimo písmo', async () => {
  const pdf = await vytvorPaskyPdf({
    firma: firma({ nazev: 'Firma ⌈Σ⌉' }), rok: 2026, mesic: 10, fonty: FONTY,
    radky: [{ zamestnanec: zamestnanec({ prijmeni: 'Ø∞' }), vysledek: vysledekA() }],
  });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
});

test('na pásce nejsou částky ani věty o podílu firmy: u zdravotního jen třetina zaměstnance', () => {
  const v = vysledekA();
  const o = obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: JANA, vysledek: v });
  const zp = o.radky.find((r) => r.popis === 'Zdravotní pojištění')!;
  expect(zp.vzorec).toBe(`4,5 % z ${formatKc(3544000)} (třetina celkového pojistného), nahoru na celé koruny.`);
  // Celkové pojistné (zaměstnanec + firma), podíl firmy na ZP a SP i jejich součet se na pásku nedostanou.
  const p = v.pojisteni;
  const firemni = [p.zdravotniZamKc + p.zdravotniFirmaKc, p.zdravotniFirmaKc, p.socialniFirmaKc, p.socialniFirmaKc + p.zdravotniFirmaKc].map((kc) => formatKc(kc * 100));
  const vse = texty({ ...o, firma: '' }).join('\n');
  for (const castka of firemni) expect(vse).not.toContain(castka);
  expect(vse).not.toMatch(/firm(a|y|u|ou)\b/i);
  expect(vse).not.toContain('13,5');
});

test('člověk, který už není mezi lidmi firmy: způsob výplaty neznámý (ne „hotově“)', () => {
  const v = vysledekA();
  const clovek = { jmeno: 'Petr', prijmeni: 'Černý', smlouva: 'DPP' as const };
  expect(obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: { ...clovek, ucet: undefined }, vysledek: v }).ucet).toBe('Způsob výplaty neznámý');
  expect(obsahPasky({ firma: FIRMA, rok: 2026, mesic: 10, zamestnanec: { ...clovek, ucet: null }, vysledek: v }).ucet).toBe('Vyplácí se hotově');
});

/** Texty kreslené na jednotlivé strany (v pořadí stran), aby šlo ověřit, co je kde. */
async function textyStran(vytvor: () => Promise<Uint8Array>): Promise<string[][]> {
  const spy = vi.spyOn(PDFPage.prototype, 'drawText');
  try {
    await vytvor();
    const strany = [...new Set(spy.mock.contexts)];
    return strany.map((strana) => spy.mock.calls.flatMap((volani, i) => (spy.mock.contexts[i] === strana ? [String(volani[0])] : [])));
  } finally {
    spy.mockRestore();
  }
}

test('dlouhá páska pokračuje na druhé straně a K výplatě je na poslední', async () => {
  const dlouhy = {
    ...vysledekA(),
    slozky: Array.from({ length: 40 }, (_, i) => ({ kod: 'JINE_ODMENY' as const, popis: `Odměna číslo ${i + 1}`, vzorec: 'z měsíčního vstupu', castkaHal: 10000 })),
  };
  let pdf!: Uint8Array;
  const strany = await textyStran(async () => {
    pdf = await vytvorPaskyPdf({ firma: FIRMA, rok: 2026, mesic: 10, radky: [{ zamestnanec: JANA, vysledek: dlouhy }], fonty: FONTY });
    return pdf;
  });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
  expect(strany).toHaveLength(2);
  const [prvni, druha] = strany as [string[], string[]];
  expect(prvni).toContain('Výplatní páska');
  expect(prvni).toContain('Odměna číslo 1');
  expect(prvni).not.toContain('K výplatě');
  // Druhá strana má hlavičku s pokračováním, zbytek složek, hrubou mzdu a K výplatě.
  expect(druha).toContain('Jana Nováková · Říjen 2026 · pokračování výplatní pásky');
  expect(druha).toContain('Odměna číslo 40');
  expect(druha).toContain('Hrubá mzda');
  expect(druha).toContain('K výplatě');
  expect(druha).not.toContain('Výplatní páska');
});

const maGlyfPisma = async (pismo: Uint8Array) => {
  const modul = await import('@pdf-lib/fontkit');
  // ES sestavení fontkitu má jen výchozí export, typy jen pojmenované.
  const fontkit = (modul as unknown as { default?: typeof modul }).default ?? modul;
  const font = fontkit.create(pismo);
  return (znak: string) => font.hasGlyphForCodePoint(znak.codePointAt(0)!);
};

test.each([['Regular', FONTY.regular], ['SemiBold', FONTY.bold]] as const)('písmo Onest %s má glyfy pro nezlomitelné mezery a minus, ocistiText je nechá', async (_vaha, pismo) => {
  const maGlyf = await maGlyfPisma(pismo);
  for (const [znak, nazev] of [['\u00a0', 'U+00A0'], ['\u202f', 'U+202F'], ['\u2212', 'U+2212']] as const) {
    expect(maGlyf(znak), nazev).toBe(true);
  }
  // Kontrola, že dotaz na glyf neodpovídá vždy „ano“.
  expect(maGlyf('⌈')).toBe(false);
  // Stejné znaky jako ve skutečných částkách: NBSP v tisících a před Kč, minus u záporných částek.
  const text = `${formatKc(-3544000)} a ${formatKc(284900)} + 1\u202f234\u202fKč − 5`;
  expect(text).toMatch(/[\u00a0\u202f\u2212]/);
  expect(ocistiText(text, maGlyf)).toBe(text);
});
