import { Check, ChevronDown, LoaderCircle, PencilLine } from 'lucide-react';
import { useId, useState } from 'react';
import { formatKc } from '../../core/penize';
import type { MesicniVstup, NastaveniFirmy, Smlouva } from '../../shared/api';
import { CHYBA_CASTKY, formatSazby, halNaText, textNaHal } from '../cisla';
import type { StavUlozeni } from '../hooks/useMesicniVstup';
import { ChybaHlaska } from './ChybaHlaska';
import { Pole } from './Pole';
import { Tlacitko } from './Tlacitko';
import { Volba } from './Volba';

type Props = {
  smlouva: Smlouva;
  nastaveni: NastaveniFirmy;
  vstup: MesicniVstup;
  /** Průměrný hodinový výdělek použitý ve výpočtu a odkud je („odhad ze sazby"…). */
  pvHal: number;
  pvZdroj: string;
  jenCteni: boolean;
  onZmena: (zmena: Partial<MesicniVstup>) => void;
  stav: StavUlozeni;
  chyba: unknown;
  onZnovu: () => void;
};

const VLASTNI = 'vlastni';
const kc = (hal: number) => formatKc(hal).replace(/ Kč$/, ' Kč');

/**
 * Pole s částkou v Kč: text drží samo, platnou částku hned pošle dál, neplatnou jen označí. Nula se ukazuje jako
 * prázdné pole a prázdné pole posílá `null` (volající z něj udělá 0, nebo „nezadáno").
 */
function PoleCastky({ popisek, napoveda, hal, onHal, pripona = 'Kč' }: {
  popisek: string; napoveda?: string; hal: number | null; onHal: (hal: number | null) => void; pripona?: string;
}) {
  const [text, nastavText] = useState(hal === null || hal === 0 ? '' : halNaText(hal));
  const prazdne = text.trim() === '';
  const chyba = !prazdne && textNaHal(text) === null ? CHYBA_CASTKY : undefined;
  return (
    <Pole
      popisek={popisek}
      napoveda={napoveda}
      pripona={pripona}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      chyba={chyba}
      onChange={(e) => {
        const novy = e.target.value;
        nastavText(novy);
        if (novy.trim() === '') onHal(null);
        else {
          const h = textNaHal(novy);
          if (h !== null) onHal(h);
        }
      }}
    />
  );
}

function StavUlozeniText({ stav }: { stav: StavUlozeni }) {
  if (stav === 'uklada') return <span className="flex items-center gap-1.5"><LoaderCircle aria-hidden className="size-4 animate-spin" />Ukládám…</span>;
  if (stav === 'ulozeno') return <span className="flex items-center gap-1.5 text-penize"><Check aria-hidden className="size-4" />Uloženo</span>;
  return null;
}

