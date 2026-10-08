import { Link, useLocation } from 'react-router';
import { jeAktivni, NAVIGACE_MOBIL } from '../stav/navigace';
import { useVyber } from '../stav/vyber';

/** Spodní lišta na mobilu (< 1024 px): Výplaty, Směny, Lidé, Více. Odsazená o spodní systémový pruh. */
export function SpodniLista() {
  const vyber = useVyber();
  const { pathname } = useLocation();

  return (
    <nav aria-label="Hlavní navigace" className="fixed inset-x-0 bottom-0 z-40 border-t border-linka bg-karta pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {NAVIGACE_MOBIL.map((polozka) => {
          const aktivni = jeAktivni(polozka, pathname);
          const Ikona = polozka.ikona;
          return (
            <li key={polozka.cesta}>
              <Link
                to={vyber.odkaz(polozka.cesta)}
                aria-current={aktivni ? 'page' : undefined}
                className={[
                  'relative flex min-h-16 flex-col items-center justify-center gap-1 text-13 transition-colors duration-150',
                  'before:absolute before:top-0 before:h-[3px] before:w-10 before:rounded-b-sm',
                  aktivni ? 'font-semibold text-akce before:bg-akce' : 'font-medium text-tlumeny active:text-inkoust',
                ].join(' ')}
              >
                <Ikona aria-hidden className="size-6" strokeWidth={aktivni ? 2 : 1.75} />
                {polozka.nazev}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
