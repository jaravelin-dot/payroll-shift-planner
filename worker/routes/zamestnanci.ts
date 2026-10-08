// Rozpočet příkazů D1 na požadavek (limit 50, počítá se i každý příkaz v dávce; hlídá ho `db()` v db/klient.ts).
// Sazby (max 100, 4 sloupce → 25 řádků na příkaz) se vkládají vícerádkově po blocích, takže celé volání stojí nejvýš:
//   GET /firmy/:id/zamestnanci 3 · POST /zamestnanci 9 (firma + zaměstnanec + 4× sazby + 2× čtení + šablony střídání)
//   · PUT /zamestnanci/:id 10 (původní + update + delete sazeb + 4× sazby + 2× čtení + šablony střídání) · DELETE /zamestnanci/:id 1.
import { and, asc, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import type { ZamestnanecSeSazbami } from '../../src/shared/api';
import { nactiTelo, nenalezeno, neplatnyVstup } from '../chyby';
import { vlozRadky } from '../db/davky';
import { davka, db, type Db } from '../db/klient';
import { firma, sablonaSmeny, sazba, zamestnanec } from '../db/schema';
import type { HonoTypy } from '../pristup';
import { radekZamestnance, radkySazeb, sSazbami } from '../prevody';
import { novyZamestnanec } from '../schemata';

export const zamestnanci = new Hono<HonoTypy>();

/** Zaměstnanci vyhovující podmínce (sloupce tabulky `zamestnanec`) i s jejich sazbami. */
async function nactiSeSazbami(d: Db, podminka: SQL): Promise<ZamestnanecSeSazbami[]> {
  const [lide, sazby] = await d.batch([
    d.select().from(zamestnanec).where(podminka).orderBy(asc(zamestnanec.prijmeni), asc(zamestnanec.jmeno), asc(zamestnanec.id)),
    d.select(getTableColumns(sazba)).from(sazba).innerJoin(zamestnanec, eq(sazba.zamestnanecId, zamestnanec.id)).where(podminka),
  ]);
  return sSazbami(lide, sazby);
}

/** Pevné směny musí být šablony téže firmy. Rozpočet: 1 příkaz, jen když střídání něco obsahuje. */
async function overStridani(d: Db, firmaId: string, stridani: string[] | undefined) {
  if (!stridani?.length) return;
  const nalezene = await d.select({ id: sablonaSmeny.id }).from(sablonaSmeny)
    .where(and(eq(sablonaSmeny.firmaId, firmaId), inArray(sablonaSmeny.id, [...new Set(stridani)])));
  if (nalezene.length !== new Set(stridani).size) throw neplatnyVstup('Pevná směna musí být šablona směny této firmy.');
}

zamestnanci.get('/firmy/:id/zamestnanci', async (c) => {
  const d = db(c.env);
  const firmaId = c.req.param('id');
  const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, firmaId));
  if (!existuje) throw nenalezeno();
  return c.json(await nactiSeSazbami(d, eq(zamestnanec.firmaId, firmaId)));
});

zamestnanci.post('/zamestnanci', async (c) => {
  const d = db(c.env);
  const vstup = await nactiTelo(c.req, novyZamestnanec);
  const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, vstup.firmaId));
  if (!existuje) throw nenalezeno();
  await overStridani(d, vstup.firmaId, vstup.stridaniSmen);
  const id = crypto.randomUUID();
  await davka(d, [d.insert(zamestnanec).values(radekZamestnance(id, vstup)), ...vlozRadky(d, sazba, radkySazeb(id, vstup))]);
  return c.json((await nactiSeSazbami(d, eq(zamestnanec.id, id)))[0], 201);
});

// Sazby se nahradí celé (staré se smažou, nové dostanou nová id). Zaměstnance nelze přesunout do jiné firmy.
// Vynechané `aktivni` ponechá uloženou hodnotu (neaktivní zaměstnanec se úpravou sám nevrátí).
zamestnanci.put('/zamestnanci/:id', async (c) => {
  const d = db(c.env);
  const id = c.req.param('id');
  const vstup = await nactiTelo(c.req, novyZamestnanec);
  const [puvodni] = await d.select({ firmaId: zamestnanec.firmaId, aktivni: zamestnanec.aktivni, rolePlanu: zamestnanec.rolePlanu, stridaniSmen: zamestnanec.stridaniSmen, poradiPodkladu: zamestnanec.poradiPodkladu, vPodkladu: zamestnanec.vPodkladu }).from(zamestnanec).where(eq(zamestnanec.id, id));
  if (!puvodni) throw nenalezeno();
  if (puvodni.firmaId !== vstup.firmaId) throw neplatnyVstup('Zaměstnance nelze přesunout do jiné firmy.');
  await overStridani(d, vstup.firmaId, vstup.stridaniSmen);
  await davka(d, [
    d.update(zamestnanec).set(radekZamestnance(id, vstup, puvodni.aktivni, puvodni)).where(eq(zamestnanec.id, id)),
    d.delete(sazba).where(eq(sazba.zamestnanecId, id)),
    ...vlozRadky(d, sazba, radkySazeb(id, vstup)),
  ]);
  return c.json((await nactiSeSazbami(d, eq(zamestnanec.id, id)))[0]);
});

zamestnanci.delete('/zamestnanci/:id', async (c) => {
  const smazane = await db(c.env).delete(zamestnanec).where(eq(zamestnanec.id, c.req.param('id'))).returning({ id: zamestnanec.id });
  if (smazane.length === 0) throw nenalezeno();
  return c.body(null, 204);
});
