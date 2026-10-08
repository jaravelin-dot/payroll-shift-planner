// Rozpočet příkazů D1 na požadavek (limit 50, počítá se i každý příkaz v dávce, max. 100 parametrů na příkaz; hlídá ho `db()` v db/klient.ts):
//   GET /firmy/:id/sablony 2 · POST /sablony 2 · PUT /sablony/:id 2
//   · DELETE /sablony/:id 3 v jedné dávce (střídání lidí firmy + šablony plánovače ve firmě + smazání šablony)
//   · PUT /plan 27 v nejhorším případě 400 položek + 400 dat ke smazání (zaměstnanec + šablony firmy + 5× DELETE po 99 datech + 20× INSERT po 20 položkách).
// Převod plánu do docházky (`POST /firmy/:id/plan/:rok/:mesic/prevest`, úkol 13) musí zapisovat po blocích z db/davky.ts, ne po řádku.
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { nactiTelo, nenalezeno, neplatnyVstup } from '../chyby';
import { smazHodnoty, vlozNeboPrepis } from '../db/davky';
import { davka, db } from '../db/klient';
import { firma, planSmeny, sablonaSmeny, zamestnanec } from '../db/schema';
import type { HonoTypy } from '../pristup';
import { novaSablona, ulozPlan } from '../schemata';

export const smeny = new Hono<HonoTypy>();

smeny.get('/firmy/:id/sablony', async (c) => {
  const d = db(c.env);
  const firmaId = c.req.param('id');
  const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, firmaId));
  if (!existuje) throw nenalezeno();
  return c.json(await d.select().from(sablonaSmeny).where(eq(sablonaSmeny.firmaId, firmaId)).orderBy(asc(sablonaSmeny.nazev), asc(sablonaSmeny.id)));
});

smeny.post('/sablony', async (c) => {
  const d = db(c.env);
  const vstup = await nactiTelo(c.req, novaSablona);
  const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, vstup.firmaId));
  if (!existuje) throw nenalezeno();
  const radek = { id: crypto.randomUUID(), ...vstup };
  await d.insert(sablonaSmeny).values(radek);
  return c.json(radek, 201);
});

// Šablonu nelze úpravou přesunout do jiné firmy.
smeny.put('/sablony/:id', async (c) => {
  const d = db(c.env);
  const id = c.req.param('id');
  const vstup = await nactiTelo(c.req, novaSablona);
  const [puvodni] = await d.select({ firmaId: sablonaSmeny.firmaId }).from(sablonaSmeny).where(eq(sablonaSmeny.id, id));
  if (!puvodni) throw nenalezeno();
  if (puvodni.firmaId !== vstup.firmaId) throw neplatnyVstup('Šablonu nelze přesunout do jiné firmy.');
  const radek = { id, ...vstup };
  await d.update(sablonaSmeny).set(vstup).where(eq(sablonaSmeny.id, id));
  return c.json(radek);
});

// Plán směn odkazující na smazanou šablonu zůstane (sablonaId se vynuluje, minuty zůstanou). Šablona zmizí i ze střídání
// (pevných směn) lidí její firmy, pořadí ostatních zůstane, a ze šablon plánovače ve firmě; jinak by uložení člověka narazilo
// na kontrolu pevných směn. Firma se bere ze šablony, takže u neexistující šablony dávka nic nezmění.
smeny.delete('/sablony/:id', async (c) => {
  const d = db(c.env);
  const id = c.req.param('id');
  const firmaSablony = sql`(select ${sablonaSmeny.firmaId} from ${sablonaSmeny} where ${sablonaSmeny.id} = ${id})`;
  const bezSablony = (pole: SQL) => sql`(select json_group_array(value) from json_each(${pole}) where value <> ${id})`;
  const obsahuje = (pole: SQL) => sql`exists (select 1 from json_each(${pole}) where value = ${id})`;
  const stridani = sql`${zamestnanec.stridaniSmen}`;
  const planovacSablony = sql`${firma.nastaveni}, '$.planovacSablony'`;
  const [, , smazane] = await d.batch([
    d.update(zamestnanec).set({ stridaniSmen: bezSablony(stridani) })
      .where(and(eq(zamestnanec.firmaId, firmaSablony), obsahuje(stridani))),
    d.update(firma).set({ nastaveni: sql`json_set(${firma.nastaveni}, '$.planovacSablony', json(${bezSablony(planovacSablony)}))` })
      .where(and(eq(firma.id, firmaSablony), obsahuje(planovacSablony))),
    d.delete(sablonaSmeny).where(eq(sablonaSmeny.id, id)).returning({ id: sablonaSmeny.id }),
  ]);
  if (smazane.length === 0) throw nenalezeno();
  return c.body(null, 204);
});

// `polozky` je upsert (zaměstnanec + datum), `smazat` seznam dat ke smazání (provede se dřív).
// Odkazované šablony musí existovat a patřit firmě zaměstnance. Plán na uzavřený měsíc se neblokuje.
smeny.put('/plan', async (c) => {
  const d = db(c.env);
  const vstup = await nactiTelo(c.req, ulozPlan);
  const [osoba] = await d.select({ firmaId: zamestnanec.firmaId }).from(zamestnanec).where(eq(zamestnanec.id, vstup.zamestnanecId));
  if (!osoba) throw nenalezeno();
  const sablonyFirmy = new Set((await d.select({ id: sablonaSmeny.id }).from(sablonaSmeny).where(eq(sablonaSmeny.firmaId, osoba.firmaId))).map((s) => s.id));
  if (vstup.polozky.some((p) => p.sablonaId !== null && !sablonyFirmy.has(p.sablonaId))) throw nenalezeno();
  const smazat = vstup.smazat ?? [];
  await davka(d, [
    ...smazHodnoty(d, planSmeny, planSmeny.zamestnanecId, vstup.zamestnanecId, planSmeny.datum, smazat),
    ...vlozNeboPrepis(d, planSmeny, vstup.polozky.map((p) => ({ zamestnanecId: vstup.zamestnanecId, ...p })), [planSmeny.zamestnanecId, planSmeny.datum]),
  ]);
  return c.json({ ok: true });
});
