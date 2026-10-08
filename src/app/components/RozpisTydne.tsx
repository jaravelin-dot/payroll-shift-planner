import { Plus } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { svatky } from '../../core/kalendar';
import { jeVPomeru, klicBunky, minutySablony } from '../../core/plan';
import type { Den, PlanSmeny, RolePlanu, SablonaSmeny, TypDne, Zamestnanec } from '../../shared/api';
import { formatHodin } from '../cisla';
import { seradDen, seradTyden, type Razeni } from '../../core/razeniRozpisu';
import { NAZVY_DNU } from './PanelPlanu';
import { barvaSablony, casSablony } from './SablonySmen';

const ZKRATKY_DNU = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

export { klicBunky } from '../../core/plan';

/** „5. 10." */
const kratkeDatum = (datum: string) => `${Number(datum.slice(8, 10))}. ${Number(datum.slice(5, 7))}.`;

const nazevSvatku = (datum: string) => svatky(Number(datum.slice(0, 4))).get(datum);

/** Krátký název role pod jménem v rozpisu (MIMO_PLAN nic). */
export const NAZEV_ROLE: Record<RolePlanu, string> = { KASA: 'kasa', KASA_UCI_SE: 'učí se kasu', PRODEJNA: 'prodejna', DOZOR: 'dozor', MIMO_PLAN: '' };
const podJmenem = (z: Zamestnanec) => [z.smlouva, NAZEV_ROLE[z.rolePlanu]].filter(Boolean).join(' · ');

const NAZEV_NEPRITOMNOSTI: Partial<Record<TypDne, string>> = {
  NEMOC: 'Nemoc', DOVOLENA: 'Dovolená', SVATEK_ZAVRENO: 'Zavřeno', NAHRADNI_VOLNO: 'Náhradní volno', NEPLACENE: 'Neplacené volno', ABSENCE: 'Absence',
};

type Vzhled = { nadpis: string; pod: string; trida: string; styl?: CSSProperties };

/** Jak buňka vypadá: šablona má svou barvu, ostatní typy barvy typů dne ze spec (8); text nese význam vždy. */
function vzhled(polozka: PlanSmeny, sablona: SablonaSmeny | undefined): Vzhled {
  switch (polozka.typ) {
    case 'SMENA': {
      if (!sablona) return { nadpis: 'Směna', pod: formatHodin(polozka.minuty), trida: 'border-den-prace bg-den-prace/10' };
      const barva = barvaSablony(sablona);
      const upraveno = polozka.minuty !== minutySablony(sablona);
      return {
        nadpis: sablona.nazev,
        pod: upraveno ? formatHodin(polozka.minuty) : casSablony(sablona),
        trida: '',
        styl: { borderLeftColor: barva, backgroundColor: `color-mix(in srgb, ${barva} 11%, white)` },
      };
    }
    case 'DOVOLENA': return { nadpis: 'Dovolená', pod: formatHodin(polozka.minuty), trida: 'border-den-dovolena bg-den-dovolena/10' };
    case 'ZAVRENO': return { nadpis: 'Zavřeno', pod: formatHodin(polozka.minuty), trida: 'border-den-svatek bg-den-svatek/10' };
    case 'NEMOC': return { nadpis: 'Nemoc', pod: formatHodin(polozka.minuty), trida: 'border-den-nemoc bg-den-nemoc/10' };
    case 'VOLNO': return { nadpis: 'Volno', pod: '', trida: 'border-linka text-tlumeny' };
  }
}

type Bunka = {
  clovek: Zamestnanec;
  datum: string;
  polozka: PlanSmeny | undefined;
  sablona: SablonaSmeny | undefined;
  svatek: string | undefined;
  zDochazky: Den | undefined;
};

function popisBunky({ clovek, datum, polozka, sablona, svatek, zDochazky }: Bunka): string {
  const kdo = `${clovek.jmeno} ${clovek.prijmeni}, ${NAZVY_DNU[(new Date(`${datum}T00:00:00Z`).getUTCDay() + 6) % 7]} ${kratkeDatum(datum)}`;
  const co = polozka
    ? [vzhled(polozka, sablona).nadpis, vzhled(polozka, sablona).pod].filter(Boolean).join(' ')
    : zDochazky ? `${NAZEV_NEPRITOMNOSTI[zDochazky.typ]} z docházky` : 'nic naplánováno';
  return `${kdo}: ${co}${svatek ? ', svátek' : ''}`;
}

