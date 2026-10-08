import { Plus, X } from 'lucide-react';
import { useRef } from 'react';
import type { Dite } from '../../shared/api';
import { Prepinac } from './Prepinac';
import { tridyTlacitka } from './Tlacitko';

type Props = {
  deti: Dite[];
  onZmena: (deti: Dite[]) => void;
};

/** Nejvíc dětí, které API přijme. */
const NEJVIC_DETI = 20;

/**
 * Děti pro daňové zvýhodnění v pořadí 1., 2., 3. a další (pořadí určuje výši zvýhodnění).
 * U každého jen průkaz ZTP/P, se kterým je zvýhodnění dvojnásobné.
 */
export function DetiEditor({ deti, onZmena }: Props) {
  const pridat = useRef<HTMLButtonElement>(null);

  const odeber = (index: number) => {
    onZmena(deti.filter((_d, i) => i !== index));
    pridat.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      {deti.length === 0 ? (
        <p className="text-15 text-tlumeny">Žádné děti.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-linka rounded-lg border border-linka">
          {deti.map((dite, index) => {
            const nazev = `${index + 1}. dítě`;
            return (
              <li key={index}>
                <div role="group" aria-label={nazev} className="flex items-center gap-3 py-1 pr-1 pl-4">
                  <span className="w-16 shrink-0 text-15 font-semibold tabular-nums">{nazev}</span>
                  <div className="min-w-0 flex-1">
                    <Prepinac
                      zapnuto={dite.ztpp}
                      onZmena={(ztpp) => onZmena(deti.map((d, i) => (i === index ? { ztpp } : d)))}
                      popisek="Průkaz ZTP/P"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => odeber(index)}
                    aria-label={`Odebrat ${nazev}`}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-tlumeny transition-colors duration-150 hover:bg-chyba/8 hover:text-chyba"
                  >
                    <X aria-hidden className="size-5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <button
          ref={pridat}
          type="button"
          onClick={() => onZmena([...deti, { ztpp: false }])}
          disabled={deti.length >= NEJVIC_DETI}
          className={tridyTlacitka('tiche')}
        >
          <Plus aria-hidden className="size-[18px]" />
          Přidat dítě
        </button>
      </div>
    </div>
  );
}
