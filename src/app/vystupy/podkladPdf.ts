// Podklad pro účetního v PDF (spec 2026-10-07): A4 na šířku ve tvaru ručního přehledu pro účetní — záhlaví, vpravo fond pracovní
// doby, pod tím tabulka zaměstnanců a brigádníků s mřížkou. Obsah skládá `podkladUcetni`; pdf-lib a písmo se načítají
// až při stažení jako u pásky. Tabulka je černobílá.
import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import { formatKc } from '../../core/penize';
import { dnesniDatum, formatDatum } from '../datum';
import { nactiFonty, ocistiText, zalom, type Fonty } from './paskaPdf';
import { NADPISY_BRIGADNIKU, NADPISY_FONDU, NADPISY_ZAMESTNANCU, type Podklad, type RadekBrigadnika, type RadekFondu, type RadekZamestnance } from './podklad';
import { nazevSouboru } from './stahni';

const STRANA: [number, number] = [841.89, 595.28];
const OKRAJ = 32;
const SIRKA = STRANA[0] - 2 * OKRAJ;
/** Spodní okraj obsahu; pod ním je jen patička. */
const SPODEK = 36;
const ODSAZENI = 4;
const BARVY = { inkoust: '#16202b', tlumeny: '#5a6878', mrizka: '#8a96a3' } as const;

