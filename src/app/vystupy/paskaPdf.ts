// Výplatní páska v PDF (spec 7): A4, jedna páska na stranu, písmo Onest s českou diakritikou. Obsah (texty a částky)
// skládá čistá funkce `obsahPasky`, vykreslení dělá pdf-lib, které se načítá až při tisku (dynamický import), aby
// nezvětšovalo hlavní balík appky. Náklad firmy na pásce záměrně není: je interní, patří jen do podkladů pro účetního.
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { formatKc } from '../../core/penize';
import { ucetNaIban } from '../../core/platby';
import type { VysledekVypoctu } from '../../core/typy';
import type { Firma, Smlouva, Zamestnanec } from '../../shared/api';
import { formatHodin } from '../cisla';
import { dnesniDatum, formatDatum } from '../datum';
import { nazevMesice } from '../dochazka';
import { rozpisUctenky, type RadekUctenky } from '../uctenka';

export interface Fonty { regular: Uint8Array; bold: Uint8Array }

/**
 * Z člověka páska potřebuje jen jméno, smlouvu a účet (u uzavřeného měsíce může člověk v datech už chybět).
 * `ucet` je `undefined`, když člověk mezi lidmi firmy už není: způsob výplaty se pak nezná (to není „hotově“).
 */
export type ZamestnanecPasky = Pick<Zamestnanec, 'jmeno' | 'prijmeni' | 'smlouva'> & { ucet: Zamestnanec['ucet'] | undefined };

export interface RadekObsahu { popis: string; castka: string; vzorec: string }
export interface RadekHodin { popis: string; hodiny: string; dny: string }

export interface ObsahPasky {
  firma: string;
  /** IČO a adresa, jen vyplněné. */
  firmaUdaje: string[];
  nadpis: string;
  obdobi: string;
  /** „Uzavřeno 5. 11. 2026" nebo upozornění, že jde o rozpracovaný výpočet. */
  stav: string;
  jmeno: string;
  smlouva: string;
  ucet: string;
  hodiny: RadekHodin[];
  pv: string;
  slozky: RadekObsahu[];
  hruba: RadekObsahu;
  /** Co se k hrubé mzdě přičítá a odečítá (se znaménkem); hrubá + tyto řádky = K výplatě. */
  radky: RadekObsahu[];
  cista: RadekObsahu;
  kVyplate: { popis: string; castka: string };
}

const SMLOUVY: Record<Smlouva, string> = { HPP: 'Pracovní poměr (HPP)', DPP: 'Dohoda o provedení práce (DPP)' };

function dnyText(pocet: number): string {
  if (pocet === 1) return '1 den';
  return `${pocet} ${pocet >= 2 && pocet <= 4 ? 'dny' : 'dní'}`;
}

/** Hodiny po typech: odpracováno vždy, ostatní jen nenulové. */
function radkyHodin(v: VysledekVypoctu): RadekHodin[] {
  const h = v.hodiny;
  const radek = (popis: string, minuty: number, dny: number | null): RadekHodin => ({ popis, hodiny: formatHodin(minuty), dny: dny === null ? '' : dnyText(dny) });
  const radky = [radek('Odpracováno', h.praceMin, h.odpracovaneDny)];
  const pridej = (popis: string, minuty: number, dny: number | null) => {
    if (minuty > 0 || (dny ?? 0) > 0) radky.push(radek(popis, minuty, dny));
  };
  pridej('z toho Po–Pá', h.praceVsedniMin, h.dnyVsedni);
  pridej('z toho sobota', h.sobotaMin, h.dnySobota);
  pridej('z toho neděle', h.nedeleMin, h.dnyNedele);
  pridej('z toho svátek', h.svatekPraceMin, h.dnySvatek);
  pridej('Dovolená', h.dovolenaMin, h.dnyDovolena);
  pridej('Svátek – zavřeno', h.svatekZavrenoMin, h.dnySvatekZavreno);
  pridej('Náhradní volno', h.nahradniVolnoMin, null);
  pridej('Nemoc (kalendářní dny)', h.nemocMin, h.dnyNemocKalendarni);
  pridej('Neplacené volno', h.neplaceneMin, null);
  pridej('Absence', h.absenceMin, null);
  return radky;
}

/** Částka se znaménkem: „+2 849 Kč", „−2 762 Kč". */
const sZnamenkem = (hal: number) => `${hal > 0 ? '+' : ''}${formatKc(hal)}`;

