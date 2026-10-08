import { CircleAlert } from 'lucide-react';
import { useId, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  popisek: string;
  napoveda?: string;
  chyba?: string;
  nepovinne?: boolean;
  /** Jednotka za číslem uvnitř pole („Kč", „Kč/h", „h týdně"); číslo se pak zarovná vpravo k jednotce. */
  pripona?: string;
  /** Chyba se čtečce ohlásí hned, jak se objeví (pro hlášky, které naskočí při opuštění pole, ne při odeslání formuláře). */
  ohlasitChybu?: boolean;
};

/** Textové pole s popiskem, nápovědou a chybou. Všude 17 px písmo, aby iOS při psaní nezoomoval; rámeček má kontrast aspoň 3:1. */
export function Pole({ popisek, napoveda, chyba, nepovinne = false, pripona, ohlasitChybu = false, id, className = '', 'aria-describedby': dalsiPopis, ...zbytek }: Props) {
  const vlastniId = useId();
  const poleId = id ?? vlastniId;
  const napovedaId = `${poleId}-napoveda`;
  const chybaId = `${poleId}-chyba`;
  const priponaId = `${poleId}-pripona`;
  // Jednotka je vizuálně uvnitř pole; čtečce ji dá do popisu pole („Kč/h"), aby číslo nezůstalo bez jednotky.
  const popsano = [pripona && priponaId, napoveda && napovedaId, chyba && chybaId, dalsiPopis].filter(Boolean).join(' ') || undefined;
  const ramecek = chyba ? 'border-chyba' : 'border-tlumeny/80 hover:border-tlumeny';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={poleId} className="text-15 font-medium">
        {popisek}
        {nepovinne && <span className="font-normal text-tlumeny"> (nepovinné)</span>}
      </label>
      {pripona ? (
        // Rámeček nese obal, aby jednotka ležela uvnitř pole; fokus se kreslí na obalu.
        <div
          className={[
            'flex min-h-11 w-full items-center rounded-lg border bg-karta text-17 transition-colors duration-150',
            'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-0',
            chyba ? `${ramecek} has-[input:focus-visible]:outline-chyba` : `${ramecek} has-[input:focus-visible]:border-akce has-[input:focus-visible]:outline-akce`,
          ].join(' ')}
        >
          <input
            id={poleId}
            aria-invalid={chyba ? true : undefined}
            aria-describedby={popsano}
            className="min-h-11 w-full min-w-0 flex-1 rounded-lg bg-transparent pl-3 text-right tabular-nums placeholder:text-tlumeny focus-visible:outline-none"
            {...zbytek}
          />
          <span id={priponaId} aria-hidden className="shrink-0 pr-3 pl-1.5 text-15 whitespace-nowrap text-tlumeny">
            {pripona}
          </span>
        </div>
      ) : (
        <input
          id={poleId}
          aria-invalid={chyba ? true : undefined}
          aria-describedby={popsano}
          className={[
            'min-h-11 w-full rounded-lg border bg-karta px-3 text-17',
            'placeholder:text-tlumeny transition-colors duration-150',
            'focus-visible:outline-2 focus-visible:outline-offset-0',
            chyba ? 'border-chyba focus-visible:outline-chyba' : 'border-tlumeny/80 hover:border-tlumeny focus-visible:border-akce',
          ].join(' ')}
          {...zbytek}
        />
      )}
      {napoveda && (
        <p id={napovedaId} className="text-13 text-tlumeny">
          {napoveda}
        </p>
      )}
      {chyba && (
        <p id={chybaId} role={ohlasitChybu ? 'alert' : undefined} className="flex items-start gap-1.5 text-13 font-medium text-chyba">
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
          {chyba}
        </p>
      )}
    </div>
  );
}
