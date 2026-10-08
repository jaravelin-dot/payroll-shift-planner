// Podklad pro účetního ve tvaru ručního přehledu pro účetní (spec 2026-10-07): záhlaví s fondem pracovní doby, zaměstnanci
// a brigádníci (DPP). Čistá funkce bez knihoven; Excel (list Podklad) a PDF ji jen vykreslují. Peníze v haléřích,
// hodiny v minutách, na Kč a hodiny se převádí až při vykreslení.
import { denVTydnu, dnyMesice, jeSvatek } from '../../core/kalendar';
import { ucetNaIban } from '../../core/platby';
import type { KodSlozky, VysledekVypoctu } from '../../core/typy';
import type { MesicData, Zamestnanec } from '../../shared/api';
import { dnesniDatum, formatDatum } from '../datum';
import { mimoPomer, nazevMesice } from '../dochazka';
import { radkyVyplat, type RadekVyplaty } from '../radkyVyplat';

export interface RadekFondu { uvazekMin: number; denneMin: number; mesicMin: number }

export interface ZahlaviPodkladu {
  firma: string; rok: number; mesic: number;
  /** „říjen 2026" */
  nazevMesice: string;
  pracovniDny: number;
  fond: RadekFondu[];
  /** „Uzavřeno 5. 11. 2026" nebo upozornění, že jde o rozpracovaný výpočet. */
  stav: string;
}

export interface RadekZamestnance {
  zamestnanecId: string; jmeno: string;
  /** `null`, když člověk v datech měsíce už není (uzavřený měsíc). */
  uvazekMin: number | null; hodinVMesiciMin: number | null;
  odpracovanoMin: number; vikendMin: number; svatekMin: number;
  dnyDovolene: number; dnyNemoci: number; dnyStravenek: number;
  odmenaHal: number; potrebujeme: string;
}

export interface RadekBrigadnika {
  zamestnanecId: string; jmeno: string; odpracovanoMin: number; mzdaHal: number;
  zpusobPlatby: 'na účet' | 'hotově' | ''; potrebujeme: string;
}

export interface Podklad { zahlavi: ZahlaviPodkladu; zamestnanci: RadekZamestnance[]; brigadnici: RadekBrigadnika[] }

export const NADPISY_FONDU = ['Fond pracovní doby', 'Denně (h)', 'Za měsíc (h)'];
export const NADPISY_ZAMESTNANCU = [
  'Jméno', 'Úvazek týdně (h)', 'Hod. v měsíci', 'Odpracováno (h)', 'z toho So–Ne (h)', 'z toho svátek (h)',
  'Dny dovolené', 'Prac. dny nemoc', 'Strav. paušál dny', 'Odměna', 'Potřebujeme mzdu',
];
export const NADPISY_BRIGADNIKU = ['Jméno', 'Hodiny', 'Mzda (hrubá)', 'Způsob platby', 'Potřebujeme mzdu'];

/** Odměny a víkendové příplatky; základ za hodiny si účetní počítá ze sazby sama. */
const SLOZKY_ODMENY: KodSlozky[] = ['ODMENA_ZA_DEN', 'AKTIVITA', 'KASA', 'PRIPLATEK_SOBOTA', 'PRIPLATEK_NEDELE', 'JINE_ODMENY'];
/** Fond pro 4 a 8 hodin denně je v záhlaví vždy, i když takový úvazek nikdo nemá (zadání zadavatele). */
const VZDY_UVAZKY_MIN = [1200, 2400];

const vsedniDen = (datum: string) => denVTydnu(datum) <= 5;

/** Pracovní dny měsíce (Po–Pá včetně svátků); s `pomer` jen ty, kdy člověk byl v pracovním poměru. */
export function pracovniDny(rok: number, mesic: number, pomer?: Pick<Zamestnanec, 'nastup' | 'ukonceni'>): number {
  return dnyMesice(rok, mesic).filter((d) => vsedniDen(d) && !(pomer && mimoPomer(d, pomer))).length;
}

/** Řádky výplat pro výstupy účetního: bez lidí, kterým je na kartě vypnuté „Zahrnout do podkladů". Člověk z uzávěrky, který v datech není, zůstává. */
export function radkyProUcetni(data: MesicData, vysledky: Map<string, VysledekVypoctu>): RadekVyplaty[] {
  const vyrazeni = new Set(data.zamestnanci.filter((z) => !z.vPodkladu).map((z) => z.id));
  return radkyVyplat(data, vysledky).radky.filter((r) => !vyrazeni.has(r.zamestnanecId));
}

