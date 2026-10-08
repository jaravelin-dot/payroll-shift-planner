// Pomocníci jen pro testy appky: falešné API přes `fetch` a obal s routerem a TanStack Query.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { VYCHOZI_NASTAVENI, type Firma, type MesicData, type ZamestnanecSeSazbami } from '../shared/api';

type Obsluha = (init: RequestInit | undefined) => Response | Promise<Response>;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Nahradí `fetch` tabulkou `"METODA /api/cesta" → odpověď`; neznámý požadavek test shodí. */
export function mockApi(trasy: Record<string, Obsluha>) {
  const fetchMock = vi.fn(async (vstup: RequestInfo | URL, init?: RequestInit) => {
    const klic = `${(init?.method ?? 'GET').toUpperCase()} ${String(vstup)}`;
    const obsluha = trasy[klic];
    if (!obsluha) throw new Error(`Nečekaný požadavek v testu: ${klic}`);
    return obsluha(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function firma(zmeny: Partial<Firma> = {}): Firma {
  return { id: 'f1', nazev: 'Ukázková prodejna s.r.o.', ico: null, adresa: null, ucet: null, nastaveni: VYCHOZI_NASTAVENI, vytvoreno: '2026-10-01T00:00:00.000Z', ...zmeny };
}

/** Jana Nováková: HPP 40 h, s prohlášením, sazba 165 Kč/h od nástupu 1. 1. 2025. */
export function zamestnanec(zmeny: Partial<ZamestnanecSeSazbami> = {}): ZamestnanecSeSazbami {
  const id = zmeny.id ?? 'z1';
  return {
    id, firmaId: 'f1', jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 2400, nastup: '2025-01-01', ukonceni: null,
    prohlaseni: true, invalidita: 'ZADNA', ztpp: false, deti: [], statniPojistenec: false, slevaNaPojistnem: false, ucet: null, poznamka: null,
    aktivni: true, rolePlanu: 'MIMO_PLAN', stridaniSmen: [], poradiPodkladu: null, vPodkladu: true, sazby: [{ id: `${id}-s1`, zamestnanecId: id, platiOd: '2025-01-01', hodinovaHal: 16500 }],
    ...zmeny,
  };
}

/** Prázdná data měsíce (říjen 2026) výchozí firmy. */
export function mesicData(zmeny: Partial<MesicData> = {}): MesicData {
  return {
    firma: firma(), rok: 2026, mesic: 10, zamestnanci: [], dny: [], vstupy: [], uzaverka: null, uzaverkyPredchozihoCtvrtleti: [],
    dppMinutyPredMesicem: {}, dovolenaRok: {}, zustatky: [], plan: [], sablony: [],
    ...zmeny,
  };
}

export function testovaciKlient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** Obal pro `renderHook`/`render`: TanStack Query + router v paměti. */
export function obal(klient: QueryClient, adresa = '/') {
  return function Obal({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={klient}>
        <MemoryRouter initialEntries={[adresa]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}
