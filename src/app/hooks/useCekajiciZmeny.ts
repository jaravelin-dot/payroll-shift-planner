// Uzávěrka měsíce musí počkat na rozdělaná a neuložená uložení docházky a odměn, jinak by server spočítal snímek
// z jiných dat, než ukazuje appka (a změna by po uzavření už nešla uložit).
import { useIsMutating, type QueryClient } from '@tanstack/react-query';
import { KLIC_ULOZ_DNY, KLIC_ULOZ_VSTUP } from '../api/dotazy';
import { neulozenaDochazka, tykaSeMesice, useNeulozenaDochazka, type NeulozenaZmenaDochazky } from '../stav/neulozenaDochazka';
import { neulozeneVstupy, useNeulozeneVstupy, type NeulozenyVstup } from '../stav/neulozeneVstupy';

type Mesic = { firmaId: string; rok: number; mesic: number };

function duvodCekani(m: Mesic, ukladaSe: boolean, dochazka: readonly NeulozenaZmenaDochazky[], vstupy: readonly NeulozenyVstup[]): string | null {
  const neulozeno = dochazka.some((p) => tykaSeMesice(p, m.firmaId, m.rok, m.mesic))
    || vstupy.some((p) => p.firmaId === m.firmaId && p.vstup.rok === m.rok && p.vstup.mesic === m.mesic);
  if (neulozeno) return 'Některé změny tohoto měsíce se neuložily (hláška nahoře). Ulož je, nebo zahoď, pak měsíc uzavři.';
  if (ukladaSe) return 'Ještě se ukládají změny docházky nebo odměn. Počkej chvilku.';
  return null;
}

/** Proč teď měsíc nejde uzavřít, česky; `null` = nic nečeká. */
export function useCekajiciZmeny(m: Mesic): string | null {
  const ukladaSe = useIsMutating({ mutationKey: KLIC_ULOZ_DNY }) + useIsMutating({ mutationKey: KLIC_ULOZ_VSTUP }) > 0;
  return duvodCekani(m, ukladaSe, useNeulozenaDochazka(), useNeulozeneVstupy());
}

/** Totéž mimo vykreslení (těsně před odesláním uzávěrky). */
export function cekajiciZmeny(qc: QueryClient, m: Mesic): string | null {
  const ukladaSe = qc.isMutating({ mutationKey: KLIC_ULOZ_DNY }) + qc.isMutating({ mutationKey: KLIC_ULOZ_VSTUP }) > 0;
  return duvodCekani(m, ukladaSe, neulozenaDochazka(), neulozeneVstupy());
}
