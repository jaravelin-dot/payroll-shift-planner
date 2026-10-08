import { useId } from 'react';

type Props = {
  zapnuto: boolean;
  onZmena: (zapnuto: boolean) => void;
  popisek: string;
  napoveda?: string;
  disabled?: boolean;
};

/** Přepínač zapnuto/vypnuto. Celý řádek je jedno tlačítko, takže se dobře trefuje i prstem. */
export function Prepinac({ zapnuto, onZmena, popisek, napoveda, disabled = false }: Props) {
  const napovedaId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={zapnuto}
      aria-describedby={napoveda ? napovedaId : undefined}
      disabled={disabled}
      onClick={() => onZmena(!zapnuto)}
      className="group flex min-h-11 w-full items-center justify-between gap-4 rounded-lg py-2 text-left disabled:opacity-50"
    >
      <span className="flex flex-col">
        <span className="text-15 font-medium">{popisek}</span>
        {napoveda && (
          <span id={napovedaId} className="text-13 text-tlumeny">
            {napoveda}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 ${zapnuto ? 'bg-akce' : 'bg-tlumeny/80 group-hover:bg-tlumeny'}`}
      >
        <span className={`size-5 rounded-full bg-karta transition-transform duration-150 ${zapnuto ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}
