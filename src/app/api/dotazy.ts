// Hooky TanStack Query nad API. Klíče: ['firmy'], ['zamestnanci', firmaId], ['mesic', firmaId, rok, mesic],
// ['sablony', firmaId], ['uzaverky', firmaId, rok]; navíc ['ja'] pro ověření přihlášení.
import { QueryClient, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DovolenaZustatek, Firma, MesicData, MesicniVstup, NovaFirma, NovaSablona, NovyOdkazRozpisu, NovyZamestnanec,
  OdkazRozpisu, SablonaSmeny, UlozDny, UlozPlan, Uzaverka, VysledekPrevodu, ZamestnanecSeSazbami,
} from '../../shared/api';
import { dochazkaUlozena, pridejNeulozenouDochazku } from '../stav/neulozenaDochazka';
import { api, ApiChyba } from './klient';

const telo = (data: unknown) => JSON.stringify(data);

/** Klient dotazů appky: neopakuje chyby, které opakováním nezmizí (4xx, nenastavený přístup). */
export function vytvorKlientaDotazu(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (pokus, chyba) => pokus < 2 && chyba instanceof ApiChyba && (chyba.kod === 'SIT' || chyba.kod === 'NEZNAMA'),
      },
      mutations: { retry: false },
    },
  });
}

/* ---- Dotazy ---- */

export function useJa() {
  // Přihlášený e-mail se při návratu do okna nemění; vypršení přihlášení pozná každý další dotaz.
  return useQuery({ queryKey: ['ja'], queryFn: () => api<{ email: string }>('/ja'), refetchOnWindowFocus: false });
}

export function useFirmy() {
  return useQuery({ queryKey: ['firmy'], queryFn: () => api<Firma[]>('/firmy') });
}

export function useZamestnanci(firmaId: string | undefined) {
  return useQuery({
    queryKey: ['zamestnanci', firmaId],
    queryFn: () => api<ZamestnanecSeSazbami[]>(`/firmy/${firmaId}/zamestnanci`),
    enabled: !!firmaId,
  });
}

export function useMesic(firmaId: string | undefined, rok: number, mesic: number) {
  return useQuery({
    queryKey: ['mesic', firmaId, rok, mesic],
    queryFn: () => api<MesicData>(`/firmy/${firmaId}/mesic/${rok}/${mesic}`),
    enabled: !!firmaId,
  });
}

/** Data několika měsíců najednou (stejný klíč i dotaz jako `useMesic`), např. pro týden přes hranici měsíce. */
export function useMesice(firmaId: string | undefined, mesice: { rok: number; mesic: number }[]) {
  return useQueries({
    queries: mesice.map(({ rok, mesic }) => ({
      queryKey: ['mesic', firmaId, rok, mesic],
      queryFn: () => api<MesicData>(`/firmy/${firmaId}/mesic/${rok}/${mesic}`),
      enabled: !!firmaId,
    })),
  });
}

export function useSablony(firmaId: string | undefined) {
  return useQuery({
    queryKey: ['sablony', firmaId],
    queryFn: () => api<SablonaSmeny[]>(`/firmy/${firmaId}/sablony`),
    enabled: !!firmaId,
  });
}

/** Platné odkazy na veřejný rozpis (tablety první); zrušené API nevrací. */
export function useOdkazyRozpisu(firmaId: string | undefined) {
  return useQuery({
    queryKey: ['odkazyRozpisu', firmaId],
    queryFn: () => api<OdkazRozpisu[]>(`/firmy/${firmaId}/odkazy-rozpisu`),
    enabled: !!firmaId,
  });
}

export function useUzaverky(firmaId: string | undefined, rok: number) {
  return useQuery({
    queryKey: ['uzaverky', firmaId, rok],
    queryFn: () => api<Uzaverka[]>(`/firmy/${firmaId}/uzaverky?rok=${rok}`),
    enabled: !!firmaId,
  });
}

/* ---- Mutace ---- */

