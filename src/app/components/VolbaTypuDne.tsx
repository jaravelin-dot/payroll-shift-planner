import { CircleAlert } from 'lucide-react';
import { useId } from 'react';
import type { TypDne } from '../../shared/api';
import { TYPY_DNU } from '../dochazka';

type Props = {
  typy: TypDne[];
  /** `undefined`: vybrané dny mají různé typy a žádný není zvolený. */
  hodnota: TypDne | undefined;
  onZmena: (typ: TypDne) => void;
  chyba?: string;
};

/** Typ dne jako velká tlačítka s písmenem a názvem (pod nimi nativní přepínače, takže fungují šipky i čtečky). */
export function VolbaTypuDne({ typy, hodnota, onZmena, chyba }: Props) {
  const name = useId();
  const chybaId = `${name}-chyba`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={chyba ? chybaId : undefined}>
      <legend className="mb-2 text-15 font-medium">Typ dne</legend>
      <div className="grid grid-cols-2 gap-2">
        {typy.map((typ) => {
          const info = TYPY_DNU[typ];
          const vybrano = typ === hodnota;
          return (
            <label
              key={typ}
              className={[
                'flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2 text-15 transition-colors duration-150 select-none',
                'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-akce',
                vybrano ? 'border-akce bg-akce/8 font-semibold text-inkoust ring-1 ring-akce' : 'border-tlumeny/80 bg-karta font-medium hover:border-tlumeny hover:bg-papir',
              ].join(' ')}
            >
              <input type="radio" name={name} value={typ} checked={vybrano} onChange={() => onZmena(typ)} className="sr-only" />
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-md border-l-[3px] text-17 font-bold ${info.vypln} ${info.okraj} ${info.text}`}>
                {info.pismeno}
              </span>
              <span className="leading-tight">{info.nazev}</span>
            </label>
          );
        })}
      </div>
      <p className="text-13 text-tlumeny">
        {hodnota ? TYPY_DNU[hodnota].popis : 'Vybrané dny mají různé typy. Když žádný nezvolíš, každý den si nechá svůj.'}
      </p>
      {chyba && (
        <p id={chybaId} role="alert" className="flex items-start gap-1.5 text-13 font-medium text-chyba">
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
          {chyba}
        </p>
      )}
    </fieldset>
  );
}
