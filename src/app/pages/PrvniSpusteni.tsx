import { useState, type FormEvent } from 'react';
import type { NovaFirma } from '../../shared/api';
import { useDemo, useUlozFirmu } from '../api/dotazy';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { Pole } from '../components/Pole';
import { Tlacitko } from '../components/Tlacitko';
import { Znak } from '../components/Znak';

/** Ukázkový týden na kartičce: jen ilustrace toho, co appka dělá (pro čtečky skrytá). */
const UKAZKOVY_TYDEN = [
  { den: 'Po', pismeno: 'P', hodiny: '8 h', tridy: 'border-den-prace bg-den-prace/8 text-den-prace' },
  { den: 'Út', pismeno: 'P', hodiny: '8 h', tridy: 'border-den-prace bg-den-prace/8 text-den-prace' },
  { den: 'St', pismeno: 'D', hodiny: '8 h', tridy: 'border-den-dovolena bg-den-dovolena/8 text-den-dovolena' },
  { den: 'Čt', pismeno: 'P', hodiny: '7,5 h', tridy: 'border-den-prace bg-den-prace/8 text-den-prace' },
  { den: 'Pá', pismeno: 'N', hodiny: '8 h', tridy: 'border-den-nemoc bg-den-nemoc/8 text-den-nemoc' },
  { den: 'So', pismeno: 'P', hodiny: '6 h', tridy: 'border-den-prace bg-den-prace/8 text-den-prace' },
  { den: 'Ne', pismeno: '', hodiny: '', tridy: '' },
];

function UkazkaKarty() {
  return (
    <figure aria-hidden className="rounded-xl border border-linka bg-karta p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-15 font-semibold">Hana Svobodová</span>
        <span className="text-13 text-tlumeny">HPP, 165 Kč/h</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {UKAZKOVY_TYDEN.map(({ den, pismeno, hodiny, tridy }) =>
          pismeno ? (
            <div key={den} className={`flex aspect-[3/4] flex-col justify-between rounded-r-md border-l-[3px] p-1.5 ${tridy}`}>
              <span className="text-13 text-tlumeny">{den}</span>
              <span className="text-28 leading-none font-semibold">{pismeno}</span>
              <span className="text-13 whitespace-nowrap text-inkoust tabular-nums">{hodiny}</span>
            </div>
          ) : (
            <div key={den} className="flex aspect-[3/4] flex-col rounded-md border border-dashed border-tlumeny/45 p-1.5">
              <span className="text-13 text-tlumeny">{den}</span>
            </div>
          ),
        )}
      </div>
      <figcaption className="mt-4 border-t border-linka pt-3 text-13 text-tlumeny">Zapíšeš docházku, appka spočítá výplatu.</figcaption>
    </figure>
  );
}

type Chyby = { nazev?: string; ico?: string };

function FormularFirmy({ onZpet }: { onZpet: () => void }) {
  const ulozFirmu = useUlozFirmu();
  const [chyby, nastavChyby] = useState<Chyby>({});

  const odeslat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (klic: string) => String(data.get(klic) ?? '').trim();
    const firma: NovaFirma = { nazev: text('nazev'), ico: text('ico') || null, adresa: text('adresa') || null, ucet: text('ucet') || null };
    const nove: Chyby = {};
    if (!firma.nazev) nove.nazev = 'Napiš název firmy.';
    if (firma.ico && !/^\d{8}$/.test(firma.ico)) nove.ico = 'IČO má 8 číslic.';
    nastavChyby(nove);
    const prvniChybne = Object.keys(nove)[0];
    if (prvniChybne) {
      (e.currentTarget.elements.namedItem(prvniChybne) as HTMLInputElement | null)?.focus();
      return;
    }
    // Zapamatování nové firmy obstará `useVyber`; tahle stránka se po založení hned odmontuje.
    ulozFirmu.mutate({ data: firma });
  };

  return (
    <form onSubmit={odeslat} noValidate className="mt-8 flex flex-col gap-5">
      <Pole name="nazev" popisek="Název firmy" chyba={chyby.nazev} autoComplete="organization" autoFocus />
      <Pole name="ico" popisek="IČO" nepovinne chyba={chyby.ico} inputMode="numeric" maxLength={8} className="max-w-48" />
      <Pole name="adresa" popisek="Adresa" nepovinne autoComplete="street-address" />
      <Pole name="ucet" popisek="Číslo účtu" nepovinne napoveda="Ve tvaru 123456789/0100. Objeví se na výplatních páskách." />
      {ulozFirmu.error && <ChybaHlaska chyba={ulozFirmu.error} />}
      <div className="flex flex-wrap gap-3 pt-1">
        <Tlacitko type="submit" nacita={ulozFirmu.isPending}>
          Založit firmu
        </Tlacitko>
        <Tlacitko varianta="tiche" onClick={onZpet}>
          Zpět
        </Tlacitko>
      </div>
    </form>
  );
}

/** Appka bez firem: založit první firmu, nebo si ji vyzkoušet na ukázkových datech. */
export function PrvniSpusteni() {
  const [formular, nastavFormular] = useState(false);
  // Po „Zpět" se tlačítko otevírající formulář vykreslí znovu; fokus mu vrátí `autoFocus`, jinak by spadl na <body>.
  const [vracenoZFormulare, nastavVraceno] = useState(false);
  const demo = useDemo();

  return (
    <div className="min-h-dvh px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-12 sm:px-8 lg:pt-16">
      <title>Začneme firmou – Mzdy</title>
      <div className="mx-auto max-w-[1040px]">
        <header className="flex items-center gap-2.5">
          <Znak />
          <span className="text-17 font-semibold">Mzdy</span>
        </header>

        <main className="mt-10 grid items-start gap-10 lg:mt-24 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20">
          <section className="max-w-[34rem]">
            <h1 className="text-28 font-semibold sm:text-40">Začneme firmou</h1>
            <p className="mt-4 text-17 text-tlumeny">
              Výplaty se počítají pro každou firmu zvlášť. Založ první firmu a pak do ní přidáš lidi. Nebo si appku nejdřív vyzkoušej na
              smyšlené prodejně se čtyřmi lidmi.
            </p>

            {formular ? (
              <FormularFirmy
                onZpet={() => {
                  nastavVraceno(true);
                  nastavFormular(false);
                }}
              />
            ) : (
              <>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Tlacitko autoFocus={vracenoZFormulare} onClick={() => nastavFormular(true)}>
                    Založit firmu
                  </Tlacitko>
                  <Tlacitko varianta="vedlejsi" nacita={demo.isPending} onClick={() => demo.mutate()}>
                    Vyzkoušet na ukázkových datech
                  </Tlacitko>
                </div>
                {demo.error ? (
                  <div className="mt-4">
                    <ChybaHlaska chyba={demo.error} />
                  </div>
                ) : (
                  <p className="mt-3 text-13 text-tlumeny">Ukázkovou prodejnu pak smažeš v Nastavení.</p>
                )}
              </>
            )}
          </section>

          <UkazkaKarty />
        </main>
      </div>
    </div>
  );
}