export function useUlozFirmu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: NovaFirma }) =>
      id ? api<Firma>(`/firmy/${id}`, { method: 'PUT', body: telo(data) }) : api<Firma>('/firmy', { method: 'POST', body: telo(data) }),
    onSuccess: (f) => Promise.all([qc.invalidateQueries({ queryKey: ['firmy'] }), qc.invalidateQueries({ queryKey: ['mesic', f.id] })]),
  });
}

export function useSmazFirmu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/firmy/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      for (const klic of ['zamestnanci', 'mesic', 'sablony', 'uzaverky']) qc.removeQueries({ queryKey: [klic, id] });
      return qc.invalidateQueries({ queryKey: ['firmy'] });
    },
  });
}

/** Obnoví všechno, co závisí na lidech firmy (seznam lidí i data měsíců). */
function obnovLidi(qc: QueryClient, firmaId: string) {
  return Promise.all([qc.invalidateQueries({ queryKey: ['zamestnanci', firmaId] }), qc.invalidateQueries({ queryKey: ['mesic', firmaId] })]);
}

export function useUlozZamestnance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: NovyZamestnanec }) =>
      id
        ? api<ZamestnanecSeSazbami>(`/zamestnanci/${id}`, { method: 'PUT', body: telo(data) })
        : api<ZamestnanecSeSazbami>('/zamestnanci', { method: 'POST', body: telo(data) }),
    onSuccess: (z) => obnovLidi(qc, z.firmaId),
  });
}

