/** Znak appky: docházková kartička 3 × 2 s jedním orazítkovaným políčkem (stejný motiv jako ikona PWA). */
export function Znak({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" className="fill-inkoust" />
      {[0, 1, 2].map((sloupec) =>
        [0, 1].map((radek) => (
          <rect
            key={`${sloupec}-${radek}`}
            x={5.75 + sloupec * 7.5}
            y={9.5 + radek * 7.5}
            width="5.5"
            height="5.5"
            rx="1.5"
            className={sloupec === 1 && radek === 1 ? 'fill-akce' : 'fill-papir'}
          />
        )),
      )}
    </svg>
  );
}