export function podkladUcetni(data: MesicData, vysledky: Map<string, VysledekVypoctu>): Podklad {
  const { rok, mesic } = data;
  const mesicKlic = `${String(rok).padStart(4, '0')}-${String(mesic).padStart(2, '0')}`;
  const dny = pracovniDny(rok, mesic);
  const lide = new Map(data.zamestnanci.map((z) => [z.id, z]));
  const jmeno = (r: { jmeno: string; prijmeni: string }) => `${r.prijmeni} ${r.jmeno}`.trim();
  const potrebujeme = (id: string) => data.vstupy.find((v) => v.zamestnanecId === id && v.rok === rok && v.mesic === mesic)?.poznamka ?? '';
  const dnyNemoci = (id: string) => data.dny.filter((d) => d.zamestnanecId === id && d.typ === 'NEMOC' && d.datum.startsWith(mesicKlic)
    && vsedniDen(d.datum) && !jeSvatek(d.datum)).length;

  const zamestnanci: RadekZamestnance[] = [];
  const brigadnici: RadekBrigadnika[] = [];
  // Pořadí z karty člověka; kdo ho nemá, zůstane na konci v dosavadním pořadí (příjmení česky). Řazení je stabilní.
  const poradi = (id: string) => lide.get(id)?.poradiPodkladu ?? Infinity;
  // Porovnání, ne odečtení: Infinity − Infinity je NaN.
  const radky = radkyProUcetni(data, vysledky).sort((a, b) => {
    const pa = poradi(a.zamestnanecId);
    const pb = poradi(b.zamestnanecId);
    return pa === pb ? 0 : pa < pb ? -1 : 1;
  });
  for (const r of radky) {
    const z = lide.get(r.zamestnanecId);
    const v = r.vysledek;
    if (r.smlouva === 'DPP') {
      brigadnici.push({
        zamestnanecId: r.zamestnanecId, jmeno: jmeno(r), odpracovanoMin: v.hodiny.praceMin, mzdaHal: v.hrubaHal,
        zpusobPlatby: !z ? '' : z.ucet && ucetNaIban(z.ucet) ? 'na účet' : 'hotově', potrebujeme: potrebujeme(r.zamestnanecId),
      });
      continue;
    }
    zamestnanci.push({
      zamestnanecId: r.zamestnanecId, jmeno: jmeno(r),
      uvazekMin: z ? z.uvazekMinTydne : null,
      hodinVMesiciMin: z ? (z.uvazekMinTydne / 5) * pracovniDny(rok, mesic, z) : null,
      odpracovanoMin: v.hodiny.praceMin,
      vikendMin: v.hodiny.sobotaMin + v.hodiny.nedeleMin,
      svatekMin: v.hodiny.svatekPraceMin,
      dnyDovolene: v.hodiny.dnyDovolena,
      dnyNemoci: dnyNemoci(r.zamestnanecId),
      dnyStravenek: v.stravne.smen,
      odmenaHal: v.slozky.filter((s) => SLOZKY_ODMENY.includes(s.kod)).reduce((soucet, s) => soucet + s.castkaHal, 0),
      potrebujeme: potrebujeme(r.zamestnanecId),
    });
  }

  const uvazky = [...new Set([...VZDY_UVAZKY_MIN, ...zamestnanci.flatMap((r) => (r.uvazekMin ? [r.uvazekMin] : []))])].sort((a, b) => a - b);
  return {
    zahlavi: {
      firma: data.firma.nazev, rok, mesic, nazevMesice: nazevMesice(rok, mesic).toLowerCase(), pracovniDny: dny,
      fond: uvazky.map((u) => ({ uvazekMin: u, denneMin: u / 5, mesicMin: (u / 5) * dny })),
      stav: data.uzaverka
        ? `Uzavřeno ${formatDatum(dnesniDatum(new Date(data.uzaverka.uzavreno)))}`
        : 'Rozpracováno – předběžný výpočet, měsíc není uzavřený',
    },
    zamestnanci,
    brigadnici,
  };
}
