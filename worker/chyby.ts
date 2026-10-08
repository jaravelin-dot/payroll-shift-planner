import type { ErrorHandler } from 'hono';
import { z } from 'zod';
import type { KodChyby } from '../src/shared/api';

/** Očekávaná chyba API: handler ji jen vyhodí, `chybaApi` z ní složí odpověď `{ chyba, zprava? }`. */
export class ChybaApi extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly kod: KodChyby, readonly zprava?: string) {
    super(zprava ?? kod);
  }
}

// 404 a 409 nesou jen kód (texty podle kódu skládá appka); zprava je jen u 400.
export const nenalezeno = () => new ChybaApi(404, 'NENALEZENO');
export const neplatnyVstup = (zprava: string) => new ChybaApi(400, 'NEPLATNY_VSTUP', zprava);
export const mesicUzavren = () => new ChybaApi(409, 'MESIC_UZAVREN');

/** Zkontroluje data zodem; chyba → 400 NEPLATNY_VSTUP se zprávou ze všech porušení. */
export function over<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const vysledek = schema.safeParse(data);
  if (vysledek.success) return vysledek.data;
  throw neplatnyVstup(vysledek.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; '));
}

/** Načte JSON tělo požadavku a zkontroluje ho schématem. */
export async function nactiTelo<T extends z.ZodType>(req: { json(): Promise<unknown> }, schema: T): Promise<z.output<T>> {
  let data: unknown;
  try { data = await req.json(); } catch { throw neplatnyVstup('Tělo požadavku není platný JSON.'); }
  return over(schema, data);
}

/** `app.onError`: ChybaApi → JSON, ostatní chyby jako výchozí chování Hona (500). */
export const chybaApi: ErrorHandler = (chyba, c) => {
  if (chyba instanceof ChybaApi) return c.json(chyba.zprava === undefined ? { chyba: chyba.kod } : { chyba: chyba.kod, zprava: chyba.zprava }, chyba.status);
  if ('getResponse' in chyba && typeof chyba.getResponse === 'function') return chyba.getResponse();
  console.error(chyba);
  return c.text('Internal Server Error', 500);
};