export function useSmazZamestnance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; firmaId: string }) => api<void>(`/zamestnanci/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, { firmaId }) => obnovLidi(qc, firmaId),
  });
}

/** `kdo` = čí docházka, česky (do hlášky, když se změna neuloží); na server se neposílá. */
export type UlozDnyPromenne = UlozDny & { firmaId: string; kdo?: string };

const klicMesice = (rok: number, mesic: number) => `${String(rok).padStart(4, '0')}-${String(mesic).padStart(2, '0')}`;

/** Promítne uložení dnů do dat měsíce; ta nesou dny svého a předchozího měsíce, jiné dny se do nich nepřidají. */
function promitniDny(data: MesicData, zmena: UlozDny): MesicData {
  const predchozi = data.mesic === 1 ? klicMesice(data.rok - 1, 12) : klicMesice(data.rok, data.mesic - 1);
  const rozsah = new Set([klicMesice(data.rok, data.mesic), predchozi]);
  const dotcena = new Set([...(zmena.smazat ?? []), ...zmena.dny.map((d) => d.datum)]);
  const zustavaji = data.dny.filter((d) => d.zamestnanecId !== zmena.zamestnanecId || !dotcena.has(d.datum));
  const nove = zmena.dny.filter((d) => rozsah.has(d.datum.slice(0, 7))).map((d) => ({ ...d, zamestnanecId: zmena.zamestnanecId }));
  // Stejné řazení jako server: datum, pak zaměstnanec.
  const dny = [...zustavaji, ...nove].sort((a, b) => a.datum.localeCompare(b.datum) || a.zamestnanecId.localeCompare(b.zamestnanecId));
  return { ...data, dny };
}

export const KLIC_ULOZ_DNY = ['dny', 'uloz'];
export const KLIC_ULOZ_VSTUP = ['vstupy', 'uloz'];

/** Proč se změna neuložila, česky (do hlášky o neuložených změnách). */
export function duvodNeulozeni(chyba: unknown): string {
  if (chyba instanceof ApiChyba && chyba.kod === 'MESIC_UZAVREN') return 'Měsíc je uzavřený — změnu nejde uložit.';
  return chyba instanceof ApiChyba ? chyba.zprava : 'Neznámá chyba.';
}

/** Pořadí posledního odeslání každého dne člověka: výsledek staršího uložení nesmí přebít novější změnu téhož dne. */
const posledniOdeslani = new Map<string, number>();
let poradiOdeslani = 0;
const klicDne = (zamestnanecId: string, datum: string) => `${zamestnanecId}|${datum}`;

/** Část změny, kterou mezitím nepřebilo novější odeslání týchž dnů. */
function jenNejnovejsi(zmena: UlozDny, poradi: number): UlozDny | null {
  const plati = (datum: string) => posledniOdeslani.get(klicDne(zmena.zamestnanecId, datum)) === poradi;
  const dny = zmena.dny.filter((d) => plati(d.datum));
  const smazat = (zmena.smazat ?? []).filter(plati);
  if (dny.length === 0 && smazat.length === 0) return null;
  return { zamestnanecId: zmena.zamestnanecId, dny, ...(smazat.length > 0 ? { smazat } : {}) };
}

/**
 * Uloží dny docházky; cache všech načtených měsíců firmy se přepíše hned a při chybě vrátí. Znovu se načte
 * až po poslední rozdělané mutaci, jinak by obnova po první z rychlých uložení na chvíli vrátila starý stav.
 * Neuložená změna se neztratí: jde do `neulozenaDochazka` (hláška se „Zkusit znovu" na každé stránce, i po odchodu).
 */
export function useUlozDny() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: KLIC_ULOZ_DNY,
    mutationFn: ({ firmaId: _firmaId, kdo: _kdo, ...zmena }: UlozDnyPromenne) => api<{ ok: true }>('/dny', { method: 'PUT', body: telo(zmena) }),
    onMutate: async ({ firmaId, kdo: _kdo, ...zmena }) => {
      const poradi = ++poradiOdeslani;
      for (const datum of [...zmena.dny.map((d) => d.datum), ...(zmena.smazat ?? [])]) posledniOdeslani.set(klicDne(zmena.zamestnanecId, datum), poradi);
      await qc.cancelQueries({ queryKey: ['mesic', firmaId] });
      const puvodni = qc.getQueriesData<MesicData>({ queryKey: ['mesic', firmaId] });
      qc.setQueriesData<MesicData>({ queryKey: ['mesic', firmaId] }, (data) => (data ? promitniDny(data, zmena) : data));
      return { puvodni, poradi };
    },
    onSuccess: (_data, { firmaId: _firmaId, kdo: _kdo, ...zmena }, vysledek) => {
      const ulozena = jenNejnovejsi(zmena, vysledek.poradi);
      if (ulozena) dochazkaUlozena(ulozena);
    },
    onError: (chyba, { firmaId, kdo, ...zmena }, vysledek) => {
      for (const [klic, data] of vysledek?.puvodni ?? []) qc.setQueryData(klic, data);
      const neulozena = vysledek ? jenNejnovejsi(zmena, vysledek.poradi) : zmena;
      if (neulozena) pridejNeulozenouDochazku({ firmaId, kdo: kdo ?? '', zmena: neulozena, duvod: duvodNeulozeni(chyba) });
    },
    // Uvnitř `onSettled` se dokončovaná mutace ještě počítá jako běžící, proto „poslední" znamená 1.
    onSettled: (_data, _chyba, { firmaId }) =>
      qc.isMutating({ mutationKey: KLIC_ULOZ_DNY }) === 1 ? qc.invalidateQueries({ queryKey: ['mesic', firmaId] }) : undefined,
  });
}

export function useUlozVstup() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: KLIC_ULOZ_VSTUP,
    mutationFn: ({ firmaId: _firmaId, ...vstup }: MesicniVstup & { firmaId: string }) =>
      api<MesicniVstup>('/vstupy', { method: 'PUT', body: telo(vstup) }),
    onSuccess: (_v, { firmaId }) => qc.invalidateQueries({ queryKey: ['mesic', firmaId] }),
  });
}

export function useUlozDovolenou() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ firmaId: _firmaId, ...zustatek }: DovolenaZustatek & { firmaId: string }) =>
      api<DovolenaZustatek>('/dovolena', { method: 'PUT', body: telo(zustatek) }),
    onSuccess: (_v, { firmaId }) => qc.invalidateQueries({ queryKey: ['mesic', firmaId] }),
  });
}

type MesicFirmy = { firmaId: string; rok: number; mesic: number };

/** Uzavření měsíce mění i sousední měsíce (čtvrtletní uzávěrky, přenos hodin DPP), proto se obnoví všechny měsíce firmy. */
function obnovUzaverku(qc: QueryClient, { firmaId, rok }: MesicFirmy) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['mesic', firmaId] }),
    qc.invalidateQueries({ queryKey: ['uzaverky', firmaId, rok] }),
  ]);
}

export function useUzavri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ firmaId, rok, mesic }: MesicFirmy) => api<Uzaverka>(`/firmy/${firmaId}/uzaverka/${rok}/${mesic}`, { method: 'POST' }),
    onSuccess: (_u, m) => obnovUzaverku(qc, m),
  });
}

export function useOtevri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ firmaId, rok, mesic }: MesicFirmy) => api<void>(`/firmy/${firmaId}/uzaverka/${rok}/${mesic}`, { method: 'DELETE' }),
    onSuccess: (_v, m) => obnovUzaverku(qc, m),
  });
}

/** Šablony jsou i v datech měsíce (`MesicData.sablony`), proto se obnoví obojí. */
function obnovSablony(qc: QueryClient, firmaId: string) {
  return Promise.all([qc.invalidateQueries({ queryKey: ['sablony', firmaId] }), qc.invalidateQueries({ queryKey: ['mesic', firmaId] })]);
}

export function useUlozSablonu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: NovaSablona }) =>
      id
        ? api<SablonaSmeny>(`/sablony/${id}`, { method: 'PUT', body: telo(data) })
        : api<SablonaSmeny>('/sablony', { method: 'POST', body: telo(data) }),
    onSuccess: (s) => obnovSablony(qc, s.firmaId),
  });
}

export function useSmazSablonu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; firmaId: string }) => api<void>(`/sablony/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, { firmaId }) => obnovSablony(qc, firmaId),
  });
}

