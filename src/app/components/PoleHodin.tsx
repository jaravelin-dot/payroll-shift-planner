import { CircleAlert, Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { minutyNaText, textNaMinuty } from '../cisla';

const RYCHLE_VOLBY = [4, 6, 8, 10, 12];
const KROK_MIN = 15;

type Props = {
  id?: string;
  popisek: string;
  hodnota: string;
  onZmena: (text: string) => void;
  chyba?: string;
  napoveda?: string;
  /** Text v prázdném poli (např. „různé" u víc vybraných dnů). */
  placeholder?: string;
};

const TLACITKO_KROKU = 'grid size-11 shrink-0 place-items-center rounded-lg border border-tlumeny/80 bg-karta text-inkoust transition-colors hover:border-tlumeny hover:bg-papir active:bg-linka/60';

/**
 * Hodiny jako text („7,5"), tlačítka ± po čtvrthodině a rychlé volby 4/6/8/10/12 h. Pole i tlačítka leží v jedné řadě,
 * nápověda a chyba pod nimi (stejný vzhled jako `Pole` s příponou).
 */
export function PoleHodin({ id, popisek, hodnota, onZmena, chyba, napoveda, placeholder }: Props) {
  const vlastniId = useId();
  const poleId = id ?? vlastniId;
  const minuty = textNaMinuty(hodnota);
  const posun = (o: number) => onZmena(minutyNaText(Math.min(1440, Math.max(0, (minuty ?? 0) + o))));
  const popsano = [napoveda && `${poleId}-napoveda`, chyba && `${poleId}-chyba`].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={poleId} className="text-15 font-medium">{popisek}</label>
      <div className="flex gap-2">
        <div
          className={[
            'flex min-h-11 min-w-0 flex-1 items-center rounded-lg border bg-karta text-17 transition-colors duration-150',
            'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-0',
            chyba ? 'border-chyba has-[input:focus-visible]:outline-chyba' : 'border-tlumeny/80 hover:border-tlumeny has-[input:focus-visible]:border-akce has-[input:focus-visible]:outline-akce',
          ].join(' ')}
        >
          <input
            id={poleId}
            inputMode="decimal"
            autoComplete="off"
            value={hodnota}
            placeholder={placeholder}
            onChange={(e) => onZmena(e.target.value)}
            aria-invalid={chyba ? true : undefined}
            aria-describedby={popsano}
            className="min-h-11 w-full min-w-0 flex-1 rounded-lg bg-transparent pl-3 text-right tabular-nums placeholder:text-tlumeny focus-visible:outline-none"
          />
          <span aria-hidden className="shrink-0 pr-3 pl-1.5 text-15 text-tlumeny">h</span>
        </div>
        <button type="button" className={TLACITKO_KROKU} aria-label="O čtvrt hodiny méně" onClick={() => posun(-KROK_MIN)}>
          <Minus aria-hidden className="size-5" />
        </button>
        <button type="button" className={TLACITKO_KROKU} aria-label="O čtvrt hodiny víc" onClick={() => posun(KROK_MIN)}>
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
      {napoveda && <p id={`${poleId}-napoveda`} className="text-13 text-tlumeny">{napoveda}</p>}
      {chyba && (
        <p id={`${poleId}-chyba`} className="flex items-start gap-1.5 text-13 font-medium text-chyba">
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
          {chyba}
        </p>
      )}
      <div role="group" aria-label="Rychlá volba hodin" className="mt-1 flex flex-wrap gap-2">
        {RYCHLE_VOLBY.map((h) => {
          const vybrano = minuty === h * 60;
          return (
            <button
              key={h}
              type="button"
              aria-pressed={vybrano}
              onClick={() => onZmena(String(h))}
              className={[
                'min-h-11 min-w-14 rounded-lg border px-3 text-15 tabular-nums transition-colors duration-150',
                vybrano ? 'border-akce bg-akce/8 font-semibold text-akce' : 'border-tlumeny/80 bg-karta font-medium hover:border-tlumeny hover:bg-papir',
              ].join(' ')}
            >
              {h} h
            </button>
          );
        })}
      </div>
    </div>
  );
}
