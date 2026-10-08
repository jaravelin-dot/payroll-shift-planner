import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Prostredi } from '../env';
import * as schema from './schema';

// Limity D1 (plán Free), které Miniflare nehlídá, produkce ano:
//  - nejvýš 50 dotazů na jedno vyvolání Workeru; KAŽDÝ příkaz uvnitř `batch()` se počítá zvlášť,
//  - nejvýš 100 vázaných parametrů na jeden příkaz.
export const MAX_PRIKAZU = 50;
export const MAX_PARAMETRU = 100;

/** Obalí D1 binding počítadlem příkazů a kontrolou parametrů; po překročení limitu vyhodí chybu (v testech i v produkci). */
export function sRozpoctem(d1: D1Database, limit = MAX_PRIKAZU): D1Database & { pocetPrikazu(): number } {
  let pouzito = 0;
  // Drizzle z bindingu používá jen `prepare(sql).bind(...)` a `batch(...)`; příkaz se počítá při `bind`, tedy právě jednou
  // za každé skutečné provedení (`prepare` bez `bind` se v dávce u příkazů bez parametrů zahodí a nic nestojí).
  return {
    prepare: (sql: string) => ({
      bind: (...hodnoty: unknown[]) => {
        if (hodnoty.length > MAX_PARAMETRU) throw new Error(`Příkaz má ${hodnoty.length} vázaných parametrů, limit D1 je ${MAX_PARAMETRU}.`);
        if (++pouzito > limit) throw new Error(`Požadavek překročil limit D1 ${limit} příkazů (včetně příkazů v dávkách).`);
        return d1.prepare(sql).bind(...hodnoty);
      },
    }),
    batch: (prikazy: D1PreparedStatement[]) => d1.batch(prikazy),
    pocetPrikazu: () => pouzito,
  } as unknown as D1Database & { pocetPrikazu(): number };
}

/** Jedno volání `db()` = jeden požadavek = jeden rozpočet 50 příkazů (každý handler ho volá jednou, nevolejte ho víckrát). */
export const db = (env: Prostredi) => drizzle(sRozpoctem(env.DB), { schema });
export type Db = ReturnType<typeof db>;

/** Provede dotazy v jedné D1 dávce (atomicky, jedna cesta po síti); prázdný seznam nedělá nic, víc než 50 příkazů je chyba. */
export async function davka(dbi: Db, dotazy: BatchItem<'sqlite'>[]): Promise<void> {
  if (dotazy.length === 0) return;
  if (dotazy.length > MAX_PRIKAZU) throw new Error(`Dávka má ${dotazy.length} příkazů, limit D1 je ${MAX_PRIKAZU}.`);
  await dbi.batch(dotazy as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}
