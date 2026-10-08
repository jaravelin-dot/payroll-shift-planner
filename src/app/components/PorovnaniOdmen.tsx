import { Link, type To } from 'react-router';
import { formatKc } from '../../core/penize';
import { pripravVstup } from '../../core/priprava';
import { porovnejOdmeny } from '../../core/varianty';
import type { MesicData } from '../../shared/api';
import { SpodniPanel } from './SpodniPanel';

type Props = {
  data: MesicData;
  odkazNastaveni: To;
  onZavrit: () => void;
};

const UZKA_MEZERA = ' ';
const kc = (hal: number, plus = false) => `${plus && hal > 0 ? '+' : ''}${formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`)}`;

/**
 * Porovnání odměny za den (spec 5.12): dnešní pravidlo „propadá při nemoci" proti výplatě bez podmínky, po lidech
 * (K výplatě) a za firmu (K výplatě i náklad). Jen výpočet, nic se neukládá.
 */
export function PorovnaniOdmen({ data, odkazNastaveni, onZavrit }: Props) {
  const prijmeni = new Map(data.zamestnanci.map((z) => [z.id, `${z.prijmeni} ${z.jmeno}`]));
  const radky = porovnejOdmeny(data.zamestnanci.map((z) => pripravVstup(data, z.id)))
    .sort((a, b) => (prijmeni.get(a.zamestnanecId) ?? '').localeCompare(prijmeni.get(b.zamestnanecId) ?? '', 'cs'));
  const rozdilVyplat = radky.reduce((s, r) => s + r.rozdilKVyplateHal, 0);
  const rozdilNakladu = radky.reduce((s, r) => s + r.rozdilNakladuHal, 0);
  const podminkaZapnuta = data.firma.nastaveni.odmenaZaDenPropadaPriNemoci;

  return (
    <SpodniPanel otevreno onZavrit={onZavrit} nadpis="Porovnat odměny za den">
      <div className="flex flex-col gap-4 text-15">
        <p>
          {podminkaZapnuta
            ? 'Dnes odměna za den celá propadne, když byl člověk v měsíci aspoň den nemocný. Bez podmínky ji dostane za každý odpracovaný den. Částky jsou K výplatě.'
            : 'Firma má podmínku vypnutou: odměna za den se vyplácí i při nemoci, takže obě varianty vycházejí stejně.'}
        </p>
        {data.uzaverka && (
          <p className="rounded-lg border-l-[3px] border-varovani bg-varovani/8 px-4 py-3 text-13">
            Měsíc je uzavřený. Porovnání se počítá z dnešních údajů (sazby, lidé, nastavení firmy), ne z uloženého výpočtu
            uzávěrky, takže se sloupec Dnes může lišit od výplat v přehledu.
          </p>
        )}

        {/* Na úzkém displeji menší písmo, aby se čtyři sloupce vešly bez vodorovného posunu. */}
        <table className="w-full border-collapse text-13 tabular-nums sm:text-15">
          <thead>
            <tr className="border-b border-linka text-13 text-tlumeny">
              <th scope="col" className="py-2 pr-2 text-left font-medium">Jméno</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Dnes</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Bez podmínky</th>
              <th scope="col" className="py-2 pl-1 text-right font-medium">Rozdíl</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linka">
            {radky.map((r) => (
              <tr key={r.zamestnanecId} className={r.rozdilKVyplateHal === 0 ? 'text-tlumeny' : ''}>
                <th scope="row" className="py-2.5 pr-2 text-left font-medium">{r.jmeno}</th>
                <td className="px-1 py-2.5 text-right whitespace-nowrap">{kc(r.dnes.kVyplateHal)}</td>
                <td className="px-1 py-2.5 text-right whitespace-nowrap">{kc(r.bezPodminky.kVyplateHal)}</td>
                <td className={`py-2.5 pl-1 text-right whitespace-nowrap ${r.rozdilKVyplateHal !== 0 ? 'font-semibold text-inkoust' : ''}`}>
                  {r.rozdilKVyplateHal === 0 ? '–' : kc(r.rozdilKVyplateHal, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="rounded-lg bg-papir px-4 py-3">
          {rozdilVyplat === 0 ? (
            'Tento měsíc vycházejí obě varianty stejně: nikdo s odměnou za den nebyl nemocný.'
          ) : (
            <>
              Bez podmínky by firma tento měsíc vyplatila o <strong className="font-semibold tabular-nums whitespace-nowrap">{kc(rozdilVyplat)}</strong> víc;
              náklad firmy i s odvody by byl vyšší o <strong className="font-semibold tabular-nums whitespace-nowrap">{kc(rozdilNakladu)}</strong>.
            </>
          )}
        </p>
        <p className="text-13 text-tlumeny">
          Jen výpočet, nic se neukládá. Pravidlo jde změnit v{' '}
          <Link to={odkazNastaveni} className="font-semibold text-akce underline decoration-akce/40 underline-offset-2 hover:decoration-akce">nastavení firmy</Link>.
        </p>
      </div>
    </SpodniPanel>
  );
}