export function useVytvorOdkazRozpisu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NovyOdkazRozpisu) => api<OdkazRozpisu>('/odkazy-rozpisu', { method: 'POST', body: telo(data) }),
    onSuccess: (_o, { firmaId }) => qc.invalidateQueries({ queryKey: ['odkazyRozpisu', firmaId] }),
  });
}

export function useZrusOdkazRozpisu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; firmaId: string }) => api<void>(`/odkazy-rozpisu/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, { firmaId }) => qc.invalidateQueries({ queryKey: ['odkazyRozpisu', firmaId] }),
  });
}

export function useUlozPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ firmaId: _firmaId, ...plan }: UlozPlan & { firmaId: string }) =>
      api<{ ok: true }>('/plan', { method: 'PUT', body: telo(plan) }),
    onSuccess: (_v, { firmaId }) => qc.invalidateQueries({ queryKey: ['mesic', firmaId] }),
  });
}

/**
 * Uloží plán víc lidí najednou (kopie týdne, vyplnění měsíce): jeden `PUT /plan` na člověka, souběžně. Data měsíců se
 * obnoví jednou na konci, i když část uložení selže, aby rozpis ukázal, co se opravdu uložilo.
 */
export function useUlozPlany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ firmaId: _firmaId, plany }: { firmaId: string; plany: UlozPlan[] }) => {
      await Promise.all(plany.map((plan) => api<{ ok: true }>('/plan', { method: 'PUT', body: telo(plan) })));
    },
    onSettled: (_v, _chyba, { firmaId }) => qc.invalidateQueries({ queryKey: ['mesic', firmaId] }),
  });
}

export function usePrevedPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ firmaId, rok, mesic }: MesicFirmy) =>
      api<VysledekPrevodu>(`/firmy/${firmaId}/plan/${rok}/${mesic}/prevest`, { method: 'POST' }),
    onSuccess: (_v, { firmaId }) => qc.invalidateQueries({ queryKey: ['mesic', firmaId] }),
  });
}

export function useDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Firma>('/demo', { method: 'POST', body: telo({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firmy'] }),
  });
}
