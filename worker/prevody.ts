// Převody mezi řádky D1 (Drizzle) a typy API kontraktu.
import { VYCHOZI_NASTAVENI, type Firma, type NastaveniFirmy, type NovaFirma, type NovyZamestnanec, type Sazba, type Uzaverka, type ZamestnanecSeSazbami } from '../src/shared/api';
import type { firma, sazba, uzaverka, zamestnanec } from './db/schema';

/** Nastavení firmy se při čtení slučuje s výchozím. */
export function naFirmu(radek: typeof firma.$inferSelect): Firma {
  return { ...radek, nastaveni: { ...VYCHOZI_NASTAVENI, ...radek.nastaveni } };
}

export function radekFirmy(vstup: NovaFirma): Omit<typeof firma.$inferSelect, 'id' | 'vytvoreno'> {
  return { nazev: vstup.nazev, ico: vstup.ico ?? null, adresa: vstup.adresa ?? null, ucet: vstup.ucet ?? null, nastaveni: vstup.nastaveni ?? {} };
}

/**
 * Změny řádku firmy pro `PUT`: vynechané `ico/adresa/ucet` (undefined) se nemění, výslovné `null` je vymaže;
 * zadané (částečné) nastavení se sloučí přes uložené, nikdy ho nenahradí celé.
 */
export function zmenyFirmy(puvodni: typeof firma.$inferSelect, vstup: { nazev: string; ico?: string | null; adresa?: string | null; ucet?: string | null; nastaveni?: Partial<NastaveniFirmy> }) {
  return {
    nazev: vstup.nazev,
    ico: vstup.ico === undefined ? puvodni.ico : vstup.ico,
    adresa: vstup.adresa === undefined ? puvodni.adresa : vstup.adresa,
    ucet: vstup.ucet === undefined ? puvodni.ucet : vstup.ucet,
    nastaveni: { ...puvodni.nastaveni, ...vstup.nastaveni },
  };
}

/** Přiřadí zaměstnancům jejich sazby (od nejstarší platnosti). */
export function sSazbami(zamestnanci: (typeof zamestnanec.$inferSelect)[], sazby: Sazba[]): ZamestnanecSeSazbami[] {
  return zamestnanci.map((z) => ({
    ...z,
    sazby: sazby.filter((s) => s.zamestnanecId === z.id).sort((a, b) => a.platiOd.localeCompare(b.platiOd) || a.id.localeCompare(b.id)),
  }));
}

/** `vychoziAktivni` platí, když vstup neurčuje `aktivni` (nový zaměstnanec = true, při úpravě uložená hodnota). Stejně role a střídání plánu. */
export function radekZamestnance(
  id: string,
  vstup: NovyZamestnanec,
  vychoziAktivni = true,
  puvodni: Pick<typeof zamestnanec.$inferSelect, 'rolePlanu' | 'stridaniSmen' | 'poradiPodkladu' | 'vPodkladu'> = { rolePlanu: 'MIMO_PLAN', stridaniSmen: [], poradiPodkladu: null, vPodkladu: true },
): typeof zamestnanec.$inferInsert {
  const { sazby: _sazby, ...zbytek } = vstup;
  return {
    ...zbytek, id, ukonceni: vstup.ukonceni ?? null, ucet: vstup.ucet ?? null, poznamka: vstup.poznamka ?? null,
    aktivni: vstup.aktivni ?? vychoziAktivni,
    rolePlanu: vstup.rolePlanu ?? puvodni.rolePlanu,
    stridaniSmen: vstup.stridaniSmen ?? puvodni.stridaniSmen,
    poradiPodkladu: vstup.poradiPodkladu === undefined ? puvodni.poradiPodkladu : vstup.poradiPodkladu,
    vPodkladu: vstup.vPodkladu ?? puvodni.vPodkladu,
  };
}

export function radkySazeb(zamestnanecId: string, vstup: NovyZamestnanec): (typeof sazba.$inferInsert)[] {
  return vstup.sazby.map((s) => ({ id: crypto.randomUUID(), zamestnanecId, platiOd: s.platiOd, hodinovaHal: s.hodinovaHal }));
}

export function naUzaverku(radek: typeof uzaverka.$inferSelect): Uzaverka {
  return { firmaId: radek.firmaId, rok: radek.rok, mesic: radek.mesic, uzavreno: radek.uzavreno, vysledky: radek.vysledky };
}