/** Obsah buňky (štítek), stejný v tabulce na PC i v seznamu na mobilu. */
function ObsahBunky({ polozka, sablona, svatek, zDochazky }: Pick<Bunka, 'polozka' | 'sablona' | 'svatek' | 'zDochazky'>) {
  if (!polozka && zDochazky) {
    return (
      <span className="flex h-full min-h-12 flex-col justify-center rounded-md border-l-[3px] border-dashed border-den-nemoc/60 py-1.5 pr-1.5 pl-2 text-tlumeny">
        <span className="truncate text-13 leading-4 font-medium">{NAZEV_NEPRITOMNOSTI[zDochazky.typ]}</span>
        <span className="truncate text-13 leading-4">z docházky</span>
      </span>
    );
  }
  if (!polozka) {
    return (
      <span className="flex h-full min-h-12 items-center justify-center rounded-md border border-dashed border-transparent text-tlumeny/70 transition-colors duration-150 group-hover:border-tlumeny/50 group-hover:text-tlumeny">
        {svatek ? <span className="text-13 font-medium text-den-svatek">Svátek</span> : <Plus aria-hidden className="size-4" />}
      </span>
    );
  }
  const v = vzhled(polozka, sablona);
  return (
    <span className={`flex h-full min-h-12 flex-col justify-center rounded-md border-l-[3px] py-1.5 pr-1.5 pl-2 ${v.trida}`} style={v.styl}>
      <span className={`truncate text-13 leading-4 ${polozka.typ === 'VOLNO' ? 'font-medium' : 'font-semibold text-inkoust'}`}>{v.nadpis}</span>
      {v.pod && <span className="truncate text-13 leading-4 text-tlumeny tabular-nums">{v.pod}</span>}
    </span>
  );
}

const TLACITKO_BUNKY = 'group block h-full w-full rounded-md text-left transition-colors duration-150 focus-visible:outline-offset-1';

type Props = {
  dny: string[];
  lide: Zamestnanec[];
  plan: Map<string, PlanSmeny>;
  sablony: Map<string, SablonaSmeny>;
  /** Nepřítomnosti z docházky (klíč `klicBunky`), ukážou se v dnech bez plánu. */
  dochazka: Map<string, Den>;
  dnes: string;
  /** Jak řadit lidi: podle času (tabulka podle týdne, seznam podle zvoleného dne) nebo podle pořadí v `lide` (jméno). */
  razeni: Razeni;
  onOtevri: (clovek: Zamestnanec, datum: string) => void;
};

