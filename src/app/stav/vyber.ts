// Vybraná firma a měsíc. Žijí v URL (`?firma=…&rok=2026&mesic=10`), aby šly sdílet odkazem a přežily
// obnovení stránky; výchozí je naposledy vybraná firma (localStorage), jinak první, a aktuální měsíc.
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { Firma } from '../../shared/api';
import { useFirmy } from '../api/dotazy';

const KLIC_FIRMY = 'mzdy.firma';
const PARAMETRY = ['firma', 'rok', 'mesic'] as const;

function nactiUlozenou(): string | null {
  try {
    return localStorage.getItem(KLIC_FIRMY);
  } catch {
    return null;
  }
}

/** Zapamatuje firmu pro příští otevření appky (bez localStorage se jen nezapamatuje). */
export function zapamatujFirmu(id: string): void {
  try {
    localStorage.setItem(KLIC_FIRMY, id);
  } catch {
    // Soukromý režim prohlížeče apod.
  }
}

function celeCislo(text: string | null, min: number, max: number): number | null {
  if (text === null || !/^\d+$/.test(text)) return null;
  const cislo = Number(text);
  return cislo >= min && cislo <= max ? cislo : null;
}

export interface Vyber {
  firma: Firma | undefined;
  firmaId: string | undefined;
  rok: number;
  mesic: number;
  nastavFirmu: (id: string) => void;
  nastavMesic: (rok: number, mesic: number) => void;
  /** Cíl odkazu, který nese vybranou firmu a měsíc z URL dál. */
  odkaz: (pathname: string) => { pathname: string; search: string };
}

export function useVyber(): Vyber {
  const [parametry, nastavParametry] = useSearchParams();
  const { data: firmy } = useFirmy();

  const zUrl = parametry.get('firma');
  const ulozena = nactiUlozenou();
  const firma = firmy?.find((f) => f.id === zUrl) ?? firmy?.find((f) => f.id === ulozena) ?? firmy?.[0];

  const ted = new Date();
  const rokZUrl = celeCislo(parametry.get('rok'), 2000, 2100);
  const mesicZUrl = celeCislo(parametry.get('mesic'), 1, 12);
  const [rok, mesic] = rokZUrl !== null && mesicZUrl !== null ? [rokZUrl, mesicZUrl] : [ted.getFullYear(), ted.getMonth() + 1];

  useEffect(() => {
    if (firma && firma.id !== ulozena) zapamatujFirmu(firma.id);
  }, [firma, ulozena]);

  const zmenParametry = useCallback(
    (zmeny: Record<string, string>) => {
      nastavParametry((puvodni) => {
        const nove = new URLSearchParams(puvodni);
        for (const [klic, hodnota] of Object.entries(zmeny)) nove.set(klic, hodnota);
        return nove;
      });
    },
    [nastavParametry],
  );

  const nastavFirmu = useCallback(
    (id: string) => {
      zapamatujFirmu(id);
      zmenParametry({ firma: id });
    },
    [zmenParametry],
  );

  const nastavMesic = useCallback(
    (novyRok: number, novyMesic: number) => zmenParametry({ rok: String(novyRok), mesic: String(novyMesic) }),
    [zmenParametry],
  );

  const odkaz = useCallback(
    (pathname: string) => {
      const kontext = new URLSearchParams();
      for (const klic of PARAMETRY) {
        const hodnota = parametry.get(klic);
        if (hodnota !== null) kontext.set(klic, hodnota);
      }
      const search = kontext.toString();
      return { pathname, search: search ? `?${search}` : '' };
    },
    [parametry],
  );

  return { firma, firmaId: firma?.id, rok, mesic, nastavFirmu, nastavMesic, odkaz };
}
