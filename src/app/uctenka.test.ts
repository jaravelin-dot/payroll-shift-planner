import { formatKc } from '../core/penize';
import { den, dnyPrace, sazba, vstup, vstupVypoctu, zam } from '../core/test-utils';
import type { VysledekVypoctu } from '../core/typy';
import { vypocitejMzdu } from '../core/vypocet';
import { rozpisUctenky } from './uctenka';

const PRAC10 = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'];
const scenarA = [
  ...dnyPrace(PRAC10, 8, true),
  ...dnyPrace(['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'], 8),
  den('2026-10-03', 'PRACE', 6), den('2026-10-10', 'PRACE', 6), den('2026-10-11', 'PRACE', 5),
  den('2026-10-28', 'PRACE', 8), den('2026-10-30', 'DOVOLENA', 8),
];
const vysledekA = () => vypocitejMzdu(vstupVypoctu({ dny: scenarA, prumernyVydelekHal: 19000, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }));

/** Účtenka musí jít sečíst: hrubá a všechno pod ní (se znaménky) dává přesně K výplatě, složky dávají hrubou. */
function overSoucty(v: VysledekVypoctu) {
  const r = rozpisUctenky(v);
  expect(r.slozky.reduce((s, x) => s + x.castkaHal, 0)).toBe(v.hrubaHal);
  expect(r.hruba.castkaHal + r.radky.reduce((s, x) => s + x.castkaHal, 0)).toBe(v.kVyplateHal);
  expect(r.kVyplateHal).toBe(v.kVyplateHal);
  return r;
}

test('scénář A: řádky, znaménka a součet do K výplatě 31 422 Kč', () => {
  const r = overSoucty(vysledekA());
  expect(r.hruba.castkaHal).toBe(3544000);
  expect(r.radky.map((x) => [x.popis, x.castkaHal])).toEqual([
    ['Stravenkový paušál', 284900],
    ['Sociální pojištění', -251700],
    ['Zdravotní pojištění', -159500],
    ['Záloha na daň', -532500],
    ['Slevy na dani', 257000],
  ]);
  expect(r.radky[0]!.vzorec).toBe('22 nároků na stravenkový paušál × 129,50 Kč');
  expect(r.radky[1]!.vzorec).toContain('7,1 %');
  expect(r.radky[1]!.vzorec).toContain('35 440 Kč');
  expect(r.radky[3]!.vzorec).toContain('35 500 Kč');
  expect(r.radky[3]!.vzorec).toContain('zaokrouhlený na stovky nahoru');
  expect(r.cista.castkaHal).toBe(2857300);
  expect(r.naklad.castkaHal).toBe(5026900);
});

test('vzorec zdravotního pojištění ukazuje jen podíl zaměstnance, ne celkové pojistné ani podíl firmy', () => {
  const v = vysledekA();
  const zp = rozpisUctenky(v).radky.find((x) => x.klic === 'ZP')!;
  expect(zp.vzorec).toBe(`4,5 % z ${formatKc(3544000)} (třetina celkového pojistného), nahoru na celé koruny.`);
  expect(zp.vzorec).not.toMatch(/firm|13,5/);
  expect(zp.vzorec).not.toContain(formatKc((v.pojisteni.zdravotniZamKc + v.pojisteni.zdravotniFirmaKc) * 100));
});

test('srážková daň (DPP pod hranicí bez prohlášení): bez pojištění, jen srážková daň', () => {
  const v = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }), sazby: [sazba(180)],
    dny: dnyPrace(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'], 8), prumernyVydelekHal: 18000 }));
  const r = overSoucty(v);
  expect(r.radky.find((x) => x.popis === 'Srážková daň')!.castkaHal).toBe(-108000);
  expect(r.radky.find((x) => x.popis === 'Sociální pojištění')!.vzorec).toMatch(/neplatí/);
  expect(r.radky.some((x) => x.popis === 'Záloha na daň')).toBe(false);
});

