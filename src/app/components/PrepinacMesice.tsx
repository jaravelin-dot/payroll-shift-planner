import { ChevronLeft, ChevronRight } from 'lucide-react';

const NAZVY_MESICU = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

type Props = {
  rok: number;
  mesic: number;
  onZmena: (rok: number, mesic: number) => void;
  className?: string;
};

const SIPKA = 'grid size-11 shrink-0 place-items-center rounded-lg text-inkoust transition-colors duration-150 hover:bg-inkoust/6 active:bg-inkoust/10';

/** „‹ Říjen 2026 ›" — posun o měsíc i přes hranici roku. */
export function PrepinacMesice({ rok, mesic, onZmena, className = '' }: Props) {
  const posun = (o: number) => {
    const index = rok * 12 + (mesic - 1) + o;
    onZmena(Math.floor(index / 12), (index % 12) + 1);
  };

  return (
    <div role="group" aria-label="Měsíc" className={`flex items-center ${className}`}>
      <button type="button" className={SIPKA} onClick={() => posun(-1)} aria-label="Předchozí měsíc">
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      {/* 7,25rem pojme nejdelší „Červenec 2026" (113 px v Onest 15 px), takže šipky při posunu neuskakují. */}
      <span aria-live="polite" className="min-w-[7.25rem] flex-1 text-center text-15 font-semibold tabular-nums">
        {NAZVY_MESICU[mesic - 1]} {rok}
      </span>
      <button type="button" className={SIPKA} onClick={() => posun(1)} aria-label="Další měsíc">
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  );
}
