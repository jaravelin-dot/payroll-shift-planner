// Měsíční vstupy (odměny, srážky, průměr), jejichž uložení selhalo až po odchodu ze stránky člověka. Drží se v paměti,
// dokud se neuloží nebo je uživatel nezahodí: appka o nich dá vědět hláškou se „Zkusit znovu" (`NeulozeneVstupy`
// v rozvržení) a při návratu k člověku je stránka převezme jako rozpracované a odešle znovu.
import { useSyncExternalStore } from 'react';
import type { MesicniVstup } from '../../shared/api';

export type NeulozenyVstup = {
  firmaId: string;
  /** Komu a kdy, česky: „Jana Nováková, říjen 2026". */
  popis: string;
  vstup: MesicniVstup;
};

let polozky: readonly NeulozenyVstup[] = [];
const posluchaci = new Set<() => void>();

const stejny = (a: MesicniVstup, b: Pick<MesicniVstup, 'zamestnanecId' | 'rok' | 'mesic'>) =>
  a.zamestnanecId === b.zamestnanecId && a.rok === b.rok && a.mesic === b.mesic;

function nastav(nove: readonly NeulozenyVstup[]) {
  polozky = nove;
  for (const posluchac of posluchaci) posluchac();
}

/** Zapamatuje neuložený vstup (starší neuložený vstup téhož člověka a měsíce nahradí). */
export function pridejNeulozeny(polozka: NeulozenyVstup): void {
  nastav([...polozky.filter((p) => !stejny(p.vstup, polozka.vstup)), polozka]);
}

export function odeberNeulozeny(polozka: NeulozenyVstup): void {
  if (polozky.includes(polozka)) nastav(polozky.filter((p) => p !== polozka));
}

export function najdiNeulozeny(zamestnanecId: string, rok: number, mesic: number): NeulozenyVstup | undefined {
  return polozky.find((p) => stejny(p.vstup, { zamestnanecId, rok, mesic }));
}

/** Aktuální seznam mimo React (kontrola těsně před uzávěrkou). */
export function neulozeneVstupy(): readonly NeulozenyVstup[] {
  return polozky;
}

/** Odeslání vstupů, které ještě čekají na prodlevu před uložením (stránka člověka je ještě neposlala). */
const cekajici = new Set<() => Promise<unknown>>();

/** Stránka člověka přihlásí čekající uložení; vrátí odhlášení (po odeslání nebo odchodu ze stránky). */
export function prihlasCekajici(odeslat: () => Promise<unknown>): () => void {
  cekajici.add(odeslat);
  return () => cekajici.delete(odeslat);
}

/** Uzávěrka nečeká na prodlevu: čekající vstupy odešle hned a počká, až doběhnou (i neúspěšně). */
export async function odesliCekajici(): Promise<void> {
  await Promise.allSettled([...cekajici].map((odeslat) => odeslat()));
}

function prihlas(posluchac: () => void) {
  posluchaci.add(posluchac);
  return () => posluchaci.delete(posluchac);
}

export function useNeulozeneVstupy(): readonly NeulozenyVstup[] {
  return useSyncExternalStore(prihlas, () => polozky);
}
