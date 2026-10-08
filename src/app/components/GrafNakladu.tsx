// Graf nákladů firmy za 12 měsíců roku (skill dataviz): skládané sloupce hrubé mzdy + odvody firmy + stravné + náhrada
// za nemoc, takže výška sloupce je přesně náklad firmy. Barvy jsou ověřená kategorická paleta (validate_palette.js proti
// bílé kartě: pořadí a CVD projdou, aqua a žlutá mají kontrast pod 3 : 1, proto je pod grafem vždy tabulka se všemi
// čísly). Mezi díly sloupce je 2px mezera v barvě karty, zaoblený je jen vrchol. Najetí myší i fokus ukáže rozpis měsíce.
import { useId, useState } from 'react';
import { formatKc } from '../../core/penize';
import { NAZVY_MESICU } from '../dochazka';
import { soucetNakladu, type MesicNakladu } from '../vystupy/naklady';
import { Castka } from './Castka';
import { Stitek } from './Stitek';

type KlicRady = 'hrubeHal' | 'odvodyHal' | 'stravneHal' | 'nemocHal';

/** Kategorické sloty 1–4 v pevném pořadí (zdola nahoru ve sloupci); barva patří řadě, ne pořadí. */
const RADY: { klic: KlicRady; nazev: string; barva: string }[] = [
  { klic: 'hrubeHal', nazev: 'Hrubé mzdy', barva: '#2a78d6' },
  { klic: 'odvodyHal', nazev: 'Odvody firmy', barva: '#eb6834' },
  { klic: 'stravneHal', nazev: 'Stravné', barva: '#1baf7a' },
  { klic: 'nemocHal', nazev: 'Náhrada za nemoc', barva: '#eda100' },
];

const ZKRATKY = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const STAVY = { UZAVRENO: 'uzavřeno', ROZPRACOVANO: 'rozpracováno', NEUZAVRENO: 'neuzavřeno' } as const;
const UZKA_MEZERA = ' ';
const kc = (hal: number) => formatKc(hal).replace(/ Kč$/, `${UZKA_MEZERA}Kč`);
const kompaktne = new Intl.NumberFormat('cs-CZ', { notation: 'compact', maximumFractionDigits: 1 });

/** Osa Y v celých Kč: hezký krok (1, 2, 2,5, 5 × 10ⁿ), asi čtyři dílky, strop je násobek kroku. */
function osaY(maxHal: number): { stropHal: number; dilky: number[] } {
  const maxKc = Math.max(1, maxHal / 100);
  const hruby = maxKc / 4;
  const rad = 10 ** Math.floor(Math.log10(hruby));
  const krok = [1, 2, 2.5, 5, 10].map((k) => k * rad).find((k) => k >= hruby)!;
  // Kousek místa nad nejvyšším sloupcem pro popisek hodnoty.
  const strop = Math.ceil((maxKc * 1.08) / krok) * krok;
  const dilky: number[] = [];
  for (let i = 0; i * krok <= strop + krok / 1000; i++) dilky.push(Math.round(i * krok * 100));
  return { stropHal: strop * 100, dilky };
}

function popisSloupce(m: MesicNakladu, rok: number): string {
  const nazev = `${NAZVY_MESICU[m.mesic - 1]} ${rok}`;
  if (m.stav === 'NEUZAVRENO') return `${nazev}: neuzavřeno`;
  const casti = RADY.map((r) => `${r.nazev.toLowerCase()} ${kc(m[r.klic])}`).join(', ');
  return `${nazev}, ${STAVY[m.stav]}: náklad ${kc(m.celkemHal)}; ${casti}`;
}

function Bublina({ m, rok, id, sloupec }: { m: MesicNakladu; rok: number; id: string; sloupec: number }) {
  // U krajních měsíců se bublina zarovná k okraji, ať nepřeteče z grafu.
  const zarovnani = sloupec < 2 ? 'left-0' : sloupec > 9 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div id={id} role="tooltip" className={`pointer-events-none absolute bottom-full z-10 mb-2 w-56 rounded-lg border border-linka bg-karta px-3 py-2.5 text-13 shadow-[0_4px_16px_rgb(22_32_43/0.12)] ${zarovnani}`}>
      <p className="mb-1.5 font-semibold">
        {NAZVY_MESICU[m.mesic - 1]} {rok} <span className="font-normal text-tlumeny">· {STAVY[m.stav]}</span>
      </p>
      <ul className="flex flex-col gap-1">
        {[...RADY].reverse().map((r) => (
          <li key={r.klic} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.barva }} />
            <span className="font-semibold whitespace-nowrap tabular-nums">{kc(m[r.klic])}</span>
            <span className="truncate text-tlumeny">{r.nazev}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between gap-3 border-t border-linka pt-1.5 font-semibold">
        <span>Náklad celkem</span>
        <span className="whitespace-nowrap tabular-nums">{kc(m.celkemHal)}</span>
      </p>
    </div>
  );
}

