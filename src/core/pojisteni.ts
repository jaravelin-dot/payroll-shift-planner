// Pojistné zaměstnance a zaměstnavatele (spec 5.6): sociální a zdravotní pojištění, minimální základ ZP u HPP
// a sleva 5 % pro firmu. Vše v celých Kč a integer aritmetice (sazby v promile, zaokrouhlení nahoru).
import type { Smlouva, Zamestnanec } from '../shared/api';
import { formatHodin } from './hodiny';
import { dnyMesice } from './kalendar';
import type { ParametryRoku } from './parametry';
import { deleniNahoru, formatKc, halNaKcDolu, procentoNahoru } from './penize';
import type { Varovani, VysledekVypoctu } from './typy';

/** Sleva 5 % pro firmu: 5 % z vyměřovacího základu (v promile). */
const SLEVA_PROMILE = 50;
/** Sleva 5 %: týdenní úvazek 8 až 30 hodin (v minutách). */
const SLEVA_UVAZEK_MIN_MINUT = 8 * 60;
const SLEVA_UVAZEK_MAX_MINUT = 30 * 60;
/** Sleva 5 %: nejvýše 138 odpracovaných hodin (včetně hodin s náhradou mzdy) v měsíci (v minutách). */
const SLEVA_PRACE_MAX_MINUT = 138 * 60;

/** Částka v celých Kč pro text: „10 200 Kč". */
const kcText = (kc: number): string => formatKc(kc * 100);

/**
 * Kdo je pojištěný při daném skutečném započitatelném příjmu `prijemKc` (celé Kč dolů; ne vyměřovací základ zaokrouhlený
 * nahoru: § 3 písm. e), § 7 a § 7a z. 187/2006). HPP: zdravotní vždy; sociální podle sjednaného příjmu (§ 6 a § 7):
 * zaměstnání malého rozsahu je jen takové, kde je SJEDNANÝ měsíční příjem pod rozhodným příjmem, a pak se sociální platí
 * až v měsíci, kdy skutečný příjem rozhodného příjmu dosáhne. Jinak se sociální platí z jakéhokoli kladného příjmu.
 * Neznámý sjednaný příjem (`null`, žádná sazba) se bere jako zaměstnání, které není malého rozsahu.
 * DPP: obojí od hranice DPP, pod ní nic.
 */
export function jePojisteny(
  smlouva: Smlouva, prijemKc: number, p: ParametryRoku, sjednanyPrijemKc: number | null,
): { socialni: boolean; zdravotni: boolean } {
  if (smlouva === 'HPP') {
    const maloRozsahu = sjednanyPrijemKc !== null && sjednanyPrijemKc < p.rozhodnyPrijemKc;
    return { socialni: maloRozsahu ? prijemKc >= p.rozhodnyPrijemKc : prijemKc > 0, zdravotni: true };
  }
  const pojistenaDpp = prijemKc >= p.hraniceDppKc;
  return { socialni: pojistenaDpp, zdravotni: pojistenaDpp };
}

/** Výjimka z minimálního základu ZP: invalidita I–III, ZTP/P nebo státní pojištěnec. */
function maVyjimkuZMinimaZp(z: Zamestnanec): boolean {
  return z.invalidita !== 'ZADNA' || z.ztpp || z.statniPojistenec;
}

/**
 * `vzKc` je vyměřovací základ (nahoru na celé Kč): z něj se počítá výše pojistného. `prijemHal` je skutečný započitatelný
 * příjem v haléřích (hrubá mzda + zdanitelné stravné): podle něj, dolů na celé Kč, se rozhoduje, kdo je pojištěný
 * (viz `jePojisteny`), a ukazuje se v textech varování. `sjednanyPrijemKc` je sjednaný měsíční příjem HPP, `null` když
 * ho nejde určit. `hodinyProSlevuMin` jsou odpracované hodiny včetně hodin s náhradou mzdy (§ 7a odst. 3 z. 589/1992):
 * práce, dovolená, svátek, náhradní volno a nemoc do 14. dne; používá je jen sleva 5 %. Záporný vyměřovací základ
 * i příjem se berou jako nula.
 */
