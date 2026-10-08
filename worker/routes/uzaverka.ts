// Uzávěrka měsíce: Worker přepočítá výplaty stejným jádrem jako appka a uloží snímek výsledků; uzavřený měsíc je jen ke čtení.
// Rozpočet příkazů D1 na požadavek (limit 50): POST 12 (firma + dávka 10 čtení z `nactiMesicData` + 1 zápis celého snímku),
// odmítnutý POST 11 · DELETE 1 (2, když nic nesmaže a ověřuje firmu) · GET /uzaverky 2 (jedna dávka).
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { pripravVstup } from '../../src/core/priprava';
import { vypocitejMzdu } from '../../src/core/vypocet';
import type { UzaverkaRadek } from '../../src/shared/api';
import { mesicUzavren, nenalezeno, over } from '../chyby';
import { db } from '../db/klient';
import { firma, uzaverka } from '../db/schema';
import { nactiMesicData } from '../mesicData';
import { naUzaverku } from '../prevody';
import type { HonoTypy } from '../pristup';
import { rokMesicVCeste } from '../schemata';

export const uzaverky = new Hono<HonoTypy>();

const rokVDotazu = z.object({ rok: rokMesicVCeste.shape.rok });

uzaverky.post('/firmy/:id/uzaverka/:rok/:mesic', async (c) => {
  const { rok, mesic } = over(rokMesicVCeste, c.req.param());
  const d = db(c.env);
  const data = await nactiMesicData(d, c.req.param('id'), rok, mesic);
  if (!data) throw nenalezeno();
  if (data.uzaverka) throw mesicUzavren();

  const vysledky: UzaverkaRadek[] = data.zamestnanci.map((zam) => ({
    zamestnanecId: zam.id,
    jmeno: `${zam.jmeno} ${zam.prijmeni}`,
    smlouva: zam.smlouva,
    vysledek: vypocitejMzdu(pripravVstup(data, zam.id)),
  }));
  // Souběžné uzavření (dvojklik, dvě okna): vyhraje první zápis, druhý nic nevloží a dostane 409 jako při opakování.
  const [ulozena] = await d.insert(uzaverka)
    .values({ firmaId: data.firma.id, rok, mesic, uzavreno: new Date().toISOString(), vysledky })
    .onConflictDoNothing()
    .returning();
  if (!ulozena) throw mesicUzavren();
  return c.json(naUzaverku(ulozena), 201);
});

// Otevření je idempotentní: neuzavřený měsíc vrací taky 204; 404 jen u neexistující firmy.
uzaverky.delete('/firmy/:id/uzaverka/:rok/:mesic', async (c) => {
  const { rok, mesic } = over(rokMesicVCeste, c.req.param());
  const firmaId = c.req.param('id');
  const d = db(c.env);
  const smazane = await d.delete(uzaverka)
    .where(and(eq(uzaverka.firmaId, firmaId), eq(uzaverka.rok, rok), eq(uzaverka.mesic, mesic)))
    .returning({ rok: uzaverka.rok });
  if (smazane.length === 0) {
    const [existuje] = await d.select({ id: firma.id }).from(firma).where(eq(firma.id, firmaId));
    if (!existuje) throw nenalezeno();
  }
  return c.body(null, 204);
});

uzaverky.get('/firmy/:id/uzaverky', async (c) => {
  const { rok } = over(rokVDotazu, { rok: c.req.query('rok') });
  const firmaId = c.req.param('id');
  const d = db(c.env);
  const [firmy, radky] = await d.batch([
    d.select({ id: firma.id }).from(firma).where(eq(firma.id, firmaId)),
    d.select().from(uzaverka).where(and(eq(uzaverka.firmaId, firmaId), eq(uzaverka.rok, rok))).orderBy(asc(uzaverka.mesic)),
  ]);
  if (firmy.length === 0) throw nenalezeno();
  return c.json(radky.map(naUzaverku));
});
