import { ChevronRight } from 'lucide-react';
import { Link, type To } from 'react-router';
import { formatKc } from '../../core/penize';
import { formatHodin } from '../cisla';
import { celeJmeno, type RadekVyplaty } from '../radkyVyplat';
import { INFO_VAROVANI, seradVarovani } from '../varovani';
import { Castka } from './Castka';
import { Stitek } from './Stitek';

const MRIZKA = 'lg:grid lg:grid-cols-[minmax(0,1fr)_4rem_5.5rem_8rem_8.5rem_1.25rem] lg:items-center lg:gap-5';

/** Upozornění řádku: nejzávažnější jako barevný štítek a počet ostatních; samé informace jen tiše jako počet. */
function StitekVarovani({ r }: { r: RadekVyplaty }) {
  const varovani = seradVarovani(r.vysledek.varovani);
  if (varovani.length === 0) return null;
  const prvni = INFO_VAROVANI[varovani[0].kod];
  const dalsich = varovani.length - 1;
  if (prvni.ton === 'info') {
    return <span className="text-13 text-tlumeny">{varovani.length === 1 ? '1 poznámka' : `${varovani.length} ${varovani.length <= 4 ? 'poznámky' : 'poznámek'}`}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Stitek ton={prvni.ton === 'chyba' ? 'chyba' : 'varovani'}>{prvni.nazev}</Stitek>
      {dalsich > 0 && <span className="text-13 text-tlumeny">a {dalsich} další</span>}
    </span>
  );
}

function Radek({ r, odkaz }: { r: RadekVyplaty; odkaz: To }) {
  const v = r.vysledek;
  const zaporna = v.kVyplateHal < 0;
  return (
    <Link to={odkaz} className={`flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-papir/70 active:bg-papir sm:px-5 ${MRIZKA}`}>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-17 font-semibold lg:text-15">{celeJmeno(r)}</span>
        <span className="text-15 text-tlumeny tabular-nums lg:hidden">
          {r.smlouva} · {formatHodin(v.hodiny.praceMin)} · <span className="whitespace-nowrap">hrubá {formatKc(v.hrubaHal).replace(/ Kč$/, ' Kč')}</span>
        </span>
        <StitekVarovani r={r} />
      </span>
      {/* Hlavička tabulky je jen vizuální, buňky proto nesou popisek sloupce pro čtečky. */}
      <span className="hidden text-15 lg:block"><span className="sr-only">Smlouva </span>{r.smlouva}</span>
      <span className="hidden text-right text-15 tabular-nums lg:block"><span className="sr-only">Odpracováno </span>{formatHodin(v.hodiny.praceMin)}</span>
      <span className="hidden lg:block"><span className="sr-only">Hrubá mzda </span><Castka hal={v.hrubaHal} className="text-15" /></span>
      <span className="sr-only">K výplatě </span>
      <Castka hal={v.kVyplateHal} className={`text-17 font-semibold ${zaporna ? 'text-chyba' : 'text-penize'}`} />
      <ChevronRight aria-hidden className="size-5 shrink-0 text-tlumeny" />
    </Link>
  );
}

/** Přehled výplat lidí: na PC tabulka se součtovým řádkem, na mobilu karty. */
export function SeznamVyplat({ radky, odkaz }: { radky: RadekVyplaty[]; odkaz: (zamestnanecId: string) => To }) {
  const soucet = (f: (r: RadekVyplaty) => number) => radky.reduce((s, r) => s + f(r), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-linka bg-karta">
      <div aria-hidden className={`hidden border-b border-linka px-5 py-2.5 text-13 font-medium text-tlumeny ${MRIZKA}`}>
        <span>Jméno</span>
        <span>Smlouva</span>
        <span className="text-right">Odpracováno</span>
        <span className="text-right">Hrubá mzda</span>
        <span className="text-right">K výplatě</span>
        <span />
      </div>
      <ul aria-label="Výplaty lidí" className="divide-y divide-linka">
        {radky.map((r) => (
          <li key={r.zamestnanecId}>
            <Radek r={r} odkaz={odkaz(r.zamestnanecId)} />
          </li>
        ))}
      </ul>
      <div className={`hidden border-t-[3px] border-double border-linka px-5 py-3 text-15 font-semibold ${MRIZKA}`}>
        <span>Celkem</span>
        <span />
        <span className="text-right tabular-nums"><span className="sr-only">Odpracováno </span>{formatHodin(soucet((r) => r.vysledek.hodiny.praceMin))}</span>
        <span className="sr-only">Hrubá mzda </span>
        <Castka hal={soucet((r) => r.vysledek.hrubaHal)} />
        <span className="sr-only">K výplatě </span>
        <Castka hal={soucet((r) => r.vysledek.kVyplateHal)} className="text-17 text-penize" />
        <span />
      </div>
    </div>
  );
}
