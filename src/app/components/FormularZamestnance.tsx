import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { zustatekDovolene } from '../../core/dovolena';
import { ucetNaIban } from '../../core/platby';
import type { Firma, NovyZamestnanec, Zamestnanec, ZamestnanecSeSazbami } from '../../shared/api';
import { useMesic, useSmazZamestnance, useUlozDovolenou, useUlozZamestnance } from '../api/dotazy';
import { cisloNaText, minutyNaText, textNaMinuty } from '../cisla';
import { dnesniDatum, formatDatum, jeDatum } from '../datum';
import { useVyber } from '../stav/vyber';
import { CHYBA_SAZBY_RADEK, SOUVISEJICI_CHYBY, konceptZ, over, overUcet, type Chyby, type Koncept } from '../validaceZamestnance';
import { ChybaHlaska } from './ChybaHlaska';
import { DetiEditor } from './DetiEditor';
import { DovolenaZamestnance, type StavDovolene } from './DovolenaZamestnance';
import { Pole } from './Pole';
import { PlanovaniZamestnance } from './PlanovaniZamestnance';
import { Prepinac } from './Prepinac';
import { SazbyEditor } from './SazbyEditor';
import { Sekce } from './Sekce';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko, tridyTlacitka } from './Tlacitko';
import { Volba } from './Volba';

const SLEVA_UVAZEK_OD_MIN = 8 * 60;
const SLEVA_UVAZEK_DO_MIN = 30 * 60;

const SMLOUVY = [
  { hodnota: 'HPP', nazev: 'Pracovní poměr (HPP)' },
  { hodnota: 'DPP', nazev: 'Dohoda (DPP)' },
] as const;

const INVALIDITY = [
  { hodnota: 'ZADNA', nazev: 'Žádný' },
  { hodnota: 'I', nazev: 'I. stupeň' },
  { hodnota: 'II', nazev: 'II. stupeň' },
  { hodnota: 'III', nazev: 'III. stupeň' },
] as const;

/** IBAN po čtveřicích pro kontrolu očima: „CZ75 0800 0000 1900 0002 4619". */
const ibanPoCtvericich = (iban: string) => iban.replace(/(.{4})(?=.)/g, '$1 ');

type Props = {
  firma: Firma;
  /** Upravovaný člověk; bez něj formulář zakládá nového. */
  zamestnanec?: ZamestnanecSeSazbami;
  /** Hotovo (uloženo, ukončeno, smazáno): stránka se vrátí na seznam s krátkou hláškou. */
  onHotovo: (oznameni: string) => void;
};

type Vysledek = 'ok' | 'neplatne' | 'chyba';