/** Vzorce účtenky odkazují na upozornění appky; ta na pásce nejsou. */
const bezOdkazuNaUpozorneni = (vzorec: string) => vzorec.replace(/\s*Podrobnosti jsou v upozornění\.?/, '');

const doObsahu = (r: RadekUctenky, castka: string): RadekObsahu => ({ popis: r.popis, castka, vzorec: bezOdkazuNaUpozorneni(r.vzorec) });

export function obsahPasky(a: {
  firma: Firma; rok: number; mesic: number; zamestnanec: ZamestnanecPasky; vysledek: VysledekVypoctu; uzavreno?: string | null;
}): ObsahPasky {
  const { firma, zamestnanec: z, vysledek: v } = a;
  const rozpis = rozpisUctenky(v);
  return {
    firma: firma.nazev,
    firmaUdaje: [firma.ico ? `IČO ${firma.ico}` : null, firma.adresa].filter((t): t is string => !!t),
    nadpis: 'Výplatní páska',
    obdobi: nazevMesice(a.rok, a.mesic),
    stav: a.uzavreno
      ? `Uzavřeno ${formatDatum(dnesniDatum(new Date(a.uzavreno)))}`
      : 'Rozpracováno – předběžný výpočet, měsíc není uzavřený',
    jmeno: `${z.jmeno} ${z.prijmeni}`.trim(),
    smlouva: SMLOUVY[z.smlouva],
    // Stejně jako u plateb: účet, který neprojde kontrolou, se nepoužije a výplata jde hotově; u člověka, který už mezi
    // lidmi firmy není, se způsob výplaty nezná.
    ucet: z.ucet === undefined ? 'Způsob výplaty neznámý' : z.ucet && ucetNaIban(z.ucet) ? `Na účet ${z.ucet.trim()}` : 'Vyplácí se hotově',
    hodiny: radkyHodin(v),
    pv: `Průměrný hodinový výdělek ${formatKc(v.pvHal)}`,
    slozky: rozpis.slozky.map((r) => doObsahu(r, formatKc(r.castkaHal))),
    hruba: doObsahu(rozpis.hruba, formatKc(rozpis.hruba.castkaHal)),
    radky: rozpis.radky.map((r) => doObsahu(r, sZnamenkem(r.castkaHal))),
    cista: doObsahu(rozpis.cista, formatKc(rozpis.cista.castkaHal)),
    kVyplate: { popis: 'K výplatě', castka: formatKc(rozpis.kVyplateHal) },
  };
}

/**
 * Text jen ze znaků, které písmo umí (jinak by v PDF byly prázdné čtverečky): NFC, řídicí znaky na mezeru,
 * neznámé znaky pryč.
 */
export function ocistiText(text: string, maGlyf: (znak: string) => boolean): string {
  return [...text.normalize('NFC').replace(/[\t\n\r]/g, ' ')].filter((znak) => znak === ' ' || maGlyf(znak)).join('');
}

/* ---- Vykreslení ---- */

const A4: [number, number] = [595.28, 841.89];
const OKRAJ = 48;
const PRAVY = A4[0] - OKRAJ;
/** Spodní okraj obsahu; pod ním je jen patička. */
const SPODEK = 52;
/** Sloupce rozpisu: popis, výpočet (vzorec), částka zarovnaná vpravo. */
const SIRKA_POPISU = 168;
const X_VZORCE = OKRAJ + SIRKA_POPISU + 12;
const SIRKA_VZORCE = PRAVY - 84 - X_VZORCE;

/** Design tokeny (spec 8): inkoust, tlumený text, linka a jediný akcent — zelená peněz u K výplatě. */
const BARVY = { inkoust: '#16202b', tlumeny: '#5a6878', linka: '#d9e0e7', penize: '#157a4a' } as const;

async function nactiFont(cesta: string): Promise<Uint8Array> {
  const odpoved = await fetch(cesta);
  if (!odpoved.ok) throw new Error(`Písmo ${cesta} se nenačetlo (${odpoved.status}).`);
  return new Uint8Array(await odpoved.arrayBuffer());
}

/** Písmo pro PDF z `public/fonts` (statické TTF s plnou češtinou; prohlížeč si ho po prvním tisku drží v mezipaměti). */
export async function nactiFonty(): Promise<Fonty> {
  const [regular, bold] = await Promise.all([nactiFont('/fonts/Onest-Regular.ttf'), nactiFont('/fonts/Onest-SemiBold.ttf')]);
  return { regular, bold };
}

