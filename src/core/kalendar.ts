// Kalendář a státní svátky. Data jsou text `YYYY-MM-DD`; veškerá aritmetika běží v UTC,
// aby výsledek nezáležel na časovém pásmu ani na letním času.
import type { NastaveniFirmy, Smlouva } from '../shared/api';
import type { ParametryRoku } from './parametry/typy';

const DEN_MS = 24 * 60 * 60 * 1000;

function dvouciferne(n: number): string {
  return String(n).padStart(2, '0');
}

function slozDatum(rok: number, mesic: number, den: number): string {
  return `${String(rok).padStart(4, '0')}-${dvouciferne(mesic)}-${dvouciferne(den)}`;
}

/** Rozloží `YYYY-MM-DD` na UTC čas v ms; neplatné nebo neexistující datum (např. 2026-02-30) je chyba. */
export function datumNaMs(datum: string): number {
  const shoda = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (shoda) {
    const [rok, mesic, den] = [Number(shoda[1]), Number(shoda[2]), Number(shoda[3])];
    const ms = Date.UTC(rok, mesic - 1, den);
    const d = new Date(ms);
    if (d.getUTCFullYear() === rok && d.getUTCMonth() === mesic - 1 && d.getUTCDate() === den) return ms;
  }
  throw new RangeError(`Neplatné datum: ${datum}`);
}

function msNaDatum(ms: number): string {
  const d = new Date(ms);
  return slozDatum(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function zkontrolujMesic(mesic: number): void {
  if (!Number.isInteger(mesic) || mesic < 1 || mesic > 12) throw new RangeError(`Neplatný měsíc: ${mesic}`);
}

/** Datum Velikonoční neděle (anonymní gregoriánský algoritmus, Meeus/Jones/Butcher). */
function velikonocniNedele(rok: number): { mesic: number; den: number } {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const soucet = h + l - 7 * m + 114;
  return { mesic: Math.floor(soucet / 31), den: (soucet % 31) + 1 };
}

/** Státní svátky a ostatní svátky (dny pracovního klidu) roku: datum → název; zákon č. 245/2000 Sb., §§ 1–2. */
export function svatky(rok: number): Map<string, string> {
  const nedele = velikonocniNedele(rok);
  const nedeleMs = Date.UTC(rok, nedele.mesic - 1, nedele.den);
  const polozky: [string, string][] = [
    [slozDatum(rok, 1, 1), 'Nový rok, Den obnovy samostatného českého státu'],
    [msNaDatum(nedeleMs - 2 * DEN_MS), 'Velký pátek'],
    [msNaDatum(nedeleMs + DEN_MS), 'Velikonoční pondělí'],
    [slozDatum(rok, 5, 1), 'Svátek práce'],
    [slozDatum(rok, 5, 8), 'Den vítězství'],
    [slozDatum(rok, 7, 5), 'Den slovanských věrozvěstů Cyrila a Metoděje'],
    [slozDatum(rok, 7, 6), 'Den upálení mistra Jana Husa'],
    [slozDatum(rok, 9, 28), 'Den české státnosti'],
    [slozDatum(rok, 10, 28), 'Den vzniku samostatného československého státu'],
    [slozDatum(rok, 11, 17), 'Den boje za svobodu a demokracii'],
    [slozDatum(rok, 12, 24), 'Štědrý den'],
    [slozDatum(rok, 12, 25), '1. svátek vánoční'],
    [slozDatum(rok, 12, 26), '2. svátek vánoční'],
  ];
  return new Map(polozky.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)));
}

/** Je datum státním nebo ostatním svátkem? */
export function jeSvatek(datum: string): boolean {
  datumNaMs(datum);
  return svatky(Number(datum.slice(0, 4))).has(datum);
}

/** Den v týdnu: 1 = pondělí … 7 = neděle. */
export function denVTydnu(datum: string): number {
  const den = new Date(datumNaMs(datum)).getUTCDay();
  return den === 0 ? 7 : den;
}

/** Všechny dny měsíce jako `YYYY-MM-DD` (mesic 1–12). */
export function dnyMesice(rok: number, mesic: number): string[] {
  zkontrolujMesic(mesic);
  const pocet = new Date(Date.UTC(rok, mesic, 0)).getUTCDate();
  return Array.from({ length: pocet }, (_, i) => slozDatum(rok, mesic, i + 1));
}

/** Posune datum o `dnu` dnů (i záporně). */
export function posunDatum(datum: string, dnu: number): string {
  return msNaDatum(datumNaMs(datum) + dnu * DEN_MS);
}

export function predchoziMesic(rok: number, mesic: number): { rok: number; mesic: number } {
  zkontrolujMesic(mesic);
  return mesic === 1 ? { rok: rok - 1, mesic: 12 } : { rok, mesic: mesic - 1 };
}

/** Kalendářní čtvrtletí měsíce (1–4). */
export function ctvrtleti(mesic: number): 1 | 2 | 3 | 4 {
  zkontrolujMesic(mesic);
  return (Math.floor((mesic - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Tři měsíce čtvrtletí, do kterého `mesic` patří. */
export function mesiceCtvrtleti(rok: number, mesic: number): { rok: number; mesic: number }[] {
  const prvni = (ctvrtleti(mesic) - 1) * 3 + 1;
  return [0, 1, 2].map((posun) => ({ rok, mesic: prvni + posun }));
}

/** Tři měsíce čtvrtletí předcházejícího čtvrtletí, do kterého `mesic` patří (rozhodné období průměrného výdělku, § 354 ZP). */
export function predchoziCtvrtleti(rok: number, mesic: number): { rok: number; mesic: number }[] {
  const q = ctvrtleti(mesic);
  return q === 1 ? mesiceCtvrtleti(rok - 1, 10) : mesiceCtvrtleti(rok, (q - 2) * 3 + 1);
}

/**
 * Hodinová minimální mzda při dané týdenní pracovní době, § 111 odst. 5 ZP: při 40 h základní sazba,
 * při kratší době úměrně vyšší (× 40 / doba), na desetihaléře nahoru. Doba nad 40 h sazbu nesnižuje.
 */
export function hodinovaMinMzdaHal(p: ParametryRoku, tydenniDoba: number): number {
  // Doba se počítá v setinách hodiny; pod 0,005 h by zaokrouhleně vyšla nula a dělení nekonečno.
  const dobaSetiny = Number.isFinite(tydenniDoba) ? Math.round(tydenniDoba * 100) : Number.NaN;
  if (!(dobaSetiny > 0)) throw new RangeError(`Neplatná týdenní doba: ${tydenniDoba}`);
  if (tydenniDoba >= 40) return p.minMzdaHodHal;
  // minMzdaHodHal × 40 / doba na desetihaléře nahoru, vše v integerech (doba v setinách hodiny).
  const citatel = p.minMzdaHodHal * 4000;
  const jmenovatel = dobaSetiny * 10;
  const desetihalere = Math.floor(citatel / jmenovatel) + (citatel % jmenovatel === 0 ? 0 : 1);
  return desetihalere * 10;
}

/**
 * Hodinová minimální mzda, od které se počítá doplatek do minima a nejnižší průměrný hodinový výdělek:
 * HPP podle týdenní pracovní doby firmy, DPP vždy základní sazba (§ 111 ZP).
 */
export function hodinovaMinimalniMzdaProZamestnance(p: ParametryRoku, nastaveni: NastaveniFirmy, smlouva: Smlouva): number {
  return smlouva === 'HPP' ? hodinovaMinMzdaHal(p, nastaveni.tydenniPracovniDoba) : p.minMzdaHodHal;
}
