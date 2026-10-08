// Platby (spec 7): české číslo účtu → IBAN a řetězec QR Platby (SPAYD). Čisté funkce, bez I/O.

/** Váhy pro kontrolu čísla účtu (10 číslic) a předčíslí (6 číslic); vážený součet musí být dělitelný 11 (vyhláška ČNB č. 169/2011 Sb.). */
const VAHY_CISLO = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1] as const;
const VAHY_PREDCISLI = [10, 5, 8, 4, 2, 1] as const;

/** `[předčíslí-]číslo/kód`; mezery se předem odstraní. Předčíslí 1–6, číslo 2–10 a kód právě 4 číslice. */
const TVAR_UCTU = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/;

function vazenySoucet(cislice: string, vahy: readonly number[]): number {
  let soucet = 0;
  for (let i = 0; i < cislice.length; i++) soucet += Number(cislice[i]) * vahy[i]!;
  return soucet;
}

/** Zbytek po dělení 97 dlouhého čísla zapsaného číslicemi (po číslicích, bez BigInt a bez ztráty přesnosti). */
function mod97(cislice: string): number {
  let zbytek = 0;
  for (const c of cislice) zbytek = (zbytek * 10 + Number(c)) % 97;
  return zbytek;
}

/**
 * České číslo účtu `[předčíslí-]číslo/kód` → IBAN (`CZkk` + kód 4 + předčíslí 6 + číslo 10, ISO 13616).
 * Před sestavením se ověří kontrolní součet předčíslí i čísla účtu (mod 11); neplatný vstup → `null`.
 */
export function ucetNaIban(ucet: string): string | null {
  const shoda = TVAR_UCTU.exec(ucet.replace(/\s+/g, ''));
  if (shoda === null) return null;
  const predcisli = (shoda[1] ?? '').padStart(6, '0');
  const cislo = shoda[2]!.padStart(10, '0');
  const kod = shoda[3]!;
  if (/^0+$/.test(cislo)) return null; // číslo účtu 0 projde kontrolním součtem, ale žádný účet to není
  if (vazenySoucet(predcisli, VAHY_PREDCISLI) % 11 !== 0 || vazenySoucet(cislo, VAHY_CISLO) % 11 !== 0) return null;
  const bban = `${kod}${predcisli}${cislo}`;
  // Kontrolní číslice: 98 − (BBAN + „CZ00" přepsané na číslice) mod 97; C = 12, Z = 35.
  const kontrolni = String(98 - mod97(`${bban}123500`)).padStart(2, '0');
  return `CZ${kontrolni}${bban}`;
}

/**
 * Písmena, která se NFD nerozloží na základní znak a diakritiku, ale mají blízkou ASCII podobu (např. Ł v Łukasz).
 * Každý jiný znak mimo tisknutelné ASCII se z textu zprávy vypustí.
 */
const BLIZKE_ASCII: Readonly<Record<string, string>> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ø: 'O', ø: 'o', ß: 'ss' };

/**
 * Zpráva pro příjemce: jen tisknutelné ASCII (NFD bez kombinujících znaků, pár písmen s blízkou ASCII podobou, ostatní
 * znaky mimo ASCII i řídicí znaky jako konec řádku pryč), bez hvězdičky (oddělovač polí), nejvýš 60 znaků.
 */
function zpravaSpayd(zprava: string): string {
  return zprava
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, (znak) => BLIZKE_ASCII[znak] ?? '')
    .replace(/\*/g, '')
    .slice(0, 60);
}

/**
 * Řetězec QR Platby (SPAYD 1.0): `SPD*1.0*ACC:…*AM:12345.50*CC:CZK*MSG:…[*X-VS:…]`.
 * Částka je celé haléře ≥ 0, `iban` tvar IBAN (bez mezer a `*`), `vs` jen číslice, nejvýš 10 (prázdný = vynechat);
 * jinak `RangeError`, aby nevznikl QR kód, který banka odmítne.
 */
export function spayd(a: { iban: string; castkaHal: number; zprava: string; vs?: string }): string {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(a.iban)) throw new RangeError(`Neplatný IBAN pro QR platbu: ${a.iban}`);
  if (!Number.isSafeInteger(a.castkaHal) || a.castkaHal < 0) {
    throw new RangeError(`Částka QR platby musí být nezáporný celý počet haléřů: ${a.castkaHal}`);
  }
  const halere = a.castkaHal % 100;
  const castka = `${(a.castkaHal - halere) / 100}.${String(halere).padStart(2, '0')}`;
  let text = `SPD*1.0*ACC:${a.iban}*AM:${castka}*CC:CZK*MSG:${zpravaSpayd(a.zprava)}`;
  if (a.vs !== undefined && a.vs !== '') {
    if (!/^\d{1,10}$/.test(a.vs)) throw new RangeError(`Variabilní symbol má mít nejvýš 10 číslic: ${a.vs}`);
    text += `*X-VS:${a.vs}`;
  }
  return text;
}
