import type { Smlouva } from '../../shared/api';
import { formatHodin } from '../cisla';
import { ChybaHlaska } from './ChybaHlaska';
import { Nacitani } from './Nacitani';
import { Pole } from './Pole';
import { Sekce } from './Sekce';

export type StavDovolene =
  | { stav: 'nacitani' }
  | { stav: 'chyba'; chyba: unknown; onZnovu: () => void }
  /** Ve vybraném měsíci není v pracovním poměru, takže data měsíce ho neobsahují. */
  | { stav: 'mimo' }
  | { stav: 'hotovo'; narokMin: number; cerpanoMin: number; zbyvaMin: number };

type Props = {
  rok: number;
  smlouva: Smlouva;
  vysledek: StavDovolene;
  prevod: string;
  navic: string;
  onPrevod: (text: string) => void;
  onNavic: (text: string) => void;
  chyby: { prevod?: string; navic?: string };
};

function Udaj({ nazev, minuty, hlavni = false }: { nazev: string; minuty: number; hlavni?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-13 text-tlumeny">{nazev}</dt>
      <dd className={`tabular-nums whitespace-nowrap ${hlavni ? `text-21 font-semibold ${minuty < 0 ? 'text-varovani' : ''}` : 'text-17 font-medium'}`}>
        {formatHodin(minuty)}
      </dd>
    </div>
  );
}

/** Zůstatek dovolené za rok vybraného měsíce (spec 5.10) a ruční převod z minula a dovolená navíc. */
export function DovolenaZamestnance({ rok, smlouva, vysledek, prevod, navic, onPrevod, onNavic, chyby }: Props) {
  return (
    <Sekce nadpis={`Dovolená ${rok}`} popis="Rok podle měsíce vybraného v přepínači.">
      {vysledek.stav === 'nacitani' && <Nacitani />}
      {vysledek.stav === 'chyba' && <ChybaHlaska chyba={vysledek.chyba} onZnovu={vysledek.onZnovu} />}
      {vysledek.stav === 'mimo' && (
        <p className="text-15 text-tlumeny">V tomhle měsíci není v pracovním poměru, zůstatek se tu nedá spočítat. Přepni měsíc na dobu, kdy pracuje.</p>
      )}
      {vysledek.stav === 'hotovo' && (
        <>
          <dl className="grid grid-cols-3 items-start gap-3 rounded-lg bg-papir px-4 py-3">
            <Udaj nazev="Nárok" minuty={vysledek.narokMin} />
            <Udaj nazev="Čerpáno" minuty={vysledek.cerpanoMin} />
            <Udaj nazev="Zbývá" minuty={vysledek.zbyvaMin} hlavni />
          </dl>
          {vysledek.zbyvaMin < 0 && <p className="-mt-2 text-13 font-medium text-varovani">Vyčerpáno víc, než je nárok.</p>}
          <p className="-mt-2 text-13 text-tlumeny">
            {smlouva === 'HPP'
              ? 'Nárok jsou 4 týdny podle úvazku, poměrně k době pracovního poměru v roce, plus převod a dovolená navíc.'
              : 'U dohody vzniká nárok za každých celých 20 odpracovaných hodin v roce, plus převod a dovolená navíc.'}
          </p>
          <Pole
            popisek="Převod z minulého roku"
            pripona="h"
            // Jediné pole s minusem: desetinná klávesnice na iOS nemá znaménko, proto běžná klávesnice.
            inputMode="text"
            autoComplete="off"
            value={prevod}
            onChange={(e) => onPrevod(e.target.value)}
            chyba={chyby.prevod}
            napoveda="Nevyčerpané hodiny z loňska. Přečerpané zapiš se znaménkem minus."
          />
          <Pole
            popisek="Dovolená navíc"
            pripona="h"
            inputMode="decimal"
            autoComplete="off"
            value={navic}
            onChange={(e) => onNavic(e.target.value)}
            chyba={chyby.navic}
            napoveda="Hodiny nad zákonné 4 týdny, když je firma dává."
          />
        </>
      )}
    </Sekce>
  );
}
