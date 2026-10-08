// Změny docházky, jejichž uložení selhalo (výpadek sítě, chyba serveru, mezitím uzavřený měsíc). Data měsíce se po chybě
// vrátí na stav serveru, takže bez tohohle seznamu by změna z karty tiše zmizela. Drží se v paměti, dokud se neuloží nebo je
// uživatel nezahodí: appka o nich dá vědět hláškou se „Zkusit znovu" (`NeulozenaDochazka` v rozvržení) a uzávěrka měsíce
// na ně počká. Plní ho `useUlozDny`.
import { useSyncExternalStore } from 'react';
import type { UlozDny } from '../../shared/api';

export type NeulozenaZmenaDochazky = {
  id: number;
  firmaId: string;
  /** Čí docházka, česky: „Jana Nováková". */
  kdo: string;
  zmena: UlozDny;
  /** Proč se neuložila, česky. */
  duvod: string;
};

let polozky: readonly NeulozenaZmenaDochazky[] = [];
let posledniId = 0;
const posluchaci = new Set<() => void>();

function nastav(nove: readonly NeulozenaZmenaDochazky[]) {
  polozky = nove;
  for (const posluchac of posluchaci) posluchac();
}

/** Data všech dnů, kterých se změna týká (zapsané i smazané). */
export const datumyZmeny = (zmena: Pick<UlozDny, 'dny' | 'smazat'>): string[] => [...zmena.dny.map((d) => d.datum), ...(zmena.smazat ?? [])];

/** Položka bez daných dnů daného člověka (novější změna je přebila); `null`, když z ní nic nezbylo. */
function bezDnu(p: NeulozenaZmenaDochazky, zamestnanecId: string, datumy: ReadonlySet<string>): NeulozenaZmenaDochazky | null {
  if (p.zmena.zamestnanecId !== zamestnanecId) return p;
  const dny = p.zmena.dny.filter((d) => !datumy.has(d.datum));
  const smazat = (p.zmena.smazat ?? []).filter((d) => !datumy.has(d));
  if (dny.length === p.zmena.dny.length && smazat.length === (p.zmena.smazat ?? []).length) return p;
  if (dny.length === 0 && smazat.length === 0) return null;
  return { ...p, zmena: { zamestnanecId, dny, ...(smazat.length > 0 ? { smazat } : {}) } };
}

function bezZmeny(zmena: UlozDny): NeulozenaZmenaDochazky[] {
  const datumy = new Set(datumyZmeny(zmena));
  return polozky.map((p) => bezDnu(p, zmena.zamestnanecId, datumy)).filter((p): p is NeulozenaZmenaDochazky => p !== null);
}

/** Zapamatuje neuloženou změnu; stejné dny téhož člověka ze starších neuložených změn nahradí. */
export function pridejNeulozenouDochazku(polozka: Omit<NeulozenaZmenaDochazky, 'id'>): void {
  nastav([...bezZmeny(polozka.zmena), { ...polozka, id: ++posledniId }]);
}

/** Změna dnů se uložila: starší neuložená změna týchž dnů už neplatí (jinak by ji „Zkusit znovu" přepsalo). */
export function dochazkaUlozena(zmena: UlozDny): void {
  const nove = bezZmeny(zmena);
  if (nove.length !== polozky.length || nove.some((p, i) => p !== polozky[i])) nastav(nove);
}

export function odeberNeulozenouDochazku(polozka: NeulozenaZmenaDochazky): void {
  if (polozky.includes(polozka)) nastav(polozky.filter((p) => p !== polozka));
}

/** Týká se neuložená změna daného měsíce firmy? */
export function tykaSeMesice(p: NeulozenaZmenaDochazky, firmaId: string, rok: number, mesic: number): boolean {
  const klic = `${String(rok).padStart(4, '0')}-${String(mesic).padStart(2, '0')}-`;
  return p.firmaId === firmaId && datumyZmeny(p.zmena).some((d) => d.startsWith(klic));
}

/** Aktuální seznam mimo React (kontrola těsně před uzávěrkou). */
export function neulozenaDochazka(): readonly NeulozenaZmenaDochazky[] {
  return polozky;
}

function prihlas(posluchac: () => void) {
  posluchaci.add(posluchac);
  return () => posluchaci.delete(posluchac);
}

export function useNeulozenaDochazka(): readonly NeulozenaZmenaDochazky[] {
  return useSyncExternalStore(prihlas, () => polozky);
}
