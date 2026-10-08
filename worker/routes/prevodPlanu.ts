// Převod plánu směn do docházky (`POST /firmy/:id/plan/:rok/:mesic/prevest`). Nic nepřepíše: den, který už v docházce je, přeskočí.
// Rozpočet příkazů D1 (limit 50 na požadavek, viz db/klient.ts): 1 dávka 5 čtení (firma, uzávěrka, lidé, plán, docházka)
// + INSERT po 25 dnech. Den váže jen 4 parametry (kasa a poznámka jsou vždy false/null, jdou jako konstanty v SQL), takže
// 20 lidí × 31 dní = 620 dní stojí 25 příkazů, celkem 30; do 50 se vejde až 36 lidí s celým měsícem.
import { and, between, eq, getTableColumns, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { dnyMesice } from '../../src/core/kalendar';
import { prevedPlan } from '../../src/core/plan';
import type { VysledekPrevodu } from '../../src/shared/api';
import { mesicUzavren, nenalezeno, over } from '../chyby';
import { bloky, radkuVBloku } from '../db/davky';
import { davka, db } from '../db/klient';
import { den, firma, planSmeny, uzaverka, zamestnanec } from '../db/schema';
import type { HonoTypy } from '../pristup';
import { rokMesicVCeste } from '../schemata';

export const prevodPlanu = new Hono<HonoTypy>();

const PARAMETRU_NA_DEN = 4; // zamestnanecId, datum, typ, minuty

prevodPlanu.post('/firmy/:id/plan/:rok/:mesic/prevest', async (c) => {
  const { rok, mesic } = over(rokMesicVCeste, c.req.param());
  const firmaId = c.req.param('id');
  const d = db(c.env);
  const dny = dnyMesice(rok, mesic);
  const [prvniDen, posledniDen] = [dny[0], dny[dny.length - 1]];
  const patriFirme = eq(zamestnanec.firmaId, firmaId);

  const [firmy, uzaverky, lide, plan, existujici] = await d.batch([
    d.select({ id: firma.id }).from(firma).where(eq(firma.id, firmaId)),
    d.select({ mesic: uzaverka.mesic }).from(uzaverka).where(and(eq(uzaverka.firmaId, firmaId), eq(uzaverka.rok, rok), eq(uzaverka.mesic, mesic))),
    d.select({ id: zamestnanec.id, smlouva: zamestnanec.smlouva, nastup: zamestnanec.nastup, ukonceni: zamestnanec.ukonceni }).from(zamestnanec).where(patriFirme),
    d.select(getTableColumns(planSmeny)).from(planSmeny).innerJoin(zamestnanec, eq(planSmeny.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, between(planSmeny.datum, prvniDen, posledniDen))),
    d.select(getTableColumns(den)).from(den).innerJoin(zamestnanec, eq(den.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, between(den.datum, prvniDen, posledniDen))),
  ]);
  if (firmy.length === 0) throw nenalezeno();
  if (uzaverky.length > 0) throw mesicUzavren();

  const prevod = prevedPlan(plan, existujici, lide);
  // `planNaDny` vrací dny vždy bez kasy a poznámky. Kdyby mezi čtením a zápisem někdo den zapsal ručně, vyhraje jeho záznam.
  await davka(d, bloky(prevod.dny, radkuVBloku(PARAMETRU_NA_DEN)).map((blok) =>
    d.insert(den)
      .values(blok.map((x) => ({ zamestnanecId: x.zamestnanecId, datum: x.datum, typ: x.typ, minuty: x.minuty, kasa: sql`0`, poznamka: sql`null` })))
      .onConflictDoNothing()));

  const vysledek: VysledekPrevodu = { vytvoreno: prevod.dny.length, preskoceno: prevod.preskoceno, preskocenoDpp: prevod.preskocenoDpp, mimoPomer: prevod.mimoPomer };
  return c.json(vysledek);
});
