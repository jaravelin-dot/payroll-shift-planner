// Náhrada za nemoc: redukce průměrného výdělku a určení dnů epizody, za které zaměstnavatel platí.
import type { Den } from '../shared/api';
import { posunDatum } from './kalendar';

/** Zaměstnavatel platí náhradu za prvních 14 kalendářních dnů pracovní neschopnosti. */
const DNY_NAHRADY = 14;

/**
 * Redukovaný průměrný výdělek (haléře za hodinu): do 1. hranice 90 %, mezi 1. a 2. 60 %,
 * mezi 2. a 3. 30 %, nad 3. hranicí nic. Matematicky na celé haléře.
 */
export function redukovanyPvHal(pvHal: number, hranice: readonly [number, number, number]): number {
  const [h1, h2, h3] = hranice;
  const pasmo1 = Math.max(0, Math.min(pvHal, h1));
  const pasmo2 = Math.max(0, Math.min(pvHal, h2) - h1);
  const pasmo3 = Math.max(0, Math.min(pvHal, h3) - h2);
  // Součet v desetinách haléře (90 % = 9, 60 % = 6, 30 % = 3), dělení deseti s půlkou nahoru, vše integer.
  const desetiny = 9 * pasmo1 + 6 * pasmo2 + 3 * pasmo3;
  return Math.floor((desetiny + 5) / 10);
}

/**
 * Rozdělí dny NEMOC měsíce podle pořadí kalendářního dne v epizodě. Epizoda je souvislá řada
 * po sobě jdoucích kalendářních dnů typu NEMOC (i s 0 minutami), která může začínat už v předchozím
 * měsíci. Dny 1.–14. s minutami > 0 → `nahrazovane`, dny od 15. s minutami > 0 → `nadLimit`.
 */
export function dnyNahradyNemoci(dny: Den[], dnyPredchozi: Den[]): { nahrazovane: Den[]; nadLimit: Den[] } {
  const nemoc = new Set<string>();
  for (const d of [...dnyPredchozi, ...dny]) if (d.typ === 'NEMOC') nemoc.add(d.datum);

  const nahrazovane: Den[] = [];
  const nadLimit: Den[] = [];
  const serazene = dny.filter((d) => d.typ === 'NEMOC').sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  for (const d of serazene) {
    let poradi = 1;
    for (let datum = posunDatum(d.datum, -1); nemoc.has(datum); datum = posunDatum(datum, -1)) poradi += 1;
    if (d.minuty <= 0) continue;
    (poradi <= DNY_NAHRADY ? nahrazovane : nadLimit).push(d);
  }
  return { nahrazovane, nadLimit };
}
