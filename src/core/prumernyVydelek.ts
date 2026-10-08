// Průměrný hodinový výdělek (PV, spec 5.3): ruční přepis → výpočet z uzavřených měsíců předchozího čtvrtletí → neznámý.
// PV je vždy celé haléře; dělení se dělá celočíselně (viz `zaokrouhliHalPodil`), ne přes float.
import type { MesicniVstup, Uzaverka } from '../shared/api';
import { mesiceCtvrtleti, predchoziCtvrtleti } from './kalendar';
import type { KodSlozky } from './typy';

export type ZdrojPrumernehoVydelku = 'RUCNE' | 'Z_UZAVEREK' | 'NEZNAMY';

/** Složky, které se počítají do PV (základ, příplatky, odměny, doplatek do min. mzdy); náhrady mzdy ne. */
const SLOZKY_DO_PV: readonly KodSlozky[] = [
  'ZAKLAD', 'PRIPLATEK_SOBOTA', 'PRIPLATEK_NEDELE', 'PRIPLATEK_SVATEK',
  'ODMENA_ZA_DEN', 'AKTIVITA', 'KASA', 'JINE_ODMENY', 'DOPLATEK_MIN_MZDA',
];
const MIN_ODPRACOVANYCH_DNI = 21;

interface SnimekPv { sumaHal: number; praceMin: number; odpracovaneDny: number; }

const jeObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const jeCislo = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Přečte `VysledekVypoctu` uložený v uzávěrce (typ `unknown`); poškozený snímek → `null`. */
function snimekPv(vysledek: unknown): SnimekPv | null {
  if (!jeObjekt(vysledek) || !Array.isArray(vysledek.slozky) || !jeObjekt(vysledek.hodiny)) return null;
  const { praceMin, odpracovaneDny } = vysledek.hodiny;
  if (!jeCislo(praceMin) || !jeCislo(odpracovaneDny)) return null;
  let sumaHal = 0;
  for (const s of vysledek.slozky as unknown[]) {
    if (jeObjekt(s) && SLOZKY_DO_PV.includes(s.kod as KodSlozky) && jeCislo(s.castkaHal)) sumaHal += s.castkaHal;
  }
  return { sumaHal, praceMin, odpracovaneDny };
}

/**
 * `citatel × 60 / jmenovatel` zaokrouhlené matematicky (půl nahoru) na celé haléře. Celé v integerech:
 * ⌊(2 × čitatel × 60 + jmenovatel) / (2 × jmenovatel)⌋ — žádný `Math.round` nad floatem, hranice .5 je přesná.
 */
function zaokrouhliHalPodil(citatelHal: number, jmenovatelMin: number): number {
  const a = 2 * Math.max(0, citatelHal) * 60 + jmenovatelMin;
  const b = 2 * jmenovatelMin;
  return (a - (a % b)) / b;
}

/**
 * Vyřeší PV zaměstnance pro měsíc `rok/mesic`:
 * (1) ruční přepis — poslední nenulový `prumernyVydelekHal` z měsíců téhož čtvrtletí do aktuálního měsíce včetně;
 * (2) z uzávěrek předchozího čtvrtletí — (základ + příplatky + odměny + doplatek) × 60 / odpracované minuty,
 *     když za čtvrtletí odpracoval aspoň 21 dní;
 * (3) jinak neznámý (`pvHal: null`). Výsledek (1) a (2) je nejméně `minHodHal` (§ 357 ZP).
 */
export function vyresPrumernyVydelek(a: {
  zamestnanecId: string; rok: number; mesic: number;
  vstupy: MesicniVstup[]; uzaverkyPredchozihoCtvrtleti: Uzaverka[]; minHodHal: number;
}): { pvHal: number | null; zdroj: ZdrojPrumernehoVydelku } {
  // (1) ruční přepis
  const ctvrtleti = mesiceCtvrtleti(a.rok, a.mesic);
  let rucne: MesicniVstup | null = null;
  for (const v of a.vstupy) {
    if (v.zamestnanecId !== a.zamestnanecId || v.mesic > a.mesic) continue;
    if (!ctvrtleti.some((m) => m.rok === v.rok && m.mesic === v.mesic)) continue;
    if (v.prumernyVydelekHal === null || v.prumernyVydelekHal === 0) continue;
    if (rucne === null || v.mesic > rucne.mesic) rucne = v;
  }
  if (rucne !== null && rucne.prumernyVydelekHal !== null) {
    return { pvHal: Math.max(rucne.prumernyVydelekHal, a.minHodHal), zdroj: 'RUCNE' };
  }

  // (2) z uzávěrek předchozího čtvrtletí
  const predchozi = predchoziCtvrtleti(a.rok, a.mesic);
  let sumaHal = 0;
  let praceMin = 0;
  let odpracovaneDny = 0;
  for (const u of a.uzaverkyPredchozihoCtvrtleti) {
    if (!predchozi.some((m) => m.rok === u.rok && m.mesic === u.mesic)) continue;
    for (const radek of u.vysledky) {
      if (radek.zamestnanecId !== a.zamestnanecId) continue;
      const snimek = snimekPv(radek.vysledek);
      if (snimek === null) continue;
      sumaHal += snimek.sumaHal;
      praceMin += snimek.praceMin;
      odpracovaneDny += snimek.odpracovaneDny;
    }
  }
  if (odpracovaneDny >= MIN_ODPRACOVANYCH_DNI && praceMin > 0) {
    return { pvHal: Math.max(zaokrouhliHalPodil(sumaHal, praceMin), a.minHodHal), zdroj: 'Z_UZAVEREK' };
  }

  // (3) neznámý
  return { pvHal: null, zdroj: 'NEZNAMY' };
}
