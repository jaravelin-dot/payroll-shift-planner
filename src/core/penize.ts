// Pomocníky pro peníze. Haléře (`…Hal`) a celé Kč (`…Kc`) jsou vždy integery;
// celé výpočty jdou přes integer aritmetiku, aby nevznikaly chyby plovoucí čárky (0,1 + 0,2).

/** Nezlomitelná mezera (oddělovač tisíců) a typografické minus; escapem, aby byly v kódu vidět. */
const NBSP = '\u00a0';
const MINUS = '\u2212';

/** Převede -0 na 0 (`-0 + 0 === 0`), aby výsledky výpočtů nikdy nebyly záporná nula. */
const bezZapornehoNuly = (x: number): number => x + 0;

/** Celočíselné dělení dolů (směrem k −∞), přesné i pro záporná čísla. */
export function deleniDolu(a: number, b: number): number {
  const zbytek = a % b;
  return bezZapornehoNuly((a - zbytek) / b - (zbytek < 0 ? 1 : 0));
}

/** Celočíselné dělení nahoru (směrem k +∞), přesné i pro záporná čísla. */
export function deleniNahoru(a: number, b: number): number {
  const zbytek = a % b;
  return bezZapornehoNuly((a - zbytek) / b + (zbytek > 0 ? 1 : 0));
}

/** Matematické zaokrouhlení (půl od nuly) s odstraněním šumu plovoucí čárky. */
function zaokrouhliMatematicky(x: number): number {
  const absolutni = Math.abs(x);
  const ocistene = Math.round(absolutni * 1e6) / 1e6;
  return bezZapornehoNuly((x < 0 ? -1 : 1) * Math.round(ocistene));
}

/** Kč → haléře (zaokrouhleno na celé haléře). */
export function kcNaHal(kc: number): number {
  return zaokrouhliMatematicky(kc * 100);
}

/** Haléře zaokrouhlené na celé Kč matematicky (půl od nuly); vrací opět haléře: 15049 → 15000, 15050 → 15100. */
export function zaokrouhliHalNaKc(hal: number): number {
  const absolutni = Math.abs(hal) + 50;
  return bezZapornehoNuly((hal < 0 ? -1 : 1) * (absolutni - (absolutni % 100)));
}

/**
 * Zlomek `citatelHal / jmenovatel` (čitatel v haléřích, jmenovatel kladný integer) zaokrouhlený matematicky
 * (půl od nuly) na celé Kč; vrací haléře. Celé v integerech, takže hranice půl koruny je přesná:
 * 3000 / 60 → 100, 2999 / 60 → 0, -3000 / 60 → -100.
 */
export function zaokrouhliZlomekNaKc(citatelHal: number, jmenovatel: number): number {
  if (!Number.isInteger(citatelHal) || !Number.isInteger(jmenovatel) || jmenovatel <= 0) {
    throw new RangeError(`Zlomek haléřů potřebuje integer čitatel a kladný integer jmenovatel: ${citatelHal} / ${jmenovatel}`);
  }
  const kc = deleniDolu(Math.abs(citatelHal) + 50 * jmenovatel, 100 * jmenovatel);
  return bezZapornehoNuly((citatelHal < 0 ? -1 : 1) * kc * 100);
}

/** Haléře → celé Kč nahoru (3889501 → 38896). */
export function halNaKcNahoru(hal: number): number {
  return deleniNahoru(hal, 100);
}

/** Haléře → celé Kč dolů (720099 → 7200). */
export function halNaKcDolu(hal: number): number {
  return deleniDolu(hal, 100);
}

/** ⌈základ × promile / 1000⌉ v celých Kč; promile jako integer (7,1 % = 71). Záporný základ dává 0. */
export function procentoNahoru(zakladKc: number, promile: number): number {
  if (zakladKc <= 0) return 0;
  return deleniNahoru(zakladKc * promile, 1000);
}

/** ⌊základ × promile / 1000⌋ v celých Kč; promile jako integer. Záporný základ dává 0. */
export function procentoDolu(zakladKc: number, promile: number): number {
  if (zakladKc <= 0) return 0;
  return deleniDolu(zakladKc * promile, 1000);
}

/** Haléře × číslo (hodiny, podíl), výsledek matematicky zaokrouhlený na celé haléře. */
export function nasobHal(hal: number, cislo: number): number {
  return zaokrouhliMatematicky(hal * cislo);
}

/** Formát částky: „38 895 Kč", „2 849,50 Kč" (nezlomitelná mezera v tisících, čárka jen při nenulových haléřích). */
export function formatKc(hal: number): string {
  const absolutni = Math.abs(hal);
  const kc = deleniDolu(absolutni, 100);
  const zbytek = absolutni - kc * 100;
  const kcText = String(kc).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const halText = zbytek === 0 ? '' : `,${String(zbytek).padStart(2, '0')}`;
  return `${hal < 0 ? MINUS : ''}${kcText}${halText} Kč`;
}