interface Pero {
  regular: PDFFont;
  bold: PDFFont;
  barva: Record<keyof typeof BARVY, RGB>;
  cisty: (text: string) => string;
}

/** Rozdělí text na řádky do dané šířky (zlom na obyčejné mezeře; nezlomitelné mezery drží částky pohromadě). */
export function zalom(text: string, font: PDFFont, velikost: number, sirka: number): string[] {
  const radky: string[] = [];
  let radek = '';
  for (const slovo of text.split(' ')) {
    const zkus = radek ? `${radek} ${slovo}` : slovo;
    if (font.widthOfTextAtSize(zkus, velikost) <= sirka || !radek) {
      radek = zkus;
    } else {
      radky.push(radek);
      radek = slovo;
    }
  }
  if (radek) radky.push(radek);
  // Slovo delší než celý řádek (dlouhý název bez mezer) se rozdělí po znacích.
  return radky.flatMap((r) => {
    if (font.widthOfTextAtSize(r, velikost) <= sirka) return [r];
    const kusy: string[] = [];
    let kus = '';
    for (const znak of r) {
      if (kus && font.widthOfTextAtSize(kus + znak, velikost) > sirka) { kusy.push(kus); kus = ''; }
      kus += znak;
    }
    return kus ? [...kusy, kus] : kusy;
  });
}

/** Kreslí jednu pásku shora dolů; když dojde místo, pokračuje na další straně. */
class Platno {
  private strana!: PDFPage;
  /** Vzdálenost od horního okraje stránky. */
  private y = 0;

  constructor(
    private readonly pridejStranu: () => PDFPage,
    readonly pero: Pero,
    private readonly pokracovani: string,
    private readonly paticka: string,
  ) {
    this.novaStrana(false);
  }

  private novaStrana(pokracuje: boolean) {
    this.strana = this.pridejStranu();
    this.y = OKRAJ;
    this.text(this.paticka, OKRAJ, A4[1] - 26, { velikost: 7.5, barva: 'tlumeny' });
    if (pokracuje) {
      this.text(this.pokracovani, OKRAJ, this.y + 9, { velikost: 9, barva: 'tlumeny' });
      this.y += 26;
    }
  }

  /** Zajistí místo na řádky o dané výšce, jinak začne novou stranu. */
  misto(vyska: number) {
    if (this.y + vyska > A4[1] - SPODEK) this.novaStrana(true);
  }

  posun(o: number) {
    this.y += o;
  }

  get pozice() {
    return this.y;
  }

  /** Text s účařím `zHora` (od horního okraje stránky); `vpravo` zarovná pravý konec na x. */
  text(text: string, x: number, zHora: number, volby: { velikost: number; tucne?: boolean; barva?: keyof typeof BARVY; vpravo?: boolean }) {
    const font = volby.tucne ? this.pero.bold : this.pero.regular;
    const cisty = this.pero.cisty(text);
    const sirka = font.widthOfTextAtSize(cisty, volby.velikost);
    this.strana.drawText(cisty, {
      x: volby.vpravo ? x - sirka : x, y: A4[1] - zHora, size: volby.velikost, font, color: this.pero.barva[volby.barva ?? 'inkoust'],
    });
    return sirka;
  }

  /** Víceřádkový text do šířky; vrátí počet řádků. */
  odstavec(text: string, x: number, sirka: number, volby: { velikost: number; vyskaRadku: number; tucne?: boolean; barva?: keyof typeof BARVY }) {
    const font = volby.tucne ? this.pero.bold : this.pero.regular;
    const radky = zalom(this.pero.cisty(text), font, volby.velikost, sirka);
    for (const radek of radky) {
      this.misto(volby.vyskaRadku);
      this.y += volby.vyskaRadku;
      this.text(radek, x, this.y - (volby.vyskaRadku - volby.velikost) / 2, volby);
    }
    return radky.length;
  }

  cara(tloustka: number, barva: keyof typeof BARVY, od = OKRAJ, do_ = PRAVY) {
    this.strana.drawLine({ start: { x: od, y: A4[1] - this.y }, end: { x: do_, y: A4[1] - this.y }, thickness: tloustka, color: this.pero.barva[barva] });
  }