/** Týdenní rozpis: na PC tabulka lidé × dny Po–Ne, na mobilu výběr dne a seznam lidí. */
export function RozpisTydne({ dny, lide, plan, sablony, dochazka, dnes, razeni, onOtevri }: Props) {
  const [zvolenyDen, nastavZvolenyDen] = useState<string | null>(null);
  const den = zvolenyDen && dny.includes(zvolenyDen) ? zvolenyDen : dny.includes(dnes) ? dnes : dny[0];

  const bunka = (clovek: Zamestnanec, datum: string): Bunka => {
    const polozka = plan.get(klicBunky(clovek.id, datum));
    return { clovek, datum, polozka, sablona: polozka?.sablonaId ? sablony.get(polozka.sablonaId) : undefined,
      svatek: nazevSvatku(datum),
      zDochazky: dochazka.get(klicBunky(clovek.id, datum)),
    };
  };
  const lideTabulky = razeni === 'CAS' ? seradTyden(lide, dny, plan, sablony) : lide;
  const lideDne = razeni === 'CAS' ? seradDen(lide, den, plan, sablony) : lide;
  const tydneMinut = (z: Zamestnanec) => dny.reduce((soucet, d) => soucet + (plan.get(klicBunky(z.id, d))?.minuty ?? 0), 0);

  return (
    <>
      {/* PC: tabulka. Pod 1280 px by se sedm sloupců s levým panelem nevešlo bez posouvání, tam je seznam po dnech. */}
      <div className="hidden overflow-x-auto rounded-xl border border-linka bg-karta xl:block">
        <table aria-label="Rozpis týdne" className="w-full min-w-[880px] table-fixed border-collapse">
          <colgroup>
            <col className="w-40" />
            {dny.map((d) => <col key={d} />)}
            <col className="w-18" />
          </colgroup>
          <thead>
            <tr className="border-b border-linka">
              <th scope="col" className="px-4 py-2.5 text-left align-bottom text-13 font-medium text-tlumeny">
                Člověk
              </th>
              {dny.map((d, i) => {
                const svatek = nazevSvatku(d);
                const dnesek = d === dnes;
                return (
                  <th key={d} scope="col" title={svatek} className="px-1.5 py-2 text-left align-bottom font-normal">
                    <span className={`flex flex-col border-b-2 pb-1 ${dnesek ? 'border-akce text-akce' : 'border-transparent'}`}>
                      <span className={`text-13 ${dnesek ? 'font-semibold' : 'text-tlumeny'}`}>{ZKRATKY_DNU[i]}</span>
                      <span className="text-15 font-semibold tabular-nums">{kratkeDatum(d)}</span>
                      {svatek && <span className="text-13 font-medium text-den-svatek"> svátek</span>}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-2.5 text-right align-bottom text-13 font-medium text-tlumeny">
                Týden
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linka">
            {lideTabulky.map((z) => (
              <tr key={z.id}>
                <th scope="row" className="px-4 py-2 text-left align-middle font-normal">
                  <span className="block truncate text-15 font-semibold">
                    {z.jmeno} {z.prijmeni}
                  </span>
                  <span className="block text-13 text-tlumeny">{podJmenem(z)}</span>
                </th>
                {dny.map((d) => {
                  const b = bunka(z, d);
                  return (
                    <td key={d} className={`h-16 p-1 ${b.svatek ? 'bg-den-svatek/4' : ''}`}>
                      {jeVPomeru(z, d) ? (
                        <button type="button" aria-label={popisBunky(b)} onClick={() => onOtevri(z, d)} className={TLACITKO_BUNKY}>
                          <ObsahBunky {...b} />
                        </button>
                      ) : (
                        <span className="flex h-full items-center justify-center text-13 text-tlumeny/70" title="Mimo pracovní poměr">
                          <span aria-hidden>–</span>
                          <span className="sr-only">mimo pracovní poměr</span>
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 text-right text-15 font-medium tabular-nums">{formatHodin(tydneMinut(z))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: výběr dne a pod ním lidé toho dne. */}
      <div className="flex flex-col gap-3 xl:hidden">
        {/* Mezera 2 px: při 360 px šířky vychází tlačítko na ≈45 px (cíl aspoň 44 px). */}
        <div role="group" aria-label="Den v týdnu" className="grid grid-cols-7 gap-0.5">
          {dny.map((d, i) => {
            const vybrany = d === den;
            const svatek = nazevSvatku(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={vybrany}
                aria-label={`${NAZVY_DNU[i]} ${kratkeDatum(d)}${svatek ? ', svátek' : ''}${d === dnes ? ', dnes' : ''}`}
                onClick={() => nastavZvolenyDen(d)}
                className={[
                  'relative flex min-h-14 flex-col items-center justify-center rounded-lg border transition-colors duration-150',
                  vybrany ? 'border-akce bg-akce/8 text-akce' : 'border-tlumeny/80 bg-karta hover:border-tlumeny',
                ].join(' ')}
              >
                <span className={`text-13 ${vybrany || d === dnes ? 'font-semibold' : 'text-tlumeny'} ${d === dnes && !vybrany ? 'text-akce' : ''}`}>{ZKRATKY_DNU[i]}</span>
                <span className="text-17 font-semibold tabular-nums">{Number(d.slice(8, 10))}</span>
                {svatek && <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-den-svatek" />}
              </button>
            );
          })}
        </div>

        <section aria-label={`Rozpis na ${NAZVY_DNU[dny.indexOf(den)]} ${kratkeDatum(den)}`} className="overflow-hidden rounded-xl border border-linka bg-karta">
          <h2 className="border-b border-linka px-4 py-3 text-17 font-semibold first-letter:uppercase">
            {NAZVY_DNU[dny.indexOf(den)]} {kratkeDatum(den)}
            {nazevSvatku(den) && <span className="mt-0.5 block text-13 font-medium text-den-svatek">Svátek: {nazevSvatku(den)}</span>}
          </h2>
          <ul className="divide-y divide-linka">
            {lideDne.map((z) => {
              const b = bunka(z, den);
              const vPomeru = jeVPomeru(z, den);
              const jmeno = (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-17 font-semibold">
                    {z.jmeno} {z.prijmeni}
                  </span>
                  <span className="text-13 text-tlumeny">{vPomeru ? podJmenem(z) : 'Mimo pracovní poměr'}</span>
                </span>
              );
              return (
                <li key={z.id}>
                  {vPomeru ? (
                    <button
                      type="button"
                      aria-label={popisBunky(b)}
                      onClick={() => onOtevri(z, den)}
                      className="group flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-papir/70 active:bg-papir"
                    >
                      {jmeno}
                      <span className="w-36 shrink-0">
                        <ObsahBunky {...b} />
                      </span>
                    </button>
                  ) : (
                    <div className="flex min-h-16 items-center gap-3 px-4 py-2 text-tlumeny">{jmeno}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
