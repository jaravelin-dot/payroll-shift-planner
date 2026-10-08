// Varování výpočtu v appce: krátký název pro štítky a tón (chyba → upozornění → informace). Plný text nese jádro.
import type { KodVarovani, Varovani } from '../core/typy';

export type TonVarovani = 'chyba' | 'varovani' | 'info';

export const INFO_VAROVANI: Record<KodVarovani, { nazev: string; ton: TonVarovani }> = {
  VYPLATA_ZAPORNA: { nazev: 'Záporná výplata', ton: 'chyba' },
  CHYBI_SAZBA: { nazev: 'Chybí sazba', ton: 'chyba' },
  DEN_MIMO_POMER: { nazev: 'Docházka mimo pracovní poměr', ton: 'varovani' },
  ODMENA_PROPADLA_NEMOC: { nazev: 'Odměna propadla', ton: 'varovani' },
  NEMOC_PRES_14_DNU: { nazev: 'Nemoc přes 14 dní', ton: 'varovani' },
  DPP_LIMIT_300H: { nazev: 'Přes 300 h na dohodu', ton: 'varovani' },
  DPP_SAZBA_POD_MINIMEM: { nazev: 'Sazba pod minimem', ton: 'varovani' },
  DOPLATEK_MIN_MZDA: { nazev: 'Doplatek do minimální mzdy', ton: 'varovani' },
  ZP_DOPLATEK_MINIMUM: { nazev: 'Doplatek zdravotního', ton: 'varovani' },
  SLEVA_POJISTNE_NESPLNENA: { nazev: 'Bez slevy 5 %', ton: 'info' },
  PRIPLATEK_POD_MINIMEM: { nazev: 'Příplatek z průměru', ton: 'info' },
  PV_ODHADNUT: { nazev: 'Průměr odhadnutý', ton: 'info' },
  PREDBEZNY_PARAMETR: { nazev: 'Předběžné hodnoty roku', ton: 'info' },
};

/**
 * Stojí upozornění za kontrolu před uzavřením měsíce? Chyby a upozornění ano; z informací jen odhadnutý průměr (mění
 * částky náhrad a jde opravit zadáním skutečného průměru). Ostatní informace (předběžné hodnoty roku, sleva 5 % na
 * pojistném bez splněných podmínek, příplatek dorovnaný z průměru) jen vysvětlují výpočet, opravit na nich nic nejde.
 */
export function kontrolovatPredUzavrenim(v: Varovani): boolean {
  return INFO_VAROVANI[v.kod].ton !== 'info' || v.kod === 'PV_ODHADNUT';
}

const PORADI_TONU: Record<TonVarovani, number> = { chyba: 0, varovani: 1, info: 2 };

/** Od nejzávažnějšího; při stejném tónu zůstává pořadí z výpočtu. */
export function seradVarovani(varovani: readonly Varovani[]): Varovani[] {
  return varovani
    .map((v, i) => ({ v, i }))
    .sort((a, b) => PORADI_TONU[INFO_VAROVANI[a.v.kod].ton] - PORADI_TONU[INFO_VAROVANI[b.v.kod].ton] || a.i - b.i)
    .map((x) => x.v);
}
