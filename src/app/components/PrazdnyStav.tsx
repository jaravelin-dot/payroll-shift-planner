import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  ikona: LucideIcon;
  nadpis: string;
  children?: ReactNode;
  /** Tlačítka nebo odkazy, kterými se z prázdného stavu dá pokračovat. */
  akce?: ReactNode;
};

/** Prázdný stav jako nevyplněná kartička: čárkovaný okraj, co tu bude a jak začít. */
export function PrazdnyStav({ ikona: Ikona, nadpis, children, akce }: Props) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-tlumeny/45 bg-karta/60 p-6 sm:p-8">
      <span className="grid size-11 place-items-center rounded-lg bg-papir text-tlumeny">
        <Ikona aria-hidden className="size-[22px]" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-[60ch] flex-col gap-1.5">
        <h2 className="text-17 font-semibold">{nadpis}</h2>
        {children && <div className="text-15 text-tlumeny">{children}</div>}
      </div>
      {akce && <div className="flex flex-wrap gap-3">{akce}</div>}
    </section>
  );
}
