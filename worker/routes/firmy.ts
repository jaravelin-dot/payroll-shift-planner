// Rozpočet příkazů D1 na požadavek (limit 50, počítá se i každý příkaz v dávce; hlídá ho `db()` v db/klient.ts):
//   GET /firmy 1 · POST /firmy 1 · PUT /firmy/:id 2 · DELETE /firmy/:id 1 (kaskáda běží uvnitř D1) · POST /demo 10 (viz demo.ts).
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { nactiTelo, nenalezeno, neplatnyVstup, over } from '../chyby';
import { db } from '../db/klient';
import { firma } from '../db/schema';
import { vytvorDemo } from '../demo';
import type { HonoTypy } from '../pristup';
import { naFirmu, radekFirmy, zmenyFirmy } from '../prevody';
import { demoTelo, novaFirma, upravaFirmy } from '../schemata';

export const firmy = new Hono<HonoTypy>();

firmy.get('/firmy', async (c) => {
  const radky = await db(c.env).select().from(firma).orderBy(asc(firma.vytvoreno), asc(firma.nazev), asc(firma.id));
  return c.json(radky.map(naFirmu));
});

firmy.post('/firmy', async (c) => {
  const radek = { id: crypto.randomUUID(), ...radekFirmy(await nactiTelo(c.req, novaFirma)), vytvoreno: new Date().toISOString() };
  await db(c.env).insert(firma).values(radek);
  return c.json(naFirmu(radek), 201);
});

// PUT mění jen to, co v těle je: vynechané ico/adresa/ucet a nastaveni zůstanou, výslovné null vymaže ico/adresu/účet,
// zadané (částečné) nastaveni se sloučí přes uložené ({ ...uložené, ...nové }). Rozpočet D1: 2 příkazy (čtení + update).
firmy.put('/firmy/:id', async (c) => {
  const d = db(c.env);
  const id = c.req.param('id');
  const vstup = await nactiTelo(c.req, upravaFirmy);
  const [puvodni] = await d.select().from(firma).where(eq(firma.id, id));
  if (!puvodni) throw nenalezeno();
  const [radek] = await d.update(firma).set(zmenyFirmy(puvodni, vstup)).where(eq(firma.id, id)).returning();
  if (!radek) throw nenalezeno();
  return c.json(naFirmu(radek));
});

firmy.delete('/firmy/:id', async (c) => {
  const smazane = await db(c.env).delete(firma).where(eq(firma.id, c.req.param('id'))).returning({ id: firma.id });
  if (smazane.length === 0) throw nenalezeno();
  return c.body(null, 204);
});

// Ukázková data se založí pro aktuální měsíc (UTC datum serveru). `{ rok, mesic }` v JSON těle měsíc přepíše — jen kvůli
// deterministickým testům, appka posílá `{}`.
firmy.post('/demo', async (c) => {
  const text = await c.req.text();
  const ted = new Date();
  let mesic = { rok: ted.getUTCFullYear(), mesic: ted.getUTCMonth() + 1 };
  if (text.trim()) {
    let telo: unknown;
    try { telo = JSON.parse(text); } catch { throw neplatnyVstup('Tělo požadavku není platný JSON.'); }
    const zadany = over(demoTelo, telo);
    if (zadany.rok !== undefined && zadany.mesic !== undefined) mesic = { rok: zadany.rok, mesic: zadany.mesic };
  }
  return c.json(await vytvorDemo(db(c.env), mesic.rok, mesic.mesic), 201);
});
