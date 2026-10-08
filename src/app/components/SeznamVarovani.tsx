import { Link, type To } from 'react-router';
import type { Varovani } from '../../core/typy';
import { INFO_VAROVANI, seradVarovani, type TonVarovani } from '../varovani';

const TON: Record<TonVarovani, { box: string; nadpis: string }> = {
  chyba: { box: 'border-chyba bg-chyba/6', nadpis: 'text-chyba' },
  varovani: { box: 'border-varovani bg-varovani/8', nadpis: 'text-varovani' },
  info: { box: 'border-tlumeny/50 bg-karta', nadpis: 'text-inkoust' },
};

type Props = {
  varovani: readonly Varovani[];
  /** Kam vede „Porovnat odměny" u propadlé odměny (Výplaty s otevřeným porovnáním). */
  odkazPorovnani?: To;
};

/** Upozornění výpočtu od nejzávažnějšího: krátký název, plný text z jádra; bez upozornění nic. */
export function SeznamVarovani({ varovani, odkazPorovnani }: Props) {
  if (varovani.length === 0) return null;
  return (
    <section aria-labelledby="varovani-nadpis" className="flex flex-col gap-2">
      <h2 id="varovani-nadpis" className="px-1 text-15 font-semibold">
        Upozornění <span className="font-normal text-tlumeny tabular-nums">({varovani.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {seradVarovani(varovani).map((v) => {
          const info = INFO_VAROVANI[v.kod];
          const ton = TON[info.ton];
          return (
            <li key={`${v.kod}-${v.text}`} className={`rounded-lg border-l-[3px] py-2.5 pr-3 pl-3.5 ${ton.box}`}>
              <p className={`text-15 font-semibold ${ton.nadpis}`}>{info.nazev}</p>
              <p className="mt-0.5 text-13 text-inkoust/85">{v.text}</p>
              {v.kod === 'ODMENA_PROPADLA_NEMOC' && odkazPorovnani && (
                <p className="mt-1.5 text-13">
                  Kolik by dostal bez téhle podmínky, ukáže{' '}
                  <Link to={odkazPorovnani} state={{ porovnat: true }} className="font-semibold text-akce underline decoration-akce/40 underline-offset-2 hover:decoration-akce">
                    Porovnat odměny
                  </Link>
                  .
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
