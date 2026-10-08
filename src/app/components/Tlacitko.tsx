import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

export type VariantaTlacitka = 'hlavni' | 'vedlejsi' | 'tiche' | 'nebezpecne' | 'nebezpecneTiche';

const VARIANTY: Record<VariantaTlacitka, string> = {
  hlavni: 'bg-akce text-karta hover:bg-akce/90 active:bg-akce/80',
  vedlejsi: 'bg-karta text-inkoust border border-tlumeny/80 hover:border-tlumeny hover:bg-papir active:bg-linka/60',
  tiche: 'text-akce hover:bg-akce/8 active:bg-akce/12',
  nebezpecne: 'bg-chyba text-karta hover:bg-chyba/90 active:bg-chyba/80',
  // Nevratná akce, která nemá na stránce převažovat (např. „Smazat natrvalo" pod formulářem).
  nebezpecneTiche: 'text-chyba hover:bg-chyba/8 active:bg-chyba/12',
};

/** Třídy tlačítka i pro odkazy, které mají vypadat jako tlačítko. Min. výška 44 px kvůli dotyku. */
export function tridyTlacitka(varianta: VariantaTlacitka = 'hlavni', navic = ''): string {
  return [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-15 font-semibold whitespace-nowrap',
    'transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50',
    VARIANTY[varianta],
    navic,
  ].join(' ');
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  varianta?: VariantaTlacitka;
  ikona?: LucideIcon;
  /** Probíhající akce: tlačítko se zablokuje a místo ikony se točí kolečko. */
  nacita?: boolean;
};

export function Tlacitko({ varianta = 'hlavni', ikona: Ikona, nacita = false, className = '', type = 'button', disabled, children, ...zbytek }: Props) {
  return (
    <button type={type} className={tridyTlacitka(varianta, className)} disabled={disabled || nacita} aria-busy={nacita || undefined} {...zbytek}>
      {nacita ? <LoaderCircle aria-hidden className="size-[18px] animate-spin" /> : Ikona && <Ikona aria-hidden className="size-[18px]" />}
      {children}
    </button>
  );
}
