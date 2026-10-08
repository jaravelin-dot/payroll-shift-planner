import type { Den, MesicniVstup, NastaveniFirmy, Sazba, Zamestnanec } from '../shared/api';

export interface VstupVypoctu {
  rok: number; mesic: number;
  zamestnanec: Zamestnanec;
  sazby: Sazba[];
  dny: Den[];                 // dny tohoto měsíce (jen tohoto zaměstnance)
  dnyPredchozi: Den[];        // dny předchozího měsíce (kvůli epizodě nemoci)
  vstup: MesicniVstup | null;
  nastaveni: NastaveniFirmy;
  prumernyVydelekHal: number | null; // vyřešený PV (haléře za hodinu); null = neznámý
  dppMinutyPredMesicem: number;      // DPP: odpracované minuty v roce před tímto měsícem
  dnyMimoPomer?: string[];           // data dnů tohoto měsíce se zápisem mimo pracovní poměr (vynechané, jen pro varování)
}

export type KodSlozky =
  | 'ZAKLAD' | 'PRIPLATEK_SOBOTA' | 'PRIPLATEK_NEDELE' | 'PRIPLATEK_SVATEK'
  | 'ODMENA_ZA_DEN' | 'AKTIVITA' | 'KASA' | 'JINE_ODMENY' | 'DOPLATEK_MIN_MZDA'
  | 'NAHRADA_DOVOLENA' | 'NAHRADA_SVATEK' | 'NAHRADA_NAHRADNI_VOLNO';

export interface Slozka { kod: KodSlozky; popis: string; vzorec: string; castkaHal: number; }

export type KodVarovani =
  | 'PV_ODHADNUT' | 'PREDBEZNY_PARAMETR' | 'ODMENA_PROPADLA_NEMOC' | 'PRIPLATEK_POD_MINIMEM'
  | 'DOPLATEK_MIN_MZDA' | 'ZP_DOPLATEK_MINIMUM' | 'DPP_LIMIT_300H' | 'DPP_SAZBA_POD_MINIMEM'
  | 'SLEVA_POJISTNE_NESPLNENA' | 'CHYBI_SAZBA' | 'NEMOC_PRES_14_DNU' | 'VYPLATA_ZAPORNA' | 'DEN_MIMO_POMER';
export interface Varovani { kod: KodVarovani; text: string; }

export interface SouhrnHodin {
  praceMin: number; praceVsedniMin: number; sobotaMin: number; nedeleMin: number; svatekPraceMin: number;
  dovolenaMin: number; svatekZavrenoMin: number; nahradniVolnoMin: number; nemocMin: number;
  neplaceneMin: number; absenceMin: number;
  odpracovaneDny: number; dnyVsedni: number; dnySobota: number; dnyNedele: number; dnySvatek: number;
  dnyKasa: number; dnyNemocKalendarni: number; dnyDovolena: number; dnySvatekZavreno: number;
  smenyStravne: number;           // nároky na stravné (≥ 3 h = 1, > 11 h = 2)
  nahradniVolnoZiskaneMin: number; // při praceVeSvatek = NAHRADNI_VOLNO
}

export interface VysledekVypoctu {
  slozky: Slozka[];
  hrubaHal: number;
  nahradaNemocHal: number; nahradaNemocVzorec: string;
  stravne: { smen: number; celkemHal: number; osvobozenoHal: number; zdanitelneHal: number };
  vzKc: number;
  pojisteni: { pojisteny: boolean; socialniZamKc: number; zdravotniZamKc: number; doplatekZpKc: number;
               socialniFirmaKc: number; zdravotniFirmaKc: number; slevaPojistneKc: number };
  dan: { rezim: 'ZALOHA' | 'SRAZKOVA'; zakladKc: number; zalohaKc: number; slevyKc: number;
         zvyhodneniKc: number; danKc: number; bonusKc: number };
  cistaHal: number; kVyplateHal: number; nakladFirmyHal: number;
  odmenaZaDenBezPodminkyHal: number;
  hodiny: SouhrnHodin;
  pvHal: number;
  varovani: Varovani[];
  parametry: { rok: number; predbezne: string[] };
}
