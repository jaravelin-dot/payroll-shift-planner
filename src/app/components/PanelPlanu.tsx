import { CircleAlert, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { posunDatum, svatky } from '../../core/kalendar';
import { minutySablony } from '../../core/plan';
import type { PlanSmeny, SablonaSmeny, Zamestnanec } from '../../shared/api';
import { useUlozPlan } from '../api/dotazy';
import { formatHodin, minutyNaText, textNaMinuty } from '../cisla';
import { formatDatum, jeDatum } from '../datum';
import { dnyNemoci } from '../dochazka';
import { ChybaHlaska } from './ChybaHlaska';
import { Pole } from './Pole';
import { barvaSablony, casSablony } from './SablonySmen';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko } from './Tlacitko';

export const NAZVY_DNU = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

/** Co je v plánu na den: šablona (`s:<id>`), směna bez šablony, volno, dovolená, nebo zavřeno ve svátek. */
type Volba = `s:${string}` | 'JINA' | 'VOLNO' | 'DOVOLENA' | 'ZAVRENO' | 'NEMOC';

function vychoziVolba(polozka: PlanSmeny | undefined, sablony: SablonaSmeny[], svatek: boolean, smlouva: Zamestnanec['smlouva']): Volba | null {
  if (polozka) {
    if (polozka.typ !== 'SMENA') return polozka.typ;
    return polozka.sablonaId && sablony.some((s) => s.id === polozka.sablonaId) ? `s:${polozka.sablonaId}` : 'JINA';
  }
  // Ve svátek se u pracovního poměru nic nepředvybírá (zavřeno, směna i volno jsou stejně možné); dohoda na náhradu nárok nemá, tak u ní volno.
  if (svatek) return smlouva === 'HPP' ? null : 'VOLNO';
  return sablony[0] ? `s:${sablony[0].id}` : 'JINA';
}

const OSTATNI: { volba: Exclude<Volba, `s:${string}`>; nazev: string; pismeno: string; barva: string; jenSvatek?: boolean }[] = [
  { volba: 'JINA', nazev: 'Jiná směna', pismeno: 'P', barva: 'text-den-prace bg-den-prace/10' },
  { volba: 'VOLNO', nazev: 'Volno', pismeno: '–', barva: 'text-tlumeny bg-inkoust/6' },
  { volba: 'DOVOLENA', nazev: 'Dovolená', pismeno: 'D', barva: 'text-den-dovolena bg-den-dovolena/10' },
  { volba: 'NEMOC', nazev: 'Nemoc', pismeno: 'N', barva: 'text-den-nemoc bg-den-nemoc/10' },
  { volba: 'ZAVRENO', nazev: 'Zavřeno (měl by směnu)', pismeno: 'S', barva: 'text-den-svatek bg-den-svatek/10', jenSvatek: true },
];

const NAPOVEDA: Record<Exclude<Volba, `s:${string}` | 'VOLNO'>, string> = {
  JINA: 'Směna mimo šablony, zadej její délku.',
  DOVOLENA: 'Kolik hodin dovolené se započítá, obvykle délka směny, kterou by měl.',
  ZAVRENO: 'Délka směny, kterou by ten den měl. Zaplatí se jako náhrada za svátek.',
  NEMOC: 'Kolik hodin by ten den pracoval. Po převodu do docházky z nich výplata spočítá náhradu mzdy.',
};

/** Nemoc od–do jde v plánu zadat najednou nejvýš na tolik kalendářních dní. */
const NEJVIC_DNU_NEMOCI = 62;

const MOZNOST = [
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-150 select-none',
  'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-akce',
].join(' ');
const tridyMoznosti = (vybrano: boolean) => `${MOZNOST} ${vybrano ? 'border-akce bg-akce/8' : 'border-tlumeny/80 bg-karta hover:border-tlumeny hover:bg-papir'}`;

type Props = {
  firmaId: string;
  clovek: Zamestnanec;
  datum: string;
  polozka: PlanSmeny | undefined;
  /** Šablony v pořadí, v jakém se mají nabídnout (první je výchozí pro prázdný den). */
  sablony: SablonaSmeny[];
  /** Délka směny, kterou člověk obvykle má (výchozí hodiny dovolené a zavřeno). */
  obvykleMinuty: number;
  onZavrit: () => void;
};

