// Náklady firmy po měsících roku (spec 7): uzavřené měsíce ze snímků uzávěrek, vybraný otevřený měsíc z přepočtu
// v prohlížeči, ostatní měsíce bez dat („neuzavřeno"). Náklad = hrubé mzdy + odvody firmy + stravné + náhrada za nemoc,
// stejně jako náklad firmy v jádře (spec 5.8).
import type { VysledekVypoctu } from '../../core/typy';
import type { Uzaverka } from '../../shared/api';

export type StavMesice = 'UZAVRENO' | 'ROZPRACOVANO' | 'NEUZAVRENO';

export interface MesicNakladu {
  mesic: number;
  stav: StavMesice;
  pocetLidi: number;
  hrubeHal: number;
  /** Sociální a zdravotní pojištění za firmu po slevě 5 %. */
  odvodyHal: number;
  stravneHal: number;
  nemocHal: number;
  celkemHal: number;
}

/** Náklady jednoho měsíce z výsledků všech lidí. */
export function nakladyMesice(mesic: number, stav: StavMesice, vysledky: VysledekVypoctu[]): MesicNakladu {
  const m: MesicNakladu = { mesic, stav, pocetLidi: vysledky.length, hrubeHal: 0, odvodyHal: 0, stravneHal: 0, nemocHal: 0, celkemHal: 0 };
  for (const v of vysledky) {
    const p = v.pojisteni;
    m.hrubeHal += v.hrubaHal;
    m.odvodyHal += (p.socialniFirmaKc - p.slevaPojistneKc + p.zdravotniFirmaKc) * 100;
    m.stravneHal += v.stravne.celkemHal;
    m.nemocHal += v.nahradaNemocHal;
    m.celkemHal += v.nakladFirmyHal;
  }
  return m;
}

/** Dvanáct měsíců roku. `rozpracovany` = vybraný měsíc, když není uzavřený (výsledky přepočtu všech lidí). */
export function nakladyRoku(a: { uzaverky: Uzaverka[]; rozpracovany: { mesic: number; vysledky: VysledekVypoctu[] } | null }): MesicNakladu[] {
  const uzavrene = new Map(a.uzaverky.map((u) => [u.mesic, u]));
  return Array.from({ length: 12 }, (_, i) => {
    const mesic = i + 1;
    const uzaverka = uzavrene.get(mesic);
    if (uzaverka) return nakladyMesice(mesic, 'UZAVRENO', uzaverka.vysledky.map((r) => r.vysledek as VysledekVypoctu));
    if (a.rozpracovany?.mesic === mesic) return nakladyMesice(mesic, 'ROZPRACOVANO', a.rozpracovany.vysledky);
    return nakladyMesice(mesic, 'NEUZAVRENO', []);
  });
}

/** Součet měsíců, které mají data (uzavřené a rozpracovaný). */
export function soucetNakladu(mesice: MesicNakladu[]) {
  const sData = mesice.filter((m) => m.stav !== 'NEUZAVRENO');
  const soucet = (pole: 'hrubeHal' | 'odvodyHal' | 'stravneHal' | 'nemocHal' | 'celkemHal') => sData.reduce((s, m) => s + m[pole], 0);
  return {
    hrubeHal: soucet('hrubeHal'), odvodyHal: soucet('odvodyHal'), stravneHal: soucet('stravneHal'), nemocHal: soucet('nemocHal'),
    celkemHal: soucet('celkemHal'), pocetMesicu: sData.length, vcetneRozpracovaneho: sData.some((m) => m.stav === 'ROZPRACOVANO'),
  };
}