export function vypocitejPojisteni(a: {
  smlouva: Smlouva; vzKc: number; prijemHal: number; zamestnanec: Zamestnanec; rok: number; mesic: number;
  dnyNemocKalendarni: number; hodinyProSlevuMin: number; sjednanyPrijemKc: number | null; p: ParametryRoku;
}): { pojisteni: VysledekVypoctu['pojisteni']; varovani: Varovani[] } {
  const { smlouva, zamestnanec, hodinyProSlevuMin, sjednanyPrijemKc, p } = a;
  const vzKc = Math.max(0, a.vzKc);
  const prijemHal = Math.max(0, a.prijemHal);
  const varovani: Varovani[] = [];
  const { socialni, zdravotni } = jePojisteny(smlouva, halNaKcDolu(prijemHal), p, sjednanyPrijemKc);

  const socialniZamKc = socialni ? procentoNahoru(vzKc, p.spZamPromile) : 0;
  const socialniFirmaKc = socialni ? procentoNahoru(vzKc, p.spFirmaPromile) : 0;
  const zdravotniCelkemKc = zdravotni ? procentoNahoru(vzKc, p.zpCelkemPromile) : 0;
  const zdravotniZamKc = deleniNahoru(zdravotniCelkemKc, 3);
  const zdravotniFirmaKc = zdravotniCelkemKc - zdravotniZamKc;

  // Minimální základ ZP (jen HPP): minimální mzda krácená o dny nemoci a dny mimo pracovní poměr.
  let doplatekZpKc = 0;
  if (smlouva === 'HPP' && zdravotni && !maVyjimkuZMinimaZp(zamestnanec)) {
    const dnyMesiceSeznam = dnyMesice(a.rok, a.mesic);
    const dnuVMesici = dnyMesiceSeznam.length;
    const dnuMimoPomer = dnyMesiceSeznam.filter((den) =>
      den < zamestnanec.nastup || (zamestnanec.ukonceni !== null && den > zamestnanec.ukonceni)).length;
    const dnuZapocitano = Math.max(0, dnuVMesici - a.dnyNemocKalendarni - dnuMimoPomer);
    const minimumKc = deleniNahoru(p.minMzdaMesicKc * dnuZapocitano, dnuVMesici);
    if (vzKc < minimumKc) {
      doplatekZpKc = procentoNahoru(minimumKc - vzKc, p.zpCelkemPromile);
      varovani.push({ kod: 'ZP_DOPLATEK_MINIMUM', text:
        `Vyměřovací základ ${kcText(vzKc)} je pod minimálním základem zdravotního pojištění ${kcText(minimumKc)} `
        + `(minimální mzda ${kcText(p.minMzdaMesicKc)} za ${dnuZapocitano} z ${dnuVMesici} kalendářních dnů měsíce). `
        + `Zaměstnanec proto doplácí na zdravotním pojištění ${kcText(doplatekZpKc)}.` });
    }
  }

  // Sleva 5 % na pojistném firmy: jen HPP s příznakem; sleva se počítá z pojistného na sociální pojištění.
  let slevaPojistneKc = 0;
  if (zamestnanec.slevaNaPojistnem) {
    const duvody: string[] = [];
    if (smlouva !== 'HPP') {
      duvody.push('sleva se týká jen pracovního poměru, ne dohody o provedení práce');
    } else {
      if (!socialni) {
        duvody.push(sjednanyPrijemKc !== null && sjednanyPrijemKc < p.rozhodnyPrijemKc
          ? `zaměstnanec není sociálně pojištěn (zaměstnání malého rozsahu: sjednaný příjem ${kcText(sjednanyPrijemKc)} i příjem `
            + `${formatKc(prijemHal)} jsou pod rozhodným příjmem ${kcText(p.rozhodnyPrijemKc)})`
          : `zaměstnanec není sociálně pojištěn (příjem ${formatKc(prijemHal)})`);
      }
      const uvazek = zamestnanec.uvazekMinTydne;
      if (uvazek < SLEVA_UVAZEK_MIN_MINUT || uvazek > SLEVA_UVAZEK_MAX_MINUT) {
        duvody.push(`týdenní úvazek ${formatHodin(uvazek)} h není mezi 8 a 30 hodinami`);
      }
      if (hodinyProSlevuMin > SLEVA_PRACE_MAX_MINUT) {
        duvody.push(`odpracováno ${formatHodin(hodinyProSlevuMin)} h (včetně hodin s náhradou mzdy), `
          + `sleva je nejvýše do ${formatHodin(SLEVA_PRACE_MAX_MINUT)} h za měsíc`);
      }
      if (vzKc > p.slevaPojistneStropKc) {
        duvody.push(`vyměřovací základ ${kcText(vzKc)} je nad stropem ${kcText(p.slevaPojistneStropKc)}`);
      }
      if (hodinyProSlevuMin <= 0) {
        duvody.push('v měsíci nejsou žádné odpracované ani nahrazené hodiny, limit na hodinu nejde ověřit');
      } else if (vzKc * 60 > p.slevaPojistneKcHod * hodinyProSlevuMin) {
        // Kč/h v haléřích nahoru, aby se v textu nikdy neukázala hodnota rovná limitu
        const kcNaHodinuHal = deleniNahoru(vzKc * 6000, hodinyProSlevuMin);
        duvody.push(`vyměřovací základ na odpracovanou hodinu (${formatKc(kcNaHodinuHal)}) je nad limitem ${kcText(p.slevaPojistneKcHod)}`);
      }
    }
    if (duvody.length === 0) {
      slevaPojistneKc = procentoNahoru(vzKc, SLEVA_PROMILE);
    } else {
      varovani.push({ kod: 'SLEVA_POJISTNE_NESPLNENA', text: `Sleva 5 % na pojistném se neuplatní: ${duvody.join('; ')}.` });
    }
  }

  return {
    pojisteni: {
      pojisteny: socialni || zdravotni,
      socialniZamKc, zdravotniZamKc, doplatekZpKc, socialniFirmaKc, zdravotniFirmaKc, slevaPojistneKc,
    },
    varovani,
  };
}
