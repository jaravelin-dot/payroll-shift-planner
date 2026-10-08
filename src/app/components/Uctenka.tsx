import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { formatKc } from '../../core/penize';
import type { VysledekVypoctu } from '../../core/typy';
import { rozpisUctenky, type RadekUctenky } from '../uctenka';

const UZKA_MEZERA = ' ';

/** Částka účtenky: „−2 762 Kč", s `plus` „+2 570 Kč"; tabulkové číslice, Kč s úzkou mezerou. */
function textCastky(hal: number, plus: boolean): string {
  return `${plus && hal > 0 ? '+' : ''}${formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`)}`;
}

type PropsRadku = {
  radek: RadekUctenky;
  otevreny: boolean;
  onPrepni: () => void;
  plus?: boolean;
  /** Hrubá mzda (mezisoučet) je tučně, Čistá mzda a Náklad firmy tlumeně. */
  vaha?: 'bezna' | 'souhrn' | 'tlumena';
};

function RadekRozpisu({ radek, otevreny, onPrepni, plus = false, vaha = 'bezna' }: PropsRadku) {
  const id = useId();
  const pismo = vaha === 'souhrn' ? 'font-semibold' : vaha === 'tlumena' ? 'text-tlumeny' : '';
  return (
    <li>
      <button
        type="button"
        aria-expanded={otevreny}
        aria-controls={otevreny ? id : undefined}
        onClick={onPrepni}
        className={`group flex min-h-11 w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left pointer-fine:min-h-9 pointer-fine:py-1.5 text-15 transition-colors duration-150 hover:bg-papir ${pismo}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {radek.popis}
          <ChevronDown aria-hidden className={`size-3.5 shrink-0 text-tlumeny transition-transform duration-150 motion-reduce:transition-none ${otevreny ? 'rotate-180' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`} />
        </span>
        <span className={`shrink-0 text-right whitespace-nowrap tabular-nums ${radek.castkaHal < 0 && vaha === 'bezna' ? 'text-inkoust' : ''}`}>
          {textCastky(radek.castkaHal, plus)}
        </span>
      </button>
      {otevreny && (
        <p id={id} className="mx-3 mb-2 animate-pozadi rounded-md bg-papir px-3 py-2 text-13 text-tlumeny">
          {radek.vzorec}
        </p>
      )}
    </li>
  );
}

type Props = { vysledek: VysledekVypoctu; className?: string };

/**
 * Rozpis výplaty jako účtenka: složky, čára, hrubá mzda, co se přičítá a odečítá, dvojitá čára a K výplatě.
 * Klepnutí na řádek ukáže, jak částka vznikla. Změna částky K výplatě krátce blikne (jen po změně, ne při načtení).
 */
export function Uctenka({ vysledek, className = '' }: Props) {
  const rozpis = rozpisUctenky(vysledek);
  const [otevrene, nastavOtevrene] = useState<ReadonlySet<string>>(new Set());
  const puvodni = useRef(rozpis.kVyplateHal);
  const zmenena = rozpis.kVyplateHal !== puvodni.current;
  const zaporna = rozpis.kVyplateHal < 0;

  const prepni = (klic: string) =>
    nastavOtevrene((stare) => {
      const nove = new Set(stare);
      if (nove.has(klic)) nove.delete(klic);
      else nove.add(klic);
      return nove;
    });
  const radek = (r: RadekUctenky, volby: Omit<PropsRadku, 'radek' | 'otevreny' | 'onPrepni'> = {}) => (
    <RadekRozpisu key={r.klic} radek={r} otevreny={otevrene.has(r.klic)} onPrepni={() => prepni(r.klic)} {...volby} />
  );

  return (
    <section aria-labelledby="uctenka-nadpis" className={`rounded-xl border border-linka bg-karta pb-2 ${className}`}>
      <header className="px-5 pt-4 pb-2">
        <h2 id="uctenka-nadpis" className="text-17 font-semibold">Rozpis výplaty</h2>
        <p className="text-13 text-tlumeny">Klepni na řádek a uvidíš, jak částka vznikla.</p>
      </header>

      <ul aria-label="Rozpis výplaty" className="px-2">
        {rozpis.slozky.length === 0 && <li className="px-3 py-2 text-15 text-tlumeny">Zatím žádná mzda. Zapiš docházku v kartě.</li>}
        {rozpis.slozky.map((r) => radek(r))}
        <li aria-hidden className="mx-3 my-1 border-t border-linka" />
        {radek(rozpis.hruba, { vaha: 'souhrn' })}
        {rozpis.radky.map((r) => radek(r, { plus: true }))}
      </ul>

      <div data-testid="k-vyplate" className="mx-5 mt-1 flex items-baseline justify-between gap-4 border-t-[3px] border-double border-inkoust pt-3 pb-1">
        <span className="text-17 font-semibold">K výplatě</span>
        <data
          key={rozpis.kVyplateHal}
          value={rozpis.kVyplateHal / 100}
          className={`-mr-1 rounded-md px-1 text-28 font-semibold whitespace-nowrap tabular-nums ${zaporna ? 'text-chyba' : 'text-penize'} ${zmenena ? 'animate-zmena' : ''}`}
        >
          {textCastky(rozpis.kVyplateHal, false)}
        </data>
      </div>

      <ul aria-label="Další součty" className="px-2 pt-1">
        {radek(rozpis.cista, { vaha: 'tlumena' })}
        {radek(rozpis.naklad, { vaha: 'tlumena' })}
      </ul>
    </section>
  );
}
