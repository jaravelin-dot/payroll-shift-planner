import { ChevronRight, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, type To } from 'react-router';
import { sazbaProDen } from '../../core/slozky';
import type { ZamestnanecSeSazbami } from '../../shared/api';
import { useZamestnanci } from '../api/dotazy';
import { formatHodin, formatSazby } from '../cisla';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { Nacitani } from '../components/Nacitani';
import { Oznameni } from '../components/Oznameni';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { Prepinac } from '../components/Prepinac';
import { Stitek } from '../components/Stitek';
import { tridyTlacitka } from '../components/Tlacitko';
import { dnesniDatum, formatDatum } from '../datum';
import { useVyber } from '../stav/vyber';

/** Řazení podle příjmení, pak jména, česky (Č za C, Ch za H). */
const podleJmena = (a: ZamestnanecSeSazbami, b: ZamestnanecSeSazbami) =>
  a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs');

/** „1 člověk", „2 lidé", „5 lidí". */
function pocetLidi(pocet: number): string {
  if (pocet === 1) return '1 člověk';
  if (pocet >= 2 && pocet <= 4) return `${pocet} lidé`;
  return `${pocet} lidí`;
}

const MRIZKA = 'lg:grid lg:grid-cols-[minmax(0,1fr)_4rem_7.5rem_7.5rem_1.25rem] lg:gap-6';

function Radek({ z, dnes, odkaz }: { z: ZamestnanecSeSazbami; dnes: string; odkaz: To }) {
  const sazba = sazbaProDen(z.sazby, dnes);
  const sazbaText = sazba === null ? 'bez sazby' : formatSazby(sazba);
  const uvazekText = z.smlouva === 'HPP' ? `${formatHodin(z.uvazekMinTydne)} týdně` : 'dohoda';
  const stitky = [
    z.invalidita !== 'ZADNA' && `Invalidita ${z.invalidita}`,
    z.ztpp && 'ZTP/P',
    z.prohlaseni && 'Prohlášení',
  ].filter((s): s is string => !!s);

  return (
    <Link
      to={odkaz}
      className={`flex min-h-16 items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-papir/70 active:bg-papir sm:px-5 ${MRIZKA} lg:items-center`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-17 font-semibold lg:text-15">
          {z.jmeno} {z.prijmeni}
        </span>
        {/* Mobil: smlouva, úvazek a sazba pod jménem (na PC mají vlastní sloupce). */}
        <span className="text-15 text-tlumeny tabular-nums lg:hidden">
          {z.aktivni ? `${z.smlouva} · ${z.smlouva === 'HPP' ? `${uvazekText} · ` : ''}${sazbaText}` : `${z.smlouva} · ${z.ukonceni ? `Ukončeno ${formatDatum(z.ukonceni)}` : 'Ukončeno'}`}
        </span>
        {stitky.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {stitky.map((s) => (
              <Stitek key={s} ton="neutralni">
                {s}
              </Stitek>
            ))}
          </span>
        )}
      </span>
      <span className="hidden text-15 lg:block">{z.smlouva}</span>
      {z.aktivni ? (
        <>
          <span className="hidden text-right text-15 tabular-nums lg:block">{z.smlouva === 'HPP' ? uvazekText : <span className="text-tlumeny">–</span>}</span>
          <span className={`hidden text-right text-15 tabular-nums lg:block ${sazba === null ? 'text-tlumeny' : 'font-medium'}`}>{sazbaText}</span>
        </>
      ) : (
        <span className="hidden text-right text-15 text-tlumeny lg:col-span-2 lg:block">
          {z.ukonceni ? `Ukončeno ${formatDatum(z.ukonceni)}` : 'Ukončeno'}
        </span>
      )}
      <ChevronRight aria-hidden className="size-5 shrink-0 text-tlumeny" />
    </Link>
  );
}

function Seznam({ nazev, lide, dnes }: { nazev: string; lide: ZamestnanecSeSazbami[]; dnes: string }) {
  const vyber = useVyber();
  return (
    <div className="overflow-hidden rounded-xl border border-linka bg-karta">
      <div aria-hidden className={`hidden border-b border-linka px-5 py-2.5 text-13 font-medium text-tlumeny ${MRIZKA}`}>
        <span>Jméno</span>
        <span>Smlouva</span>
        <span className="text-right">Úvazek</span>
        <span className="text-right">Sazba dnes</span>
        <span />
      </div>
      <ul aria-label={nazev} className="divide-y divide-linka">
        {lide.map((z) => (
          <li key={z.id}>
            <Radek z={z} dnes={dnes} odkaz={vyber.odkaz(`/lide/${z.id}`)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Lide() {
  const vyber = useVyber();
  const lide = useZamestnanci(vyber.firmaId);
  const [ukazatByvale, nastavUkazatByvale] = useState(false);
  const dnes = dnesniDatum();

  const vsichni = [...(lide.data ?? [])].sort(podleJmena);
  const soucasni = vsichni.filter((z) => z.aktivni);
  const byvali = vsichni.filter((z) => !z.aktivni);
  const pridat = (
    <Link to={vyber.odkaz('/lide/novy')} className={tridyTlacitka('hlavni')}>
      <UserPlus aria-hidden className="size-[18px]" />
      Přidat člověka
    </Link>
  );

  return (
    <>
      <title>Lidé – Mzdy</title>
      <Oznameni />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-28 font-semibold">Lidé</h1>
          {vyber.firma && (
            <p className="text-15 text-tlumeny">
              {vyber.firma.nazev}
              {lide.data && soucasni.length > 0 && ` · ${pocetLidi(soucasni.length)}`}
            </p>
          )}
        </div>
        {lide.data && vsichni.length > 0 && pridat}
      </header>

      {lide.isPending && <Nacitani />}
      {!lide.data && lide.error && <ChybaHlaska chyba={lide.error} onZnovu={() => void lide.refetch()} />}

      {lide.data && vsichni.length === 0 && (
        <PrazdnyStav ikona={Users} nadpis="Zatím tu nikdo není" akce={pridat}>
          Přidej prvního člověka: jméno, smlouvu, hodinovou sazbu a údaje pro daň. Docházku mu pak zapíšeš ve Výplatách.
        </PrazdnyStav>
      )}

      {lide.data && vsichni.length > 0 && (
        <div className="flex flex-col gap-4">
          {soucasni.length > 0 ? (
            <Seznam nazev="Současní" lide={soucasni} dnes={dnes} />
          ) : (
            <PrazdnyStav ikona={Users} nadpis="Teď tu nikdo nepracuje">
              Všichni lidé v téhle firmě mají ukončený pracovní poměr.
            </PrazdnyStav>
          )}

          {byvali.length > 0 && (
            <div className="max-w-md">
              <Prepinac
                zapnuto={ukazatByvale}
                onZmena={nastavUkazatByvale}
                popisek="Zobrazit i bývalé"
                napoveda={`${pocetLidi(byvali.length)} s ukončeným pracovním poměrem`}
              />
            </div>
          )}

          {ukazatByvale && byvali.length > 0 && (
            <section aria-labelledby="byvali-nadpis" className="flex flex-col gap-3">
              <h2 id="byvali-nadpis" className="text-17 font-semibold">
                Bývalí
              </h2>
              <Seznam nazev="Bývalí" lide={byvali} dnes={dnes} />
            </section>
          )}
        </div>
      )}
    </>
  );
}
