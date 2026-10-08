import { CircleAlert, RotateCw } from 'lucide-react';
import { ApiChyba } from '../api/klient';
import { Tlacitko } from './Tlacitko';

type Props = {
  chyba: unknown;
  /** Nabídne „Zkusit znovu". */
  onZnovu?: () => void;
};

function textChyby(chyba: unknown): string {
  return chyba instanceof ApiChyba ? chyba.zprava : 'Něco se nepovedlo. Zkus to znovu.';
}

/** Chybová hláška ve stejné řeči jako docházková karta: světlá výplň a plný levý okraj. */
export function ChybaHlaska({ chyba, onZnovu }: Props) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-l-[3px] border-chyba bg-chyba/8 py-3 pr-3 pl-4">
      <p className="flex min-w-0 flex-1 basis-60 items-start gap-2 text-15 font-medium text-chyba">
        <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
        {textChyby(chyba)}
      </p>
      {onZnovu && (
        <Tlacitko varianta="tiche" ikona={RotateCw} onClick={onZnovu}>
          Zkusit znovu
        </Tlacitko>
      )}
    </div>
  );
}
