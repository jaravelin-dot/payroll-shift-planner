import { useId } from 'react';

type Moznost<T extends string> = { hodnota: T; nazev: string };

type Props<T extends string> = {
  popisek: string;
  moznosti: readonly Moznost<T>[];
  hodnota: T;
  onZmena: (hodnota: T) => void;
  napoveda?: string;
};

/**
 * Výběr jedné z několika možností jako řada tlačítek. Pod tím jsou nativní přepínače (radio), takže funguje
 * klávesnice (šipky) i čtečky; vybraná možnost má stejné „razítko" jako aktivní položka navigace.
 */
export function Volba<T extends string>({ popisek, moznosti, hodnota, onZmena, napoveda }: Props<T>) {
  const name = useId();
  const napovedaId = `${name}-napoveda`;
  return (
    <fieldset aria-describedby={napoveda ? napovedaId : undefined} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-15 font-medium">{popisek}</legend>
      <div className="flex flex-wrap gap-2">
        {moznosti.map((m) => {
          const vybrano = m.hodnota === hodnota;
          return (
            <label
              key={m.hodnota}
              className={[
                'inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-15 transition-colors duration-150 select-none',
                'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-akce',
                vybrano ? 'border-akce bg-akce/8 font-semibold text-akce' : 'border-tlumeny/80 bg-karta font-medium hover:border-tlumeny hover:bg-papir',
              ].join(' ')}
            >
              <input type="radio" name={name} value={m.hodnota} checked={vybrano} onChange={() => onZmena(m.hodnota)} className="sr-only" />
              {m.nazev}
            </label>
          );
        })}
      </div>
      {napoveda && (
        <p id={napovedaId} className="text-13 text-tlumeny">
          {napoveda}
        </p>
      )}
    </fieldset>
  );
}
