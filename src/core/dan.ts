// Měsíční daň z příjmů ze závislé činnosti (spec 5.7): srážková daň bez prohlášení, jinak záloha se slevami
// na poplatníka, daňovým zvýhodněním na děti a případným daňovým bonusem. Vše v celých Kč, integer aritmetika.
import type { Smlouva, Zamestnanec } from '../shared/api';
import type { ParametryRoku } from './parametry';
import { deleniNahoru, procentoDolu } from './penize';
import type { VysledekVypoctu } from './typy';

/** Sazby daně v promile: 15 % a 23 % (nad hranicí). */
const DAN_15_PROMILE = 150;
const DAN_23_PROMILE = 230;

/** Základ zálohy: do 100 Kč včetně na celé Kč, jinak nahoru na celé stovky. */
function zakladZalohy(vzKc: number): number {
  return vzKc <= 100 ? vzKc : vzKc + ((100 - (vzKc % 100)) % 100);
}

/**
 * `vzKc` je vyměřovací základ (zaokrouhlený nahoru): z něj se počítá záloha. `prijemKc` je skutečný zdanitelný příjem
 * zaokrouhlený dolů na celé Kč: podle něj se posuzuje režim srážkové daně a nárok na bonus (½ minimální mzdy)
 * a z něj se počítá srážková daň. Záporné hodnoty se berou jako nula.
 */
export function vypocitejDan(a: {
  smlouva: Smlouva; vzKc: number; prijemKc: number; zamestnanec: Zamestnanec; p: ParametryRoku;
}): VysledekVypoctu['dan'] {
  const { smlouva, zamestnanec: z, p } = a;
  const vzKc = Math.max(0, a.vzKc);
  const prijemKc = Math.max(0, a.prijemKc);

  const srazkova = !z.prohlaseni
    && ((smlouva === 'DPP' && prijemKc < p.hraniceDppKc) || (smlouva === 'HPP' && prijemKc < p.rozhodnyPrijemKc));
  if (srazkova) {
    return { rezim: 'SRAZKOVA', zakladKc: prijemKc, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: procentoDolu(prijemKc, DAN_15_PROMILE), bonusKc: 0 };
  }

  const zakladKc = zakladZalohy(vzKc);
  const zalohaKc = deleniNahoru(
    Math.min(zakladKc, p.hraniceDan23Kc) * DAN_15_PROMILE + Math.max(0, zakladKc - p.hraniceDan23Kc) * DAN_23_PROMILE, 1000,
  );
  if (!z.prohlaseni) {
    return { rezim: 'ZALOHA', zakladKc, zalohaKc, slevyKc: 0, zvyhodneniKc: 0, danKc: zalohaKc, bonusKc: 0 };
  }

  const slevyNarokKc = p.slevaPoplatnikKc
    + (z.invalidita === 'III' ? p.slevaInvaliditaIIIKc : z.invalidita === 'ZADNA' ? 0 : p.slevaInvaliditaIaIIKc)
    + (z.ztpp ? p.slevaZtppKc : 0);
  const slevyKc = Math.min(slevyNarokKc, zalohaKc);
  const zvyhodneniKc = z.deti.reduce((soucet, dite, poradi) => {
    const zaDite = p.zvyhodneniDetiKc[Math.min(poradi, 2) as 0 | 1 | 2];
    return soucet + zaDite * (dite.ztpp ? 2 : 1);
  }, 0);

  const zbyvaKc = zalohaKc - slevyKc;
  if (zbyvaKc >= zvyhodneniKc) {
    return { rezim: 'ZALOHA', zakladKc, zalohaKc, slevyKc, zvyhodneniKc, danKc: zbyvaKc - zvyhodneniKc, bonusKc: 0 };
  }
  const bonusKc = zvyhodneniKc - zbyvaKc;
  const bonusSeVyplati = bonusKc >= p.minBonusKc && prijemKc >= p.minPrijemBonusKc;
  return { rezim: 'ZALOHA', zakladKc, zalohaKc, slevyKc, zvyhodneniKc, danKc: 0, bonusKc: bonusSeVyplati ? bonusKc : 0 };
}
