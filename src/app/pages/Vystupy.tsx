import { CircleAlert, Download, FileDown, FileSpreadsheet, FileText, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatKc } from '../../core/penize';
import type { MesicData } from '../../shared/api';
import { useMesic, useUzaverky } from '../api/dotazy';
import { dnesniDatum, formatDatum } from '../datum';
import { nazevMesice } from '../dochazka';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { GrafNakladu } from '../components/GrafNakladu';
import { Nacitani } from '../components/Nacitani';
import { Platby } from '../components/Platby';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { Sekce } from '../components/Sekce';
import { Stitek } from '../components/Stitek';
import { Tlacitko, tridyTlacitka } from '../components/Tlacitko';
import { useVypocet } from '../hooks/useVypocet';
import { celeJmeno, radkyVyplat, type RadekVyplaty } from '../radkyVyplat';
import { useVyber } from '../stav/vyber';
import { nazevExcelu, vytvorExcel } from '../vystupy/excel';
import { nakladyMesice, nakladyRoku, soucetNakladu, type MesicNakladu } from '../vystupy/naklady';
import { podkladUcetni } from '../vystupy/podklad';
import { nazevPodkladuPdf, vytvorPodkladPdf } from '../vystupy/podkladPdf';
import { vytvorPaskyPdf, type ZamestnanecPasky } from '../vystupy/paskaPdf';
import { nazevSouboru, stahni } from '../vystupy/stahni';

