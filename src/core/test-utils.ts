import type { Den, MesicniVstup, Sazba, TypDne, Zamestnanec } from '../shared/api';
import { VYCHOZI_NASTAVENI } from '../shared/api';
import type { VstupVypoctu } from './typy';
export function zam(c: Partial<Zamestnanec> = {}): Zamestnanec {
  return { id: 'z1', firmaId: 'f1', jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 2400,
    nastup: '2020-01-01', ukonceni: null, prohlaseni: true, invalidita: 'ZADNA', ztpp: false, deti: [],
    statniPojistenec: false, slevaNaPojistnem: false, ucet: null, poznamka: null, aktivni: true, rolePlanu: 'MIMO_PLAN', stridaniSmen: [], poradiPodkladu: null, vPodkladu: true, ...c };
}
export function den(datum: string, typ: TypDne, hodiny: number, kasa = false): Den {
  return { zamestnanecId: 'z1', datum, typ, minuty: Math.round(hodiny * 60), kasa, poznamka: null };
}
export function dnyPrace(datumy: string[], hodiny: number, kasa = false): Den[] {
  return datumy.map((d) => den(d, 'PRACE', hodiny, kasa));
}
export function sazba(hodinovaKc: number, platiOd = '2020-01-01'): Sazba {
  return { id: `s-${platiOd}`, zamestnanecId: 'z1', platiOd, hodinovaHal: Math.round(hodinovaKc * 100) };
}
export function vstup(c: Partial<MesicniVstup> = {}): MesicniVstup {
  return { zamestnanecId: 'z1', rok: 2026, mesic: 10, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0,
    srazkyHal: 0, prumernyVydelekHal: null, poznamka: null, ...c };
}
export function vstupVypoctu(c: Partial<VstupVypoctu>): VstupVypoctu {
  return { rok: 2026, mesic: 10, zamestnanec: zam(), sazby: [sazba(160)], dny: [], dnyPredchozi: [],
    vstup: null, nastaveni: { ...VYCHOZI_NASTAVENI }, prumernyVydelekHal: null, dppMinutyPredMesicem: 0, ...c };
}
