import { ArrowUp, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { RolePlanu } from '../../shared/api';
import { useSablony } from '../api/dotazy';
import { casSablony } from './SablonySmen';
import { Sekce } from './Sekce';
import { tridyTlacitka } from './Tlacitko';
import { Volba } from './Volba';

const ROLE: { hodnota: RolePlanu; nazev: string }[] = [
  { hodnota: 'KASA', nazev: 'Zodpovědný kasař' },
  { hodnota: 'KASA_UCI_SE', nazev: 'Učí se kasu' },
  { hodnota: 'PRODEJNA', nazev: 'Prodejna' },
  { hodnota: 'DOZOR', nazev: 'Dozor' },
  { hodnota: 'MIMO_PLAN', nazev: 'Mimo plán' },
];

const NAPOVEDA_ROLE: Record<RolePlanu, string> = {
  KASA: 'Počítá se do dvou zodpovědných kasařů.',
  KASA_UCI_SE: 'Kasu jistí jen v nouzi, když zodpovědných není dost.',
  PRODEJNA: 'Obsluha prodejny, na kasu se nepočítá.',
  DOZOR: 'Má směnu podle pevného střídání, do obsazení se nepočítá.',
  MIMO_PLAN: 'Plánovač ho nikdy nenaplánuje (brigádníci).',
};

type Props = {
  firmaId: string;
  role: RolePlanu;
  stridani: string[];
  onRole: (role: RolePlanu) => void;
  onStridani: (stridani: string[]) => void;
};

/** Sekce formuláře zaměstnance: role v plánu směn a pevné směny, které se točí po týdnech. */
export function PlanovaniZamestnance({ firmaId, role, stridani, onRole, onStridani }: Props) {
  const sablony = useSablony(firmaId).data ?? [];
  const podleId = new Map(sablony.map((s) => [s.id, s]));
  const [vybrana, nastavVybranou] = useState('');
  const vyberId = useId();
  const pridat = vybrana || sablony[0]?.id || '';
  return (
    <Sekce nadpis="Plánování směn" popis="Podle toho plánovač směn rozděluje lidi na kasu a prodejnu.">
      <Volba popisek="Role" moznosti={ROLE} hodnota={role} onZmena={onRole} napoveda={NAPOVEDA_ROLE[role]} />
      <div className="flex flex-col gap-2">
        <p className="text-15 font-medium">Pevné směny</p>
        <p className="-mt-1 text-13 text-tlumeny">
          Točí se po týdnech v tomhle pořadí (jedna směna = pořád stejná). Bez pevných směn vybírá plánovač.
        </p>
        {stridani.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {stridani.map((id, i) => {
              const s = podleId.get(id);
              const nazev = s?.nazev ?? 'Smazaná šablona';
              return (
                <li key={`${id}-${i}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-linka px-3">
                  <span className="w-14 text-13 text-tlumeny">{i + 1}. týden</span>
                  <span className="flex-1 text-15 font-medium">
                    {nazev} {s && <span className="text-13 font-normal text-tlumeny tabular-nums">{casSablony(s)}</span>}
                  </span>
                  {i > 0 && (
                    <button type="button" aria-label={`Posunout ${nazev} výš`} className={tridyTlacitka('tiche')}
                      onClick={() => onStridani(stridani.map((x, j) => (j === i - 1 ? id : j === i ? stridani[i - 1]! : x)))}>
                      <ArrowUp aria-hidden className="size-[18px]" />
                    </button>
                  )}
                  <button type="button" aria-label={`Odebrat ${nazev}`} className={tridyTlacitka('tiche')}
                    onClick={() => onStridani(stridani.filter((_, j) => j !== i))}>
                    <X aria-hidden className="size-[18px]" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {sablony.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={vyberId} className="sr-only">Přidat pevnou směnu</label>
            <select id={vyberId} value={pridat} onChange={(e) => nastavVybranou(e.target.value)}
              className="min-h-11 rounded-lg border border-tlumeny/80 bg-karta px-3 text-15">
              {sablony.map((s) => <option key={s.id} value={s.id}>{s.nazev} ({casSablony(s)})</option>)}
            </select>
            <button type="button" className={tridyTlacitka('vedlejsi')} disabled={!pridat || stridani.length >= 14}
              onClick={() => onStridani([...stridani, pridat])}>
              <Plus aria-hidden className="size-[18px]" />
              Přidat směnu
            </button>
          </div>
        ) : (
          <p className="text-13 text-tlumeny">Firma zatím nemá šablony směn. Založ je v záložce Směny.</p>
        )}
      </div>
    </Sekce>
  );
}
