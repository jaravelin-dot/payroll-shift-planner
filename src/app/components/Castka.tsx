import { formatKc } from '../../core/penize';

type Props = {
  hal: number;
  /** Hlavní částka (např. K výplatě): stupeň 28 px. */
  velka?: boolean;
  /** Vedlejší částka (např. Náklad firmy): tlumená barva. */
  tlumena?: boolean;
  className?: string;
};

const UZKA_MEZERA = ' ';

/** Částka v Kč: tabulkové číslice, zarovnání vpravo, „Kč" odsazené úzkou nezlomitelnou mezerou. */
export function Castka({ hal, velka = false, tlumena = false, className = '' }: Props) {
  const text = formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`);
  const velikost = velka ? 'text-28 font-semibold' : '';
  const barva = tlumena ? 'text-tlumeny' : '';
  return (
    <data value={hal / 100} className={`block text-right tabular-nums whitespace-nowrap ${velikost} ${barva} ${className}`}>
      {text}
    </data>
  );
}