const cislo = (n: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(n);
const hodiny = (min: number | null) => (min === null ? '' : cislo(min / 60));
const dvojmistne = (mesic: number) => String(mesic).padStart(2, '0');

export function bunkyZamestnance(r: RadekZamestnance): string[] {
  return [
    r.jmeno, hodiny(r.uvazekMin), hodiny(r.hodinVMesiciMin), hodiny(r.odpracovanoMin), hodiny(r.vikendMin), hodiny(r.svatekMin),
    String(r.dnyDovolene), String(r.dnyNemoci), String(r.dnyStravenek), formatKc(r.odmenaHal), r.potrebujeme,
  ];
}

export function bunkyBrigadnika(r: RadekBrigadnika): string[] {
  return [r.jmeno, hodiny(r.odpracovanoMin), formatKc(r.mzdaHal), r.zpusobPlatby, r.potrebujeme];
}

export function bunkyFondu(f: RadekFondu): string[] {
  return [`úvazek ${hodiny(f.uvazekMin)} h týdně`, hodiny(f.denneMin), hodiny(f.mesicMin)];
}

export function nazevPodkladuPdf(firma: string, rok: number, mesic: number): string {
  return `podklad-ucetni-${nazevSouboru(firma)}-${rok}-${dvojmistne(mesic)}.pdf`;
}

interface Tabulka { x: number; sirky: number[]; vpravo: boolean[]; nadpisy: string[] }

/** Sloupce: jméno, 8 čísel, odměna, „Potřebujeme mzdu" dostane zbytek šířky. */
const sirkyZamestnancu = (() => {
  const pevne = [128, 50, 50, 68, 50, 50, 50, 50, 50, 70];
  return [...pevne, SIRKA - pevne.reduce((a, b) => a + b, 0)];
})();
const TABULKA_ZAMESTNANCU: Tabulka = { x: OKRAJ, sirky: sirkyZamestnancu, vpravo: sirkyZamestnancu.map((_, i) => i > 0 && i < 10), nadpisy: NADPISY_ZAMESTNANCU };
const sirkyBrigadniku = (() => {
  const pevne = [128, 56, 70, 80];
  return [...pevne, SIRKA - pevne.reduce((a, b) => a + b, 0)];
})();
const TABULKA_BRIGADNIKU: Tabulka = { x: OKRAJ, sirky: sirkyBrigadniku, vpravo: [false, true, true, false, false], nadpisy: ['Brigádníci (DPP)', ...NADPISY_BRIGADNIKU.slice(1)] };
const SIRKY_FONDU = [116, 58, 66];
const TABULKA_FONDU: Tabulka = { x: OKRAJ + SIRKA - SIRKY_FONDU.reduce((a, b) => a + b, 0), sirky: SIRKY_FONDU, vpravo: [false, true, true], nadpisy: NADPISY_FONDU };

/** Kreslí shora dolů; `y` je vzdálenost od horního okraje stránky. */
class Kreslic {
  strana!: PDFPage;
  y = 0;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonty: { regular: PDFFont; bold: PDFFont },
    private readonly barvy: Record<keyof typeof BARVY, RGB>,
    readonly cisty: (text: string) => string,
    private readonly paticka: string,
  ) {
    this.nova();
  }

  nova() {
    this.strana = this.pdf.addPage(STRANA);
    this.y = OKRAJ;
    this.text(this.paticka, OKRAJ, STRANA[1] - 16, { velikost: 7, barva: 'tlumeny' });
  }

  font(tucne?: boolean) {
    return tucne ? this.fonty.bold : this.fonty.regular;
  }

  text(text: string, x: number, zHora: number, volby: { velikost: number; tucne?: boolean; barva?: keyof typeof BARVY; vpravo?: boolean }) {
    const font = this.font(volby.tucne);
    const cisty = this.cisty(text);
    const sirka = font.widthOfTextAtSize(cisty, volby.velikost);
    this.strana.drawText(cisty, { x: volby.vpravo ? x - sirka : x, y: STRANA[1] - zHora, size: volby.velikost, font, color: this.barvy[volby.barva ?? 'inkoust'] });
  }

  cara(x1: number, y1: number, x2: number, y2: number) {
    this.strana.drawLine({ start: { x: x1, y: STRANA[1] - y1 }, end: { x: x2, y: STRANA[1] - y2 }, thickness: 0.6, color: this.barvy.mrizka });
  }

  /** Zalomený obsah buněk a výška řádku tabulky. */
  private zmer(t: Tabulka, bunky: string[], volby: { velikost: number; tucne?: boolean }) {
    const font = this.font(volby.tucne);
    const vyskaRadku = volby.velikost + 2.5;
    const radky = bunky.map((b, i) => (b ? zalom(this.cisty(b), font, volby.velikost, t.sirky[i]! - 2 * ODSAZENI) : []));
    const vyska = Math.max(1, ...radky.map((r) => r.length)) * vyskaRadku + 2 * ODSAZENI;
    return { radky, vyskaRadku, vyska };
  }

  /** Jeden řádek tabulky s mřížkou; text v buňkách se zalamuje. Vrátí false, když se na stranu nevešel (nic nenakreslí),
   * leda že je `vynutit` — pak ho nakreslí vždy (řádek vyšší než celá strana přeteče pod okraj, ale nezmizí). */
  radek(t: Tabulka, bunky: string[], volby: { velikost: number; tucne?: boolean; vynutit?: boolean }): boolean {
    const { radky, vyskaRadku, vyska } = this.zmer(t, bunky, volby);
    if (!volby.vynutit && this.y + vyska > STRANA[1] - SPODEK) return false;
    let x = t.x;
    radky.forEach((radkyBunky, i) => {
      const sirka = t.sirky[i]!;
      radkyBunky.forEach((r, j) => this.text(r, t.vpravo[i] ? x + sirka - ODSAZENI : x + ODSAZENI, this.y + ODSAZENI + volby.velikost + j * vyskaRadku - 1,
        { velikost: volby.velikost, tucne: volby.tucne, vpravo: t.vpravo[i] }));
      this.cara(x, this.y, x, this.y + vyska);
      x += sirka;
    });
    this.cara(x, this.y, x, this.y + vyska);
    this.cara(t.x, this.y, x, this.y);
    this.cara(t.x, this.y + vyska, x, this.y + vyska);
    this.y += vyska;
    return true;
  }

  /** Celá tabulka: záhlaví a řádky; když dojde místo, pokračuje na nové straně se zopakovaným záhlavím. */
  tabulka(t: Tabulka, radky: string[][]) {
    const zahlavi = { velikost: 7.5, tucne: true };
    const radekVolby = { velikost: 9 };
    // Záhlaví nesmí zůstat samo dole na straně: musí se vejít spolu s prvním řádkem (nahoře na straně se už nezačíná znovu).
    const potrebne = this.zmer(t, t.nadpisy, zahlavi).vyska + (radky[0] ? this.zmer(t, radky[0], radekVolby).vyska : 0);
    if (this.y > OKRAJ && this.y + potrebne > STRANA[1] - SPODEK) this.nova();
    this.radek(t, t.nadpisy, { ...zahlavi, vynutit: true });
    for (const r of radky) {
      if (this.radek(t, r, radekVolby)) continue;
      this.nova();
      this.radek(t, t.nadpisy, { ...zahlavi, vynutit: true });
      this.radek(t, r, { ...radekVolby, vynutit: true });
    }
  }
}

