import { Building2, ChevronRight, Download, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { formatKc } from '../../core/penize';
import type { Firma } from '../../shared/api';
import { useFirmy } from '../api/dotazy';
import { cisloNaText } from '../cisla';
import { Oznameni } from '../components/Oznameni';
import { Sekce } from '../components/Sekce';
import { Stitek } from '../components/Stitek';
import { tridyTlacitka } from '../components/Tlacitko';
import { useVyber } from '../stav/vyber';

/** Pár hlavních pravidel do řádku seznamu, aby šly firmy porovnat bez otevírání. */
function shrnutiPravidel(f: Firma): string {
  const n = f.nastaveni;
  const vikend = n.priplatekSobotaHal === n.priplatekNedeleHal
    ? `So a Ne ${formatKc(n.priplatekSobotaHal)}`
    : `So ${formatKc(n.priplatekSobotaHal)}, Ne ${formatKc(n.priplatekNedeleHal)}`;
  return `${cisloNaText(n.tydenniPracovniDoba)} h týdně · ${vikend} · stravné ${formatKc(n.stravnePausalHal)}`;
}

export function Nastaveni() {
  const { data: firmy = [] } = useFirmy();
  const vyber = useVyber();

  return (
    <>
      <title>Nastavení – Mzdy</title>
      <Oznameni />
      <h1 className="mb-6 text-28 font-semibold">Nastavení</h1>

      <div className="flex max-w-[44rem] flex-col gap-6">
        <Sekce nadpis="Firmy" popis="Každá firma má vlastní lidi a vlastní pravidla výpočtu: příplatky, stravné, odměny a pracovní dobu.">
          <ul aria-label="Firmy" className="-mx-5 -mt-1 divide-y divide-linka border-y border-linka sm:-mx-6">
            {firmy.map((f) => (
              <li key={f.id}>
                <Link
                  to={vyber.odkaz(`/nastaveni/firma/${f.id}`)}
                  className="flex min-h-16 items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-papir/70 active:bg-papir sm:px-6"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-papir text-inkoust">
                    <Building2 aria-hidden className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-17 font-semibold break-words lg:text-15">{f.nazev}</span>
                      {f.id === vyber.firmaId && <Stitek ton="info">Vybraná</Stitek>}
                    </span>
                    {f.ico && <span className="text-13 text-tlumeny tabular-nums">IČO {f.ico}</span>}
                    <span className="text-13 text-tlumeny">{shrnutiPravidel(f)}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-tlumeny" />
                </Link>
              </li>
            ))}
          </ul>
          <div>
            <Link to={vyber.odkaz('/nastaveni/firma/nova')} className={tridyTlacitka('vedlejsi')}>
              <Plus aria-hidden className="size-[18px]" />
              Přidat firmu
            </Link>
          </div>
        </Sekce>

        <Sekce nadpis="Záloha" popis="Všechna data všech firem v jednom souboru JSON. Stáhni si ji třeba po každé uzávěrce měsíce.">
          <div>
            <a href="/api/zaloha" download className={tridyTlacitka('vedlejsi')}>
              <Download aria-hidden className="size-[18px]" />
              Stáhnout zálohu
            </a>
          </div>
        </Sekce>

        <Sekce nadpis="O appce">
          <p className="text-15 text-tlumeny">
            Mzdy počítají výplaty podle zákonných parametrů pro roky 2026 a 2027. Úřední hlášení (ČSSZ, pojišťovny, finanční úřad) dál dělá
            účetní.
          </p>
        </Sekce>
      </div>
    </>
  );
}
