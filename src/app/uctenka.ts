// Rozpis výplaty jako účtenka: složky → hrubá mzda → co se přičítá a odečítá (se znaménkem) → K výplatě. Každý řádek nese
// větu, jak vznikl. Řádky jdou sečíst: hrubá + všechny řádky pod ní = K výplatě (srážky se dopočítají z výsledku, takže
// sedí i u snímku uzávěrky).
import { parametryRoku, type ParametryRoku } from '../core/parametry';
import { formatKc } from '../core/penize';
import type { VysledekVypoctu } from '../core/typy';

export interface RadekUctenky {
  klic: string;
  popis: string;
  /** Haléře se znaménkem: srážky a odvody záporně. */
  castkaHal: number;
  vzorec: string;
}

export interface RozpisUctenky {
  slozky: RadekUctenky[];
  hruba: RadekUctenky;
  /** Řádky pod hrubou mzdou; hrubá + jejich součet = K výplatě. */
  radky: RadekUctenky[];
  kVyplateHal: number;
  cista: RadekUctenky;
  naklad: RadekUctenky;
}

const kc = (castkaKc: number) => formatKc(castkaKc * 100);
const procento = (promile: number) => `${String(promile / 10).replace('.', ',')} %`;

/** Počet nároků na stravné (směna ≥ 3 h = 1, nad 11 h = 2), ne počet směn. */
function narokyText(pocet: number): string {
  const tvar = pocet === 1 ? 'nárok' : pocet >= 2 && pocet <= 4 ? 'nároky' : 'nároků';
  return `${pocet} ${tvar} na stravenkový paušál`;
}

function radkyDane(v: VysledekVypoctu, p: ParametryRoku): RadekUctenky[] {
  const d = v.dan;
  const hraniceKc = p.hraniceDan23Kc;
  if (d.rezim === 'SRAZKOVA') {
    return [{ klic: 'DAN', popis: 'Srážková daň', castkaHal: -d.danKc * 100,
      vzorec: `15 % z příjmu ${kc(d.zakladKc)}, dolů na celé koruny. Bez prohlášení a s příjmem pod hranicí se daň jen srazí, slevy se neuplatní.` }];
  }
  const nad = Math.max(0, d.zakladKc - hraniceKc);
  // Základ do 100 Kč se zaokrouhluje jen na celé koruny, vyšší na celé stovky.
  const zaokrouhleni = d.zakladKc > 100 ? 'na stovky' : 'na koruny';
  const zaloha: RadekUctenky = { klic: 'DAN', popis: 'Záloha na daň', castkaHal: -d.zalohaKc * 100,
    vzorec: nad > 0
      ? `15 % z ${kc(hraniceKc)} a 23 % z ${kc(nad)} (základ ${kc(d.zakladKc)} je vyměřovací základ zaokrouhlený ${zaokrouhleni} nahoru).`
      : `15 % ze základu ${kc(d.zakladKc)} (vyměřovací základ zaokrouhlený ${zaokrouhleni} nahoru), výsledek nahoru na celé koruny.` };
  const radky = [zaloha];
  // Zvýhodnění na děti snižuje daň nejvýš na nulu; co zbude, je bonus.
  const uplatneneZvyhodneniKc = Math.min(d.zvyhodneniKc, d.zalohaKc - d.slevyKc);
  if (d.slevyKc + uplatneneZvyhodneniKc > 0) {
    const casti = [d.slevyKc > 0 && `slevy ${kc(d.slevyKc)}`, uplatneneZvyhodneniKc > 0 && `zvýhodnění na děti ${kc(uplatneneZvyhodneniKc)}`].filter(Boolean);
    radky.push({ klic: 'SLEVY', popis: 'Slevy na dani', castkaHal: (d.slevyKc + uplatneneZvyhodneniKc) * 100,
      vzorec: `${casti.join(' a ')}; odečítají se od zálohy, nejvýš do její výše.`.replace(/^./, (c) => c.toUpperCase()) });
  }
  const vypocitanyBonusKc = d.zvyhodneniKc - (d.zalohaKc - d.slevyKc);
  if (d.bonusKc > 0) {
    radky.push({ klic: 'BONUS', popis: 'Daňový bonus', castkaHal: d.bonusKc * 100,
      vzorec: `Zvýhodnění na děti ${kc(d.zvyhodneniKc)} je vyšší než daň po slevách, rozdíl se vyplácí.` });
  } else if (vypocitanyBonusKc > 0) {
    // Bonus vyšel, ale zákon ho nedovolí vyplatit: je pod 50 Kč, nebo je příjem pod polovinou minimální mzdy.
    const proc = vypocitanyBonusKc < p.minBonusKc
      ? `bonus pod ${kc(p.minBonusKc)} se nevyplácí`
      : `příjem v měsíci je pod polovinou minimální mzdy (${kc(p.minPrijemBonusKc)})`;
    radky.push({ klic: 'BONUS', popis: 'Daňový bonus se nevyplácí', castkaHal: 0,
      vzorec: `Zvýhodnění na děti ${kc(d.zvyhodneniKc)} je o ${kc(vypocitanyBonusKc)} vyšší než daň po slevách, ale ${proc}.` });
  }
  return radky;
}

