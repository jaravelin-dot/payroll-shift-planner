// Excel pro účetního (spec 7): list Podklad (tvar ručního přehledu pro účetní, spec 2026-10-07), list Souhrn (řádek na
// člověka se všemi složkami) a list Docházka (po dnech).
// Čísla jsou čísla (Kč, hodiny, dny), ne text, aby s nimi účetní mohla počítat. exceljs je velký, proto se načítá
// dynamickým importem až při stažení.
import type { Workbook, Worksheet } from 'exceljs';
import type { KodSlozky, VysledekVypoctu } from '../../core/typy';
import type { Firma, MesicData } from '../../shared/api';
import { TYPY_DNU, nazevMesice } from '../dochazka';
import type { RadekVyplaty } from '../radkyVyplat';
import { NADPISY_BRIGADNIKU, NADPISY_FONDU, NADPISY_ZAMESTNANCU, podkladUcetni, radkyProUcetni, type Podklad } from './podklad';
import { nazevSouboru } from './stahni';

export const TYP_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Formáty buněk se v souboru ukládají v anglickém zápisu; Excel je zobrazí podle jazyka systému (česky „1 234,50 Kč").
 */
const FORMAT_KC = '#,##0.00 "Kč";-#,##0.00 "Kč"';
const FORMAT_HODIN = '0.00';
const FORMAT_POCTU = '0';
const FORMAT_DATA = 'd. m. yyyy';

type TypSloupce = 'text' | 'kc' | 'hodiny' | 'pocet';

export interface SloupecSouhrnu {
  nadpis: string;
  typ: TypSloupce;
  sirka: number;
  hodnota: (r: RadekVyplaty) => string | number;
  /** Vysvětlivka v poznámce záhlaví, kde název sloupce nestačí. */
  poznamka?: string;
}

const hodin = (minuty: number) => minuty / 60;
const kc = (hal: number) => hal / 100;
const slozka = (v: VysledekVypoctu, ...kody: KodSlozky[]) => kc(v.slozky.filter((s) => kody.includes(s.kod)).reduce((soucet, s) => soucet + s.castkaHal, 0));
export const jmenoProUcetni = (r: { jmeno: string; prijmeni: string }) => `${r.prijmeni} ${r.jmeno}`.trim();

/**
 * Složky hrubé mzdy podle kódu z jádra. `Record` hlídá, že žádná složka v Excelu nechybí (jinak by součet složek
 * nedával hrubou mzdu); pořadí sloupců je pořadí klíčů.
 */
const SLOZKY_HRUBE_MZDY: Record<KodSlozky, { nadpis: string; sirka: number; poznamka?: string }> = {
  ZAKLAD: { nadpis: 'Základ', sirka: 13, poznamka: 'Odpracované hodiny × hodinová sazba.' },
  ODMENA_ZA_DEN: { nadpis: 'Odměna za den', sirka: 13 },
  AKTIVITA: { nadpis: 'Aktivita', sirka: 13 },
  PRIPLATEK_SOBOTA: { nadpis: 'Příplatek So', sirka: 13 },
  PRIPLATEK_NEDELE: { nadpis: 'Příplatek Ne', sirka: 13 },
  KASA: { nadpis: 'Kasa', sirka: 13 },
  PRIPLATEK_SVATEK: { nadpis: 'Příplatek za svátek', sirka: 14, poznamka: 'Příplatek za práci ve svátek.' },
  JINE_ODMENY: { nadpis: 'Jiné odměny', sirka: 13 },
  DOPLATEK_MIN_MZDA: { nadpis: 'Doplatek do min. mzdy', sirka: 14, poznamka: 'Doplatek, když mzda a odměny nedosahují minimální mzdy.' },
  NAHRADA_DOVOLENA: { nadpis: 'Náhrada za dovolenou', sirka: 14 },
  NAHRADA_SVATEK: { nadpis: 'Náhrada za svátek', sirka: 14, poznamka: 'Náhrada mzdy za svátek, kdy bylo zavřeno.' },
  NAHRADA_NAHRADNI_VOLNO: { nadpis: 'Náhrada za náhradní volno', sirka: 14 },
};

const SLOUPCE_SLOZEK: SloupecSouhrnu[] = (Object.keys(SLOZKY_HRUBE_MZDY) as KodSlozky[]).map((kod) => ({
  ...SLOZKY_HRUBE_MZDY[kod], typ: 'kc', hodnota: (r) => slozka(r.vysledek, kod),
}));

/** Záloha na daň před slevami, u srážkové daně celá srážková daň (Kč). */
const zalohaNeboSrazkova = (v: VysledekVypoctu) => (v.dan.rezim === 'SRAZKOVA' ? v.dan.danKc : v.dan.zalohaKc);
/** Slevy a uplatněné zvýhodnění na děti: o tolik je daň nižší než záloha, u srážkové daně nula (Kč). */
const slevyNaDani = (v: VysledekVypoctu) => zalohaNeboSrazkova(v) - v.dan.danKc;
/** Srážky se dopočítávají stejně jako v účtence, takže sedí i u snímku uzávěrky. */
const srazky = (v: VysledekVypoctu) => kc(v.cistaHal + v.nahradaNemocHal + v.stravne.osvobozenoHal - v.kVyplateHal);
const odvodyFirmy = (v: VysledekVypoctu) => v.pojisteni.socialniFirmaKc - v.pojisteni.slevaPojistneKc + v.pojisteni.zdravotniFirmaKc;

/**
 * Sloupce jdou v pořadí výpočtu, aby šel každý řádek sečíst: složky mzdy → Hrubá mzda; Hrubá mzda + zdanitelné stravenky
 * − pojistné − záloha + slevy + bonus → Čistá; Čistá + náhrada za nemoc + osvobozené stravenky − srážky → K výplatě.
 * Poslední tři sloupce jsou souhrnné údaje mimo tyhle součty.
 */
export const SLOUPCE_SOUHRNU: SloupecSouhrnu[] = [
  { nadpis: 'Jméno', typ: 'text', sirka: 24, hodnota: jmenoProUcetni },
  { nadpis: 'Smlouva', typ: 'text', sirka: 9, hodnota: (r) => r.smlouva },
  { nadpis: 'Hodiny Po–Pá', typ: 'hodiny', sirka: 10, hodnota: (r) => hodin(r.vysledek.hodiny.praceVsedniMin), poznamka: 'Odpracované hodiny ve všední dny mimo svátky.' },
  { nadpis: 'Dny Po–Pá', typ: 'pocet', sirka: 8, hodnota: (r) => r.vysledek.hodiny.dnyVsedni },
  { nadpis: 'Hodiny So', typ: 'hodiny', sirka: 10, hodnota: (r) => hodin(r.vysledek.hodiny.sobotaMin) },
  { nadpis: 'Dny So', typ: 'pocet', sirka: 8, hodnota: (r) => r.vysledek.hodiny.dnySobota },
  { nadpis: 'Hodiny Ne', typ: 'hodiny', sirka: 10, hodnota: (r) => hodin(r.vysledek.hodiny.nedeleMin) },
  { nadpis: 'Dny Ne', typ: 'pocet', sirka: 8, hodnota: (r) => r.vysledek.hodiny.dnyNedele },
  { nadpis: 'Hodiny svátky', typ: 'hodiny', sirka: 10, hodnota: (r) => hodin(r.vysledek.hodiny.svatekPraceMin + r.vysledek.hodiny.svatekZavrenoMin),
    poznamka: 'Práce ve svátek i svátek, kdy bylo zavřeno (náhrada mzdy).' },
  { nadpis: 'Dny svátky', typ: 'pocet', sirka: 8, hodnota: (r) => r.vysledek.hodiny.dnySvatek + r.vysledek.hodiny.dnySvatekZavreno },
  { nadpis: 'Neschopenka h', typ: 'hodiny', sirka: 11, hodnota: (r) => hodin(r.vysledek.hodiny.nemocMin) },
  { nadpis: 'Neschopenka dny', typ: 'pocet', sirka: 11, hodnota: (r) => r.vysledek.hodiny.dnyNemocKalendarni, poznamka: 'Kalendářní dny neschopenky v měsíci.' },
  { nadpis: 'Dovolená h', typ: 'hodiny', sirka: 10, hodnota: (r) => hodin(r.vysledek.hodiny.dovolenaMin) },
  { nadpis: 'Dovolená dny', typ: 'pocet', sirka: 10, hodnota: (r) => r.vysledek.hodiny.dnyDovolena },
  { nadpis: 'Stravenky (nároků)', typ: 'pocet', sirka: 12, hodnota: (r) => r.vysledek.stravne.smen,
    poznamka: 'Počet nároků na stravenkový paušál: směna od 3 hodin = 1, nad 11 hodin = 2 (ne počet směn).' },
  { nadpis: 'Stravenky Kč', typ: 'kc', sirka: 13, hodnota: (r) => kc(r.vysledek.stravne.celkemHal), poznamka: 'Stravenkový paušál celkem = zdanitelná + osvobozená část.' },
  ...SLOUPCE_SLOZEK,
  { nadpis: 'Hrubá mzda', typ: 'kc', sirka: 14, hodnota: (r) => kc(r.vysledek.hrubaHal), poznamka: 'Součet složek mzdy vlevo (bez náhrady za nemoc a stravenek).' },
  { nadpis: 'Stravenky zdanitelné', typ: 'kc', sirka: 14, hodnota: (r) => kc(r.vysledek.stravne.zdanitelneHal),
    poznamka: 'Část stravenkového paušálu nad osvobozený limit: daní se a pojišťuje, přičítá se k hrubé mzdě.' },
  { nadpis: 'SP zaměstnanec', typ: 'kc', sirka: 13, hodnota: (r) => r.vysledek.pojisteni.socialniZamKc, poznamka: 'Sociální pojištění zaměstnance; odečítá se.' },
  { nadpis: 'ZP zaměstnanec', typ: 'kc', sirka: 13, hodnota: (r) => r.vysledek.pojisteni.zdravotniZamKc, poznamka: 'Zdravotní pojištění zaměstnance; odečítá se.' },
  { nadpis: 'Doplatek ZP', typ: 'kc', sirka: 12, hodnota: (r) => r.vysledek.pojisteni.doplatekZpKc,
    poznamka: 'Doplatek zdravotního pojištění do minimálního základu; odečítá se.' },
  { nadpis: 'Záloha / srážková daň', typ: 'kc', sirka: 14, hodnota: (r) => zalohaNeboSrazkova(r.vysledek), poznamka: 'Záloha na daň před slevami, nebo srážková daň; odečítá se.' },
  { nadpis: 'Slevy na dani', typ: 'kc', sirka: 13, hodnota: (r) => slevyNaDani(r.vysledek),
    poznamka: 'Slevy a daňové zvýhodnění na děti uplatněné proti záloze; přičítá se.' },
  { nadpis: 'Daňový bonus', typ: 'kc', sirka: 13, hodnota: (r) => r.vysledek.dan.bonusKc, poznamka: 'Daňový bonus na děti; přičítá se.' },
  { nadpis: 'Čistá', typ: 'kc', sirka: 14, hodnota: (r) => kc(r.vysledek.cistaHal),
    poznamka: 'Hrubá mzda + stravenky zdanitelné − SP − ZP − doplatek ZP − záloha/srážková daň + slevy na dani + daňový bonus.' },
  { nadpis: 'Náhrada za nemoc', typ: 'kc', sirka: 13, hodnota: (r) => kc(r.vysledek.nahradaNemocHal), poznamka: 'Nedaní se a neplatí se z ní pojištění; přičítá se.' },
  { nadpis: 'Stravenky osvobozené', typ: 'kc', sirka: 14, hodnota: (r) => kc(r.vysledek.stravne.osvobozenoHal), poznamka: 'Osvobozená část stravenkového paušálu; přičítá se.' },
  { nadpis: 'Srážky', typ: 'kc', sirka: 12, hodnota: (r) => srazky(r.vysledek), poznamka: 'Srážky z výplaty (např. vyplacená záloha); odečítají se.' },
  { nadpis: 'K výplatě', typ: 'kc', sirka: 14, hodnota: (r) => kc(r.vysledek.kVyplateHal),
    poznamka: 'Čistá + náhrada za nemoc + stravenky osvobozené − srážky.' },
  { nadpis: 'Daň po slevách', typ: 'kc', sirka: 13, hodnota: (r) => r.vysledek.dan.danKc,
    poznamka: 'Záloha nebo srážková daň po slevách, tedy daň k odvodu. V součtu čisté mzdy už je (záloha − slevy), nepřičítat znovu.' },
  { nadpis: 'Odvody firmy', typ: 'kc', sirka: 13, hodnota: (r) => odvodyFirmy(r.vysledek), poznamka: 'Sociální a zdravotní pojištění za firmu po případné slevě 5 %.' },
  { nadpis: 'Náklad firmy', typ: 'kc', sirka: 14, hodnota: (r) => kc(r.vysledek.nakladFirmyHal),
    poznamka: 'Hrubá mzda + náhrada za nemoc + stravenky Kč + odvody firmy.' },
];

const FORMATY: Record<TypSloupce, string | undefined> = { text: undefined, kc: FORMAT_KC, hodiny: FORMAT_HODIN, pocet: FORMAT_POCTU };

/** Záhlaví listu: tučně, jemné podbarvení, ukotvené při posouvání (volitelně i první sloupec, u širokého souhrnu Jméno). */
function zahlavi(list: Worksheet, zmrazitPrvniSloupec = false) {
  const radek = list.getRow(1);
  radek.font = { bold: true };
  radek.alignment = { vertical: 'middle', wrapText: true };
  radek.height = 32;
  radek.eachCell((bunka) => {
    bunka.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F7' } };
    bunka.border = { bottom: { style: 'thin', color: { argb: 'FFD9E0E7' } } };
  });
  list.views = [{ state: 'frozen', ySplit: 1, ...(zmrazitPrvniSloupec ? { xSplit: 1 } : {}) }];
}

const datumExcelu = (datum: string) => {
  const [rok, mesic, den] = datum.split('-').map(Number);
  // exceljs převádí datum přes UTC; půlnoc UTC je tedy přesně ten den.
  return new Date(Date.UTC(rok!, mesic! - 1, den));
};

/**
 * List Podklad (spec 2026-10-07): tabulka ve tvaru ručního přehledu pro účetní — záhlaví, fond pracovní doby,
 * zaměstnanci a brigádníci (DPP). Hodiny a dny bez pevného formátu (84, 62,5), peníze ve formátu Kč.
 */
function listPodkladu(kniha: Workbook, p: Podklad) {
  const list = kniha.addWorksheet('Podklad');
  list.columns = [{ width: 26 }, ...Array.from({ length: 8 }, () => ({ width: 11 })), { width: 14 }, { width: 40 }];
  // Hodiny na 2 desetinná místa jako v PDF (číslo zůstává číslem); štítek úvazku česky, např. „37,5“.
  const hodiny = (min: number) => Math.round((min / 60) * 100) / 100;
  const formatHodin = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
  const zahlaviTabulky = (radek: number) => {
    const r = list.getRow(radek);
    r.font = { bold: true };
    r.alignment = { vertical: 'middle', wrapText: true };
    r.eachCell((bunka) => { bunka.border = { bottom: { style: 'thin' } }; });
  };

  list.addRow([`${p.zahlavi.firma} — podklad pro mzdy`]).font = { bold: true, size: 14 };
  list.addRow([`měsíc: ${p.zahlavi.nazevMesice}, ${p.zahlavi.pracovniDny} pracovních dní`]);
  list.addRow([p.zahlavi.stav]).font = { color: { argb: 'FF5A6878' } };
  list.addRow([]);

  zahlaviTabulky(list.addRow(NADPISY_FONDU).number);
  for (const f of p.zahlavi.fond) list.addRow([`úvazek ${formatHodin.format(f.uvazekMin / 60)} h týdně`, hodiny(f.denneMin), hodiny(f.mesicMin)]);
  list.addRow([]);

  zahlaviTabulky(list.addRow(NADPISY_ZAMESTNANCU).number);
  for (const r of p.zamestnanci) {
    const radek = list.addRow([
      r.jmeno, r.uvazekMin === null ? null : hodiny(r.uvazekMin), r.hodinVMesiciMin === null ? null : hodiny(r.hodinVMesiciMin),
      hodiny(r.odpracovanoMin), hodiny(r.vikendMin), hodiny(r.svatekMin), r.dnyDovolene, r.dnyNemoci, r.dnyStravenek,
      r.odmenaHal / 100, r.potrebujeme || null,
    ]);
    radek.getCell(10).numFmt = FORMAT_KC;
    radek.getCell(11).alignment = { wrapText: true, vertical: 'top' };
  }

  if (p.brigadnici.length > 0) {
    list.addRow([]);
    const nadpis = list.addRow(['Brigádníci (DPP)', ...NADPISY_BRIGADNIKU.slice(1)]);
    zahlaviTabulky(nadpis.number);
    for (const r of p.brigadnici) {
      const radek = list.addRow([r.jmeno, hodiny(r.odpracovanoMin), r.mzdaHal / 100, r.zpusobPlatby || null, r.potrebujeme || null]);
      radek.getCell(3).numFmt = FORMAT_KC;
    }
  }
}

export function nazevExcelu(firma: Pick<Firma, 'nazev'>, rok: number, mesic: number): string {
  return `mzdy-${nazevSouboru(firma.nazev)}-${rok}-${String(mesic).padStart(2, '0')}.xlsx`;
}

/** Sešit pro účetního za měsíc: uzavřený měsíc ze snímku uzávěrky, otevřený z přepočtu (`vysledky` z `useVypocet`). */
export async function vytvorExcel(a: { firma: Firma; rok: number; mesic: number; data: MesicData; vysledky: Map<string, VysledekVypoctu> }): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const radky = radkyProUcetni(a.data, a.vysledky);
  const kniha = new ExcelJS.Workbook();
  kniha.creator = 'Mzdy';
  kniha.created = new Date();
  kniha.title = `Mzdy ${a.firma.nazev} – ${nazevMesice(a.rok, a.mesic).toLowerCase()}`;
  kniha.subject = a.data.uzaverka ? 'Uzavřený měsíc (snímek uzávěrky)' : 'Rozpracovaný měsíc – předběžný výpočet, měsíc není uzavřený';

  listPodkladu(kniha, podkladUcetni(a.data, a.vysledky));

  const souhrn = kniha.addWorksheet('Souhrn');
  souhrn.columns = SLOUPCE_SOUHRNU.map((s) => ({ header: s.nadpis, width: s.sirka, style: FORMATY[s.typ] ? { numFmt: FORMATY[s.typ] } : {} }));
  for (const r of radky) souhrn.addRow(SLOUPCE_SOUHRNU.map((s) => s.hodnota(r)));
  SLOUPCE_SOUHRNU.forEach((s, i) => {
    if (s.poznamka) souhrn.getRow(1).getCell(i + 1).note = s.poznamka;
  });
  zahlavi(souhrn, true);

  const dochazka = kniha.addWorksheet('Docházka');
  dochazka.columns = [
    { header: 'Datum', width: 12, style: { numFmt: FORMAT_DATA } },
    { header: 'Jméno', width: 24 },
    { header: 'Typ', width: 18 },
    { header: 'Hodiny', width: 9, style: { numFmt: FORMAT_HODIN } },
    { header: 'Kasa', width: 7 },
    { header: 'Poznámka', width: 40 },
  ];
  const mesicKlic = `${String(a.rok).padStart(4, '0')}-${String(a.mesic).padStart(2, '0')}`;
  const lide = new Map(radky.map((r) => [r.zamestnanecId, jmenoProUcetni(r)]));
  const dny = a.data.dny
    .filter((d) => d.datum.startsWith(mesicKlic) && lide.has(d.zamestnanecId))
    .map((d) => ({ ...d, jmeno: lide.get(d.zamestnanecId)! }))
    .sort((x, y) => x.datum.localeCompare(y.datum) || x.jmeno.localeCompare(y.jmeno, 'cs'));
  for (const d of dny) {
    dochazka.addRow([datumExcelu(d.datum), d.jmeno, TYPY_DNU[d.typ].nazev, hodin(d.minuty), d.kasa ? 'ano' : '', d.poznamka ?? '']);
  }
  zahlavi(dochazka);

  const obsah = await kniha.xlsx.writeBuffer();
  return new Blob([obsah as ArrayBuffer], { type: TYP_XLSX });
}