function Graf({ rok, mesice }: { rok: number; mesice: MesicNakladu[] }) {
  const id = useId();
  const [aktivni, nastavAktivni] = useState<number | null>(null);
  const { stropHal, dilky } = osaY(Math.max(...mesice.map((m) => m.celkemHal)));
  const vyska = (hal: number) => `${(hal / stropHal) * 100}%`;
  const rozpracovany = mesice.some((m) => m.stav === 'ROZPRACOVANO');

  return (
    <figure aria-labelledby={`${id}-popis`} className="@container flex flex-col gap-4">
      <figcaption id={`${id}-popis`} className="sr-only">
        Náklady firmy {rok} po měsících v Kč, podrobně v tabulce pod grafem
      </figcaption>
      <ul aria-label="Legenda" className="flex flex-wrap gap-x-5 gap-y-1.5 text-13 text-tlumeny">
        {RADY.map((r) => (
          <li key={r.klic} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: r.barva }} />
            {r.nazev}
          </li>
        ))}
        {rozpracovany && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-[#2a78d6]/45" />
            Rozpracovaný měsíc (světlejší)
          </li>
        )}
      </ul>

      <div className="flex flex-col">
        <div className="relative h-52 @2xl:h-60">
          {/* Mřížka a popisky osy Y v celých Kč. */}
          {dilky.map((d) => (
            <div key={d} aria-hidden className="absolute right-0 left-0 h-px" style={{ bottom: vyska(d) }}>
              <span className="absolute top-0 left-0 w-12 -translate-y-1/2 pr-2 text-right text-13 text-tlumeny tabular-nums">{kompaktne.format(d / 100)}</span>
              <span className={`absolute inset-y-0 right-0 left-12 ${d === 0 ? 'bg-tlumeny/50' : 'bg-linka'}`} />
            </div>
          ))}
          <div className="absolute inset-y-0 right-0 left-12 flex">
            {mesice.map((m, i) => {
              const ukazuje = aktivni === i;
              if (m.stav === 'NEUZAVRENO') {
                return (
                  <div key={m.mesic} role="img" aria-label={popisSloupce(m, rok)} className="flex flex-1 items-end justify-center pb-1.5">
                    <span aria-hidden className="text-13 text-tlumeny [writing-mode:vertical-rl] rotate-180">neuzavřeno</span>
                  </div>
                );
              }
              const rady = RADY.filter((r) => m[r.klic] > 0);
              return (
                <div
                  key={m.mesic}
                  role="img"
                  tabIndex={0}
                  aria-label={popisSloupce(m, rok)}
                  aria-describedby={ukazuje ? `${id}-bublina` : undefined}
                  onPointerEnter={() => nastavAktivni(i)}
                  onPointerLeave={() => nastavAktivni((a) => (a === i ? null : a))}
                  onFocus={() => nastavAktivni(i)}
                  onBlur={() => nastavAktivni((a) => (a === i ? null : a))}
                  className="group relative flex flex-1 cursor-default items-end justify-center rounded-md outline-none focus-visible:bg-akce/6 focus-visible:ring-2 focus-visible:ring-akce"
                >
                  {/* Bublina je u vrcholu sloupce, ne nad celým grafem. */}
                  <div className="relative flex w-full justify-center" style={{ height: vyska(m.celkemHal) }}>
                    <div aria-hidden className="flex h-full w-[min(24px,60%)] flex-col-reverse gap-[2px]">
                      {rady.map((r, j) => (
                        <span
                          key={r.klic}
                          className={`block min-h-px transition-[filter] duration-150 ${j === rady.length - 1 ? 'rounded-t-[4px]' : ''} ${m.stav === 'ROZPRACOVANO' ? 'opacity-45' : ''} ${ukazuje ? 'brightness-110' : ''}`}
                          style={{ backgroundColor: r.barva, flexGrow: m[r.klic], flexBasis: 0 }}
                        />
                      ))}
                    </div>
                    <span aria-hidden className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 text-13 whitespace-nowrap text-tlumeny tabular-nums @2xl:block">
                      {kompaktne.format(m.celkemHal / 100)}
                    </span>
                    {ukazuje && <Bublina m={m} rok={rok} id={`${id}-bublina`} sloupec={i} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div aria-hidden className="flex pt-2 pl-12">
          {mesice.map((m) => (
            <span key={m.mesic} className="flex-1 text-center text-13 text-tlumeny tabular-nums">
              {/* Na úzkém grafu se zkratky nevejdou, stačí číslo měsíce. */}
              <span className="@xl:hidden">{m.mesic}</span>
              <span className="hidden @xl:inline">{ZKRATKY[m.mesic - 1]}</span>
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

const STITKY = {
  UZAVRENO: <Stitek ton="ok">Uzavřeno</Stitek>,
  ROZPRACOVANO: <Stitek ton="neutralni">Rozpracováno</Stitek>,
  NEUZAVRENO: <span className="text-13 text-tlumeny">Neuzavřeno</span>,
};

function Tabulka({ rok, mesice }: { rok: number; mesice: MesicNakladu[] }) {
  const soucet = soucetNakladu(mesice);
  const bunka = 'px-3 py-2 text-right whitespace-nowrap';
  const castka = (m: MesicNakladu, hal: number) => (m.stav === 'NEUZAVRENO' ? <span className="text-tlumeny">–</span> : <Castka hal={hal} />);
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[44rem] border-collapse text-15 tabular-nums">
        <caption className="sr-only">Náklady firmy po měsících {rok}</caption>
        <thead>
          <tr className="border-b border-linka text-13 text-tlumeny">
            <th scope="col" className="sticky left-0 bg-karta py-2 pr-3 pl-5 text-left font-medium sm:pl-6">Měsíc</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Stav</th>
            {/* Celek hned za stavem: na mobilu je vidět bez posouvání tabulky do strany. */}
            <th scope="col" className="px-3 py-2 text-right font-medium">Náklad celkem</th>
            {RADY.map((r, i) => <th key={r.klic} scope="col" className={`py-2 pl-3 text-right font-medium ${i === RADY.length - 1 ? 'pr-5 sm:pr-6' : 'pr-3'}`}>{r.nazev}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-linka">
          {mesice.map((m) => (
            <tr key={m.mesic}>
              <th scope="row" className="sticky left-0 bg-karta py-2 pr-3 pl-5 text-left font-medium sm:pl-6">{NAZVY_MESICU[m.mesic - 1]}</th>
              <td className="px-3 py-2">{STITKY[m.stav]}</td>
              <td className={`${bunka} font-semibold`}>{castka(m, m.celkemHal)}</td>
              {RADY.map((r, i) => <td key={r.klic} className={`${bunka} ${i === RADY.length - 1 ? 'pr-5 sm:pr-6' : ''}`}>{castka(m, m[r.klic])}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-[3px] border-double border-linka font-semibold">
            <th scope="row" className="sticky left-0 bg-karta py-2.5 pr-3 pl-5 text-left sm:pl-6">Celkem</th>
            <td className="px-3 py-2.5 text-13 font-normal text-tlumeny">{soucet.vcetneRozpracovaneho ? 'vč. rozpracovaného' : 'uzavřené měsíce'}</td>
            <td className={bunka}><Castka hal={soucet.celkemHal} /></td>
            {RADY.map((r, i) => <td key={r.klic} className={`${bunka} ${i === RADY.length - 1 ? 'pr-5 sm:pr-6' : ''}`}><Castka hal={soucet[r.klic]} /></td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Náklady firmy za rok: graf 12 měsíců a pod ním tabulka se stejnými čísly (přístupná náhrada grafu). */
export function GrafNakladu({ rok, mesice }: { rok: number; mesice: MesicNakladu[] }) {
  if (mesice.every((m) => m.stav === 'NEUZAVRENO')) {
    return <p className="text-15 text-tlumeny">Za rok {rok} zatím není žádný uzavřený měsíc.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      <Graf rok={rok} mesice={mesice} />
      <Tabulka rok={rok} mesice={mesice} />
    </div>
  );
}
