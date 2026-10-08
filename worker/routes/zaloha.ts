// Rozpočet příkazů D1 na požadavek (limit 50): GET /zaloha = 9 (jedna dávka čtení všech tabulek).
import { Hono } from 'hono';
import type { Zaloha } from '../../src/shared/api';
import { db } from '../db/klient';
import { den, dovolenaZustatek, firma, mesicniVstup, planSmeny, sablonaSmeny, sazba, uzaverka, zamestnanec } from '../db/schema';
import type { HonoTypy } from '../pristup';

export const zaloha = new Hono<HonoTypy>();

// Klíče `tabulky` jsou názvy tabulek ve schématu (camelCase), řádky v podobě, v jaké leží v D1 (nastavení firmy neslučené s výchozím).
zaloha.get('/zaloha', async (c) => {
  const d = db(c.env);
  // Jedna dávka = konzistentní snímek všech tabulek.
  const [f, z, s, dn, v, u, dz, sm, pl] = await d.batch([
    d.select().from(firma), d.select().from(zamestnanec), d.select().from(sazba), d.select().from(den), d.select().from(mesicniVstup),
    d.select().from(uzaverka), d.select().from(dovolenaZustatek), d.select().from(sablonaSmeny), d.select().from(planSmeny),
  ]);
  const ted = new Date().toISOString();
  const telo: Zaloha = {
    verze: 1,
    vytvoreno: ted,
    tabulky: { firma: f, zamestnanec: z, sazba: s, den: dn, mesicniVstup: v, uzaverka: u, dovolenaZustatek: dz, sablonaSmeny: sm, planSmeny: pl },
  };
  return c.json(telo, 200, { 'Content-Disposition': `attachment; filename="mzdy-zaloha-${ted.slice(0, 10)}.json"` });
});
