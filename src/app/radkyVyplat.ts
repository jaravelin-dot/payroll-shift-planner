// Řádky přehledu výplat: otevřený měsíc = lidé z dat měsíce s přepočtem, uzavřený = lidé ze snímku uzávěrky (i ti, kdo
// mezitím z firmy zmizeli). Řazení podle příjmení česky (Č za C, Ch za H).
import type { VysledekVypoctu } from '../core/typy';
import type { MesicData, Smlouva, ZamestnanecSeSazbami } from '../shared/api';

export interface RadekVyplaty {
  zamestnanecId: string;
  jmeno: string;
  prijmeni: string;
  smlouva: Smlouva;
  vysledek: VysledekVypoctu;
}

export const celeJmeno = (r: { jmeno: string; prijmeni: string }) => `${r.jmeno} ${r.prijmeni}`;

/** Snímek nese jen celé jméno; příjmení pro řazení je poslední slovo. */
function rozdelJmeno(cele: string): { jmeno: string; prijmeni: string } {
  const mezera = cele.lastIndexOf(' ');
  return mezera < 0 ? { jmeno: '', prijmeni: cele } : { jmeno: cele.slice(0, mezera), prijmeni: cele.slice(mezera + 1) };
}

export function radkyVyplat(data: MesicData, vysledky: Map<string, VysledekVypoctu>): { radky: RadekVyplaty[]; mimoUzaverku: ZamestnanecSeSazbami[] } {
  const podleId = new Map(data.zamestnanci.map((z) => [z.id, z]));
  const radky: RadekVyplaty[] = [];
  if (data.uzaverka) {
    for (const r of data.uzaverka.vysledky) {
      const z = podleId.get(r.zamestnanecId);
      const vysledek = vysledky.get(r.zamestnanecId);
      if (!vysledek) continue;
      radky.push({ zamestnanecId: r.zamestnanecId, ...(z ? { jmeno: z.jmeno, prijmeni: z.prijmeni } : rozdelJmeno(r.jmeno)), smlouva: r.smlouva, vysledek });
    }
  } else {
    for (const z of data.zamestnanci) {
      const vysledek = vysledky.get(z.id);
      if (vysledek) radky.push({ zamestnanecId: z.id, jmeno: z.jmeno, prijmeni: z.prijmeni, smlouva: z.smlouva, vysledek });
    }
  }
  radky.sort((a, b) => a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs'));
  const vUzaverce = new Set(radky.map((r) => r.zamestnanecId));
  const mimoUzaverku = data.uzaverka ? data.zamestnanci.filter((z) => !vUzaverce.has(z.id)) : [];
  return { radky, mimoUzaverku };
}
