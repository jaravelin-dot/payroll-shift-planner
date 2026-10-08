import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, type To } from 'react-router';
import type { Varovani, VysledekVypoctu } from '../../core/typy';
import type { Uzaverka } from '../../shared/api';
import { useOtevri, useUzavri } from '../api/dotazy';
import { ApiChyba } from '../api/klient';
import { nazevMesice } from '../dochazka';
import { cekajiciZmeny, useCekajiciZmeny } from '../hooks/useCekajiciZmeny';
import { odesliCekajici } from '../stav/neulozeneVstupy';
import { INFO_VAROVANI, kontrolovatPredUzavrenim, seradVarovani } from '../varovani';
import { Castka } from './Castka';
import { ChybaHlaska } from './ChybaHlaska';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko } from './Tlacitko';

export type SouhrnUzaverky = {
  kVyplateHal: number;
  pocetLidi: number;
  lide: { zamestnanecId: string; jmeno: string; varovani: readonly Varovani[] }[];
};

type Props = {
  akce: 'uzavrit' | 'otevrit';
  firmaId: string;
  rok: number;
  mesic: number;
  /** Pro uzavření: součet a přehled upozornění po lidech. */
  souhrn?: SouhrnUzaverky;
  odkazNaCloveka?: (zamestnanecId: string) => To;
  onZavrit: () => void;
  /** Po úspěchu: zavřít panel a ukázat hlášku. */
  onHotovo: (hlaska: string) => void;
};

// Při uzavírání znamená 409, že měsíc mezitím uzavřel někdo jiný (jiné okno); obecná hláška „nejdřív ho otevři" by mátla.
const jizUzavreny = (chyba: unknown) => chyba instanceof ApiChyba && chyba.kod === 'MESIC_UZAVREN';
const JIZ_UZAVRENY = new ApiChyba(409, 'MESIC_UZAVREN', 'Měsíc už je uzavřený, nejspíš z jiného okna. Obnov stránku.');

/** Součet K výplatě ze snímku uzávěrky, který spočítal server. */
const soucetUzaverky = (u: Uzaverka) => u.vysledky.reduce((s, r) => s + (r.vysledek as VysledekVypoctu).kVyplateHal, 0);

