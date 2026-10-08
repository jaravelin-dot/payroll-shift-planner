// Čísla zadávaná ve formulářích česky („300", „129,50", „37,5", „1 200") a zpět na text. Appka je ukládá jako celé
// haléře a celé minuty; převod jde přes setiny v integerech, aby nevznikaly chyby plovoucí čárky.
import { formatKc } from '../core/penize';

/** Úzká nezlomitelná mezera před jednotkou (stejně jako u Kč v `Castka`). */
const UZKA_MEZERA = ' ';
const MINUS = '−';

/** Nejvýš dvě desetinná místa, desetinná čárka i tečka; mezery (i nezlomitelné) jako oddělovač tisíců. */
const TVAR = /^(-?)(\d{1,9})(?:[.,](\d{1,2}))?$/;

/** Hláška u pole s částkou, kterou nejde přečíst. */
export const CHYBA_CASTKY = 'Zadej částku v Kč, nejvýš s haléři, např. 300 nebo 129,50.';

/** Text → setiny (číslo × 100 jako integer); `null`, když to není číslo ve tvaru výše. */
function naSetiny(text: string, zaporne: boolean): number | null {
  const shoda = TVAR.exec(text.replace(/\s/g, '').replace(MINUS, '-'));
  if (shoda === null || (shoda[1] === '-' && !zaporne)) return null;
  const setiny = Number(shoda[2]) * 100 + Number((shoda[3] ?? '').padEnd(2, '0'));
  return shoda[1] === '-' && setiny !== 0 ? -setiny : setiny;
}

/** Kč → celé haléře: „300" → 30000, „129,50" → 12950. Záporné nebo víc než dvě desetinná místa → `null`. */
export function textNaHal(text: string): number | null {
  return naSetiny(text, false);
}

/** Hodiny → celé minuty: „30" → 1800, „37,5" → 2250 (zlomek minuty se zaokrouhlí). Záporné jen se `zaporne`. */
export function textNaMinuty(text: string, { zaporne = false }: { zaporne?: boolean } = {}): number | null {
  const setiny = naSetiny(text, zaporne);
  // setiny × 60 / 100 = setiny × 3 / 5: zlomek nikdy není přesně ½, takže zaokrouhlení je jednoznačné.
  return setiny === null ? null : Math.round((setiny * 3) / 5) + 0;
}

/** Desetinné číslo (např. týdenní pracovní doba v hodinách): „37,5" → 37.5. */
export function textNaCislo(text: string): number | null {
  const setiny = naSetiny(text, false);
  return setiny === null ? null : setiny / 100;
}

/** Haléře → text do pole: 30000 → „300", 12950 → „129,50", -50 → „-0,50" (bez oddělovače tisíců). */
export function halNaText(hal: number): string {
  // Znaménko zvlášť: u -50 haléřů jsou celé Kč nula a ta by minus ztratila.
  const znamenko = hal < 0 ? '-' : '';
  const abs = Math.abs(hal);
  const kc = Math.trunc(abs / 100);
  const zbytek = abs % 100;
  return `${znamenko}${zbytek === 0 ? kc : `${kc},${String(zbytek).padStart(2, '0')}`}`;
}

/** Minuty → hodiny do pole: 2250 → „37,5", 20 → „0,33" (nejvýš dvě desetinná místa). */
export function minutyNaText(minuty: number): string {
  return cisloNaText(Math.round((minuty * 100) / 60) / 100);
}

/** Číslo → text s desetinnou čárkou: 37.5 → „37,5". */
export function cisloNaText(cislo: number): string {
  return String(cislo + 0).replace('.', ',');
}

/** Hodinová sazba k zobrazení: 16500 → „165 Kč/h", 16550 → „165,50 Kč/h". */
export function formatSazby(hal: number): string {
  // Stejný formát částky jako všude jinde (jádro): tisíce s nezlomitelnou mezerou, haléře jen nenulové.
  return formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč/h`);
}

/** Hodiny k zobrazení: 2250 → „37,5 h", −480 → „−8 h". */
export function formatHodin(minuty: number): string {
  return `${minutyNaText(minuty).replace('-', MINUS)}${UZKA_MEZERA}h`;
}