  /** Řádek rozpisu ve třech sloupcích: popis, jak částka vznikla (tlumeně, zalomené), částka vpravo. */
  radekCastky(r: RadekObsahu, volby: { tucne?: boolean } = {}) {
    const font = volby.tucne ? this.pero.bold : this.pero.regular;
    const popis = zalom(this.pero.cisty(r.popis), font, 10, SIRKA_POPISU);
    const vzorec = r.vzorec ? zalom(this.pero.cisty(r.vzorec), this.pero.regular, 8, SIRKA_VZORCE) : [];
    const vyska = Math.max(popis.length * 13, vzorec.length * 10.5 + 1.5) + 5;
    // Řádek se nerozdělí na dvě strany.
    this.misto(vyska);
    const prvni = this.y + 12;
    popis.forEach((radek, i) => this.text(radek, OKRAJ, prvni + i * 13, { velikost: 10, tucne: volby.tucne }));
    vzorec.forEach((radek, i) => this.text(radek, X_VZORCE, prvni - 0.5 + i * 10.5, { velikost: 8, barva: 'tlumeny' }));
    this.text(r.castka, PRAVY, prvni, { velikost: 10, tucne: volby.tucne, vpravo: true });
    this.y += vyska;
  }

  /** Nadpis oddílu s popisky sloupců a jemnou čarou pod ním. */
  nadpisOddilu(nadpis: string, sloupce: { text: string; x: number; vpravo?: boolean }[] = []) {
    this.misto(48);
    this.y += 24;
    this.text(nadpis, OKRAJ, this.y, { velikost: 11, tucne: true });
    for (const s of sloupce) this.text(s.text, s.x, this.y, { velikost: 8, barva: 'tlumeny', vpravo: s.vpravo });
    this.y += 6;
    this.cara(0.75, 'linka');
    this.y += 2;
  }
}

function nakresliPasku(platno: Platno, o: ObsahPasky) {
  // Hlavička: firma vlevo, název dokladu, období a stav vpravo.
  const zacatek = platno.pozice;
  platno.text(o.nadpis, PRAVY, zacatek + 18, { velikost: 20, tucne: true, vpravo: true });
  platno.text(o.obdobi, PRAVY, zacatek + 36, { velikost: 12, vpravo: true });
  const stavRadky = zalom(platno.pero.cisty(o.stav), platno.pero.regular, 8.5, 265);
  for (const [i, radek] of stavRadky.entries()) platno.text(radek, PRAVY, zacatek + 51 + i * 11, { velikost: 8.5, barva: 'tlumeny', vpravo: true });
  const konecVpravo = zacatek + 54 + (stavRadky.length - 1) * 11;
  platno.posun(4);
  platno.odstavec(o.firma, OKRAJ, 230, { velikost: 12, vyskaRadku: 16, tucne: true });
  for (const udaj of o.firmaUdaje) platno.odstavec(udaj, OKRAJ, 230, { velikost: 9, vyskaRadku: 13, barva: 'tlumeny' });
  platno.posun(Math.max(0, konecVpravo - platno.pozice) + 12);
  platno.cara(1.25, 'inkoust');

  // Kdo a kam.
  platno.posun(10);
  platno.odstavec(o.jmeno, OKRAJ, PRAVY - OKRAJ, { velikost: 15, vyskaRadku: 20, tucne: true });
  platno.odstavec(`${o.smlouva} · ${o.ucet}`, OKRAJ, PRAVY - OKRAJ, { velikost: 10, vyskaRadku: 15, barva: 'tlumeny' });

  // Hodiny po typech.
  const sloupecHodin = PRAVY - 70;
  platno.nadpisOddilu('Hodiny', [{ text: 'hodiny', x: sloupecHodin, vpravo: true }, { text: 'dny', x: PRAVY, vpravo: true }]);
  for (const h of o.hodiny) {
    platno.misto(14);
    platno.posun(14);
    const odsazeni = h.popis.startsWith('z toho') ? 12 : 0;
    platno.text(h.popis, OKRAJ + odsazeni, platno.pozice - 3.5, { velikost: 10, barva: odsazeni ? 'tlumeny' : 'inkoust' });
    platno.text(h.hodiny, sloupecHodin, platno.pozice - 3.5, { velikost: 10, vpravo: true });
    if (h.dny) platno.text(h.dny, PRAVY, platno.pozice - 3.5, { velikost: 10, vpravo: true });
  }
  platno.posun(4);
  platno.odstavec(o.pv, OKRAJ, PRAVY - OKRAJ, { velikost: 8, vyskaRadku: 11, barva: 'tlumeny' });

  // Mzda: složky, hrubá, odvody, daň, srážky.
  platno.nadpisOddilu('Mzda', [{ text: 'výpočet', x: X_VZORCE }, { text: 'částka', x: PRAVY, vpravo: true }]);
  for (const r of o.slozky) platno.radekCastky(r);
  platno.misto(24);
  platno.posun(3);
  platno.cara(0.75, 'linka');
  platno.radekCastky(o.hruba, { tucne: true });
  for (const r of o.radky) platno.radekCastky(r);

  // K výplatě: dvojitá čára a jediná barevná částka.
  platno.misto(60);
  platno.posun(6);
  platno.cara(0.75, 'inkoust');
  platno.posun(2.5);
  platno.cara(0.75, 'inkoust');
  platno.posun(24);
  platno.text(o.kVyplate.popis, OKRAJ, platno.pozice - 3, { velikost: 13, tucne: true });
  platno.text(o.kVyplate.castka, PRAVY, platno.pozice - 2, { velikost: 18, tucne: true, barva: 'penize', vpravo: true });
  platno.posun(8);
  platno.odstavec(`${o.cista.popis} ${o.cista.castka}. ${o.cista.vzorec}`, OKRAJ, PRAVY - OKRAJ - 120, { velikost: 8, vyskaRadku: 10.5, barva: 'tlumeny' });
}

