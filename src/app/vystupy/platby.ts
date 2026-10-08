// Platby měsíce (spec 7): komu kolik a jak. Kladná částka a platné číslo účtu → QR Platba (SPAYD); bez platného účtu
// hotově. QR se nikdy neskládá pro nulovou ani zápornou částku (spayd by u záporné vyhodil chybu a banka by ji odmítla).
// Člověk, který je jen ve snímku uzávěrky a mezi lidmi firmy už není, nemá známý účet: nelze říct, že dostane hotově,
// proto má vlastní stav a do součtu hotovosti se nepočítá.
import { spayd, ucetNaIban } from '../../core/platby';
import type { Zamestnanec } from '../../shared/api';
import { celeJmeno, type RadekVyplaty } from '../radkyVyplat';

export type StavPlatby = 'QR' | 'HOTOVE' | 'NEZNAMY' | 'NIC' | 'ZAPORNA';

export interface PolozkaPlatby {
  zamestnanecId: string;
  jmeno: string;
  prijmeni: string;
  ucet: string | null;
  /** Účet je vyplněný, ale neprošel kontrolou (tvar nebo kontrolní součet). */
  neplatnyUcet: boolean;
  kVyplateHal: number;
  stav: StavPlatby;
  /** Text QR Platby, jen u stavu QR. */
  spayd: string | null;
  zprava: string;
  vs: string;
}

export interface SoucetPlateb { pocet: number; castkaHal: number }

const dvojmistne = (mesic: number) => String(mesic).padStart(2, '0');

/** Zpráva pro příjemce „Mzda 10/2026 Nováková" (diakritiku z QR odstraní až `spayd`) a variabilní symbol 102026. */
export const zpravaPlatby = (prijmeni: string, rok: number, mesic: number) => `Mzda ${dvojmistne(mesic)}/${rok} ${prijmeni}`.trim();
export const vsPlatby = (rok: number, mesic: number) => `${dvojmistne(mesic)}${rok}`;

export function platbyMesice(a: { radky: RadekVyplaty[]; zamestnanci: Pick<Zamestnanec, 'id' | 'ucet'>[]; rok: number; mesic: number }): {
  polozky: PolozkaPlatby[]; naUcet: SoucetPlateb; hotove: SoucetPlateb; neznamy: SoucetPlateb;
} {
  const ucty = new Map(a.zamestnanci.map((z) => [z.id, z.ucet]));
  const vs = vsPlatby(a.rok, a.mesic);
  const naUcet: SoucetPlateb = { pocet: 0, castkaHal: 0 };
  const hotove: SoucetPlateb = { pocet: 0, castkaHal: 0 };
  const neznamy: SoucetPlateb = { pocet: 0, castkaHal: 0 };

  const polozky = a.radky.map((r): PolozkaPlatby => {
    const zname = ucty.has(r.zamestnanecId);
    const ucet = ucty.get(r.zamestnanecId)?.trim() || null;
    const iban = ucet ? ucetNaIban(ucet) : null;
    const kVyplateHal = r.vysledek.kVyplateHal;
    const zprava = zpravaPlatby(r.prijmeni, a.rok, a.mesic);
    const zaklad = { zamestnanecId: r.zamestnanecId, jmeno: celeJmeno(r), prijmeni: r.prijmeni, ucet, neplatnyUcet: ucet !== null && iban === null, kVyplateHal, zprava, vs };
    if (kVyplateHal < 0) return { ...zaklad, stav: 'ZAPORNA', spayd: null };
    if (kVyplateHal === 0) return { ...zaklad, stav: 'NIC', spayd: null };
    if (!zname) {
      neznamy.pocet += 1;
      neznamy.castkaHal += kVyplateHal;
      return { ...zaklad, stav: 'NEZNAMY', spayd: null };
    }
    if (iban === null) {
      hotove.pocet += 1;
      hotove.castkaHal += kVyplateHal;
      return { ...zaklad, stav: 'HOTOVE', spayd: null };
    }
    naUcet.pocet += 1;
    naUcet.castkaHal += kVyplateHal;
    return { ...zaklad, stav: 'QR', spayd: spayd({ iban, castkaHal: kVyplateHal, zprava, vs }) };
  });
  return { polozky, naUcet, hotove, neznamy };
}
