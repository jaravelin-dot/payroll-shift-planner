// Příprava vstupu výpočtu: z dat měsíce, jak je vrací API (`MesicData`), složí `VstupVypoctu` jednoho zaměstnance.
// Používá ho prohlížeč (okamžitý přepočet) i Worker (přepočet při uzávěrce), takže oba počítají ze stejného vstupu.
import type { MesicData } from '../shared/api';
import { hodinovaMinimalniMzdaProZamestnance, predchoziMesic } from './kalendar';
import { parametryRoku } from './parametry';
import { jeVPomeru } from './plan';
import { vyresPrumernyVydelek } from './prumernyVydelek';
import type { VstupVypoctu } from './typy';

/** `YYYY-MM` pro porovnání s předponou data. */
function klicMesice(rok: number, mesic: number): string {
  return `${String(rok).padStart(4, '0')}-${String(mesic).padStart(2, '0')}`;
}

export function pripravVstup(data: MesicData, zamestnanecId: string): VstupVypoctu {
  const nalezeny = data.zamestnanci.find((z) => z.id === zamestnanecId);
  if (nalezeny === undefined) {
    throw new Error(`Zaměstnanec ${zamestnanecId} není v datech měsíce ${data.mesic}/${data.rok}.`);
  }
  const { sazby, ...zamestnanec } = nalezeny;
  const nastaveni = data.firma.nastaveni;

  const tentoMesic = klicMesice(data.rok, data.mesic);
  const predchozi = predchoziMesic(data.rok, data.mesic);
  const minulyMesic = klicMesice(predchozi.rok, predchozi.mesic);
  const dnyZamestnance = data.dny.filter((d) => d.zamestnanecId === zamestnanecId);
  // Docházka mimo pracovní poměr (před nástupem, po ukončení) se neplatí ani nepočítá do epizody nemoci; dny tohoto
  // měsíce se jen vypíšou ve varování, aby je šlo smazat nebo opravit datum nástupu či ukončení.
  const vPomeru = dnyZamestnance.filter((d) => jeVPomeru(zamestnanec, d.datum));
  const dnyMimoPomer = dnyZamestnance.filter((d) => d.datum.slice(0, 7) === tentoMesic && !jeVPomeru(zamestnanec, d.datum)).map((d) => d.datum);

  // Hodinová minimální mzda jako ve výpočtu mzdy: HPP podle týdenní doby firmy, DPP základní.
  const p = parametryRoku(data.rok);
  const minHodHal = hodinovaMinimalniMzdaProZamestnance(p, nastaveni, zamestnanec.smlouva);
  const pv = vyresPrumernyVydelek({
    zamestnanecId, rok: data.rok, mesic: data.mesic,
    vstupy: data.vstupy, uzaverkyPredchozihoCtvrtleti: data.uzaverkyPredchozihoCtvrtleti, minHodHal,
  });

  return {
    rok: data.rok, mesic: data.mesic,
    zamestnanec,
    sazby,
    dny: vPomeru.filter((d) => d.datum.slice(0, 7) === tentoMesic),
    dnyPredchozi: vPomeru.filter((d) => d.datum.slice(0, 7) === minulyMesic),
    vstup: data.vstupy.find((v) => v.zamestnanecId === zamestnanecId && v.rok === data.rok && v.mesic === data.mesic) ?? null,
    nastaveni,
    prumernyVydelekHal: pv.pvHal,
    dppMinutyPredMesicem: data.dppMinutyPredMesicem[zamestnanecId] ?? 0,
    dnyMimoPomer,
  };
}
