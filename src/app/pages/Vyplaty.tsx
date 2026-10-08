import { FileText, Lock, Scale, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { formatKc } from '../../core/penize';
import { useMesic } from '../api/dotazy';
import { dnesniDatum, formatDatum } from '../datum';
import { nazevMesice } from '../dochazka';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { Nacitani } from '../components/Nacitani';
import { Oznameni, type StavOznameni } from '../components/Oznameni';
import { PorovnaniOdmen } from '../components/PorovnaniOdmen';
import { PotvrzeniUzaverky } from '../components/PotvrzeniUzaverky';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { SeznamVyplat } from '../components/SeznamVyplat';
import { Stitek } from '../components/Stitek';
import { Tlacitko, tridyTlacitka } from '../components/Tlacitko';
import { useCekajiciZmeny } from '../hooks/useCekajiciZmeny';
import { useVypocet } from '../hooks/useVypocet';
import { celeJmeno, radkyVyplat, type RadekVyplaty } from '../radkyVyplat';
import { useVyber } from '../stav/vyber';

const UZKA_MEZERA = ' ';
const kc = (hal: number) => formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`);
const pocetLidi = (n: number) => (n === 1 ? '1 člověk' : n >= 2 && n <= 4 ? `${n} lidé` : `${n} lidí`);

function SouctyFirmy({ radky }: { radky: RadekVyplaty[] }) {
  const soucet = (f: (r: RadekVyplaty) => number) => radky.reduce((s, r) => s + f(r), 0);
  const kVyplate = soucet((r) => r.vysledek.kVyplateHal);
  return (
    <section aria-label="Součty za firmu" className="mb-6 flex flex-wrap items-end gap-x-12 gap-y-4 rounded-xl border border-linka bg-karta px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col">
        <span className="text-15 text-tlumeny">K výplatě celkem</span>
        <data value={kVyplate / 100} className="text-40 font-semibold whitespace-nowrap text-penize tabular-nums">{kc(kVyplate)}</data>
        <span className="text-13 text-tlumeny">{pocetLidi(radky.length)}</span>
      </div>
      <div className="flex flex-col pb-[1.125rem]">
        <span className="text-15 text-tlumeny">Náklad firmy</span>
        <data value={soucet((r) => r.vysledek.nakladFirmyHal) / 100} className="text-21 font-semibold whitespace-nowrap tabular-nums">{kc(soucet((r) => r.vysledek.nakladFirmyHal))}</data>
      </div>
      <div className="flex flex-col pb-[1.125rem]">
        <span className="text-15 text-tlumeny">Hrubé mzdy</span>
        <data value={soucet((r) => r.vysledek.hrubaHal) / 100} className="text-21 font-semibold whitespace-nowrap tabular-nums">{kc(soucet((r) => r.vysledek.hrubaHal))}</data>
      </div>
    </section>
  );
}

/** Výplaty měsíce: stav (rozpracováno / uzavřeno), součty firmy, výplaty lidí, uzávěrka a porovnání odměn. */
export function Vyplaty() {
  const vyber = useVyber();
  const navigate = useNavigate();
  const location = useLocation();
  const mesic = useMesic(vyber.firmaId, vyber.rok, vyber.mesic);
  const vysledky = useVypocet(mesic.data);
  // Odkaz z upozornění „Porovnat odměny" přichází se stavem navigace `porovnat`.
  const [porovnani, nastavPorovnani] = useState(() => (location.state as { porovnat?: boolean } | null)?.porovnat === true);
  const [potvrzeni, nastavPotvrzeni] = useState<'uzavrit' | 'otevrit' | null>(null);
  // Uzavřít jde, až se uloží rozdělané a neuložené změny docházky a odměn tohoto měsíce.
  const cekani = useCekajiciZmeny({ firmaId: vyber.firmaId ?? '', rok: vyber.rok, mesic: vyber.mesic });

  useEffect(() => {
    if ((location.state as { porovnat?: boolean } | null)?.porovnat) {
      void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const data = mesic.data;
  const { radky, mimoUzaverku } = data ? radkyVyplat(data, vysledky) : { radky: [], mimoUzaverku: [] };
  const uzavreno = data?.uzaverka ?? null;
  const nazev = nazevMesice(vyber.rok, vyber.mesic);
  const hotovo = (oznameni: string) => {
    nastavPotvrzeni(null);
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: { oznameni } satisfies StavOznameni });
  };

  return (
    <>
      <title>{`Výplaty – ${nazev} – Mzdy`}</title>
      <Oznameni />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-28 font-semibold">Výplaty</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-17">
            <span className="font-medium">{nazev}</span>
            {data && (uzavreno ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-akce px-2 py-px text-13 font-semibold text-akce">
                <Lock aria-hidden className="size-3.5" strokeWidth={2.5} />
                Uzavřeno {formatDatum(dnesniDatum(new Date(uzavreno.uzavreno)))}
              </span>
            ) : (
              <Stitek ton="neutralni">Rozpracováno</Stitek>
            ))}
          </p>
        </div>
        {data && radky.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Tlacitko varianta="vedlejsi" ikona={Scale} onClick={() => nastavPorovnani(true)}>Porovnat odměny</Tlacitko>
            <Link to={vyber.odkaz('/vystupy')} className={tridyTlacitka('vedlejsi')}>
              <FileText aria-hidden className="size-[18px]" />
              Výstupy
            </Link>
            {uzavreno ? (
              <Tlacitko varianta="vedlejsi" onClick={() => nastavPotvrzeni('otevrit')}>Otevřít měsíc</Tlacitko>
            ) : (
              <Tlacitko ikona={Lock} onClick={() => nastavPotvrzeni('uzavrit')} disabled={cekani !== null} title={cekani ?? undefined}>Uzavřít měsíc</Tlacitko>
            )}
          </div>
        )}
      </header>
      {data && radky.length > 0 && !uzavreno && cekani && (
        <p role="status" className="-mt-2 mb-6 rounded-lg border-l-[3px] border-varovani bg-varovani/8 px-4 py-2 text-15">
          Uzavřít měsíc zatím nejde. {cekani}
        </p>
      )}

      {mesic.isPending && <Nacitani />}
      {!data && mesic.error && <ChybaHlaska chyba={mesic.error} onZnovu={() => void mesic.refetch()} />}

      {data && radky.length === 0 && mimoUzaverku.length === 0 && (
        <PrazdnyStav
          ikona={Users}
          nadpis="V tomhle měsíci zatím nikdo nepracuje"
          akce={<Link to={vyber.odkaz('/lide')} className={tridyTlacitka('vedlejsi')}>Otevřít Lidé</Link>}
        >
          Přidej lidi v sekci Lidé. Pak jim tady zapíšeš docházku a uvidíš výplaty.
        </PrazdnyStav>
      )}

      {data && radky.length > 0 && (
        <>
          <SouctyFirmy radky={radky} />
          <SeznamVyplat radky={radky} odkaz={(id) => vyber.odkaz(`/clovek/${id}`)} />
        </>
      )}
      {mimoUzaverku.length > 0 && (
        <p className="mt-4 rounded-lg border-l-[3px] border-varovani bg-varovani/8 px-4 py-3 text-15">
          {mimoUzaverku.map((z) => `${z.jmeno} ${z.prijmeni}`).join(', ')} {mimoUzaverku.length === 1 ? 'není' : 'nejsou'} v uzávěrce
          (přibyli po uzavření). Otevři měsíc a uzavři ho znovu, ať se jim výplata spočítá.
        </p>
      )}

      {porovnani && data && (
        <PorovnaniOdmen data={data} odkazNastaveni={vyber.odkaz(`/nastaveni/firma/${data.firma.id}`)} onZavrit={() => nastavPorovnani(false)} />
      )}
      {potvrzeni && data && (
        <PotvrzeniUzaverky
          akce={potvrzeni}
          firmaId={data.firma.id}
          rok={data.rok}
          mesic={data.mesic}
          souhrn={{
            kVyplateHal: radky.reduce((s, r) => s + r.vysledek.kVyplateHal, 0),
            pocetLidi: radky.length,
            lide: radky.map((r) => ({ zamestnanecId: r.zamestnanecId, jmeno: celeJmeno(r), varovani: r.vysledek.varovani })),
          }}
          odkazNaCloveka={(id) => vyber.odkaz(`/clovek/${id}`)}
          onZavrit={() => nastavPotvrzeni(null)}
          onHotovo={hotovo}
        />
      )}
    </>
  );
}
