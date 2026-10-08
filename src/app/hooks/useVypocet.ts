// Výsledky výplat měsíce: otevřený měsíc přepočítá jádro v prohlížeči (okamžitě při každé změně dat), uzavřený
// se bere ze snímku uzávěrky, který spočítal a uložil Worker.
import { useMemo } from 'react';
import { pripravVstup } from '../../core/priprava';
import type { VysledekVypoctu } from '../../core/typy';
import { vypocitejMzdu } from '../../core/vypocet';
import type { MesicData } from '../../shared/api';

export function vypocty(data: MesicData | undefined): Map<string, VysledekVypoctu> {
  const vysledky = new Map<string, VysledekVypoctu>();
  if (!data) return vysledky;
  if (data.uzaverka) {
    for (const radek of data.uzaverka.vysledky) vysledky.set(radek.zamestnanecId, radek.vysledek as VysledekVypoctu);
    return vysledky;
  }
  for (const z of data.zamestnanci) vysledky.set(z.id, vypocitejMzdu(pripravVstup(data, z.id)));
  return vysledky;
}

/** Mapa `zamestnanecId → VysledekVypoctu`; přepočítá se jen při změně `data`. */
export function useVypocet(data: MesicData | undefined): Map<string, VysledekVypoctu> {
  return useMemo(() => vypocty(data), [data]);
}