export function FormularZamestnance({ firma, zamestnanec, onHotovo }: Props) {
  const vyber = useVyber();
  const dnes = dnesniDatum();
  const [k, nastavK] = useState(() => konceptZ(zamestnanec, firma, dnes));
  const [chyby, nastavChyby] = useState<Chyby>({});
  // Účet se kontroluje průběžně, jakmile ho uživatel jednou opustí (nebo zkusí uložit).
  const [kontrolaUctu, nastavKontroluUctu] = useState(false);
  const [pokus, nastavPokus] = useState(0);
  const [panel, nastavPanel] = useState<'ukoncit' | 'smazat' | null>(null);
  const [posledniDen, nastavPosledniDen] = useState(dnes);
  const formular = useRef<HTMLFormElement>(null);
  const poznamkaId = useId();
  const chybaPoznamkyId = useId();
  const ulozZamestnance = useUlozZamestnance();
  const ulozDovolenou = useUlozDovolenou();
  const smaz = useSmazZamestnance();

  // Dovolená: data roku z měsíce vybraného v přepínači; koncept platí jen pro rok, ve kterém vznikl.
  const rok = vyber.rok;
  const mesic = useMesic(zamestnanec ? firma.id : undefined, rok, vyber.mesic);
  const rocni = zamestnanec ? mesic.data?.dovolenaRok[zamestnanec.id] : undefined;
  const ulozenyZustatek = (zamestnanec && mesic.data?.zustatky.find((z) => z.zamestnanecId === zamestnanec.id)) || null;
  const [dovolena, nastavDovolenou] = useState<{ rok: number; prevod: string; navic: string } | null>(null);
  const dovolenaKoncept = dovolena?.rok === rok ? dovolena : null;
  const prevodText = dovolenaKoncept?.prevod ?? minutyNaText(ulozenyZustatek?.prevodMin ?? 0);
  const navicText = dovolenaKoncept?.navic ?? minutyNaText(ulozenyZustatek?.narokNavicMin ?? 0);

  useEffect(() => {
    if (pokus > 0) formular.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [pokus]);

  const zmen = <K extends keyof Koncept>(pole: K, hodnota: Koncept[K]) => {
    nastavK((puvodni) => {
      const novy = { ...puvodni, [pole]: hodnota };
      // Sazba, která platila od nástupu, se posune spolu s ním.
      if (pole === 'nastup') novy.sazby = puvodni.sazby.map((s) => (s.platiOd === puvodni.nastup ? { ...s, platiOd: hodnota as string } : s));
      return novy;
    });
    // Schová i chyby, které závisí na tomhle poli, i když se ukazují u jiného (nástup ↔ ukončení a sazby, smlouva ↔ úvazek).
    nastavChyby((puvodni) => {
      const nove = { ...puvodni, [pole]: undefined };
      for (const souvisejici of SOUVISEJICI_CHYBY[pole] ?? []) nove[souvisejici] = undefined;
      return nove;
    });
  };

  const zmenSazby = (sazby: Koncept['sazby']) => {
    nastavK((puvodni) => ({ ...puvodni, sazby }));
    // Chyby řádků (`sazba-1.kc`) i celé historie (`sazby`, `sazby.radek`); chyby dovolené s tečkou v klíči zůstanou.
    nastavChyby((puvodni) => Object.fromEntries(Object.entries(puvodni).filter(([klic]) => klic !== 'sazby' && (!klic.includes('.') || klic.startsWith('dovolena.')))));
  };

  const chybaUctu = kontrolaUctu ? overUcet(k.ucet) : chyby.ucet;

  /* ---- Dovolená: náhled z aktuálního stavu formuláře ---- */
  const prevodMin = textNaMinuty(prevodText, { zaporne: true });
  const navicMin = textNaMinuty(navicText);
  let stavDovolene: StavDovolene = { stav: 'nacitani' };
  if (zamestnanec) {
    if (mesic.error && !mesic.data) stavDovolene = { stav: 'chyba', chyba: mesic.error, onZnovu: () => void mesic.refetch() };
    else if (mesic.data && !rocni) stavDovolene = { stav: 'mimo' };
    else if (rocni) {
      const uvazek = textNaMinuty(k.uvazek);
      const navrh: Zamestnanec = {
        ...zamestnanec,
        smlouva: k.smlouva,
        uvazekMinTydne: k.smlouva === 'HPP' ? (uvazek ?? zamestnanec.uvazekMinTydne) : 0,
        nastup: jeDatum(k.nastup) ? k.nastup : zamestnanec.nastup,
        ukonceni: k.ukonceni === '' ? null : jeDatum(k.ukonceni) ? k.ukonceni : zamestnanec.ukonceni,
      };
      const zustatek = zustatekDovolene({
        z: navrh, rok, cerpanoMin: rocni.cerpanoMin, praceMin: rocni.praceMin,
        zustatek: {
          zamestnanecId: zamestnanec.id, rok,
          prevodMin: prevodMin ?? ulozenyZustatek?.prevodMin ?? 0,
          narokNavicMin: navicMin ?? ulozenyZustatek?.narokNavicMin ?? 0,
        },
      });
      stavDovolene = { stav: 'hotovo', ...zustatek };
    }
  }

  /** Zkontroluje a uloží člověka (a změněnou dovolenou); `zmeny` přepíšou ukončení a aktivitu (ukončení / návrat). */
  async function ulozit(zmeny: { ukonceni?: string | null; aktivni?: boolean } = {}, oznameni = 'Uloženo'): Promise<Vysledek> {
    const { udaje, chyby: nove } = over(k);
    if (dovolenaKoncept && prevodMin === null) nove['dovolena.prevod'] = 'Zadej hodiny, např. 16 nebo −7,5.';
    if (dovolenaKoncept && navicMin === null) nove['dovolena.navic'] = 'Zadej hodiny, např. 8.';
    nastavChyby(nove);
    nastavKontroluUctu(true);
    if (!udaje || Object.values(nove).some(Boolean)) {
      nastavPokus((p) => p + 1);
      return 'neplatne';
    }

    ulozZamestnance.reset();
    ulozDovolenou.reset();
    const data: NovyZamestnanec = {
      ...udaje,
      firmaId: firma.id,
      ukonceni: zmeny.ukonceni !== undefined ? zmeny.ukonceni : udaje.ukonceni,
      aktivni: zmeny.aktivni ?? zamestnanec?.aktivni ?? true,
    };
    try {
      const ulozeny = await ulozZamestnance.mutateAsync({ id: zamestnanec?.id, data });
      const zmenenaDovolena = dovolenaKoncept && prevodMin !== null && navicMin !== null
        && (prevodMin !== (ulozenyZustatek?.prevodMin ?? 0) || navicMin !== (ulozenyZustatek?.narokNavicMin ?? 0));
      if (zmenenaDovolena) {
        await ulozDovolenou.mutateAsync({ firmaId: firma.id, zamestnanecId: ulozeny.id, rok, prevodMin, narokNavicMin: navicMin });
      }
    } catch {
      // Chybu ukáže hláška z mutace.
      return 'chyba';
    }
    onHotovo(oznameni);
    return 'ok';
  }

  const odeslat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void ulozit();
  };

  const ukoncit = async () => {
    if (!jeDatum(posledniDen) || (jeDatum(k.nastup) && posledniDen < k.nastup)) return;
    if ((await ulozit({ ukonceni: posledniDen, aktivni: false }, 'Pracovní poměr ukončen')) === 'neplatne') {
      // Chyby jsou ve formuláři pod panelem. Dokud byl panel otevřený, stránka byla inert a fokus na chybné pole nešel;
      // zavření panelu ho vrací na tlačítko, proto se fokus pošle znovu ve stejném vykreslení (efekt pokusu běží až po úklidu panelu).
      nastavPanel(null);
      nastavPokus((p) => p + 1);
    }
  };

  const smazat = async () => {
    if (!zamestnanec) return;
    try {
      await smaz.mutateAsync({ id: zamestnanec.id, firmaId: firma.id });
    } catch {
      return;
    }
    onHotovo('Smazáno');
  };

  const chybaPoslednihoDne = !jeDatum(posledniDen)
    ? 'Vyber poslední den.'
    : jeDatum(k.nastup) && posledniDen < k.nastup
      ? 'Poslední den nesmí být před nástupem.'
      : undefined;
  const chybaUlozeni = ulozZamestnance.error ?? ulozDovolenou.error;
  const uklada = ulozZamestnance.isPending || ulozDovolenou.isPending;
  const uvazekMin = textNaMinuty(k.uvazek);
  const celeJmeno = zamestnanec ? `${zamestnanec.jmeno} ${zamestnanec.prijmeni}` : '';
  const iban = !chybaUctu && k.ucet.trim() ? ucetNaIban(k.ucet) : null;
  const automatickaVyjimka = k.invalidita !== 'ZADNA' || k.ztpp;

  return (
    <form ref={formular} onSubmit={odeslat} noValidate className="flex flex-col gap-6">
      <div className={`grid items-start gap-6 ${zamestnanec ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : 'max-w-[40rem]'}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <Sekce nadpis="Základ">
            <div className="grid gap-5 sm:grid-cols-2">
              <Pole popisek="Jméno" name="jmeno" autoComplete="off" value={k.jmeno} onChange={(e) => zmen('jmeno', e.target.value)} chyba={chyby.jmeno} />
              <Pole popisek="Příjmení" name="prijmeni" autoComplete="off" value={k.prijmeni} onChange={(e) => zmen('prijmeni', e.target.value)} chyba={chyby.prijmeni} />
            </div>
            <Volba popisek="Smlouva" moznosti={SMLOUVY} hodnota={k.smlouva} onZmena={(s) => zmen('smlouva', s)} />
            {k.smlouva === 'HPP' && (
              <Pole
                popisek="Úvazek"
                pripona="h týdně"
                inputMode="decimal"
                autoComplete="off"
                value={k.uvazek}
                onChange={(e) => zmen('uvazek', e.target.value)}
                chyba={chyby.uvazek}
                napoveda={`Plný úvazek ve firmě je ${cisloNaText(firma.nastaveni.tydenniPracovniDoba)} h.`}
                className="sm:max-w-64"
              />
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Pole type="date" popisek="Nástup" value={k.nastup} onChange={(e) => zmen('nastup', e.target.value)} chyba={chyby.nastup} />
              <Pole
                type="date"
                popisek="Ukončení"
                nepovinne
                value={k.ukonceni}
                onChange={(e) => zmen('ukonceni', e.target.value)}
                chyba={chyby.ukonceni}
                napoveda="Poslední den pracovního poměru."
              />
            </div>
          </Sekce>

          <Sekce nadpis="Mzda" popis="Pro každý den se použije sazba, která v ten den platila.">
            <SazbyEditor sazby={k.sazby} onZmena={zmenSazby} dnes={dnes} chyby={chyby} chyba={chyby.sazby} chybaRadek={chyby[CHYBA_SAZBY_RADEK]} />
          </Sekce>

          <Sekce nadpis="Daň a pojištění">
            <Prepinac
              zapnuto={k.prohlaseni}
              onZmena={(v) => zmen('prohlaseni', v)}
              popisek="Podepsané prohlášení poplatníka"
              napoveda="Uplatní se slevy na dani a zvýhodnění na děti."
            />
            <Volba popisek="Invalidní důchod" moznosti={INVALIDITY} hodnota={k.invalidita} onZmena={(v) => zmen('invalidita', v)} />
            <div className="-my-1 flex flex-col divide-y divide-linka">
              <div className="pb-1">
                <Prepinac
                  zapnuto={k.ztpp}
                  onZmena={(v) => zmen('ztpp', v)}
                  popisek="Držitel průkazu ZTP/P"
                  napoveda="Sleva na dani a výjimka z minima zdravotního pojištění."
                />
              </div>
              {k.smlouva === 'HPP' && (
                <div className="py-1">
                  <Prepinac
                    zapnuto={k.statniPojistenec}
                    onZmena={(v) => zmen('statniPojistenec', v)}
                    popisek="Výjimka z minima zdravotního pojištění"
                    napoveda={
                      'Student, důchodce, rodičovská, držitel průkazu ZTP nebo ZTP/P, osoba pečující… Invalidní důchod a průkaz ZTP/P zadané výše appka započítá sama.'
                      + (automatickaVyjimka ? ' Teď výjimka platí i bez tohohle přepínače.' : '')
                    }
                  />
                </div>
              )}
              {k.smlouva === 'HPP' && (
                <div className="pt-1">
                  <Prepinac
                    zapnuto={k.slevaNaPojistnem}
                    onZmena={(v) => zmen('slevaNaPojistnem', v)}
                    popisek="Sleva na pojistném"
                    napoveda="Jen zkrácený úvazek 8–30 h týdně (HPP), záměr předem oznámit ČSSZ."
                  />
                  {k.slevaNaPojistnem && uvazekMin !== null && (uvazekMin < SLEVA_UVAZEK_OD_MIN || uvazekMin > SLEVA_UVAZEK_DO_MIN) && (
                    <p className="pb-2 text-13 font-medium text-varovani">Úvazek {k.uvazek} h týdně je mimo 8–30 h, sleva se neuplatní.</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-linka pt-5">
              <h3 className="text-15 font-semibold">Děti</h3>
              <p className="-mt-1 text-13 text-tlumeny">Pořadí určuje výši zvýhodnění. Uplatní se jen s podepsaným prohlášením.</p>
              <DetiEditor deti={k.deti} onZmena={(deti) => zmen('deti', deti)} />
            </div>
          </Sekce>

          <Sekce nadpis="Výplata">
            <Pole
              popisek="Číslo účtu"
              nepovinne
              autoComplete="off"
              value={k.ucet}
              onChange={(e) => zmen('ucet', e.target.value)}
              onBlur={() => k.ucet.trim() && nastavKontroluUctu(true)}
              chyba={chybaUctu}
              ohlasitChybu
              napoveda={iban ? `IBAN ${ibanPoCtvericich(iban)}` : 'Ve tvaru předčíslí-číslo/kód banky, např. 19-\u206024619/0800. Použije se pro QR platbu.'}
              className="sm:max-w-96"
            />
            <Pole
              popisek="Pořadí v podkladu pro účetního"
              nepovinne
              inputMode="numeric"
              autoComplete="off"
              value={k.poradi}
              onChange={(e) => zmen('poradi', e.target.value)}
              chyba={chyby.poradi}
              napoveda="Číslo řádku v podkladu pro účetního. Kdo ho nemá, je na konci podle příjmení."
              className="sm:max-w-40"
            />
            <Prepinac
              zapnuto={k.vPodkladu}
              onZmena={(v) => zmen('vPodkladu', v)}
              popisek="Zahrnout do podkladů pro účetního"
              napoveda="Když je vypnuté, člověk není v PDF podkladu ani v Excelu pro účetního. Směny, docházka a výplaty zůstávají."
            />
          </Sekce>

          <PlanovaniZamestnance
            firmaId={firma.id}
            role={k.rolePlanu}
            stridani={k.stridaniSmen}
            onRole={(role) => zmen('rolePlanu', role)}
            onStridani={(stridani) => zmen('stridaniSmen', stridani)}
          />

          <Sekce nadpis="Poznámka" nadpisId={poznamkaId}>
            <textarea
              aria-labelledby={poznamkaId}
              aria-invalid={chyby.poznamka ? true : undefined}
              aria-describedby={chyby.poznamka ? chybaPoznamkyId : undefined}
              rows={3}
              value={k.poznamka}
              onChange={(e) => zmen('poznamka', e.target.value)}
              placeholder="Cokoli, co chceš mít u člověka poznamenané."
              className={[
                'w-full rounded-lg border bg-karta px-3 py-2.5 text-17 placeholder:text-tlumeny transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-0',
                chyby.poznamka ? 'border-chyba focus-visible:outline-chyba' : 'border-tlumeny/80 hover:border-tlumeny focus-visible:border-akce',
              ].join(' ')}
            />
            {chyby.poznamka && (
              <p id={chybaPoznamkyId} className="-mt-3 text-13 font-medium text-chyba">
                {chyby.poznamka}
              </p>
            )}
          </Sekce>
        </div>

        {zamestnanec && (
          <div className="flex min-w-0 flex-col gap-6">
            <DovolenaZamestnance
              rok={rok}
              smlouva={k.smlouva}
              vysledek={stavDovolene}
              prevod={prevodText}
              navic={navicText}
              onPrevod={(prevod) => {
                nastavDovolenou({ rok, prevod, navic: navicText });
                nastavChyby((c) => ({ ...c, 'dovolena.prevod': undefined }));
              }}
              onNavic={(navic) => {
                nastavDovolenou({ rok, prevod: prevodText, navic });
                nastavChyby((c) => ({ ...c, 'dovolena.navic': undefined }));
              }}
              chyby={{ prevod: chyby['dovolena.prevod'], navic: chyby['dovolena.navic'] }}
            />

            <Sekce nadpis="Pracovní poměr">
              {zamestnanec.aktivni ? (
                <div className="flex flex-col items-start gap-2">
                  <Tlacitko varianta="vedlejsi" onClick={() => nastavPanel('ukoncit')}>
                    Ukončit pracovní poměr
                  </Tlacitko>
                  <p className="text-13 text-tlumeny">Přesune se mezi bývalé. Docházka a výplaty zůstanou.</p>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-15">
                    Bývalý zaměstnanec{zamestnanec.ukonceni ? `, poslední den ${formatDatum(zamestnanec.ukonceni)}` : ''}.
                  </p>
                  <Tlacitko varianta="vedlejsi" nacita={uklada} onClick={() => void ulozit({ ukonceni: null, aktivni: true }, 'Vráceno mezi současné')}>
                    Vrátit mezi současné
                  </Tlacitko>
                </div>
              )}
              <div className="flex flex-col items-start gap-1 border-t border-linka pt-4">
                <Tlacitko varianta="nebezpecneTiche" onClick={() => nastavPanel('smazat')} className="-ml-4">
                  Smazat natrvalo
                </Tlacitko>
                <p className="text-13 text-tlumeny">Jen když je člověk zadaný omylem. Smaže i docházku.</p>
              </div>
            </Sekce>
          </div>
        )}
      </div>

      {chybaUlozeni && !panel && (
        <div className="max-w-[40rem]">
          <ChybaHlaska chyba={chybaUlozeni} />
        </div>
      )}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-linka bg-papir px-4 py-3 sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Tlacitko type="submit" nacita={uklada && !panel}>
            Uložit
          </Tlacitko>
          <Link to={vyber.odkaz('/lide')} className={tridyTlacitka('tiche')}>
            Zrušit
          </Link>
        </div>
      </div>

      {zamestnanec && (
        <SpodniPanel
          otevreno={panel === 'ukoncit'}
          onZavrit={() => nastavPanel(null)}
          nadpis="Ukončit pracovní poměr"
          paticka={
            <>
              <Tlacitko nacita={uklada} disabled={!!chybaPoslednihoDne} onClick={() => void ukoncit()}>
                Ukončit pracovní poměr
              </Tlacitko>
              <Tlacitko varianta="tiche" onClick={() => nastavPanel(null)}>
                Zpět
              </Tlacitko>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <p className="text-15">
              <strong className="font-semibold">{celeJmeno}</strong> se přesune mezi bývalé. Docházka, výplaty i uzávěrky zůstanou a v měsících
              do posledního dne se dál počítá.
            </p>
            <Pole type="date" popisek="Poslední den" value={posledniDen} onChange={(e) => nastavPosledniDen(e.target.value)} chyba={chybaPoslednihoDne} />
            {chybaUlozeni && <ChybaHlaska chyba={chybaUlozeni} />}
          </div>
        </SpodniPanel>
      )}

      {zamestnanec && (
        <SpodniPanel
          otevreno={panel === 'smazat'}
          onZavrit={() => nastavPanel(null)}
          nadpis="Smazat natrvalo?"
          paticka={
            <>
              <Tlacitko varianta="nebezpecne" nacita={smaz.isPending} onClick={() => void smazat()}>
                Smazat natrvalo
              </Tlacitko>
              <Tlacitko varianta="tiche" onClick={() => nastavPanel(null)}>
                Nechat
              </Tlacitko>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-15">
              <strong className="font-semibold">{celeJmeno}</strong> se smaže včetně docházky, sazeb a dovolené. Nejde to vrátit.
            </p>
            {zamestnanec.aktivni && (
              <p className="text-15 text-tlumeny">Když jen odchází z firmy, raději ukonči pracovní poměr. Docházka i výplaty zůstanou.</p>
            )}
            {smaz.error && <ChybaHlaska chyba={smaz.error} />}
          </div>
        </SpodniPanel>
      )}
    </form>
  );
}
