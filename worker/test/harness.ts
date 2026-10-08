import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { sRozpoctem } from '../db/klient';
import { vytvorApp } from '../index';
import type { Prostredi } from '../env';

const SLOZKA_MIGRACI = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** Všechny migrace v abecedním pořadí, rozdělené na jednotlivé příkazy (CRLF i LF). */
export function nactiMigrace(): string[] {
  return readdirSync(SLOZKA_MIGRACI)
    .filter((soubor) => soubor.endsWith('.sql'))
    .sort()
    .flatMap((soubor) => readFileSync(SLOZKA_MIGRACI + soubor, 'utf8').split('--> statement-breakpoint'))
    .map((prikaz) => prikaz.trim())
    .filter((prikaz) => prikaz.length > 0);
}

/** `app.request` na `/api` + cesta, s daným prostředím. */
export function api(app: ReturnType<typeof vytvorApp>, env: Prostredi) {
  return (cesta: string, init?: RequestInit) => app.request('/api' + cesta, init, env);
}

/** Aplikace nad čistou Miniflare D1 s aplikovanými migracemi a `DEV_BYPASS`. Po testu zavolej `zavri()`. */
export async function vytvorTestovaciApp() {
  // Miniflare 5 přijímá přímo jen nízkoúrovňový tvar (`workers: [...]`); plochý tvar jako ve wrangleru jde přes convertV4MiniflareOptions.
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("") } }',
    d1Databases: { DB: 'test-' + crypto.randomUUID() },
  }));
  try {
    const surovaDB = await mf.getD1Database('DB');
    for (const prikaz of nactiMigrace()) await surovaDB.prepare(prikaz).run();
    // Počítadlo bez limitu: testy přes něj měří, kolik příkazů D1 stál celý požadavek (viz `prikazy()`).
    const DB = sRozpoctem(surovaDB, Infinity);
    const env: Prostredi = { DB, DEV_BYPASS: '1', ALLOWED_EMAILS: 'majitel@example.cz,kancelar@example.cz' };
    const app = vytvorApp();
    /** Počet příkazů D1 (včetně těch v dávkách), které vyvolá `akce`. */
    const prikazy = async (akce: () => Promise<unknown>) => {
      const pred = DB.pocetPrikazu();
      await akce();
      return DB.pocetPrikazu() - pred;
    };
    return { app, env, fetchApi: api(app, env), prikazy, zavri: () => mf.dispose() };
  } catch (chyba) {
    await mf.dispose();
    throw chyba;
  }
}