const dvojmistne = (mesic: number) => String(mesic).padStart(2, '0');

/**
 * Výplatní pásky měsíce v jednom PDF, jedna páska na stranu (delší pokračuje na další). `fonty` jen pro testy,
 * v prohlížeči se načtou z `/fonts`. `uzavreno` = čas uzávěrky; bez něj se páska označí jako rozpracovaná.
 */
export async function vytvorPaskyPdf(a: {
  firma: Firma; rok: number; mesic: number;
  radky: { zamestnanec: ZamestnanecPasky; vysledek: VysledekVypoctu }[];
  uzavreno?: string | null;
  fonty?: Fonty;
}): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkitModul, fonty] = await Promise.all([
    import('pdf-lib'), import('@pdf-lib/fontkit'), a.fonty ? Promise.resolve(a.fonty) : nactiFonty(),
  ]);
  // ES sestavení fontkitu má jen výchozí export, typy jen pojmenované.
  const fontkit = (fontkitModul as unknown as { default?: typeof fontkitModul }).default ?? fontkitModul;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([pdf.embedFont(fonty.regular, { subset: true }), pdf.embedFont(fonty.bold, { subset: true })]);
  const pokryti = fontkit.create(fonty.regular);
  const barva = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
  const pero: Pero = {
    regular, bold,
    barva: { inkoust: barva(BARVY.inkoust), tlumeny: barva(BARVY.tlumeny), linka: barva(BARVY.linka), penize: barva(BARVY.penize) },
    cisty: (text) => ocistiText(text, (znak) => pokryti.hasGlyphForCodePoint(znak.codePointAt(0)!)),
  };

  const obdobi = `${dvojmistne(a.mesic)}/${a.rok}`;
  const paticka = `Vytvořeno ${formatDatum(dnesniDatum())} v appce Mzdy · výpočet podle zákonných parametrů roku ${a.rok}`;
  for (const r of a.radky) {
    const o = obsahPasky({ firma: a.firma, rok: a.rok, mesic: a.mesic, zamestnanec: r.zamestnanec, vysledek: r.vysledek, uzavreno: a.uzavreno });
    const platno = new Platno(() => pdf.addPage(A4), pero, `${o.jmeno} · ${o.obdobi} · pokračování výplatní pásky`, paticka);
    nakresliPasku(platno, o);
  }

  pdf.setTitle(`Výplatní pásky ${obdobi}`, { showInWindowTitleBar: true });
  pdf.setSubject(`${a.firma.nazev}, ${nazevMesice(a.rok, a.mesic).toLowerCase()}`);
  pdf.setAuthor(a.firma.nazev);
  pdf.setCreator('Mzdy');
  pdf.setProducer('Mzdy (pdf-lib)');
  pdf.setLanguage('cs-CZ');
  return pdf.save();
}
