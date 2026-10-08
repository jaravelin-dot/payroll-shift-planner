import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import type { Firma } from '../../shared/api';

type Props = {
  firmy: Firma[];
  vybranaId: string | undefined;
  onZmena: (id: string) => void;
};

const NAZEV = 'line-clamp-2 text-15 leading-[1.15rem] font-semibold break-words';

/**
 * Výběr firmy bez vlastního rámečku (rámuje ho okolí). Název se smí zalomit na dva řádky; nad ním leží
 * průhledný nativní select (telefon otevře systémový výběr, 17 px písmo brání zoomu na iOS).
 * S jedinou firmou jen její název.
 */
export function PrepinacFirmy({ firmy, vybranaId, onZmena }: Props) {
  const id = useId();
  const vybrana = firmy.find((f) => f.id === vybranaId);

  if (firmy.length <= 1) {
    return (
      <div className="flex min-h-11 min-w-0 items-center px-3 py-1.5">
        <p className={NAZEV}>{vybrana?.nazev}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-11 min-w-0 items-center rounded-lg py-1.5 pr-8 pl-3 transition-colors duration-150 hover:bg-inkoust/6 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-akce">
      <span aria-hidden className={NAZEV}>
        {vybrana?.nazev}
      </span>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-[18px] -translate-y-1/2 text-tlumeny" />
      <label htmlFor={id} className="sr-only">
        Firma
      </label>
      <select
        id={id}
        value={vybranaId}
        onChange={(e) => onZmena(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 text-17"
      >
        {firmy.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nazev}
          </option>
        ))}
      </select>
    </div>
  );
}
