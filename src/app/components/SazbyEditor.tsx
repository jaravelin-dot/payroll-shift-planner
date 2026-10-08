import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { formatDatum, jeDatum, prvniDenDalsihoMesice } from '../datum';
import { Pole } from './Pole';
import { tridyTlacitka } from './Tlacitko';

/** Řádek historie sazeb ve formuláři: text tak, jak ho uživatel píše (částka v Kč s čárkou). */
export interface RadekSazby {
  klic: string;
  platiOd: string;
  kc: string;
}

let citac = 0;
/** Stabilní klíč nového řádku (React key a klíč chyb `${klic}.platiOd` / `${klic}.kc`). */
export const novyKlicSazby = () => `sazba-${++citac}`;

type Props = {
  sazby: RadekSazby[];
  onZmena: (sazby: RadekSazby[]) => void;
  /** Dnešní datum RRRR-MM-DD: podle něj se označí sazba, která platí dnes. */
  dnes: string;
  /** Chyby polí: klíč `${klic}.platiOd` nebo `${klic}.kc`. */
  chyby?: Record<string, string | undefined>;
  /** Chyba celé historie (např. dvě sazby od stejného dne). */
  chyba?: string;
  /** Klíč řádku, jehož „Platí od" je u chyby celé historie první chybné: dostane `aria-invalid` a odkaz na hlášku. */
  chybaRadek?: string;
};

/** Klíč řádku, který platí v daný den: nejpozdější platné „Platí od" ≤ dnes. */
function platnaDnes(sazby: RadekSazby[], dnes: string): string | null {
  let nejlepsi: RadekSazby | null = null;
  for (const s of sazby) {
    if (jeDatum(s.platiOd) && s.platiOd <= dnes && (nejlepsi === null || s.platiOd > nejlepsi.platiOd)) nejlepsi = s;
  }
  return nejlepsi?.klic ?? null;
}

/**
 * Historie hodinových sazeb: řádky „Platí od" + „Kč/h". Výpočet bere pro každý den sazbu s nejpozdějším
 * „Platí od" do toho dne. Aspoň jedna sazba musí zůstat, proto poslední řádek odebrat nejde.
 */
export function SazbyEditor({ sazby, onZmena, dnes, chyby = {}, chyba, chybaRadek }: Props) {
  const [pridany, nastavPridany] = useState<string | null>(null);
  const chybaId = useId();
  const posledniId = useId();
  const pridat = useRef<HTMLButtonElement>(null);
  const dnesniKlic = platnaDnes(sazby, dnes);
  const posledni = sazby.length === 1;

  const zmen = (klic: string, zmena: Partial<RadekSazby>) => onZmena(sazby.map((s) => (s.klic === klic ? { ...s, ...zmena } : s)));
  const odeber = (klic: string) => {
    if (posledni) return;
    onZmena(sazby.filter((s) => s.klic !== klic));
    // Tlačítko mizí s řádkem; fokus dostane „Přidat sazbu", aby nespadl na začátek stránky.
    pridat.current?.focus();
  };
  const pridej = () => {
    const klic = novyKlicSazby();
    nastavPridany(klic);
    onZmena([...sazby, { klic, platiOd: prvniDenDalsihoMesice(dnes), kc: '' }]);
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {sazby.map((s, i) => {
          const platiDnes = s.klic === dnesniKlic;
          const oznacena = !!chyba && s.klic === chybaRadek;
          return (
            <li
              key={s.klic}
              className={`flex items-start gap-3 border-l-[3px] pl-3 ${platiDnes ? 'border-akce' : 'border-linka'}`}
            >
              {/* Řádek je skupina s názvem „Sazba 2", ať čtečka u polí „Platí od" a „Hodinová sazba" řekne, o kterou jde. */}
              <fieldset className="min-w-0 flex-1">
                <legend className="sr-only">Sazba {i + 1}</legend>
                {/* Mobil: pole pod sebou (vedle sebe by se datum na 390 px nevešlo); od 640 px vedle sebe. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Pole
                    type="date"
                    popisek="Platí od"
                    value={s.platiOd}
                    onChange={(e) => zmen(s.klic, { platiOd: e.target.value })}
                    chyba={chyby[`${s.klic}.platiOd`]}
                    napoveda={platiDnes ? 'Platí dnes' : undefined}
                    className="min-w-0"
                    {...(oznacena ? { 'aria-invalid': true, 'aria-describedby': chybaId } : {})}
                  />
                  <Pole
                    popisek="Hodinová sazba"
                    pripona="Kč/h"
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus={s.klic === pridany}
                    value={s.kc}
                    onChange={(e) => zmen(s.klic, { kc: e.target.value })}
                    chyba={chyby[`${s.klic}.kc`]}
                    className="min-w-0"
                  />
                </div>
              </fieldset>
              {/* `aria-disabled` místo `disabled`: tlačítko zůstane v pořadí tabulátoru a čtečka řekne, proč nejde použít. */}
              <button
                type="button"
                onClick={() => odeber(s.klic)}
                aria-disabled={posledni || undefined}
                aria-describedby={posledni ? posledniId : undefined}
                aria-label={`Odebrat sazbu${jeDatum(s.platiOd) ? ` od ${formatDatum(s.platiOd)}` : ''}`}
                className="mt-7 grid size-11 shrink-0 place-items-center rounded-lg text-tlumeny transition-colors duration-150 hover:bg-chyba/8 hover:text-chyba aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                <Trash2 aria-hidden className="size-5" />
              </button>
              {posledni && (
                <span id={posledniId} className="sr-only">
                  Aspoň jedna sazba musí zůstat.
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {chyba && (
        <p id={chybaId} className="flex items-start gap-1.5 text-13 font-medium text-chyba">
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
          {chyba}
        </p>
      )}
      <div>
        <button ref={pridat} type="button" onClick={pridej} className={tridyTlacitka('tiche')}>
          <Plus aria-hidden className="size-[18px]" />
          Přidat sazbu
        </button>
      </div>
    </div>
  );
}