/** Spodní (na PC boční) panel jedné buňky rozpisu: výběr šablony nebo typu a hodiny. */
export function PanelPlanu({ firmaId, clovek, datum, polozka, sablony, obvykleMinuty, onZavrit }: Props) {
  const nazevSvatku = svatky(Number(datum.slice(0, 4))).get(datum);
  const svatek = nazevSvatku !== undefined;
  const [volba, nastavVolbu] = useState<Volba | null>(() => vychoziVolba(polozka, sablony, svatek, clovek.smlouva));
  const [hodiny, nastavHodiny] = useState(() => {
    const vybrana = volba?.startsWith('s:') ? sablony.find((s) => `s:${s.id}` === volba) : undefined;
    return minutyNaText(polozka && polozka.typ !== 'VOLNO' ? polozka.minuty : vybrana ? minutySablony(vybrana) : obvykleMinuty);
  });
  const [chybaHodin, nastavChybuHodin] = useState<string | undefined>();
  const [chybaVolby, nastavChybuVolby] = useState(false);
  const [nemocDo, nastavNemocDo] = useState(datum);
  const [chybaNemocDo, nastavChybuNemocDo] = useState<string | undefined>();
  const uloz = useUlozPlan();
  const formId = useId();
  const nazevSkupiny = useId();
  const chybaVolbyId = useId();
  const denTydne = NAZVY_DNU[(new Date(`${datum}T00:00:00Z`).getUTCDay() + 6) % 7];
  const sablona = volba?.startsWith('s:') ? sablony.find((s) => `s:${s.id}` === volba) : undefined;
  const nemocRozsah = volba === 'NEMOC' && jeDatum(nemocDo) && nemocDo > datum;

  const vyber = (nova: Volba) => {
    nastavVolbu(nova);
    nastavChybuVolby(false);
    nastavChybuHodin(undefined);
    const s = nova.startsWith('s:') ? sablony.find((x) => `s:${x.id}` === nova) : undefined;
    if (s) nastavHodiny(minutyNaText(minutySablony(s)));
  };

  const odesli = (e: FormEvent) => {
    e.preventDefault();
    if (volba === null) {
      nastavChybuVolby(true);
      return;
    }
    if (volba === 'NEMOC') {
      // Nemoc od–do na každý kalendářní den, víkendy a svátky s 0 h (stejně jako docházka), jinak by se po převodu přerušila
      // epizoda a 14 dní náhrady by se počítalo špatně. Položky plánu v rozsahu se přepíšou.
      const posledni = posunDatum(datum, NEJVIC_DNU_NEMOCI - 1);
      if (!jeDatum(nemocDo)) return nastavChybuNemocDo('Zadej datum, do kdy nemoc trvá.');
      if (nemocDo < datum) return nastavChybuNemocDo('Konec nemoci nesmí být před tímto dnem.');
      if (nemocDo > posledni) return nastavChybuNemocDo(`Najednou jde zadat nejvýš ${NEJVIC_DNU_NEMOCI} dní, tedy do ${formatDatum(posledni)}.`);
      const minuty = textNaMinuty(hodiny);
      // Jediný den dostane přesně zadané hodiny (i 0, třeba víkend uvnitř nemoci); v rozsahu jsou to hodiny pracovních dní.
      if (minuty === null || minuty < (nemocRozsah ? 1 : 0) || minuty > 1440) {
        nastavChybuHodin('Zadej hodiny, např. 8 nebo 7,5 (nejvýš 24).');
        return;
      }
      const polozky = dnyNemoci(datum, nemocDo, minuty, clovek).map((d) => ({ datum: d.datum, typ: 'NEMOC' as const, sablonaId: null, minuty: d.minuty }));
      uloz.mutate({ firmaId, zamestnanecId: clovek.id, polozky }, { onSuccess: onZavrit });
      return;
    }
    let nova: Omit<PlanSmeny, 'zamestnanecId'>;
    if (volba === 'VOLNO') {
      nova = { datum, typ: 'VOLNO', sablonaId: null, minuty: 0 };
    } else {
      const minuty = textNaMinuty(hodiny);
      if (minuty === null || minuty <= 0 || minuty > 1440) {
        nastavChybuHodin('Zadej hodiny, např. 8 nebo 7,5 (nejvýš 24).');
        return;
      }
      if (sablona) nova = { datum, typ: 'SMENA', sablonaId: sablona.id, minuty };
      else nova = { datum, typ: volba === 'JINA' ? 'SMENA' : (volba as 'DOVOLENA' | 'ZAVRENO'), sablonaId: null, minuty };
    }
    uloz.mutate({ firmaId, zamestnanecId: clovek.id, polozky: [nova] }, { onSuccess: onZavrit });
  };

  const vymaz = () => uloz.mutate({ firmaId, zamestnanecId: clovek.id, polozky: [], smazat: [datum] }, { onSuccess: onZavrit });

  const paticka = (
    <>
      <Tlacitko type="submit" form={formId} nacita={uloz.isPending}>
        Uložit
      </Tlacitko>
      {polozka && (
        <Tlacitko varianta="nebezpecneTiche" ikona={Trash2} onClick={vymaz} disabled={uloz.isPending} className="ml-auto">
          Vymazat
        </Tlacitko>
      )}
    </>
  );

  return (
    <SpodniPanel otevreno onZavrit={onZavrit} nadpis={`${clovek.jmeno} ${clovek.prijmeni}`} paticka={paticka}>
      <form id={formId} onSubmit={odesli} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-15 text-tlumeny first-letter:uppercase">
            {denTydne} {formatDatum(datum)}
            {clovek.smlouva === 'DPP' && ', dohoda (DPP)'}
          </p>
          {nazevSvatku && (
            <p className="rounded-lg border-l-[3px] border-den-svatek bg-den-svatek/8 py-2.5 pr-3 pl-3.5 text-15">
              <span className="font-semibold">Svátek: {nazevSvatku}.</span> Když bylo zavřeno a měl by směnu, vyber „Zavřeno“.
            </p>
          )}
        </div>

        <fieldset aria-describedby={chybaVolby ? chybaVolbyId : undefined} className="flex flex-col gap-2">
          <legend className="mb-2 text-15 font-medium">Plán na tento den</legend>
          {sablony.map((s) => {
            const hodnota = `s:${s.id}` as const;
            return (
              <label key={s.id} className={tridyMoznosti(volba === hodnota)}>
                <input type="radio" name={nazevSkupiny} checked={volba === hodnota} onChange={() => vyber(hodnota)} className="sr-only" />
                <span aria-hidden className="h-8 w-[5px] shrink-0 rounded-full" style={{ backgroundColor: barvaSablony(s) }} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-15 font-semibold">{s.nazev}</span>
                  <span className="text-13 text-tlumeny tabular-nums">{casSablony(s)}</span>
                </span>
                <span className="text-15 tabular-nums">{formatHodin(minutySablony(s))}</span>
              </label>
            );
          })}
          {OSTATNI.filter((o) => !o.jenSvatek || svatek).map((o) => (
            <label key={o.volba} className={tridyMoznosti(volba === o.volba)}>
              <input type="radio" name={nazevSkupiny} checked={volba === o.volba} onChange={() => vyber(o.volba)} className="sr-only" />
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-md text-15 font-bold ${o.barva}`}>
                {o.pismeno}
              </span>
              <span className="text-15 font-medium">{o.nazev}</span>
            </label>
          ))}
          {chybaVolby && (
            <p id={chybaVolbyId} className="flex items-start gap-1.5 text-13 font-medium text-chyba">
              <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
              Vyber, co ten den platí.
            </p>
          )}
        </fieldset>

        {volba === 'NEMOC' && (
          <Pole
            type="date"
            popisek="Nemoc do (včetně)"
            value={nemocDo}
            min={datum}
            max={posunDatum(datum, NEJVIC_DNU_NEMOCI - 1)}
            onChange={(e) => {
              nastavNemocDo(e.target.value);
              nastavChybuNemocDo(undefined);
            }}
            chyba={chybaNemocDo}
            napoveda="Zapíše se každý den od–do, i víkendy a svátky (s 0 h), ať se nepřeruší počítání 14 dní náhrady."
          />
        )}

        {volba !== null && volba !== 'VOLNO' && (
          <Pole
            popisek={nemocRozsah ? 'Hodiny v pracovní dny' : 'Hodiny'}
            pripona="h"
            inputMode="decimal"
            value={hodiny}
            onChange={(e) => {
              nastavHodiny(e.target.value);
              nastavChybuHodin(undefined);
            }}
            chyba={chybaHodin}
            napoveda={
              sablona
                ? `Podle šablony ${formatHodin(minutySablony(sablona))}. Přepiš, když bude ten den směna kratší nebo delší.`
                : volba === 'ZAVRENO' && clovek.smlouva === 'DPP'
                  ? 'Délka směny, kterou by ten den měl.'
                  : NAPOVEDA[volba as keyof typeof NAPOVEDA]
            }
          />
        )}

        {volba === 'ZAVRENO' && clovek.smlouva === 'DPP' && (
          <p className="flex items-start gap-2 rounded-lg border-l-[3px] border-varovani bg-varovani/8 py-2.5 pr-3 pl-3.5 text-15">
            <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-varovani" />
            U dohody se „Zavřeno“ do docházky nepřevede: dohoda na náhradu za svátek nárok nemá.
          </p>
        )}

        {uloz.error && <ChybaHlaska chyba={uloz.error} />}
      </form>
    </SpodniPanel>
  );
}
