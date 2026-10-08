import type { ReactNode } from 'react';

export type TonStitku = 'varovani' | 'chyba' | 'info' | 'ok' | 'neutralni';

const TONY: Record<TonStitku, string> = {
  varovani: 'bg-varovani/10 text-varovani',
  chyba: 'bg-chyba/10 text-chyba',
  info: 'bg-akce/10 text-akce',
  ok: 'bg-penize/10 text-penize',
  // Údaj, ne stav (Prohlášení, ZTP/P…): bez barvy, aby nesoupeřil s akcemi a varováními.
  neutralni: 'bg-inkoust/6 text-inkoust',
};

/** Krátký štítek stavu. Význam nese text, barva je jen podpora. */
export function Stitek({ ton, children }: { ton: TonStitku; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-13 font-medium whitespace-nowrap ${TONY[ton]}`}>{children}</span>;
}
