// Jen pro testy výstupů: zlatý scénář A z jádra (plný měsíc HPP, říjen 2026). Jana Nováková, K výplatě 31 422 Kč,
// náklad firmy 50 269 Kč (viz src/core/vypocet.test.ts).
import { den, dnyPrace, sazba, vstup, vstupVypoctu, zam } from '../../core/test-utils';
import type { VysledekVypoctu } from '../../core/typy';
import { vypocitejMzdu } from '../../core/vypocet';
import { VYCHOZI_NASTAVENI, type Den } from '../../shared/api';

const PRAC10 = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'];

/** Dny scénáře A (zaměstnanec `z1`). */
export const DNY_A: Den[] = [
  ...dnyPrace(PRAC10, 8, true),
  ...dnyPrace(['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'], 8),
  den('2026-10-03', 'PRACE', 6), den('2026-10-10', 'PRACE', 6), den('2026-10-11', 'PRACE', 5),
  den('2026-10-28', 'PRACE', 8), den('2026-10-30', 'DOVOLENA', 8),
];

export function vysledekA(): VysledekVypoctu {
  return vypocitejMzdu(vstupVypoctu({ dny: DNY_A, prumernyVydelekHal: 19000, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }));
}

/**
 * Scénář E z jádra (nemoc přes hranici měsíce, odměna propadla, doplatek ZP do minima) s půjčkou 500 Kč srážkou,
 * jinými odměnami 300 Kč a stravným 150 Kč za nárok (část nad limitem se daní): náhrada za nemoc, srážky, doplatek ZP
 * i zdanitelné stravné v jednom výsledku.
 */
export function vysledekNemocSrazky(): VysledekVypoctu {
  const zari = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']
    .map((d) => den(d, 'NEMOC', ['2026-09-26', '2026-09-27'].includes(d) ? 0 : 8));
  const nemoc = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((d) => den(`2026-10-${d}`, 'NEMOC', ['03', '04', '10'].includes(d) ? 0 : 8));
  const prace = dnyPrace(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'], 8);
  return vypocitejMzdu(vstupVypoctu({
    dny: [...nemoc, ...prace], dnyPredchozi: zari, sazby: [sazba(180)], prumernyVydelekHal: 20000,
    vstup: vstup({ odmenaZaDenHal: 18000, jineOdmenyHal: 30000, srazkyHal: 50000 }),
    nastaveni: { ...VYCHOZI_NASTAVENI, stravnePausalHal: 15000 },
  }));
}

/** Scénář F z jádra: dvě děti, daňový bonus a slevy na dani. */
export const vysledekBonus = (): VysledekVypoctu => vypocitejMzdu(vstupVypoctu({
  zamestnanec: zam({ deti: [{ ztpp: false }, { ztpp: false }] }), sazby: [sazba(200)], dny: dnyPrace(PRAC10, 10), prumernyVydelekHal: 20000,
}));

/** Scénář B z jádra: DPP bez prohlášení pod hranicí, srážková daň. */
export const vysledekSrazkovaDan = (): VysledekVypoctu => vypocitejMzdu(vstupVypoctu({
  zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }), sazby: [sazba(180)],
  dny: dnyPrace(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'], 8), prumernyVydelekHal: 18000,
}));
