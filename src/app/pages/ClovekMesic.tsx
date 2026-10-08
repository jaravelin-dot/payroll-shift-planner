import { ChevronLeft, ChevronRight, Lock, Thermometer, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { hodinovaMinimalniMzdaProZamestnance, mesiceCtvrtleti } from '../../core/kalendar';
import { parametryRoku } from '../../core/parametry';
import { vyresPrumernyVydelek } from '../../core/prumernyVydelek';
import { sazbaProMesic } from '../../core/slozky';
import type { MesicData, ZamestnanecSeSazbami } from '../../shared/api';
import { useMesic, useUlozDny } from '../api/dotazy';
import { formatHodin, formatSazby } from '../cisla';
import { dnesniDatum, formatDatum } from '../datum';
import { mimoPomer, nazevMesice, vMesici } from '../dochazka';
import { Castka } from '../components/Castka';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { DochazkovaKarta } from '../components/DochazkovaKarta';
import { Nacitani } from '../components/Nacitani';
import { OdmenyMesice } from '../components/OdmenyMesice';
import { Oznameni, type StavOznameni } from '../components/Oznameni';
import { PanelDne, type ZmenaDnu } from '../components/PanelDne';
import { PanelMimoPomeru } from '../components/PanelMimoPomeru';
import { PotvrzeniUzaverky } from '../components/PotvrzeniUzaverky';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { SeznamVarovani } from '../components/SeznamVarovani';
import { Tlacitko, tridyTlacitka } from '../components/Tlacitko';
import { SouhrnHodinMesice } from '../components/SouhrnHodinMesice';
import { Uctenka } from '../components/Uctenka';
import { useMesicniVstup } from '../hooks/useMesicniVstup';
import { useVypocet } from '../hooks/useVypocet';
import { useVyber } from '../stav/vyber';

const podlePrijmeni = (a: ZamestnanecSeSazbami, b: ZamestnanecSeSazbami) =>
  a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs');
const celeJmeno = (z: ZamestnanecSeSazbami) => `${z.jmeno} ${z.prijmeni}`;

/** Odkud je průměrný výdělek, česky: ručně / z uzávěrek / odhad ze sazby. */
function zdrojPrumeru(data: MesicData, z: ZamestnanecSeSazbami): string {
  const minHodHal = hodinovaMinimalniMzdaProZamestnance(parametryRoku(data.rok), data.firma.nastaveni, z.smlouva);
  const { zdroj } = vyresPrumernyVydelek({
    zamestnanecId: z.id, rok: data.rok, mesic: data.mesic, vstupy: data.vstupy, uzaverkyPredchozihoCtvrtleti: data.uzaverkyPredchozihoCtvrtleti, minHodHal,
  });
  if (zdroj === 'RUCNE') {
    const ctvrtleti = mesiceCtvrtleti(data.rok, data.mesic).map((m) => m.mesic);
    const zadany = data.vstupy
      .filter((v) => v.zamestnanecId === z.id && v.rok === data.rok && ctvrtleti.includes(v.mesic) && v.mesic <= data.mesic && v.prumernyVydelekHal)
      .sort((a, b) => b.mesic - a.mesic)[0];
    return zadany && zadany.mesic !== data.mesic
      ? `Zadaný ručně ${vMesici(zadany.mesic)}, platí pro celé čtvrtletí.`
      : 'Zadaný ručně pro celé čtvrtletí.';
  }
  if (zdroj === 'Z_UZAVEREK') return 'Spočítaný z uzávěrek minulého čtvrtletí.';
  return sazbaProMesic(z.sazby, data.rok, data.mesic)
    ? 'Odhad ze sazby: minulé čtvrtletí nemá dost uzavřených měsíců.'
    : 'Odhad z minimální mzdy: člověk nemá sazbu.';
}

type Panel = { datumy: string[]; rezim: 'den' | 'nemoc' };

function ObsahCloveka({ data, z, firmaId }: { data: MesicData; z: ZamestnanecSeSazbami; firmaId: string }) {
  const vyber = useVyber();
  const navigate = useNavigate();
  const location = useLocation();
  const vstup = useMesicniVstup(firmaId, data, z.id);
  const ulozDny = useUlozDny();
  const [panel, nastavPanel] = useState<Panel | null>(null);
  const [vybrane, nastavVybrane] = useState<string[]>([]);
  const [otevrit, nastavOtevrit] = useState(false);

  const dataProVypocet = useMemo(() => {
    const k = vstup.koncept;
    if (!k) return data;
    return { ...data, vstupy: [...data.vstupy.filter((v) => !(v.zamestnanecId === k.zamestnanecId && v.rok === k.rok && v.mesic === k.mesic)), k] };
  }, [data, vstup.koncept]);
  const vysledek = useVypocet(dataProVypocet).get(z.id);

  const uzavreno = data.uzaverka !== null;
  const mesicKlic = `${data.rok}-${String(data.mesic).padStart(2, '0')}`;
  const dnyOsoby = data.dny.filter((d) => d.zamestnanecId === z.id);
  const lide = [...data.zamestnanci].sort(podlePrijmeni);
  const poradi = lide.findIndex((x) => x.id === z.id);
  const [predchozi, dalsi] = [lide[poradi - 1], lide[poradi + 1]];
  const sazba = sazbaProMesic(z.sazby, data.rok, data.mesic);
  // Den mimo pracovní poměr jde otevřít, jen když má zápis, a to jen ke smazání.
  const zaznamMimoPomer = panel?.rezim === 'den' && panel.datumy.length === 1 && mimoPomer(panel.datumy[0], z)
    ? dnyOsoby.find((d) => d.datum === panel.datumy[0]) : undefined;
  const ukaz = (oznameni: string) => void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: { oznameni } satisfies StavOznameni });

  const uloz = (zmena: ZmenaDnu, hlaska?: string) => {
    ulozDny.mutate({ firmaId, zamestnanecId: z.id, ...zmena, kdo: celeJmeno(z) });
    nastavPanel(null);
    nastavVybrane([]);
    if (hlaska) ukaz(hlaska);
  };

  const sipka = (kdo: ZamestnanecSeSazbami | undefined, smer: 'Předchozí' | 'Další') => {
    const Ikona = smer === 'Předchozí' ? ChevronLeft : ChevronRight;
    if (!kdo) return <span aria-hidden className="grid size-11 place-items-center rounded-lg border border-linka text-linka"><Ikona className="size-5" /></span>;
    return (
      <Link to={vyber.odkaz(`/clovek/${kdo.id}`)} aria-label={`${smer}: ${celeJmeno(kdo)}`} title={celeJmeno(kdo)}
        className="grid size-11 place-items-center rounded-lg border border-tlumeny/80 bg-karta text-inkoust transition-colors hover:border-tlumeny hover:bg-papir">
        <Ikona aria-hidden className="size-5" />
      </Link>
    );
  };

  return (
    <>
      <title>{`${celeJmeno(z)} – ${nazevMesice(data.rok, data.mesic)} – Mzdy`}</title>
      <Oznameni />
      <div className="flex items-center justify-between gap-4">
        <Link to={vyber.odkaz('/')} aria-label="Zpět na výplaty" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-15 font-medium text-tlumeny transition-colors hover:text-inkoust">
          <ChevronLeft aria-hidden className="size-5" />
          Výplaty
        </Link>
        <nav aria-label="Další lidé" className="flex gap-2">
          {sipka(predchozi, 'Předchozí')}
          {sipka(dalsi, 'Další')}
        </nav>
      </div>
      <header className="mt-1 mb-6 flex min-w-0 flex-col gap-1">
        <h1 className="text-28 font-semibold">{celeJmeno(z)}</h1>
        <p className="text-15 text-tlumeny tabular-nums">
          {z.smlouva}{z.smlouva === 'HPP' && ` · ${formatHodin(z.uvazekMinTydne)} týdně`} · {sazba ? formatSazby(sazba.hodinovaHal) : 'bez sazby'} · {nazevMesice(data.rok, data.mesic)}
        </p>
        {/* Mobil: účtenka je až pod kartou, proto výsledek i nahoře, ať je změna po zápisu dne vidět hned. */}
        {vysledek && (
          <p className="mt-1 flex items-baseline gap-2 text-15 lg:hidden">
            K výplatě
            <Castka hal={vysledek.kVyplateHal} className={`text-21 font-semibold ${vysledek.kVyplateHal < 0 ? 'text-chyba' : 'text-penize'}`} />
          </p>
        )}
      </header>

      {uzavreno && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border-2 border-akce/70 bg-karta px-4 py-3">
          <Lock aria-hidden className="size-5 shrink-0 text-akce" />
          <p className="min-w-0 flex-1 basis-60 text-15">
            <span className="font-semibold">{nazevMesice(data.rok, data.mesic)} je uzavřený.</span>{' '}
            <span className="text-tlumeny">Uzavřeno {formatDatum(dnesniDatum(new Date(data.uzaverka!.uzavreno)))}. Docházka a odměny jdou jen prohlížet.</span>
          </p>
          <Tlacitko varianta="vedlejsi" onClick={() => nastavOtevrit(true)}>Otevřít měsíc</Tlacitko>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <OdmenyMesice
            smlouva={z.smlouva} nastaveni={data.firma.nastaveni} vstup={vstup.vstup}
            pvHal={vysledek?.pvHal ?? 0} pvZdroj={zdrojPrumeru(data, z)} jenCteni={uzavreno}
            onZmena={vstup.zmen} stav={vstup.stav} chyba={vstup.chyba} onZnovu={vstup.znovu}
          />
          <DochazkovaKarta
            rok={data.rok} mesic={data.mesic} dny={dnyOsoby.filter((d) => d.datum.startsWith(mesicKlic))} zamestnanec={z} dnes={dnesniDatum()}
            jenCteni={uzavreno} vybrane={vybrane} onVyber={nastavVybrane}
            onOtevri={(datumy) => nastavPanel({ datumy, rezim: 'den' })}
            akce={!uzavreno && (
              <Tlacitko varianta="vedlejsi" ikona={Thermometer} onClick={() => nastavPanel({ datumy: [dnesniDatum().startsWith(mesicKlic) ? dnesniDatum() : `${mesicKlic}-01`], rezim: 'nemoc' })}>
                Zadat nemoc
              </Tlacitko>
            )}
          />
          {vysledek && <SouhrnHodinMesice hodiny={vysledek.hodiny} />}
        </div>

        <aside aria-label="Výpočet" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:-m-1 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:p-1 lg:[scrollbar-width:thin]">
          {vysledek ? (
            <Uctenka vysledek={vysledek} />
          ) : (
            <p className="rounded-xl border border-linka bg-karta p-5 text-15 text-tlumeny">
              V uzávěrce tohoto měsíce tenhle člověk není. Otevři měsíc a uzavři ho znovu, ať se mu výplata spočítá.
            </p>
          )}
          {vysledek && <SeznamVarovani varovani={vysledek.varovani} odkazPorovnani={vyber.odkaz('/')} />}
        </aside>
      </div>

      {panel && (zaznamMimoPomer ? (
        <PanelMimoPomeru zaznam={zaznamMimoPomer} zamestnanec={z} onSmazat={() => uloz({ dny: [], smazat: [zaznamMimoPomer.datum] })} onZavrit={() => nastavPanel(null)} />
      ) : (
        <PanelDne
          datumy={panel.datumy} rezim={panel.rezim} rok={data.rok} mesic={data.mesic} zamestnanec={z} dnyOsoby={dnyOsoby}
          onUloz={uloz} onZavrit={() => nastavPanel(null)}
        />
      ))}
      {otevrit && (
        <PotvrzeniUzaverky akce="otevrit" firmaId={firmaId} rok={data.rok} mesic={data.mesic}
          onZavrit={() => nastavOtevrit(false)} onHotovo={(hlaska) => { nastavOtevrit(false); ukaz(hlaska); }} />
      )}
    </>
  );
}

