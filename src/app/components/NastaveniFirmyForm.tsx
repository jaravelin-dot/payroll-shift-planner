import { Plus, TriangleAlert, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NastaveniFirmy, NastaveniVypoctu } from '../../shared/api';
import { CHYBA_CASTKY, cisloNaText, halNaText, textNaCislo, textNaHal } from '../cisla';
import { Pole } from './Pole';
import { Prepinac } from './Prepinac';
import { Sekce } from './Sekce';
import { tridyTlacitka } from './Tlacitko';
import { Volba } from './Volba';

/** Úroveň odměny v konceptu: text v Kč a stabilní klíč (React key a klíč chyby). */
export interface Uroven {
  klic: string;
  kc: string;
}

/** Nastavení výpočtu tak, jak ho uživatel píše: částky v Kč jako text. */
export interface KonceptNastaveni {
  tydenniPracovniDoba: string;
  stravnePausal: string;
  stravneProDpp: boolean;
  priplatekSobota: string;
  priplatekNedele: string;
  priplatekKasa: string;
  praceVeSvatek: NastaveniFirmy['praceVeSvatek'];
  odmenaZaDenPropadaPriNemoci: boolean;
  urovneOdmenyZaDen: Uroven[];
  urovneAktivity: Uroven[];
  odmenyIProDpp: boolean;
}

type Chyby = Record<string, string | undefined>;

let citac = 0;
const novyKlic = () => `uroven-${++citac}`;

/** Nejvíc úrovní, které API přijme. */
const NEJVIC_UROVNI = 20;
/** Zákonné maximum stanovené týdenní pracovní doby (§ 79 zákoníku práce). */
const NEJVIC_HODIN_TYDNE = 40;

export function konceptNastaveni(n: NastaveniVypoctu): KonceptNastaveni {
  return {
    tydenniPracovniDoba: cisloNaText(n.tydenniPracovniDoba),
    stravnePausal: halNaText(n.stravnePausalHal),
    stravneProDpp: n.stravneProDpp,
    priplatekSobota: halNaText(n.priplatekSobotaHal),
    priplatekNedele: halNaText(n.priplatekNedeleHal),
    priplatekKasa: halNaText(n.priplatekKasaHal),
    praceVeSvatek: n.praceVeSvatek,
    odmenaZaDenPropadaPriNemoci: n.odmenaZaDenPropadaPriNemoci,
    urovneOdmenyZaDen: n.urovneOdmenyZaDenHal.map((hal) => ({ klic: novyKlic(), kc: halNaText(hal) })),
    urovneAktivity: n.urovneAktivityHal.map((hal) => ({ klic: novyKlic(), kc: halNaText(hal) })),
    odmenyIProDpp: n.odmenyIProDpp,
  };
}

/** Zkontroluje koncept; bez chyb vrátí celé nastavení v haléřích. Klíče chyb odpovídají polím konceptu. */
export function overNastaveni(k: KonceptNastaveni): { nastaveni: NastaveniVypoctu | null; chyby: Chyby } {
  const chyby: Chyby = {};
  const castka = (pole: string, text: string): number => {
    const hal = textNaHal(text);
    if (hal === null) chyby[pole] = text.trim() ? CHYBA_CASTKY : 'Vyplň částku (může být i 0).';
    return hal ?? 0;
  };

  const doba = textNaCislo(k.tydenniPracovniDoba);
  if (doba === null || doba <= 0 || doba > NEJVIC_HODIN_TYDNE) chyby.tydenniPracovniDoba = 'Zadej hodiny týdně, víc než 0 a nejvýš 40, např. 40 nebo 37,5.';
  const nastaveni: NastaveniVypoctu = {
    tydenniPracovniDoba: doba ?? 0,
    stravnePausalHal: castka('stravnePausal', k.stravnePausal),
    stravneProDpp: k.stravneProDpp,
    priplatekSobotaHal: castka('priplatekSobota', k.priplatekSobota),
    priplatekNedeleHal: castka('priplatekNedele', k.priplatekNedele),
    priplatekKasaHal: castka('priplatekKasa', k.priplatekKasa),
    praceVeSvatek: k.praceVeSvatek,
    odmenaZaDenPropadaPriNemoci: k.odmenaZaDenPropadaPriNemoci,
    urovneOdmenyZaDenHal: k.urovneOdmenyZaDen.map((u) => castka(u.klic, u.kc)),
    urovneAktivityHal: k.urovneAktivity.map((u) => castka(u.klic, u.kc)),
    odmenyIProDpp: k.odmenyIProDpp,
    zaokrouhleniZpZamestnanec: 'TRETINA_NAHORU',
  };
  return Object.values(chyby).some(Boolean) ? { nastaveni: null, chyby } : { nastaveni, chyby: {} };
}