test('dítě s daňovým bonusem, srážky a náhrada za nemoc se sečtou správně', () => {
  const v = vypocitejMzdu(vstupVypoctu({
    zamestnanec: zam({ deti: [{ ztpp: false }, { ztpp: true }] }), sazby: [sazba(180)], prumernyVydelekHal: 20000,
    dny: [...dnyPrace(PRAC10.slice(0, 9), 8), den('2026-10-15', 'NEMOC', 8), den('2026-10-16', 'NEMOC', 8)],
    vstup: vstup({ srazkyHal: 150000 }),
  }));
  expect(v.dan.bonusKc).toBeGreaterThan(0);
  expect(v.nahradaNemocHal).toBeGreaterThan(0);
  const r = overSoucty(v);
  const popisy = r.radky.map((x) => x.popis);
  expect(popisy).toEqual(expect.arrayContaining(['Náhrada za nemoc', 'Daňový bonus', 'Srážky']));
  expect(r.radky.find((x) => x.popis === 'Srážky')!.castkaHal).toBe(-150000);
  expect(popisy.indexOf('Náhrada za nemoc')).toBeLessThan(popisy.indexOf('Stravenkový paušál'));
});

test('doplatek zdravotního pojištění do minima je samostatný řádek', () => {
  const v = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 1200 }), sazby: [sazba(170)], dny: dnyPrace(PRAC10, 6), prumernyVydelekHal: 17000 }));
  const r = overSoucty(v);
  expect(r.radky.find((x) => x.popis === 'Doplatek zdravotního do minima')!.castkaHal).toBe(-164700);
});

test('základ zálohy do 100 Kč se zaokrouhluje jen na koruny', () => {
  const v = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP', prohlaseni: true }), sazby: [sazba(140)],
    dny: dnyPrace(['2026-10-05'], 0.5), prumernyVydelekHal: 14000 }));
  expect(v.dan.rezim).toBe('ZALOHA');
  expect(v.dan.zakladKc).toBeLessThanOrEqual(100);
  const zaloha = overSoucty(v).radky.find((x) => x.popis === 'Záloha na daň')!;
  expect(zaloha.vzorec).toContain('zaokrouhlený na koruny nahoru');
  expect(zaloha.vzorec).not.toContain('stovky');
});

test('bonus na dítě, který se kvůli nízkému příjmu nevyplácí, má vysvětlující řádek', () => {
  const v = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ deti: [{ ztpp: false }] }), sazby: [sazba(165)],
    dny: dnyPrace(['2026-10-05'], 4), prumernyVydelekHal: 16500 }));
  expect(v.dan.bonusKc).toBe(0);
  const r = overSoucty(v);
  const bonus = r.radky.find((x) => x.klic === 'BONUS')!;
  expect(bonus.popis).toBe('Daňový bonus se nevyplácí');
  expect(bonus.castkaHal).toBe(0);
  expect(bonus.vzorec).toMatch(/je o 1\s267 Kč vyšší než daň po slevách, ale příjem v měsíci je pod polovinou minimální mzdy \(11\s200 Kč\)\./);
});

test('bonus pod 50 Kč se nevyplácí a řádek řekne proč', () => {
  const PRAC20 = [...PRAC10, '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-29'];
  const v = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ deti: [{ ztpp: false }] }), sazby: [sazba(158.75)], dny: dnyPrace(PRAC20, 8), prumernyVydelekHal: 15875 }));
  const vypocitany = v.dan.zvyhodneniKc - (v.dan.zalohaKc - v.dan.slevyKc);
  expect(vypocitany).toBeGreaterThan(0);
  expect(vypocitany).toBeLessThan(50);
  expect(v.dan.bonusKc).toBe(0);
  const bonus = overSoucty(v).radky.find((x) => x.klic === 'BONUS')!;
  expect(bonus.popis).toBe('Daňový bonus se nevyplácí');
  expect(bonus.vzorec).toContain(`je o ${vypocitany} Kč vyšší než daň po slevách, ale bonus pod 50 Kč se nevyplácí.`);
});

test('bez dětí řádek bonusu není', () => {
  const r = overSoucty(vysledekA());
  expect(r.radky.some((x) => x.klic === 'BONUS')).toBe(false);
});
