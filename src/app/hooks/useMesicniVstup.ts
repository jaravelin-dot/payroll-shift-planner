// Měsíční vstup jednoho člověka (odměny, srážky, ruční průměr) s rozpracovanou verzí: změna se hned projeví ve výpočtu
// a na server odejde až po 600 ms klidu (`PUT /api/vstupy` s celým vstupem). Rozpracovaná verze se zahodí, až když
// ji server uložil a data měsíce se znovu načetla; při odchodu ze stránky se nedokončené (nebo neúspěšné) uložení
// odešle hned. Když selže až po odchodu, vstup se nezahodí: zůstane v `neulozeneVstupy` (hláška se „Zkusit znovu")
// a při návratu k člověku se převezme a odešle znovu.
import { useEffect, useRef, useState } from 'react';
import type { MesicData, MesicniVstup } from '../../shared/api';
import { useUlozVstup } from '../api/dotazy';
import { nazevMesice } from '../dochazka';
import { najdiNeulozeny, odeberNeulozeny, prihlasCekajici, pridejNeulozeny } from '../stav/neulozeneVstupy';

export const PRODLEVA_ULOZENI_MS = 600;

export function prazdnyVstup(zamestnanecId: string, rok: number, mesic: number): MesicniVstup {
  return { zamestnanecId, rok, mesic, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null };
}

export type StavUlozeni = 'klid' | 'uklada' | 'ulozeno' | 'chyba';

export function useMesicniVstup(firmaId: string, data: MesicData, zamestnanecId: string) {
  const ulozVstup = useUlozVstup();
  const ulozeny = data.vstupy.find((v) => v.zamestnanecId === zamestnanecId && v.rok === data.rok && v.mesic === data.mesic) ?? null;
  // Vstup, který se minule neuložil: platí místo uloženého, dokud ho server nepřijme.
  const [prevzaty] = useState(() => najdiNeulozeny(zamestnanecId, data.rok, data.mesic));
  const [koncept, nastavKoncept] = useState<MesicniVstup | null>(prevzaty?.vstup ?? null);
  const casovac = useRef<number | undefined>(undefined);
  const cekajici = useRef<MesicniVstup | null>(null);
  /** Naposledy odeslaný vstup; o výsledku rozhoduje jen ten (když selže starší, novější je stejně na cestě). */
  const posledni = useRef<MesicniVstup | null>(null);
  /** Naposledy odeslaný vstup, jehož uložení selhalo (při odchodu ze stránky se zkusí znovu). */
  const selhany = useRef<MesicniVstup | null>(null);
  const pripojeno = useRef(true);
  /** Odhlášení čekajícího uložení z `neulozeneVstupy` (uzávěrka ho tak umí odeslat hned). */
  const odhlasCekajici = useRef<(() => void) | null>(null);
  const mutateAsync = ulozVstup.mutateAsync;
  const z = data.zamestnanci.find((x) => x.id === zamestnanecId);
  const popis = `${z ? `${z.jmeno} ${z.prijmeni}, ` : ''}${nazevMesice(data.rok, data.mesic).toLowerCase()}`;

  const vstup = koncept ?? ulozeny ?? prazdnyVstup(zamestnanecId, data.rok, data.mesic);

  const odesli = (v: MesicniVstup): Promise<unknown> => {
    cekajici.current = null;
    selhany.current = null;
    posledni.current = v;
    odhlasCekajici.current?.();
    odhlasCekajici.current = null;
    return mutateAsync({ ...v, firmaId }).then(
      () => {
        if (pripojeno.current) nastavKoncept((k) => (k === v ? null : k));
      },
      () => {
        if (posledni.current !== v) return; // novější vstup je už na cestě
        if (pripojeno.current) selhany.current = v;
        else pridejNeulozeny({ firmaId, popis, vstup: v });
      },
    );
  };
  const odesliRef = useRef(odesli);
  odesliRef.current = odesli;

  const zmen = (zmena: Partial<MesicniVstup>) => {
    const novy = { ...vstup, ...zmena };
    nastavKoncept(novy);
    cekajici.current = novy;
    window.clearTimeout(casovac.current);
    casovac.current = window.setTimeout(() => odesliRef.current(novy), PRODLEVA_ULOZENI_MS);
    odhlasCekajici.current ??= prihlasCekajici(() => {
      window.clearTimeout(casovac.current);
      return cekajici.current ? odesliRef.current(cekajici.current) : Promise.resolve();
    });
  };

  // Převzatý neuložený vstup se hned odešle znovu (a z hlášky zmizí, stránka ho teď hlídá sama).
  useEffect(() => {
    if (!prevzaty) return;
    odeberNeulozeny(prevzaty);
    odesliRef.current(prevzaty.vstup);
  }, [prevzaty]);

  // Odchod ze stránky (jiný člověk, měsíc) před uplynutím prodlevy nebo po neúspěšném uložení: uložit hned znovu.
  useEffect(() => {
    pripojeno.current = true;
    return () => {
      pripojeno.current = false;
      window.clearTimeout(casovac.current);
      const neulozeny = cekajici.current ?? selhany.current;
      if (neulozeny) odesliRef.current(neulozeny);
    };
  }, []);

  const stav: StavUlozeni = ulozVstup.isError ? 'chyba' : koncept !== null || ulozVstup.isPending ? 'uklada' : ulozVstup.isSuccess ? 'ulozeno' : 'klid';
  return {
    vstup,
    /** Rozpracovaný vstup, který ještě není v datech měsíce (pro okamžitý přepočet). */
    koncept,
    zmen,
    stav,
    chyba: ulozVstup.error,
    znovu: () => odesli(vstup),
  };
}