/** Člověk v měsíci (`/clovek/:zamestnanecId`): odměny, docházková karta, účtenka výpočtu a upozornění. */
export function ClovekMesic() {
  const { zamestnanecId } = useParams();
  const vyber = useVyber();
  const mesic = useMesic(vyber.firmaId, vyber.rok, vyber.mesic);

  if (!vyber.firma || mesic.isPending) return <Nacitani />;
  if (!mesic.data) return <ChybaHlaska chyba={mesic.error} onZnovu={() => void mesic.refetch()} />;
  const z = mesic.data.zamestnanci.find((x) => x.id === zamestnanecId);

  if (!z) {
    return (
      <>
        <title>Člověk v měsíci – Mzdy</title>
        <PrazdnyStav
          ikona={UserX}
          nadpis="V tomhle měsíci tu tenhle člověk není"
          akce={<Link to={vyber.odkaz('/')} className={tridyTlacitka('vedlejsi')}>Zpět na výplaty</Link>}
        >
          {vMesici(vyber.mesic).replace(/^v/, 'V')} {vyber.rok} nebyl ve firmě {vyber.firma.nazev} v pracovním poměru, nebo patří k jiné firmě.
        </PrazdnyStav>
      </>
    );
  }
  return <ObsahCloveka key={`${vyber.firma.id}-${z.id}-${vyber.rok}-${vyber.mesic}`} data={mesic.data} z={z} firmaId={vyber.firma.id} />;
}
