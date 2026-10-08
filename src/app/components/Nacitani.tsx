import { LoaderCircle } from 'lucide-react';

type Props = {
  text?: string;
  /** Přes celou obrazovku (než je jasné, jestli appka smí načíst data). */
  celaObrazovka?: boolean;
};

export function Nacitani({ text = 'Načítám…', celaObrazovka = false }: Props) {
  const stav = (
    <div role="status" className={`flex items-center gap-2 text-15 text-tlumeny ${celaObrazovka ? 'justify-center' : 'py-10'}`}>
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      {text}
    </div>
  );
  // Přes celou obrazovku není kolem nic jiného, takže stav je hlavní obsah stránky.
  return celaObrazovka ? <main className="flex min-h-dvh flex-col justify-center">{stav}</main> : stav;
}