const UZKA_MEZERA = ' ';
const kc = (hal: number) => formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`);
const dvojmistne = (mesic: number) => String(mesic).padStart(2, '0');

/** Co se právě stahuje: pásky všech, páska jednoho člověka (jeho id), Excel nebo podklad pro účetního. */
type Probiha = { co: 'vse' | 'excel' | 'podklad' } | { co: 'clovek'; id: string };

/** Chyba při tvorbě souboru: stejná řeč jako ChybaHlaska, ale s vlastním textem (nejde o chybu API). */
function HlaskaChyby({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border-l-[3px] border-chyba bg-chyba/8 py-3 pr-3 pl-4 text-15 font-medium text-chyba">
      <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      {text}
    </p>
  );
}

/**
 * Hlavní čísla nákladů vybraného měsíce a celého roku. `mesice` je `null`, dokud nejsou uzávěrky roku načtené (nebo
 * když se nenačetly): roční součet by pak vypadal úplně, ale měl by jen vybraný měsíc.
 */
function SouhrnNakladu({ mesic, rok, nazevMesice: nazev, mesice, nacita }: {
  mesic: MesicNakladu; rok: number; nazevMesice: string; mesice: MesicNakladu[] | null; nacita: boolean;
}) {
  const rokCelkem = mesice ? soucetNakladu(mesice) : null;
  const polozky: [string, number][] = [
    ['Hrubé mzdy', mesic.hrubeHal],
    ['Odvody firmy', mesic.odvodyHal],
    ['Stravné', mesic.stravneHal],
    ...(mesic.nemocHal > 0 ? [['Náhrada za nemoc', mesic.nemocHal] as [string, number]] : []),
  ];
  return (
    <dl className="flex flex-wrap items-end gap-x-10 gap-y-4">
      <div className="flex flex-col">
        <dt className="text-15 text-tlumeny">Náklad firmy, {nazev.toLowerCase()}</dt>
        <dd><data value={mesic.celkemHal / 100} className="text-28 font-semibold whitespace-nowrap tabular-nums">{kc(mesic.celkemHal)}</data></dd>
      </div>
      {polozky.map(([popis, hal]) => (
        <div key={popis} className="flex flex-col pb-0.5">
          <dt className="text-13 text-tlumeny">{popis}</dt>
          <dd><data value={hal / 100} className="text-17 font-semibold whitespace-nowrap tabular-nums">{kc(hal)}</data></dd>
        </div>
      ))}
      <div className="flex flex-col pb-0.5">
        <dt className="text-13 text-tlumeny">Za rok {rok}{rokCelkem?.vcetneRozpracovaneho ? ' vč. rozpracovaného' : ''}</dt>
        <dd>
          {rokCelkem ? (
            <data value={rokCelkem.celkemHal / 100} className="text-17 font-semibold whitespace-nowrap tabular-nums">{kc(rokCelkem.celkemHal)}</data>
          ) : (
            <span className="text-15 text-tlumeny">{nacita ? 'načítám uzávěrky…' : 'nedostupné'}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Údaje člověka pro pásku: jméno a smlouva z řádku (u uzavřeného měsíce ze snímku), účet z aktuálních údajů (člověk už mezi nimi nemusí být). */
function zamestnanecPasky(r: RadekVyplaty, data: MesicData): ZamestnanecPasky {
  const z = data.zamestnanci.find((c) => c.id === r.zamestnanecId);
  return { jmeno: r.jmeno, prijmeni: r.prijmeni, smlouva: r.smlouva, ucet: z?.ucet };
}

/** Výstupy měsíce: výplatní pásky (PDF), Excel pro účetního, platby s QR, náklady firmy a záloha. */
export function Vystupy() {
  const vyber = useVyber();
  const mesic = useMesic(vyber.firmaId, vyber.rok, vyber.mesic);
  const uzaverky = useUzaverky(vyber.firmaId, vyber.rok);
  const vysledky = useVypocet(mesic.data);
  const [probiha, nastavProbiha] = useState<Probiha | null>(null);
  const [chyba, nastavChybu] = useState<'pasky' | 'excel' | 'podklad' | null>(null);

  const data = mesic.data;
  const { radky, mimoUzaverku } = data ? radkyVyplat(data, vysledky) : { radky: [], mimoUzaverku: [] };
  const uzavreno = data?.uzaverka ?? null;
  const nazev = nazevMesice(vyber.rok, vyber.mesic);
  const obdobi = `${vyber.rok}-${dvojmistne(vyber.mesic)}`;

  // Uzávěrky roku + uzávěrka vybraného měsíce z jeho dat (kdyby seznam uzávěrek ještě nebyl obnovený).
  const uzaverkyRoku = [...(uzaverky.data ?? []).filter((u) => !(data?.uzaverka && u.mesic === data.uzaverka.mesic)), ...(data?.uzaverka ? [data.uzaverka] : [])];
  // „Aktuální měsíc“ v grafu je měsíc vybraný nahoře, když je otevřený: jen jeho docházka je tu načtená, takže jen pro něj
  // jde spočítat předběžný náklad. Ostatní neuzavřené měsíce zůstanou prázdné („neuzavřeno“).
  const mesiceNakladu = nakladyRoku({
    uzaverky: uzaverkyRoku,
    rozpracovany: data && !data.uzaverka ? { mesic: vyber.mesic, vysledky: radky.map((r) => r.vysledek) } : null,
  });
  // Roční součet a graf dávají smysl, až když jsou uzávěrky roku načtené; do té doby by v nich byl jen vybraný měsíc.
  const uzaverkyNacteny = uzaverky.data !== undefined;
  const nakladyVybraneho = nakladyMesice(vyber.mesic, uzavreno ? 'UZAVRENO' : 'ROZPRACOVANO', radky.map((r) => r.vysledek));

  async function stahniPasky(kdo: RadekVyplaty[], co: Probiha, nazevSouboruPdf: string) {
    if (!data) return;
    nastavProbiha(co);
    nastavChybu(null);
    try {
      const pdf = await vytvorPaskyPdf({
        firma: data.firma, rok: vyber.rok, mesic: vyber.mesic, uzavreno: uzavreno?.uzavreno ?? null,
        radky: kdo.map((r) => ({ zamestnanec: zamestnanecPasky(r, data), vysledek: r.vysledek })),
      });
      stahni(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), nazevSouboruPdf);
    } catch {
      nastavChybu('pasky');
    } finally {
      nastavProbiha(null);
    }
  }

  async function stahniExcel() {
    if (!data) return;
    nastavProbiha({ co: 'excel' });
    nastavChybu(null);
    try {
      stahni(await vytvorExcel({ firma: data.firma, rok: vyber.rok, mesic: vyber.mesic, data, vysledky }), nazevExcelu(data.firma, vyber.rok, vyber.mesic));
    } catch {
      nastavChybu('excel');
    } finally {
      nastavProbiha(null);
    }
  }

  async function stahniPodklad() {
    if (!data) return;
    nastavProbiha({ co: 'podklad' });
    nastavChybu(null);
    try {
      const pdf = await vytvorPodkladPdf({ podklad: podkladUcetni(data, vysledky) });
      stahni(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), nazevPodkladuPdf(data.firma.nazev, vyber.rok, vyber.mesic));
    } catch {
      nastavChybu('podklad');
    } finally {
      nastavProbiha(null);
    }
  }

  const nacitaClovek = (id: string) => probiha?.co === 'clovek' && probiha.id === id;

  return (
    <>
      <title>{`Výstupy – ${nazev} – Mzdy`}</title>
      <header className="mb-6 flex flex-col gap-1.5">
        <h1 className="text-28 font-semibold">Výstupy</h1>
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
        {data && radky.length > 0 && (
          <p className="max-w-[65ch] text-15 text-tlumeny">
            {uzavreno
              ? 'Pásky, Excel i platby jsou ze snímku uzávěrky, čísla se už nezmění.'
              : 'Měsíc není uzavřený. Pásky, Excel i platby ukazují rozpracovaný výpočet a pásky to mají napsané. Po uzavření se čísla zamknou.'}
          </p>
        )}
      </header>

      {mesic.isPending && <Nacitani />}
      {!data && mesic.error && <ChybaHlaska chyba={mesic.error} onZnovu={() => void mesic.refetch()} />}

      {data && radky.length === 0 && (
        <PrazdnyStav
          ikona={FileText}
          nadpis="V tomhle měsíci nejsou žádné výplaty"
          akce={<Link to={vyber.odkaz('/')} className={tridyTlacitka('vedlejsi')}>Otevřít výplaty</Link>}
        >
          Výstupy se připraví, až budou lidé v měsíci mít zapsanou docházku.
        </PrazdnyStav>
      )}

      {data && radky.length > 0 && (
        <div className="flex flex-col gap-6">
          {mimoUzaverku.length > 0 && (
            <p className="rounded-lg border-l-[3px] border-varovani bg-varovani/8 px-4 py-3 text-15">
              {mimoUzaverku.map((z) => `${z.jmeno} ${z.prijmeni}`).join(', ')} {mimoUzaverku.length === 1 ? 'není' : 'nejsou'} v uzávěrce,
              proto ve výstupech chybí. Otevři měsíc a uzavři ho znovu.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
            <Sekce nadpis="Výplatní pásky" popis="PDF na A4, každý člověk na vlastní stránce. Náklad firmy na pásce není, ten je jen v Excelu.">
              <div>
                <Tlacitko
                  ikona={FileDown}
                  nacita={probiha?.co === 'vse'}
                  disabled={probiha !== null}
                  onClick={() => void stahniPasky(radky, { co: 'vse' }, `vyplatni-pasky-${nazevSouboru(data.firma.nazev)}-${obdobi}.pdf`)}
                >
                  {`Stáhnout pásky všech (${radky.length})`}
                </Tlacitko>
              </div>
              {chyba === 'pasky' && <HlaskaChyby text="PDF se nepodařilo vytvořit. Zkus to znovu, případně obnov stránku." />}
              <ul aria-label="Pásky lidí" className="-mx-5 divide-y divide-linka border-t border-linka sm:-mx-6">
                {radky.map((r) => (
                  <li key={r.zamestnanecId} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-15 font-semibold">{celeJmeno(r)}</span>
                      <span className="text-13 text-tlumeny tabular-nums">{r.smlouva} · k výplatě {kc(r.vysledek.kVyplateHal)}</span>
                    </span>
                    <Tlacitko
                      varianta="tiche"
                      ikona={FileDown}
                      aria-label={`Páska PDF: ${celeJmeno(r)}`}
                      nacita={nacitaClovek(r.zamestnanecId)}
                      disabled={probiha !== null}
                      onClick={() => void stahniPasky([r], { co: 'clovek', id: r.zamestnanecId },
                        `vyplatni-paska-${nazevSouboru(`${r.prijmeni} ${r.jmeno}`)}-${obdobi}.pdf`)}
                    >
                      Páska PDF
                    </Tlacitko>
                  </li>
                ))}
              </ul>
            </Sekce>

            <div className="flex flex-col gap-6">
              <Sekce
                nadpis="Pro účetního"
                popis="Podklad pro účetního: tabulka ve tvaru ručního přehledu pro účetní (fond pracovní doby, hodiny, dovolená, nemoc, stravenky, odměny, brigádníci) v PDF. Excel má tutéž tabulku na prvním listu Podklad a k tomu Souhrn (všechny složky mzdy, odvody, daň, k výplatě, náklad firmy) a Docházku po dnech."
              >
                <div className="flex flex-wrap gap-2">
                  <Tlacitko varianta="vedlejsi" ikona={FileText} nacita={probiha?.co === 'podklad'} disabled={probiha !== null} onClick={() => void stahniPodklad()}>
                    Podklad pro účetního (PDF)
                  </Tlacitko>
                  <Tlacitko varianta="vedlejsi" ikona={FileSpreadsheet} nacita={probiha?.co === 'excel'} disabled={probiha !== null} onClick={() => void stahniExcel()}>
                    Stáhnout Excel
                  </Tlacitko>
                </div>
                {chyba === 'podklad' && <HlaskaChyby text="PDF podkladu se nepodařilo vytvořit. Zkus to znovu, případně obnov stránku." />}
                {chyba === 'excel' && <HlaskaChyby text="Excel se nepodařilo vytvořit. Zkus to znovu, případně obnov stránku." />}
              </Sekce>
              <Sekce nadpis="Záloha" popis="Všechna data všech firem v jednom souboru JSON.">
                <div>
                  <a href="/api/zaloha" download className={tridyTlacitka('vedlejsi')}>
                    <Download aria-hidden className="size-[18px]" />
                    Stáhnout zálohu
                  </a>
                </div>
              </Sekce>
            </div>
          </div>

          <Sekce nadpis="Platby" popis="QR Platbu naskenuj v bankovní aplikaci. Kdo nemá platné číslo účtu, dostane výplatu hotově.">
            <Platby radky={radky} zamestnanci={data.zamestnanci} rok={vyber.rok} mesic={vyber.mesic} />
          </Sekce>

          <Sekce nadpis="Náklady firmy" popis="Uzavřené měsíce jsou ze snímků uzávěrek, rozpracovaný měsíc z aktuálního výpočtu.">
            <SouhrnNakladu mesic={nakladyVybraneho} rok={vyber.rok} nazevMesice={nazev} mesice={uzaverkyNacteny ? mesiceNakladu : null} nacita={uzaverky.isPending} />
            {uzaverky.isPending && <Nacitani text="Načítám uzávěrky roku…" />}
            {uzaverky.error && !uzaverkyNacteny && <ChybaHlaska chyba={uzaverky.error} onZnovu={() => void uzaverky.refetch()} />}
            {uzaverkyNacteny && <GrafNakladu rok={vyber.rok} mesice={mesiceNakladu} />}
          </Sekce>
        </div>
      )}
    </>
  );
}
