// Rozpočet příkazů D1 na požadavek (limit 50):
//   GET /firmy/:id/odkazy-rozpisu 2 · POST /odkazy-rozpisu osobní 4 (firma + zaměstnanec + dávka update+insert), tablet 3 (firma + počet + insert)
//   · DELETE /odkazy-rozpisu/:id 1.
import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { OdkazRozpisu } from '../../src/shared/api';
import { nactiTelo, nenalezeno } from '../chyby';
import { davka, db } from '../db/klient';
import { firma, odkazRozpisu, zamestnanec } from '../db/schema';
import type { HonoTypy } from '../pristup';
import { novyOdkazRozpisu } from '../schemata';

export const odkazyRozpisu = new Hono<HonoTypy>();

/** Tajný token: 24 náhodných bajtů jako base64url (32 znaků, bez výplně). */
export function novyToken(): string {
  const bajty = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bajty)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const NAZEV_TABLETU = 'Tablet v prodejně';

// Tablet první (bez zaměstnance), pak osobní; v rámci skupiny podle vzniku. Zrušené se nevrací.
odkazyRozpisu.get('/firmy/:id/odkazy-rozpisu', async (c) => {
  const d = db(c.env);
  const firmaId = c.req.param('id');
  const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, firmaId));
  if (!existuje) throw nenalezeno();
  const radky = await d.select().from(odkazRozpisu)
    .where(and(eq(odkazRozpisu.firmaId, firmaId), isNull(odkazRozpisu.zruseno)))
    .orderBy(asc(isNotNull(odkazRozpisu.zamestnanecId)), asc(odkazRozpisu.vytvoreno), asc(odkazRozpisu.id));
  return c.json(radky.map(({ zruseno: _zruseno, ...odkaz }): OdkazRozpisu => odkaz));
});

// Osobní odkaz: nejvýš jeden platný na člověka (nový starý zruší v téže dávce). Tablet: další platné se číslují podle jejich počtu.
odkazyRozpisu.post('/odkazy-rozpisu', async (c) => {
  const d = db(c.env);
  const vstup = await nactiTelo(c.req, novyOdkazRozpisu);
  const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, vstup.firmaId));
  if (!existuje) throw nenalezeno();
  const ted = new Date().toISOString();
  const odkaz: OdkazRozpisu = { id: crypto.randomUUID(), firmaId: vstup.firmaId, zamestnanecId: vstup.zamestnanecId, token: novyToken(), nazev: NAZEV_TABLETU, vytvoreno: ted };
  if (vstup.zamestnanecId === null) {
    const [{ pocet }] = await d.select({ pocet: count() }).from(odkazRozpisu)
      .where(and(eq(odkazRozpisu.firmaId, vstup.firmaId), isNull(odkazRozpisu.zamestnanecId), isNull(odkazRozpisu.zruseno)));
    if (pocet > 0) odkaz.nazev = `${NAZEV_TABLETU} ${pocet + 1}`;
    await d.insert(odkazRozpisu).values(odkaz);
  } else {
    const [clovek] = await d.select({ jmeno: zamestnanec.jmeno, prijmeni: zamestnanec.prijmeni }).from(zamestnanec)
      .where(and(eq(zamestnanec.id, vstup.zamestnanecId), eq(zamestnanec.firmaId, vstup.firmaId)));
    if (!clovek) throw nenalezeno();
    odkaz.nazev = `${clovek.jmeno} ${clovek.prijmeni}`.trim();
    await davka(d, [
      d.update(odkazRozpisu).set({ zruseno: ted }).where(and(eq(odkazRozpisu.zamestnanecId, vstup.zamestnanecId), isNull(odkazRozpisu.zruseno))),
      d.insert(odkazRozpisu).values(odkaz),
    ]);
  }
  return c.json(odkaz, 201);
});

odkazyRozpisu.delete('/odkazy-rozpisu/:id', async (c) => {
  const zrusene = await db(c.env).update(odkazRozpisu).set({ zruseno: new Date().toISOString() })
    .where(and(eq(odkazRozpisu.id, c.req.param('id')), isNull(odkazRozpisu.zruseno))).returning({ id: odkazRozpisu.id });
  if (zrusene.length === 0) throw nenalezeno();
  return c.body(null, 204);
});
