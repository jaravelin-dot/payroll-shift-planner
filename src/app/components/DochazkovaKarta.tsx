import { Calculator, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { denVTydnu, dnyMesice, posunDatum, svatky } from '../../core/kalendar';
import type { Den, TypDne, Zamestnanec } from '../../shared/api';
import { mimoPomer, nazevMesice, TYPY_DNU, ZKRATKY_DNU } from '../dochazka';
import { PolickoDne } from './PolickoDne';
import { Tlacitko } from './Tlacitko';

type Props = {
  rok: number;
  mesic: number;
  /** Dny osoby; dny jiných měsíců se ignorují. */
  dny: Den[];
  zamestnanec: Pick<Zamestnanec, 'nastup' | 'ukonceni'>;
  dnes: string;
  /** Uzavřený měsíc: dny jdou procházet, ale ne otevřít ani vybrat. */
  jenCteni: boolean;
  vybrane: string[];
  onVyber: (datumy: string[]) => void;
  /** Otevře panel pro jeden den nebo pro vybrané dny. */
  onOtevri: (datumy: string[]) => void;
  /** Tlačítka v hlavičce karty (např. „Zadat nemoc"). */
  akce?: ReactNode;
};

const DLOUHY_STISK_MS = 450;
const SIPKY: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const LEGENDA: TypDne[] = ['PRACE', 'DOVOLENA', 'NEMOC', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE'];

function vybranoText(pocet: number): string {
  if (pocet === 1) return 'Vybrán 1 den';
  return pocet <= 4 ? `Vybrány ${pocet} dny` : `Vybráno ${pocet} dní`;
}

/**
 * Docházková karta měsíce: mřížka Po–Ne, klepnutí (Enter) otevře den, šipky posouvají fokus. Víc dní se vybere podržením
 * prstu, Shift+klikem (rozsah) nebo Ctrl+klikem; ve výběru klepnutí den přidá nebo odebere.
 */
export function DochazkovaKarta({ rok, mesic, dny, zamestnanec, dnes, jenCteni, vybrane, onVyber, onOtevri, akce }: Props) {
  const datumy = dnyMesice(rok, mesic);
  const podleData = new Map(dny.map((d) => [d.datum, d]));
  const nazvySvatku = svatky(rok);
  const [fokus, nastavFokus] = useState<string | null>(null);
  const zastavka = fokus && datumy.includes(fokus) ? fokus : datumy.includes(dnes) ? dnes : datumy[0];
  const tlacitka = useRef(new Map<string, HTMLButtonElement>());
  const kotva = useRef<string | null>(null);
  /** Rozběhnuté podržení prstem; `provedeno` = den se už vybral a klik, který po puštění přijde, se spolkne. */
  const stisk = useRef<{ casovac: number; provedeno: boolean; drzi: boolean } | null>(null);
  const vybraneSada = new Set(vybrane);

  const lzeOtevrit = (datum: string) => !jenCteni && !mimoPomer(datum, zamestnanec);
  /** Zápis mimo pracovní poměr se nezapočítá; den jde otevřít jen kvůli smazání (vybrat ho nejde). */
  const lzeSmazatMimo = (datum: string) => !jenCteni && mimoPomer(datum, zamestnanec) && podleData.has(datum);

  const prepni = (datum: string) => {
    const nove = new Set(vybrane);
    if (nove.has(datum)) nove.delete(datum);
    else nove.add(datum);
    kotva.current = datum;
    onVyber([...nove].sort());
  };

  const rozsah = (datum: string) => {
    const od = kotva.current;
    if (od === null || vybrane.length === 0) return prepni(datum);
    const [zacatek, konec] = od < datum ? [od, datum] : [datum, od];
    const nove = new Set(vybrane);
    for (const d of datumy) if (d >= zacatek && d <= konec && lzeOtevrit(d)) nove.add(d);
    kotva.current = datum;
    onVyber([...nove].sort());
  };

  const naKlik = (e: MouseEvent, datum: string) => {
    nastavFokus(datum);
    if (stisk.current?.provedeno) {
      stisk.current = null; // klik po dlouhém stisku už den vybral
      return;
    }
    if (lzeSmazatMimo(datum) && vybrane.length === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      kotva.current = datum;
      return onOtevri([datum]);
    }
    if (!lzeOtevrit(datum)) return;
    if (e.shiftKey) return rozsah(datum);
    if (e.ctrlKey || e.metaKey || vybrane.length > 0) return prepni(datum);
    kotva.current = datum;
    onOtevri([datum]);
  };

  const naKlavesu = (e: KeyboardEvent, datum: string) => {
    const posun = SIPKY[e.key];
    if (posun === undefined) return;
    e.preventDefault();
    const cil = posunDatum(datum, posun);
    if (!datumy.includes(cil)) return;
    nastavFokus(cil);
    tlacitka.current.get(cil)?.focus();
  };

  const zrusStisk = () => {
    if (stisk.current) clearTimeout(stisk.current.casovac);
    stisk.current = null;
  };
  const naStisk = (e: PointerEvent, datum: string) => {
    // Nový stisk (i myší) začíná načisto: po podržení, po kterém klik nepřišel, by se jinak spolkl tenhle.
    zrusStisk();
    if (e.pointerType === 'mouse' || !lzeOtevrit(datum)) return;
    const novy = { casovac: 0, provedeno: false, drzi: true };
    novy.casovac = window.setTimeout(() => {
      novy.provedeno = true;
      prepni(datum);
      navigator.vibrate?.(10);
    }, DLOUHY_STISK_MS);
    stisk.current = novy;
  };
  const pustStisk = () => {
    if (stisk.current?.provedeno) stisk.current.drzi = false; // klik po puštění se spolkne
    else zrusStisk();
  };
  // Na dotykové obrazovce: po puštění přijde pointerleave ještě před klikem, tehdy příznak musí na klik počkat. Odjede-li prst z dne
  // při držení, klik na tenhle den už nepřijde.
  const opustStisk = () => {
    if (stisk.current && (stisk.current.drzi || !stisk.current.provedeno)) zrusStisk();
  };

  return (
    <section aria-labelledby="dochazka-nadpis" className="rounded-xl border border-linka bg-karta p-3 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:mb-4 sm:flex-nowrap">
        <div className="flex min-w-0 flex-col">
          <h2 id="dochazka-nadpis" className="text-17 font-semibold">Docházka</h2>
          <p className="text-13 text-tlumeny">
            {jenCteni ? 'Měsíc je uzavřený, docházka jde jen prohlížet.' : 'Klepni na den. Víc dní označíš podržením nebo Shift+klikem.'}
          </p>
        </div>
        {akce}
      </header>

      <div aria-hidden className="mb-1.5 grid grid-cols-7 gap-1 text-center text-13 font-medium text-tlumeny sm:gap-1.5">
        {ZKRATKY_DNU.map((zkratka) => <span key={zkratka}>{zkratka}</span>)}
      </div>
      <div role="group" aria-label={`Docházka, ${nazevMesice(rok, mesic).toLowerCase()}`} className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: denVTydnu(datumy[0]) - 1 }, (_, i) => <div key={`prazdne-${i}`} data-prazdne aria-hidden />)}
        {datumy.map((datum) => (
          <PolickoDne
            key={datum}
            ref={(prvek) => {
              if (prvek) tlacitka.current.set(datum, prvek);
              else tlacitka.current.delete(datum);
            }}
            datum={datum}
            zaznam={podleData.get(datum)}
            svatek={nazvySvatku.get(datum)}
            vikend={denVTydnu(datum) >= 6}
            dnes={datum === dnes}
            vybrano={vybraneSada.has(datum)}
            mimoPomer={mimoPomer(datum, zamestnanec)}
            aktivni={lzeOtevrit(datum) || lzeSmazatMimo(datum)}
            tabIndex={datum === zastavka ? 0 : -1}
            onClick={(e) => naKlik(e, datum)}
            onKeyDown={(e) => naKlavesu(e, datum)}
            onPointerDown={(e) => naStisk(e, datum)}
            onPointerUp={pustStisk}
            onPointerLeave={opustStisk}
            onPointerCancel={zrusStisk}
            onContextMenu={(e) => { if (stisk.current) e.preventDefault(); }}
          />
        ))}
      </div>

      {vybrane.length > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-inkoust py-1.5 pr-1.5 pl-4 text-karta lg:bottom-4">
          <span role="status" className="mr-auto text-15 font-semibold">{vybranoText(vybrane.length)}</span>
          <Tlacitko onClick={() => onOtevri(vybrane)} className="bg-karta! text-inkoust! hover:bg-karta/90!">Vyplnit vybrané</Tlacitko>
          <button type="button" onClick={() => onVyber([])} aria-label="Zrušit výběr" className="grid size-11 place-items-center rounded-lg text-karta/80 transition-colors hover:bg-karta/10 hover:text-karta">
            <X aria-hidden className="size-5" />
          </button>
        </div>
      )}

      <ul aria-label="Vysvětlivky" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-13 text-tlumeny">
        {LEGENDA.map((typ) => (
          <li key={typ} className="flex items-center gap-1.5">
            <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-sm border-l-[3px] text-13 font-bold ${TYPY_DNU[typ].vypln} ${TYPY_DNU[typ].okraj} ${TYPY_DNU[typ].text}`}>
              {TYPY_DNU[typ].pismeno}
            </span>
            {typ === 'NEPLACENE' ? 'Neplacené, absence' : TYPY_DNU[typ].nazev}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Calculator aria-hidden className="size-3.5 text-inkoust/70" strokeWidth={2} />
          Kasa
        </li>
      </ul>
    </section>
  );
}
