import { Outlet } from 'react-router';
import { useFirmy } from '../api/dotazy';
import { useVyber } from '../stav/vyber';
import { BocniPanel } from './BocniPanel';
import { NeulozenaDochazka } from './NeulozenaDochazka';
import { NeulozeneVstupy } from './NeulozeneVstupy';
import { PrepinacFirmy } from './PrepinacFirmy';
import { PrepinacMesice } from './PrepinacMesice';
import { SpodniLista } from './SpodniLista';

/** Kostra appky: PC = levý panel 240 px + obsah max. 1200 px; mobil = horní lišta s kontextem + spodní navigace. */
export function Rozvrzeni() {
  const { data: firmy = [] } = useFirmy();
  const vyber = useVyber();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#obsah"
        className="sr-only rounded-lg bg-akce px-4 py-3 font-semibold text-karta focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Přeskočit na obsah
      </a>

      <BocniPanel />

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-linka bg-papir pt-[env(safe-area-inset-top)] pr-1 pl-1 lg:hidden">
          {/* Flex rodič: výběr firmy je jen tak široký jako název, šipka zůstane u něj. */}
          <div className="flex min-w-0 flex-1">
            <PrepinacFirmy firmy={firmy} vybranaId={vyber.firmaId} onZmena={vyber.nastavFirmu} />
          </div>
          <PrepinacMesice rok={vyber.rok} mesic={vyber.mesic} onZmena={vyber.nastavMesic} className="shrink-0" />
        </header>

        <main id="obsah" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          <NeulozenaDochazka />
          <NeulozeneVstupy />
          <Outlet />
        </main>
      </div>

      <SpodniLista />
    </div>
  );
}
