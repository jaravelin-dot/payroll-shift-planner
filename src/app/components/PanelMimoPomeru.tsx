import { Trash2 } from 'lucide-react';
import type { Den, Zamestnanec } from '../../shared/api';
import { formatHodin } from '../cisla';
import { formatDatum } from '../datum';
import { nazevDne, TYPY_DNU } from '../dochazka';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko } from './Tlacitko';

type Props = {
  zaznam: Den;
  zamestnanec: Pick<Zamestnanec, 'nastup' | 'ukonceni'>;
  onSmazat: () => void;
  onZavrit: () => void;
};

/**
 * Den se zápisem mimo pracovní poměr (před nástupem, po ukončení): výpočet ho vynechá, upravit ho nejde, jen smazat.
 * Vznikne třeba tím, že se ukončení posunulo dřív až po zapsání docházky.
 */
export function PanelMimoPomeru({ zaznam, zamestnanec: z, onSmazat, onZavrit }: Props) {
  const typ = TYPY_DNU[zaznam.typ];
  return (
    <SpodniPanel
      otevreno
      onZavrit={onZavrit}
      nadpis={nazevDne(zaznam.datum)}
      paticka={
        <>
          <Tlacitko varianta="nebezpecne" ikona={Trash2} onClick={onSmazat} className="flex-1 sm:flex-none">Smazat den</Tlacitko>
          <Tlacitko varianta="vedlejsi" onClick={onZavrit}>Zavřít</Tlacitko>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-15">
        <p className="rounded-lg border-l-[3px] border-varovani bg-varovani/8 py-2 pr-3 pl-3 font-medium">
          Mimo pracovní poměr — den se nezapočítá, můžeš ho smazat.
        </p>
        <dl className="flex flex-col gap-1">
          <div className="flex gap-2">
            <dt className="text-tlumeny">Zapsáno:</dt>
            <dd>{typ.nazev} {formatHodin(zaznam.minuty)}{zaznam.kasa ? ', kasa' : ''}</dd>
          </div>
          {zaznam.poznamka && (
            <div className="flex gap-2">
              <dt className="text-tlumeny">Poznámka:</dt>
              <dd className="min-w-0 break-words">{zaznam.poznamka}</dd>
            </div>
          )}
        </dl>
        <p className="text-13 text-tlumeny">
          Pracovní poměr je od {formatDatum(z.nastup)}{z.ukonceni ? ` do ${formatDatum(z.ukonceni)}` : ''}. Upravit tenhle den nejde;
          když je v datu nástupu nebo ukončení chyba, oprav ho u člověka v Lidé.
        </p>
      </div>
    </SpodniPanel>
  );
}
