import { Calculator, Check } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import type { Den } from '../../shared/api';
import { formatHodin, minutyNaText } from '../cisla';
import { nazevDne, TYPY_DNU } from '../dochazka';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  ref?: Ref<HTMLButtonElement>;
  datum: string;
  zaznam: Den | undefined;
  svatek: string | undefined;
  vikend: boolean;
  dnes: boolean;
  vybrano: boolean;
  mimoPomer: boolean;
  /** Den jde otevřít (otevřený měsíc a pracovní poměr; mimo pracovní poměr jen den se zápisem, kvůli smazání). */
  aktivni: boolean;
};

/** Mírně „ručně" orazítkované písmeno: náklon podle čísla dne, aby karta nevypadala jako tabulka. */
const naklon = (den: number) => ((den * 37) % 9) - 4;

/** Text pro čtečky: „Pondělí 5. října, svátek …: práce 8 h, kasa, vybráno". Hodiny s obyčejnou mezerou. */
function popisek(datum: string, zaznam: Den | undefined, svatek: string | undefined, mimoPomer: boolean, vybrano: boolean): string {
  const zapsano = zaznam && `${TYPY_DNU[zaznam.typ].nazev.toLowerCase()} ${minutyNaText(zaznam.minuty)} h${zaznam.kasa ? ', kasa' : ''}`;
  const stav = mimoPomer
    ? `mimo pracovní poměr${zapsano ? `, zapsáno ${zapsano}, nezapočítá se` : ''}`
    : zapsano ?? 'nevyplněno';
  return `${nazevDne(datum)}${svatek ? `, svátek ${svatek}` : ''}: ${stav}${vybrano ? ', vybráno' : ''}`;
}

/** Jedno políčko docházkové karty: číslo dne, orazítkované písmeno typu, hodiny, kasa, svátek, dnešek a výběr. */
export function PolickoDne({ datum, zaznam, svatek, vikend, dnes, vybrano, mimoPomer, aktivni, className = '', ...zbytek }: Props) {
  const typ = zaznam ? TYPY_DNU[zaznam.typ] : undefined;
  const den = Number(datum.slice(8));
  const pozadi = mimoPomer
    ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-linka)_6px_7px)] text-tlumeny/70'
    : typ
      ? `${typ.vypln} border-l-[3px] ${typ.okraj}`
      : vikend ? 'bg-papir' : 'bg-karta';
  const ramecek = vybrano ? 'ring-2 ring-akce ring-offset-1 ring-offset-karta' : dnes ? 'ring-2 ring-inkoust ring-offset-1 ring-offset-karta' : '';
  const interakce = aktivni ? 'cursor-pointer hover:border-tlumeny/70 active:scale-[0.97]' : 'cursor-default';

  return (
    <button
      type="button"
      aria-disabled={!aktivni || undefined}
      aria-current={dnes ? 'date' : undefined}
      aria-label={popisek(datum, zaznam, svatek, mimoPomer, vybrano)}
      title={svatek}
      className={[
        'relative flex min-h-[3.75rem] w-full flex-col items-center justify-end overflow-hidden rounded-md border border-linka px-0.5 pt-4 pb-1',
        'touch-manipulation select-none [-webkit-touch-callout:none] transition-[border-color,transform] duration-150 motion-reduce:transition-none',
        'sm:min-h-[4.5rem] lg:min-h-[5.25rem] lg:pb-1.5',
        pozadi, ramecek, interakce, className,
      ].join(' ')}
      {...zbytek}
    >
      <span
        aria-hidden
        className={[
          'absolute top-1 left-1.5 flex items-center gap-1 text-13 leading-none tabular-nums lg:top-1.5 lg:left-2',
          svatek ? 'font-semibold text-den-svatek' : dnes ? 'font-semibold text-inkoust' : 'text-tlumeny',
        ].join(' ')}
      >
        {den}
        {svatek && <span className="size-1.5 rounded-full bg-den-svatek" />}
      </span>
      {zaznam?.kasa && <Calculator aria-hidden className="absolute top-1 right-1 size-3.5 text-inkoust/70 lg:top-1.5 lg:right-1.5" strokeWidth={2} />}
      {vybrano && (
        <span aria-hidden className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-akce text-karta">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {typ && zaznam && (
        <span aria-hidden className="flex flex-col items-center">
          <span className={`text-21 leading-none font-bold lg:text-28 ${typ.text}`} style={{ rotate: `${naklon(den)}deg` }}>
            {typ.pismeno}
          </span>
          <span className="mt-0.5 text-13 leading-tight font-medium tracking-tight whitespace-nowrap text-inkoust/85 tabular-nums lg:mt-1">
            {formatHodin(zaznam.minuty)}
          </span>
        </span>
      )}
    </button>
  );
}