/** Podklad pro účetního jako PDF. `fonty` jen pro testy, v prohlížeči se načtou z `/fonts`. */
export async function vytvorPodkladPdf(a: { podklad: Podklad; fonty?: Fonty }): Promise<Uint8Array> {
  const [{ PDFDocument: Dokument, rgb }, fontkitModul, fonty] = await Promise.all([
    import('pdf-lib'), import('@pdf-lib/fontkit'), a.fonty ? Promise.resolve(a.fonty) : nactiFonty(),
  ]);
  // ES sestavení fontkitu má jen výchozí export, typy jen pojmenované.
  const fontkit = (fontkitModul as unknown as { default?: typeof fontkitModul }).default ?? fontkitModul;
  const pdf = await Dokument.create();
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([pdf.embedFont(fonty.regular, { subset: true }), pdf.embedFont(fonty.bold, { subset: true })]);
  const pokryti = fontkit.create(fonty.regular);
  const barva = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

  const { zahlavi: z } = a.podklad;
  const k = new Kreslic(
    pdf, { regular, bold },
    { inkoust: barva(BARVY.inkoust), tlumeny: barva(BARVY.tlumeny), mrizka: barva(BARVY.mrizka) },
    (text) => ocistiText(text, (znak) => pokryti.hasGlyphForCodePoint(znak.codePointAt(0)!)),
    `Vytvořeno ${formatDatum(dnesniDatum())} v appce Mzdy · ${z.firma} · podklad pro mzdy ${dvojmistne(z.mesic)}/${z.rok}`,
  );

  // Záhlaví vlevo, fond pracovní doby vpravo vedle něj.
  const zacatek = k.y;
  k.tabulka(TABULKA_FONDU, z.fond.map(bunkyFondu));
  const konecFondu = k.y;
  k.text(`${z.firma} — podklad pro mzdy`, OKRAJ, zacatek + 14, { velikost: 14, tucne: true });
  k.text(`měsíc: ${z.nazevMesice}, ${z.pracovniDny} pracovních dní`, OKRAJ, zacatek + 32, { velikost: 11 });
  k.text(z.stav, OKRAJ, zacatek + 46, { velikost: 8.5, barva: 'tlumeny' });
  k.y = Math.max(konecFondu, zacatek + 52) + 14;

  k.tabulka(TABULKA_ZAMESTNANCU, a.podklad.zamestnanci.map(bunkyZamestnance));
  if (a.podklad.brigadnici.length > 0) {
    k.y += 14;
    k.tabulka(TABULKA_BRIGADNIKU, a.podklad.brigadnici.map(bunkyBrigadnika));
  }

  pdf.setTitle(`Podklad pro účetního ${dvojmistne(z.mesic)}/${z.rok}`, { showInWindowTitleBar: true });
  pdf.setSubject(`${z.firma}, ${z.nazevMesice}`);
  pdf.setAuthor(z.firma);
  pdf.setCreator('Mzdy');
  pdf.setProducer('Mzdy (pdf-lib)');
  pdf.setLanguage('cs-CZ');
  return pdf.save();
}
