// Porovnání variant odměny za den (spec 5.12): dnešní „propadá při nemoci" proti variantě bez podmínky. Jen výpočet,
// nic se neukládá.
import { vypocitejMzdu } from './vypocet';
import type { VstupVypoctu, VysledekVypoctu } from './typy';

export interface RadekPorovnani {
  zamestnanecId: string;
  jmeno: string;
  dnes: { hrubaHal: number; kVyplateHal: number; nakladFirmyHal: number };
  /** Výpočet s `odmenaZaDenPropadaPriNemoci: false`. */
  bezPodminky: { hrubaHal: number; kVyplateHal: number; nakladFirmyHal: number };
  rozdilKVyplateHal: number;
  rozdilNakladuHal: number;
}

const souhrn = (r: VysledekVypoctu): RadekPorovnani['dnes'] => ({
  hrubaHal: r.hrubaHal, kVyplateHal: r.kVyplateHal, nakladFirmyHal: r.nakladFirmyHal,
});

export function porovnejOdmeny(vstupy: VstupVypoctu[]): RadekPorovnani[] {
  return vstupy.map((v) => {
    const dnes = souhrn(vypocitejMzdu(v));
    const bezPodminky = souhrn(vypocitejMzdu({ ...v, nastaveni: { ...v.nastaveni, odmenaZaDenPropadaPriNemoci: false } }));
    return {
      zamestnanecId: v.zamestnanec.id,
      jmeno: `${v.zamestnanec.jmeno} ${v.zamestnanec.prijmeni}`,
      dnes,
      bezPodminky,
      rozdilKVyplateHal: bezPodminky.kVyplateHal - dnes.kVyplateHal,
      rozdilNakladuHal: bezPodminky.nakladFirmyHal - dnes.nakladFirmyHal,
    };
  });
}