function Urovne({ nazev, napoveda, urovne, onZmena, chyby }: {
  nazev: string;
  napoveda: string;
  urovne: Uroven[];
  onZmena: (urovne: Uroven[]) => void;
  chyby: Chyby;
}) {
  const [pridana, nastavPridanou] = useState<string | null>(null);
  const pridat = useRef<HTMLButtonElement>(null);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-15 font-medium">{nazev}</legend>
      <p className="-mt-2 text-13 text-tlumeny">{napoveda}</p>
      {urovne.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-3">
          {urovne.map((u, i) => (
            <li key={u.klic} className="flex items-start gap-1">
              <Pole
                popisek={`${i + 1}. úroveň`}
                pripona="Kč"
                inputMode="decimal"
                autoComplete="off"
                autoFocus={u.klic === pridana}
                value={u.kc}
                onChange={(e) => onZmena(urovne.map((x) => (x.klic === u.klic ? { ...x, kc: e.target.value } : x)))}
                chyba={chyby[u.klic]}
                className="w-36"
              />
              <button
                type="button"
                onClick={() => {
                  onZmena(urovne.filter((x) => x.klic !== u.klic));
                  pridat.current?.focus();
                }}
                aria-label={`Odebrat ${i + 1}. úroveň`}
                className="mt-7 grid size-11 shrink-0 place-items-center rounded-lg text-tlumeny transition-colors duration-150 hover:bg-chyba/8 hover:text-chyba"
              >
                <X aria-hidden className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          ref={pridat}
          type="button"
          disabled={urovne.length >= NEJVIC_UROVNI}
          onClick={() => {
            const klic = novyKlic();
            nastavPridanou(klic);
            onZmena([...urovne, { klic, kc: '' }]);
          }}
          className={tridyTlacitka('tiche')}
        >
          <Plus aria-hidden className="size-[18px]" />
          Přidat úroveň
        </button>
      </div>
    </fieldset>
  );
}

type Props = {
  koncept: KonceptNastaveni;
  onZmena: (zmena: Partial<KonceptNastaveni>) => void;
  chyby: Chyby;
};

/** Pravidla výpočtu firmy (spec 4, nastavení firmy): všechna pole `NastaveniFirmy`, částky v Kč. */
export function NastaveniFirmyForm({ koncept: k, onZmena, chyby }: Props) {
  return (
    <>
      <Sekce nadpis="Pracovní doba">
        <Pole
          popisek="Stanovená týdenní pracovní doba"
          pripona="h týdně"
          inputMode="decimal"
          autoComplete="off"
          value={k.tydenniPracovniDoba}
          onChange={(e) => onZmena({ tydenniPracovniDoba: e.target.value })}
          chyba={chyby.tydenniPracovniDoba}
          napoveda="Obvykle 40 h (může být 38,75 nebo 37,5). Kratší doba zvyšuje hodinovou minimální mzdu."
          className="sm:max-w-72"
        />
      </Sekce>

      <Sekce nadpis="Stravné">
        <Pole
          popisek="Stravenkový paušál za směnu"
          pripona="Kč"
          inputMode="decimal"
          autoComplete="off"
          value={k.stravnePausal}
          onChange={(e) => onZmena({ stravnePausal: e.target.value })}
          chyba={chyby.stravnePausal}
          napoveda="Za směnu aspoň 3 hodiny. Co je nad osvobozený limit, se zdaní."
          className="sm:max-w-56"
        />
        <Prepinac zapnuto={k.stravneProDpp} onZmena={(v) => onZmena({ stravneProDpp: v })} popisek="Stravné i pro dohody (DPP)" />
      </Sekce>

      <Sekce nadpis="Příplatky">
        <div className="grid gap-5 sm:grid-cols-2">
          <Pole
            popisek="Příplatek za sobotu"
            pripona="Kč"
            inputMode="decimal"
            autoComplete="off"
            value={k.priplatekSobota}
            onChange={(e) => onZmena({ priplatekSobota: e.target.value })}
            chyba={chyby.priplatekSobota}
            napoveda="Za odpracovaný den."
          />
          <Pole
            popisek="Příplatek za neděli"
            pripona="Kč"
            inputMode="decimal"
            autoComplete="off"
            value={k.priplatekNedele}
            onChange={(e) => onZmena({ priplatekNedele: e.target.value })}
            chyba={chyby.priplatekNedele}
            napoveda="Za odpracovaný den."
          />
        </div>
        <p className="-mt-2 text-13 text-tlumeny">Když vyjde zákonných 10 % průměrného výdělku víc, appka použije je a upozorní na to.</p>
        <Pole
          popisek="Příplatek za kasu"
          pripona="Kč"
          inputMode="decimal"
          autoComplete="off"
          value={k.priplatekKasa}
          onChange={(e) => onZmena({ priplatekKasa: e.target.value })}
          chyba={chyby.priplatekKasa}
          napoveda="Za každý den, kdy byl člověk na kase."
          className="sm:max-w-[calc(50%-0.625rem)]"
        />
        <Volba
          popisek="Práce ve svátek"
          moznosti={[
            { hodnota: 'PRIPLATEK', nazev: 'Příplatek 100 % průměrného výdělku' },
            { hodnota: 'NAHRADNI_VOLNO', nazev: 'Náhradní volno' },
          ]}
          hodnota={k.praceVeSvatek}
          onZmena={(praceVeSvatek) => onZmena({ praceVeSvatek })}
          napoveda="Při náhradním volnu se za svátek nic nedoplácí a hodiny se převedou do volna."
        />
      </Sekce>

      <Sekce nadpis="Odměny">
        <Urovne
          nazev="Odměna za den"
          napoveda="Částky za odpracovaný den, mezi kterými u člověka v měsíci vybíráš."
          urovne={k.urovneOdmenyZaDen}
          onZmena={(urovneOdmenyZaDen) => onZmena({ urovneOdmenyZaDen })}
          chyby={chyby}
        />
        <Urovne
          nazev="Aktivita"
          napoveda="Částky za odpracovaný den navíc za aktivitu."
          urovne={k.urovneAktivity}
          onZmena={(urovneAktivity) => onZmena({ urovneAktivity })}
          chyby={chyby}
        />
        <div className="flex flex-col gap-2 border-t border-linka pt-4">
          <Prepinac
            zapnuto={k.odmenaZaDenPropadaPriNemoci}
            onZmena={(v) => onZmena({ odmenaZaDenPropadaPriNemoci: v })}
            popisek="Odměna za den propadá při nemoci"
            napoveda="Když je člověk v měsíci nemocný, odměnu za den nedostane vůbec."
          />
          <p className="flex items-start gap-2 rounded-lg border-l-[3px] border-varovani bg-varovani/8 py-3 pr-3 pl-4 text-15">
            <TriangleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-varovani" />
            <span>Inspekce práce tuhle podmínku pokutuje — doporučujeme ji vypnout. Podrobnosti jsou v docs/research.</span>
          </p>
        </div>
        <div className="border-t border-linka pt-4">
          <Prepinac
            zapnuto={k.odmenyIProDpp}
            onZmena={(v) => onZmena({ odmenyIProDpp: v })}
            popisek="Odměny i pro dohody (DPP)"
            napoveda="Paušály za sobotu a neděli, kasa, odměna za den a aktivita. Zákonných 10 % za víkend dostane dohoda vždy."
          />
        </div>
      </Sekce>

      <Sekce nadpis="Zdravotní pojištění">
        <p className="text-15">
          Zaměstnanec platí třetinu celkového pojistného, zaokrouhlenou nahoru.{' '}
          <span className="text-tlumeny">Jiný způsob zatím appka nemá.</span>
        </p>
      </Sekce>
    </>
  );
}