/** Potvrzení uzavření (s přehledem upozornění) nebo otevření měsíce. Uzávěrku počítá a ukládá server. */
export function PotvrzeniUzaverky({ akce, firmaId, rok, mesic, souhrn, odkazNaCloveka, onZavrit, onHotovo }: Props) {
  const qc = useQueryClient();
  const uzavri = useUzavri();
  const otevri = useOtevri();
  const mutace = akce === 'uzavrit' ? uzavri : otevri;
  const mesicText = nazevMesice(rok, mesic).toLowerCase();
  // Uzavřít jde, až se uloží všechny změny měsíce (jinak by snímek nesl jiná čísla, než appka ukazuje).
  const cekani = useCekajiciZmeny({ firmaId, rok, mesic });
  const blokovano = akce === 'uzavrit' && cekani !== null;
  const [odesilaCekajici, nastavOdesilaCekajici] = useState(false);
  /** Server po uzavření spočítal jiný součet K výplatě, než ukazovala appka. */
  const [rozdil, nastavRozdil] = useState<{ serverHal: number; appkaHal: number } | null>(null);
  // Jen upozornění, která mají smysl řešit před uzavřením (bez čistě informačních poznámek k výpočtu).
  const sUpozornenim = (souhrn?.lide ?? [])
    .map((l) => ({ ...l, varovani: l.varovani.filter(kontrolovatPredUzavrenim) }))
    .filter((l) => l.varovani.length > 0);

  const potvrd = async () => {
    if (akce === 'otevrit') {
      otevri.mutate({ firmaId, rok, mesic }, { onSuccess: () => onHotovo(`${nazevMesice(rok, mesic)} je zase otevřený.`) });
      return;
    }
    // Odměny čekající na prodlevu před uložením se odešlou hned; co se neuloží, uzávěrku zablokuje (hláška v panelu).
    nastavOdesilaCekajici(true);
    await odesliCekajici();
    nastavOdesilaCekajici(false);
    if (cekajiciZmeny(qc, { firmaId, rok, mesic }) !== null) return;
    uzavri.mutate({ firmaId, rok, mesic }, {
      onSuccess: (uzaverka) => {
        const serverHal = soucetUzaverky(uzaverka);
        if (souhrn && serverHal !== souhrn.kVyplateHal) {
          nastavRozdil({ serverHal, appkaHal: souhrn.kVyplateHal });
          return;
        }
        onHotovo(`${nazevMesice(rok, mesic)} je uzavřený.`);
      },
    });
  };

  if (rozdil) {
    return (
      <SpodniPanel
        otevreno
        onZavrit={onZavrit}
        nadpis={`${nazevMesice(rok, mesic)} je uzavřený`}
        paticka={<Tlacitko onClick={() => onHotovo(`${nazevMesice(rok, mesic)} je uzavřený.`)} className="flex-1 sm:flex-none">Rozumím</Tlacitko>}
      >
        <div role="alert" className="flex flex-col gap-2 rounded-lg border-l-[3px] border-varovani bg-varovani/8 py-3 pr-3 pl-4 text-15">
          <p className="font-semibold">Součet v uzávěrce nesedí s tím, co ukazovala appka.</p>
          <p className="flex flex-wrap items-baseline gap-x-2">K výplatě v uzávěrce: <Castka hal={rozdil.serverHal} className="font-semibold" /></p>
          <p className="flex flex-wrap items-baseline gap-x-2">Appka před uzavřením: <Castka hal={rozdil.appkaHal} className="font-semibold" /></p>
          <p>
            Platí čísla z uzávěrky. Nejspíš se mezitím změnila data (jiné okno nebo zařízení). Projdi výplaty lidí; když
            něco nesedí, měsíc otevři, oprav a uzavři znovu.
          </p>
        </div>
      </SpodniPanel>
    );
  }

  return (
    <SpodniPanel
      otevreno
      onZavrit={onZavrit}
      nadpis={akce === 'uzavrit' ? `Uzavřít ${mesicText}?` : `Otevřít ${mesicText}?`}
      paticka={
        <>
          <Tlacitko onClick={() => void potvrd()} nacita={mutace.isPending || odesilaCekajici} disabled={blokovano} className="flex-1 sm:flex-none">
            {akce === 'uzavrit' ? 'Uzavřít měsíc' : 'Otevřít měsíc'}
          </Tlacitko>
          <Tlacitko varianta="vedlejsi" onClick={onZavrit}>Zrušit</Tlacitko>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-15">
        {blokovano && (
          <p role="status" className="rounded-lg border-l-[3px] border-varovani bg-varovani/8 py-2 pr-3 pl-3">{cekani}</p>
        )}
        {mutace.isError && <ChybaHlaska chyba={jizUzavreny(mutace.error) ? JIZ_UZAVRENY : mutace.error} />}
        {akce === 'uzavrit' ? (
          <>
            <p>Výplaty se spočítají a uloží tak, jak jsou teď. Docházku a odměny pak nepůjde měnit, dokud měsíc znovu neotevřeš.</p>
            {souhrn && (
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-papir px-4 py-3">
                <span>K výplatě celkem <span className="text-tlumeny">({souhrn.pocetLidi} {souhrn.pocetLidi === 1 ? 'člověk' : souhrn.pocetLidi <= 4 ? 'lidé' : 'lidí'})</span></span>
                <Castka hal={souhrn.kVyplateHal} className="text-17 font-semibold text-penize" />
              </div>
            )}
            {sUpozornenim.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold">Než uzavřeš, projdi upozornění</h3>
                <ul className="flex flex-col divide-y divide-linka rounded-lg border border-linka">
                  {sUpozornenim.map((l) => (
                    <li key={l.zamestnanecId} className="flex flex-col gap-0.5 px-3 py-2.5">
                      {odkazNaCloveka ? (
                        <Link to={odkazNaCloveka(l.zamestnanecId)} className="font-semibold text-akce hover:underline">{l.jmeno}</Link>
                      ) : (
                        <span className="font-semibold">{l.jmeno}</span>
                      )}
                      <span className="text-13 text-tlumeny">
                        {seradVarovani(l.varovani).map((v, i) => {
                          const { nazev, ton } = INFO_VAROVANI[v.kod];
                          return (
                            <span key={`${v.kod}-${i}`}>
                              {i > 0 && ', '}
                              <span className={ton === 'chyba' ? 'font-semibold text-chyba' : ton === 'varovani' ? 'font-semibold text-varovani' : ''}>{nazev}</span>
                            </span>
                          );
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-penize"><CircleCheck aria-hidden className="size-[18px]" />Žádná upozornění.</p>
            )}
          </>
        ) : (
          <>
            <p>Docházku a odměny půjde zase měnit. Uložený výpočet uzávěrky se zahodí; při dalším uzavření se spočítá znovu.</p>
            <p className="text-tlumeny">Z uzávěrek se počítá průměrný výdělek pro další čtvrtletí, proto měsíc po úpravách zase uzavři.</p>
          </>
        )}
      </div>
    </SpodniPanel>
  );
}
