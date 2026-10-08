import { ChevronRight, Download, FileText, Settings, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useVyber } from '../stav/vyber';

function Radek({ ikona: Ikona, nazev, popis, koncovka }: { ikona: LucideIcon; nazev: string; popis: string; koncovka: ReactNode }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-papir text-inkoust">
        <Ikona aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-17 font-semibold lg:text-15">{nazev}</span>
        <span className="text-13 text-tlumeny">{popis}</span>
      </span>
      {koncovka}
    </>
  );
}

const RADEK = 'flex min-h-16 items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-papir/70 active:bg-papir';

/** Mobilní rozcestník pro sekce, které se nevešly do spodní lišty. */
export function Vice() {
  const vyber = useVyber();
  const sipka = <ChevronRight aria-hidden className="size-5 shrink-0 text-tlumeny" />;

  return (
    <>
      <title>Více – Mzdy</title>
      <h1 className="mb-6 text-28 font-semibold">Více</h1>
      <ul className="divide-y divide-linka overflow-hidden rounded-xl border border-linka bg-karta">
        <li>
          <Link to={vyber.odkaz('/vystupy')} className={RADEK}>
            <Radek ikona={FileText} nazev="Výstupy" popis="Výplatní pásky, Excel pro účetního, náklady a platby" koncovka={sipka} />
          </Link>
        </li>
        <li>
          <Link to={vyber.odkaz('/nastaveni')} className={RADEK}>
            <Radek ikona={Settings} nazev="Nastavení" popis="Firmy a pravidla výpočtu" koncovka={sipka} />
          </Link>
        </li>
        <li>
          <a href="/api/zaloha" download className={RADEK}>
            <Radek ikona={Download} nazev="Stáhnout zálohu" popis="Všechna data v jednom souboru JSON" koncovka={null} />
          </a>
        </li>
      </ul>
    </>
  );
}
