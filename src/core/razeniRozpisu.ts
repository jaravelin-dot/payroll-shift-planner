import type { PlanSmeny, SablonaSmeny, Zamestnanec } from '../shared/api';
import { klicBunky } from './plan';

/** Jak se řadí rozpis: podle času příchodu a odchodu, nebo podle jména. */
export type Razeni = 'CAS' | 'JMENO';

type Cas = { zacatek: string; konec: string };

const podleJmena = (a: Zamestnanec, b: Zamestnanec) =>
  a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs') || a.id.localeCompare(b.id);

/** Čas směny: jen směna, která má šablonu. Konec před začátkem (přes půlnoc) je později než jakýkoli denní konec. */
function casSmeny(polozka: PlanSmeny | undefined, sablony: Map<string, SablonaSmeny>): Cas | null {
  if (polozka?.typ !== 'SMENA' || !polozka.sablonaId) return null;
  const sablona = sablony.get(polozka.sablonaId);
  if (!sablona) return null;
  return { zacatek: sablona.zacatek, konec: sablona.konec < sablona.zacatek ? `24:${sablona.konec}` : sablona.konec };
}

/** Nejčastější hodnota; při shodě četnosti ta dřívější (text 'HH:MM' se porovnává jako text). */
function nejcastejsi(hodnoty: string[]): string {
  const pocty = new Map<string, number>();
  for (const h of hodnoty) pocty.set(h, (pocty.get(h) ?? 0) + 1);
  return [...pocty.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

/** Seřadí podle času (lidé bez času na konec); při shodě podle jména. */
function seradPodleCasu(lide: Zamestnanec[], cas: (z: Zamestnanec) => Cas | null): Zamestnanec[] {
  const casy = new Map(lide.map((z) => [z.id, cas(z)]));
  return [...lide].sort((a, b) => {
    const ca = casy.get(a.id)!;
    const cb = casy.get(b.id)!;
    if (ca && cb) return ca.zacatek.localeCompare(cb.zacatek) || ca.konec.localeCompare(cb.konec) || podleJmena(a, b);
    if (ca || cb) return ca ? -1 : 1;
    return podleJmena(a, b);
  });
}

/** Týdenní tabulka: podle nejčastějšího začátku směny v týdnu, pak nejčastějšího konce směn s tímto začátkem. */
export function seradTyden(lide: Zamestnanec[], dny: string[], plan: Map<string, PlanSmeny>, sablony: Map<string, SablonaSmeny>): Zamestnanec[] {
  return seradPodleCasu(lide, (z) => {
    const smeny = dny.flatMap((d) => casSmeny(plan.get(klicBunky(z.id, d)), sablony) ?? []);
    if (smeny.length === 0) return null;
    const zacatek = nejcastejsi(smeny.map((s) => s.zacatek));
    return { zacatek, konec: nejcastejsi(smeny.filter((s) => s.zacatek === zacatek).map((s) => s.konec)) };
  });
}

/** Seznam jednoho dne (mobil): podle začátku a konce směny ten den. */
export function seradDen(lide: Zamestnanec[], datum: string, plan: Map<string, PlanSmeny>, sablony: Map<string, SablonaSmeny>): Zamestnanec[] {
  return seradPodleCasu(lide, (z) => casSmeny(plan.get(klicBunky(z.id, datum)), sablony));
}