export function rozpisUctenky(v: VysledekVypoctu): RozpisUctenky {
  const p = parametryRoku(v.parametry.rok);
  const poj = v.pojisteni;
  const slozky = v.slozky.map((s) => ({ klic: s.kod, popis: s.popis, castkaHal: s.castkaHal, vzorec: s.vzorec }));
  const hruba = { klic: 'HRUBA', popis: 'Hrubá mzda', castkaHal: v.hrubaHal,
    vzorec: slozky.length > 0 ? 'Součet složek nad čarou.' : 'V měsíci není nic k proplacení.' };

  const radky: RadekUctenky[] = [];
  if (v.nahradaNemocHal > 0) {
    radky.push({ klic: 'NEMOC', popis: 'Náhrada za nemoc', castkaHal: v.nahradaNemocHal,
      vzorec: `${v.nahradaNemocVzorec}. Nedaní se a neplatí se z ní pojištění.` });
  }
  if (v.stravne.smen > 0) {
    const zdanitelne = v.stravne.zdanitelneHal > 0 ? `; ${formatKc(v.stravne.zdanitelneHal)} nad osvobozený limit se daní a pojišťuje` : '';
    radky.push({ klic: 'STRAVNE', popis: 'Stravenkový paušál', castkaHal: v.stravne.celkemHal,
      vzorec: `${narokyText(v.stravne.smen)} × ${formatKc(v.stravne.celkemHal / v.stravne.smen)}${zdanitelne}` });
  }
  radky.push({ klic: 'SP', popis: 'Sociální pojištění', castkaHal: -poj.socialniZamKc * 100,
    vzorec: poj.socialniZamKc > 0
      ? `${procento(p.spZamPromile)} z vyměřovacího základu ${kc(v.vzKc)}, nahoru na celé koruny.`
      : 'Z tohoto příjmu se sociální pojištění neplatí.' });
  radky.push({ klic: 'ZP', popis: 'Zdravotní pojištění', castkaHal: -poj.zdravotniZamKc * 100,
    vzorec: poj.zdravotniZamKc > 0
      ? `${procento(p.zpCelkemPromile / 3)} z ${kc(v.vzKc)} (třetina celkového pojistného), nahoru na celé koruny.`
      : 'Z tohoto příjmu se zdravotní pojištění neplatí.' });
  if (poj.doplatekZpKc > 0) {
    radky.push({ klic: 'ZP_DOPLATEK', popis: 'Doplatek zdravotního do minima', castkaHal: -poj.doplatekZpKc * 100,
      vzorec: `Vyměřovací základ je pod minimálním základem; zaměstnanec doplácí ${procento(p.zpCelkemPromile)} z rozdílu. Podrobnosti jsou v upozornění.` });
  }
  radky.push(...radkyDane(v, p));
  const srazkyHal = v.cistaHal + v.nahradaNemocHal + v.stravne.osvobozenoHal - v.kVyplateHal;
  if (srazkyHal !== 0) {
    radky.push({ klic: 'SRAZKY', popis: 'Srážky', castkaHal: -srazkyHal, vzorec: 'Zadané u odměn měsíce, např. vyplacená záloha.' });
  }

  const sleva = poj.slevaPojistneKc > 0 ? ` − sleva 5 % ${kc(poj.slevaPojistneKc)}` : '';
  const nemoc = v.nahradaNemocHal > 0 ? ` + náhrada za nemoc ${formatKc(v.nahradaNemocHal)}` : '';
  return {
    slozky, hruba, radky, kVyplateHal: v.kVyplateHal,
    cista: { klic: 'CISTA', popis: 'Čistá mzda', castkaHal: v.cistaHal,
      vzorec: 'Hrubá mzda + zdanitelná část stravného − pojištění − daň + bonus. K výplatě se k ní přičte náhrada za nemoc a osvobozené stravné a odečtou srážky.' },
    naklad: { klic: 'NAKLAD', popis: 'Náklad firmy', castkaHal: v.nakladFirmyHal,
      vzorec: `Hrubá mzda ${formatKc(v.hrubaHal)}${nemoc} + stravné ${formatKc(v.stravne.celkemHal)} + sociální za firmu ${kc(poj.socialniFirmaKc)}${sleva} + zdravotní za firmu ${kc(poj.zdravotniFirmaKc)}.` },
  };
}