/** Odměny a srážky měsíce: odměna za den a aktivita tlačítky z nastavení firmy, jiné odměny, srážky a ruční průměr. */
export function OdmenyMesice({ smlouva, nastaveni, vstup, pvHal, pvZdroj, jenCteni, onZmena, stav, chyba, onZnovu }: Props) {
  const urovne = nastaveni.urovneOdmenyZaDenHal;
  const [vlastni, nastavVlastni] = useState(vstup.odmenaZaDenHal !== 0 && !urovne.includes(vstup.odmenaZaDenHal));
  const [rucniPv, nastavRucniPv] = useState(vstup.prumernyVydelekHal !== null);
  // Méně časté položky jsou sbalené (souhrn je vidět), rozbalené rovnou, když už v nich něco je.
  const [dalsi, nastavDalsi] = useState(vstup.jineOdmenyHal !== 0 || vstup.srazkyHal !== 0 || vstup.prumernyVydelekHal !== null);
  const dalsiId = useId();
  const odmeny = smlouva === 'HPP' || nastaveni.odmenyIProDpp;

  const moznostiOdmeny = [
    { hodnota: '0', nazev: 'Bez odměny' },
    ...urovne.map((h) => ({ hodnota: String(h), nazev: formatKc(h) })),
    { hodnota: VLASTNI, nazev: 'Jiná částka' },
  ];
  const aktivity = [...new Set([...nastaveni.urovneAktivityHal, ...(vstup.aktivitaHal !== 0 ? [vstup.aktivitaHal] : [])])].sort((a, b) => a - b);
  const moznostiAktivity = [{ hodnota: '0', nazev: 'Bez aktivity' }, ...aktivity.map((h) => ({ hodnota: String(h), nazev: formatKc(h) }))];

  return (
    <section aria-labelledby="odmeny-nadpis" className="rounded-xl border border-linka bg-karta p-4 sm:p-5">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="odmeny-nadpis" className="text-17 font-semibold">Odměny a srážky</h2>
        <p aria-live="polite" className="text-13 text-tlumeny">{!jenCteni && <StavUlozeniText stav={stav} />}</p>
      </header>
      {stav === 'chyba' && <div className="mb-4"><ChybaHlaska chyba={chyba} onZnovu={onZnovu} /></div>}

      {/* Uzavřený měsíc: pole jen ke čtení (zakázané fieldsety); rozbalení dalších položek ale funguje dál. */}
      <div className="flex flex-col gap-5">
        <fieldset disabled={jenCteni} className="flex flex-col gap-5 disabled:opacity-80">
          {odmeny ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <Volba
                  popisek="Odměna za odpracovaný den"
                  moznosti={moznostiOdmeny}
                  hodnota={vlastni ? VLASTNI : String(vstup.odmenaZaDenHal)}
                  onZmena={(h) => {
                    nastavVlastni(h === VLASTNI);
                    if (h !== VLASTNI) onZmena({ odmenaZaDenHal: Number(h) });
                  }}
                />
                {vlastni && (
                  <PoleCastky popisek="Vlastní odměna za den" hal={vstup.odmenaZaDenHal} onHal={(h) => onZmena({ odmenaZaDenHal: h ?? 0 })} />
                )}
              </div>
              <Volba popisek="Aktivita za den" moznosti={moznostiAktivity} hodnota={String(vstup.aktivitaHal)} onZmena={(h) => onZmena({ aktivitaHal: Number(h) })} />
            </div>
          ) : (
            <p className="text-15 text-tlumeny">Firma odměny za den a aktivitu dohodářům nevyplácí (Nastavení firmy).</p>
          )}
        </fieldset>

        <div className="border-t border-linka pt-1">
          <button
            type="button"
            aria-expanded={dalsi}
            aria-controls={dalsiId}
            onClick={() => nastavDalsi(!dalsi)}
            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-papir"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-15 font-medium">Jiné odměny, srážky a průměrný výdělek</span>
              <span className="text-13 text-tlumeny tabular-nums">
                Jiné {kc(vstup.jineOdmenyHal)} · srážky {kc(vstup.srazkyHal)} · průměr {formatSazby(pvHal)}
              </span>
            </span>
            <ChevronDown aria-hidden className={`size-5 shrink-0 text-tlumeny transition-transform duration-150 motion-reduce:transition-none ${dalsi ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {dalsi && (
          <fieldset id={dalsiId} disabled={jenCteni} className="-mt-2 flex flex-col gap-5 disabled:opacity-80">
            <div className="grid gap-4 sm:grid-cols-2">
              <PoleCastky popisek="Jiné odměny" napoveda="Jednorázově za měsíc, zdaní se." hal={vstup.jineOdmenyHal} onHal={(h) => onZmena({ jineOdmenyHal: h ?? 0 })} />
              <PoleCastky popisek="Srážky" napoveda="Např. vyplacená záloha, odečte se z výplaty." hal={vstup.srazkyHal} onHal={(h) => onZmena({ srazkyHal: h ?? 0 })} />
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-15">
                  Průměrný výdělek pro náhrady <span className="font-semibold tabular-nums">{formatSazby(pvHal)}</span>
                  <span className="block text-13 text-tlumeny">{pvZdroj}</span>
                </p>
                {!rucniPv && !jenCteni && (
                  <Tlacitko varianta="tiche" ikona={PencilLine} onClick={() => nastavRucniPv(true)} className="-mr-4">Zadat ručně</Tlacitko>
                )}
              </div>
              {rucniPv && (
                <PoleCastky
                  popisek="Ruční průměr pro celé čtvrtletí"
                  napoveda="Platí od tohoto měsíce do konce čtvrtletí. Prázdné pole = počítat z uzávěrek."
                  pripona="Kč/h"
                  hal={vstup.prumernyVydelekHal}
                  onHal={(h) => onZmena({ prumernyVydelekHal: h === 0 ? null : h })}
                />
              )}
            </div>
          </fieldset>
        )}
      </div>
    </section>
  );
}
