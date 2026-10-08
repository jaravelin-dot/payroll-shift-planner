import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { VYCHOZI_NASTAVENI, type Firma, type NovaFirma } from '../../shared/api';
import { useSmazFirmu, useUlozFirmu } from '../api/dotazy';
import { useVyber } from '../stav/vyber';
import { overUcet } from '../validaceZamestnance';
import { ChybaHlaska } from './ChybaHlaska';
import { NastaveniFirmyForm, konceptNastaveni, overNastaveni, type KonceptNastaveni } from './NastaveniFirmyForm';
import { Pole } from './Pole';
import { Sekce } from './Sekce';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko, tridyTlacitka } from './Tlacitko';

type Chyby = Record<string, string | undefined>;

type Props = {
  /** Upravovaná firma; bez ní formulář zakládá novou (s výchozími pravidly výpočtu). */
  firma?: Firma;
  /** Uloženo: `nova` říká, že firma právě vznikla. */
  onUlozeno: (firma: Firma, nova: boolean) => void;
  onSmazano: () => void;
};

/** Údaje firmy a pravidla výpočtu na jedné stránce s jedním „Uložit". */
export function FormularFirmy({ firma, onUlozeno, onSmazano }: Props) {
  const vyber = useVyber();
  const [udaje, nastavUdaje] = useState({ nazev: firma?.nazev ?? '', ico: firma?.ico ?? '', adresa: firma?.adresa ?? '', ucet: firma?.ucet ?? '' });
  const [nastaveni, nastavNastaveni] = useState<KonceptNastaveni>(() => konceptNastaveni(firma?.nastaveni ?? VYCHOZI_NASTAVENI));
  const [chyby, nastavChyby] = useState<Chyby>({});
  const [kontrolaUctu, nastavKontroluUctu] = useState(false);
  const [pokus, nastavPokus] = useState(0);
  const [mazani, nastavMazani] = useState(false);
  const formular = useRef<HTMLFormElement>(null);
  const uloz = useUlozFirmu();
  const smaz = useSmazFirmu();

  useEffect(() => {
    if (pokus > 0) formular.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [pokus]);

  const zmenUdaj = (pole: keyof typeof udaje, hodnota: string) => {
    nastavUdaje((u) => ({ ...u, [pole]: hodnota }));
    nastavChyby((c) => ({ ...c, [pole]: undefined }));
  };

  const zmenNastaveni = (zmena: Partial<KonceptNastaveni>) => {
    nastavNastaveni((n) => ({ ...n, ...zmena }));
    // U úrovní se mění celé pole, proto se schovají chyby všech jeho položek (klíče úrovní začínají „uroven-").
    const klice = Object.keys(zmena);
    nastavChyby((c) => Object.fromEntries(Object.entries(c).filter(([klic]) => !klice.includes(klic) && !(klic.startsWith('uroven-') && klice.some((k) => k.startsWith('urovne'))))));
  };

  const chybaUctu = kontrolaUctu ? overUcet(udaje.ucet) : chyby.ucet;

  const odeslat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nazev = udaje.nazev.trim();
    const ico = udaje.ico.replace(/\s+/g, '');
    const adresa = udaje.adresa.trim();
    const ucet = udaje.ucet.replace(/\s+/g, '');
    const { nastaveni: hotove, chyby: chybyNastaveni } = overNastaveni(nastaveni);
    const nove: Chyby = {
      nazev: !nazev ? 'Napiš název firmy.' : nazev.length > 200 ? 'Nejvýš 200 znaků.' : undefined,
      ico: ico && !/^\d{8}$/.test(ico) ? 'IČO má 8 číslic.' : undefined,
      adresa: adresa.length > 500 ? 'Nejvýš 500 znaků.' : undefined,
      ucet: overUcet(ucet),
      ...chybyNastaveni,
    };
    nastavChyby(nove);
    nastavKontroluUctu(true);
    if (!hotove || Object.values(nove).some(Boolean)) {
      nastavPokus((p) => p + 1);
      return;
    }
    const data: NovaFirma = { nazev, ico: ico || null, adresa: adresa || null, ucet: ucet || null, nastaveni: hotove };
    uloz.mutateAsync({ id: firma?.id, data }).then((ulozena) => onUlozeno(ulozena, !firma), () => {
      // Chybu ukáže hláška z mutace.
    });
  };

  // Přes promise, ne callback mutace: po smazání poslední firmy se stránka odmontuje (appka ukáže první spuštění)
  // a callback u `mutate` by už neproběhl, takže by v adrese zůstala smazaná firma.
  const smazat = () => {
    if (!firma) return;
    smaz.mutateAsync(firma.id).then(onSmazano, () => {
      // Chybu ukáže hláška v panelu.
    });
  };

  return (
    <form ref={formular} onSubmit={odeslat} noValidate className="flex flex-col gap-6">
      <div className="flex max-w-[44rem] flex-col gap-6">
        <Sekce nadpis="Údaje firmy">
          <Pole popisek="Název firmy" autoComplete="organization" value={udaje.nazev} onChange={(e) => zmenUdaj('nazev', e.target.value)} chyba={chyby.nazev} />
          <Pole
            popisek="IČO"
            nepovinne
            inputMode="numeric"
            // 8 číslic i s mezerami z vložené hodnoty („123 456 78"); mezery se před kontrolou odstraní.
            maxLength={12}
            value={udaje.ico}
            onChange={(e) => zmenUdaj('ico', e.target.value)}
            chyba={chyby.ico}
            className="sm:max-w-48"
          />
          <Pole popisek="Adresa" nepovinne autoComplete="street-address" value={udaje.adresa} onChange={(e) => zmenUdaj('adresa', e.target.value)} chyba={chyby.adresa} />
          <Pole
            popisek="Číslo účtu"
            nepovinne
            autoComplete="off"
            value={udaje.ucet}
            onChange={(e) => zmenUdaj('ucet', e.target.value)}
            onBlur={() => udaje.ucet.trim() && nastavKontroluUctu(true)}
            chyba={chybaUctu}
            ohlasitChybu
            napoveda={'Ve tvaru předčíslí-číslo/kód banky, např. 19-\u206024619/0800. Objeví se na výplatních páskách.'}
            className="sm:max-w-96"
          />
        </Sekce>

        <NastaveniFirmyForm koncept={nastaveni} onZmena={zmenNastaveni} chyby={chyby} />

        {firma && (
          <Sekce nadpis="Smazat firmu">
            <p className="text-15 text-tlumeny">Smaže firmu se všemi lidmi, docházkou a uzávěrkami. Hodí se třeba pro ukázkovou prodejnu.</p>
            <div>
              <Tlacitko varianta="nebezpecneTiche" onClick={() => nastavMazani(true)} className="-ml-4">
                Smazat firmu
              </Tlacitko>
            </div>
          </Sekce>
        )}

        {uloz.error && <ChybaHlaska chyba={uloz.error} />}
      </div>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linka bg-papir px-4 py-3 sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Tlacitko type="submit" nacita={uloz.isPending}>
            Uložit
          </Tlacitko>
          <Link to={vyber.odkaz('/nastaveni')} className={tridyTlacitka('tiche')}>
            Zrušit
          </Link>
        </div>
      </div>

      {firma && (
        <SpodniPanel
          otevreno={mazani}
          onZavrit={() => nastavMazani(false)}
          nadpis="Smazat firmu natrvalo?"
          paticka={
            <>
              <Tlacitko varianta="nebezpecne" nacita={smaz.isPending} onClick={smazat}>
                Smazat natrvalo
              </Tlacitko>
              <Tlacitko varianta="tiche" onClick={() => nastavMazani(false)}>
                Nechat
              </Tlacitko>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-15">
              <strong className="font-semibold">{firma.nazev}</strong> se smaže se všemi lidmi, docházkou a uzávěrkami. Nejde to vrátit.
            </p>
            <p className="text-15 text-tlumeny">Než ji smažeš, můžeš si v Nastavení stáhnout zálohu.</p>
            {smaz.error && <ChybaHlaska chyba={smaz.error} />}
          </div>
        </SpodniPanel>
      )}
    </form>
  );
}
