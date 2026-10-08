// Hromadné zápisy do D1 po blocích. D1 (plán Free) povoluje nejvýš 50 příkazů na požadavek a 100 vázaných parametrů na příkaz,
// takže řádky se vkládají vícerádkovým `INSERT … VALUES (…),(…)` a mazání se dělá `DELETE … WHERE … IN (…)`; blok má tolik řádků,
// aby se vešel do 100 parametrů (6 sloupců → 16 řádků, 400 řádků → 25 příkazů).
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { MAX_PARAMETRU, type Db } from './klient';

/** Kolik řádků o `sloupcu` sloupcích se vejde do jednoho příkazu (nejvýš 100 parametrů). */
export const radkuVBloku = (sloupcu: number) => Math.max(1, Math.floor(MAX_PARAMETRU / sloupcu));

/** Rozdělí pole na bloky po `velikost` položkách (prázdné pole → žádný blok). */
export function bloky<T>(polozky: readonly T[], velikost: number): T[][] {
  const vysledek: T[][] = [];
  for (let i = 0; i < polozky.length; i += velikost) vysledek.push(polozky.slice(i, i + velikost));
  return vysledek;
}

/**
 * Příkazy `INSERT … ON CONFLICT (klíč) DO UPDATE` po blocích; při konfliktu se přepíšou všechny ostatní sloupce hodnotami nového řádku
 * (`excluded.*`). Řádky jsou celé (všechny sloupce tabulky); pořadí řádků zůstane, při shodě klíče vyhrává poslední.
 */
export function vlozNeboPrepis<T extends SQLiteTable>(dbi: Db, tabulka: T, radky: T['$inferInsert'][], klic: SQLiteColumn[]): BatchItem<'sqlite'>[] {
  const sloupce = Object.entries(getTableColumns(tabulka));
  const set = Object.fromEntries(sloupce.filter(([, s]) => !klic.includes(s)).map(([nazev, s]) => [nazev, sql`excluded.${sql.identifier(s.name)}`]));
  return bloky(radky, radkuVBloku(sloupce.length)).map((blok) =>
    dbi.insert(tabulka).values(blok as never).onConflictDoUpdate({ target: klic, set: set as never }));
}

/** Příkazy `INSERT` po blocích (bez řešení konfliktů). */
export function vlozRadky<T extends SQLiteTable>(dbi: Db, tabulka: T, radky: T['$inferInsert'][]): BatchItem<'sqlite'>[] {
  return bloky(radky, radkuVBloku(Object.keys(getTableColumns(tabulka)).length)).map((blok) => dbi.insert(tabulka).values(blok as never));
}

/** Příkazy `DELETE … WHERE vlastnik = ? AND hodnota IN (…)` po blocích (jeden parametr zabírá vlastník, zbytek hodnoty). */
export function smazHodnoty(dbi: Db, tabulka: SQLiteTable, vlastnik: SQLiteColumn, vlastnikId: string, sloupec: SQLiteColumn, hodnoty: string[]): BatchItem<'sqlite'>[] {
  return bloky(hodnoty, MAX_PARAMETRU - 1).map((blok) => dbi.delete(tabulka).where(and(eq(vlastnik, vlastnikId), inArray(sloupec, blok))));
}
