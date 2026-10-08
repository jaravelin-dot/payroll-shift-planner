import { Link, useLocation } from 'react-router';
import { useFirmy, useJa } from '../api/dotazy';
import { jeAktivni, NAVIGACE_PC } from '../stav/navigace';
import { useVyber } from '../stav/vyber';
import { PrepinacFirmy } from './PrepinacFirmy';
import { PrepinacMesice } from './PrepinacMesice';
import { Znak } from './Znak';

/** Levý panel na PC (≥ 1024 px): znak, pracovní kontext (firma + měsíc) a navigace. */
export function BocniPanel() {
  const { data: firmy = [] } = useFirmy();
  const { data: ja } = useJa();
  const vyber = useVyber();
  const { pathname } = useLocation();

  return (
    <div className="sticky top-0 hidden h-dvh flex-col border-r border-linka lg:flex">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <Znak />
        <span className="text-17 font-semibold">Mzdy</span>
      </div>

      <div className="mx-3 rounded-xl border border-linka bg-karta">
        <PrepinacFirmy firmy={firmy} vybranaId={vyber.firmaId} onZmena={vyber.nastavFirmu} />
        <div className="border-t border-linka">
          <PrepinacMesice rok={vyber.rok} mesic={vyber.mesic} onZmena={vyber.nastavMesic} />
        </div>
      </div>

      <nav aria-label="Hlavní navigace" className="flex-1 overflow-y-auto px-3 pt-6 pb-4">
        <ul className="flex flex-col gap-0.5">
          {NAVIGACE_PC.map((polozka) => {
            const aktivni = jeAktivni(polozka, pathname);
            const Ikona = polozka.ikona;
            return (
              <li key={polozka.cesta}>
                <Link
                  to={vyber.odkaz(polozka.cesta)}
                  aria-current={aktivni ? 'page' : undefined}
                  className={[
                    'flex min-h-11 items-center gap-3 rounded-r-lg border-l-[3px] pr-3 pl-[9px] text-15 transition-colors duration-150',
                    aktivni ? 'border-akce bg-akce/8 font-semibold text-akce' : 'border-transparent font-medium text-tlumeny hover:bg-inkoust/5 hover:text-inkoust',
                  ].join(' ')}
                >
                  <Ikona aria-hidden className="size-5" strokeWidth={aktivni ? 2 : 1.75} />
                  {polozka.nazev}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {ja && (
        <p className="truncate border-t border-linka px-5 py-4 text-13 text-tlumeny" title={ja.email}>
          {ja.email}
        </p>
      )}
    </div>
  );
}
