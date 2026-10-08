// Dovolená (spec 5.9, 5.10): roční nárok HPP (poměrně k trvání pracovního poměru), nárok DPP z odpracovaných
// hodin a zůstatek. Minuty jsou integery; zlomky se zaokrouhlují nahoru celočíselně, ne přes `Math.ceil` nad floatem.
import type { DovolenaZustatek, Zamestnanec } from '../shared/api';
import { datumNaMs } from './kalendar';

const DEN_MS = 24 * 60 * 60 * 1000;

/** Pořadové číslo dne (UTC) z `YYYY-MM-DD`; jiný tvar i neexistující datum (2026-02-30) je chyba. */
function cisloDne(datum: string): number {
  return Math.round(datumNaMs(datum) / DEN_MS);
}

/** Celočíselné dělení nahoru pro nezáporný čitatel a kladný jmenovatel. */
function deleniNahoru(citatel: number, jmenovatel: number): number {
  const zbytek = citatel % jmenovatel;
  return (citatel - zbytek) / jmenovatel + (zbytek > 0 ? 1 : 0);
}

/** Počet dnů roku, kdy trval pracovní poměr (včetně prvního a posledního dne); 0, když v roce netrval. */
function dnyVPomeruVRoce(z: Zamestnanec, rok: number): { dnyVPomeru: number; dnyRoku: number } {
  const prvniDenRoku = cisloDne(`${String(rok).padStart(4, '0')}-01-01`);
  const posledniDenRoku = cisloDne(`${String(rok).padStart(4, '0')}-12-31`);
  const od = Math.max(cisloDne(z.nastup), prvniDenRoku);
  const doDne = Math.min(z.ukonceni === null ? posledniDenRoku : cisloDne(z.ukonceni), posledniDenRoku);
  return { dnyVPomeru: Math.max(0, doDne - od + 1), dnyRoku: posledniDenRoku - prvniDenRoku + 1 };
}

/**
 * Roční nárok na dovolenou HPP v minutách: ⌈4 týdny × úvazek × dny v poměru / dny roku⌉ na celé hodiny nahoru
 * (jedno zaokrouhlení, v integerech). Bez navýšení a převodu — ty přidává `zustatekDovolene`.
 */
export function narokDovoleneHppMin(z: Zamestnanec, rok: number): number {
  const { dnyVPomeru, dnyRoku } = dnyVPomeruVRoce(z, rok);
  return deleniNahoru(4 * z.uvazekMinTydne * dnyVPomeru, dnyRoku * 60) * 60;
}

/** Nárok DPP v minutách: ⌈⌊odpracované h / 20⌋ × 20 × 4 / 52⌉ h (za každých celých 20 odpracovaných hodin). */
export function narokDovoleneDppMin(odpracovanoMinVRoce: number): number {
  const bloky = Math.max(0, Math.floor(odpracovanoMinVRoce / 1200)); // 20 h = 1200 min
  return deleniNahoru(bloky * 20 * 4, 52) * 60;
}

/**
 * Zůstatek dovolené za rok: nárok (HPP z úvazku a doby poměru, DPP z odpracovaných minut) + nárok navíc + převod
 * z minulého roku; zbývá = nárok − čerpáno. Zůstatek může být záporný (čerpáno víc, než je nárok).
 */
export function zustatekDovolene(a: { z: Zamestnanec; rok: number; cerpanoMin: number; praceMin: number; zustatek: DovolenaZustatek | null }):
  { narokMin: number; cerpanoMin: number; zbyvaMin: number } {
  const zaklad = a.z.smlouva === 'HPP' ? narokDovoleneHppMin(a.z, a.rok) : narokDovoleneDppMin(a.praceMin);
  const narokMin = zaklad + (a.zustatek?.narokNavicMin ?? 0) + (a.zustatek?.prevodMin ?? 0);
  return { narokMin, cerpanoMin: a.cerpanoMin, zbyvaMin: narokMin - a.cerpanoMin };
}
