// Pomocníci pro testy API: volání s JSON tělem a továrny na vstupy.
import type { NovaFirma, NovaSablona, NovyZamestnanec } from '../../src/shared/api';
import type { vytvorTestovaciApp } from './harness';

type FetchApi = Awaited<ReturnType<typeof vytvorTestovaciApp>>['fetchApi'];

export function klient(fetchApi: FetchApi) {
  // Jako appka (src/app/api/klient.ts): každý zápis nese Content-Type JSON, i bez těla (API jiný typ odmítne).
  const volej = async (metoda: string, cesta: string, telo?: unknown) => {
    const res = await fetchApi(cesta, {
      method: metoda,
      headers: metoda === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const text = await res.text();
    const body: any = text ? JSON.parse(text) : null;
    return { status: res.status, headers: res.headers, body };
  };
  return {
    get: (cesta: string) => volej('GET', cesta),
    post: (cesta: string, telo?: unknown) => volej('POST', cesta, telo),
    put: (cesta: string, telo?: unknown) => volej('PUT', cesta, telo),
    del: (cesta: string) => volej('DELETE', cesta),
  };
}

export const firmaVstup = (prepis: Partial<NovaFirma> = {}): NovaFirma => ({ nazev: 'Testovací firma s.r.o.', ...prepis });

export const zamestnanecVstup = (firmaId: string, prepis: Partial<NovyZamestnanec> = {}): NovyZamestnanec => ({
  firmaId, jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 2400,
  nastup: '2026-01-01', ukonceni: null, prohlaseni: true, invalidita: 'ZADNA', ztpp: false, deti: [],
  statniPojistenec: false, slevaNaPojistnem: false, ucet: null, poznamka: null,
  sazby: [{ platiOd: '2026-01-01', hodinovaHal: 15000 }],
  ...prepis,
});

export const sablonaVstup = (firmaId: string, prepis: Partial<NovaSablona> = {}): NovaSablona => ({
  firmaId, nazev: 'Ranní', zacatek: '08:00', konec: '16:30', prestavkaMin: 30, barva: null, ...prepis,
});
