// Rozpočet příkazů D1 na požadavek (limit 50, počítá se i každý příkaz v dávce, max. 100 parametrů na příkaz; hlídá ho `db()` v db/klient.ts).
// Zápisy dnů jdou vícerádkově po blocích (db/davky.ts); nejhorší případ, 400 dní + 400 dat ke smazání:
//   PUT /dny 32 (zaměstnanec + uzávěrky + 5× DELETE po 99 datech + 25× INSERT po 16 dnech) · PUT /vstupy 3 · PUT /dovolena 2
//   · GET /firmy/:id/mesic/:rok/:mesic 11 (firma + dávka 10 čtení).
// Pozor pro úkoly 12/13: `POST /firmy/:id/plan/:rok/:mesic/prevest` (až 20 lidí × 31 dní ≈ 620 řádků, 5 sloupců → 31 příkazů) i uzavření
// měsíce musí zapisovat stejně po blocích (`vlozNeboPrepis`/`vlozRadky`/`smazHodnoty`), nikdy po řádku, a vejít se do 50 příkazů.
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { DovolenaZustatek, MesicniVstup } from '../../src/shared/api';
import { mesicUzavren, nactiTelo, nenalezeno, over } from '../chyby';
import { smazHodnoty, vlozNeboPrepis } from '../db/davky';
import { davka, db, type Db } from '../db/klient';
import { den, dovolenaZustatek, mesicniVstup, uzaverka, zamestnanec } from '../db/schema';
import { nactiMesicData } from '../mesicData';
import type { HonoTypy } from '../pristup';
import { rokMesicVCeste, ulozDny, ulozDovolenou, ulozVstup } from '../schemata';

export const mesic = new Hono<HonoTypy>();

async function firmaZamestnance(d: Db, zamestnanecId: string): Promise<string> {
  const [radek] = await d.select({ firmaId: zamestnanec.firmaId }).from(zamestnanec).where(eq(zamestnanec.id, zamestnanecId));
  if (!radek) throw nenalezeno();
  return radek.firmaId;
}

/** 409 MESIC_UZAVREN, když firma má uzávěrku kteréhokoli z měsíců, do nichž spadají `data` (`YYYY-MM-DD`). */
async function zkontrolujOtevreno(d: Db, firmaId: string, data: string[]): Promise<void> {
  const mesice = new Set(data.map((datum) => datum.slice(0, 7)));
  if (mesice.size === 0) return;
  const uzavrene = await d.select({ rok: uzaverka.rok, mesic: uzaverka.mesic }).from(uzaverka).where(eq(uzaverka.firmaId, firmaId));
  if (uzavrene.some((u) => mesice.has(`${String(u.rok).padStart(4, '0')}-${String(u.mesic).padStart(2, '0')}`))) throw mesicUzavren();
}

mesic.get('/firmy/:id/mesic/:rok/:mesic', async (c) => {
  const { rok, mesic: cisloMesice } = over(rokMesicVCeste, c.req.param());
  const data = await nactiMesicData(db(c.env), c.req.param('id'), rok, cisloMesice);
  if (!data) throw nenalezeno();
  return c.json(data);
});

// `dny` je upsert (stejný zaměstnanec + datum se přepíše), `smazat` je seznam dat ke smazání;
// smazání se provede dřív, takže den uvedený v obou seznamech zůstane s hodnotami z `dny`.
mesic.put('/dny', async (c) => {
  const d = db(c.env);
  const vstup = await nactiTelo(c.req, ulozDny);
  const firmaId = await firmaZamestnance(d, vstup.zamestnanecId);
  const smazat = vstup.smazat ?? [];
  await zkontrolujOtevreno(d, firmaId, [...vstup.dny.map((x) => x.datum), ...smazat]);
  await davka(d, [
    ...smazHodnoty(d, den, den.zamestnanecId, vstup.zamestnanecId, den.datum, smazat),
    ...vlozNeboPrepis(d, den, vstup.dny.map((x) => ({ zamestnanecId: vstup.zamestnanecId, ...x })), [den.zamestnanecId, den.datum]),
  ]);
  return c.json({ ok: true });
});

mesic.put('/vstupy', async (c) => {
  const d = db(c.env);
  const vstup: MesicniVstup = await nactiTelo(c.req, ulozVstup);
  const firmaId = await firmaZamestnance(d, vstup.zamestnanecId);
  await zkontrolujOtevreno(d, firmaId, [`${String(vstup.rok).padStart(4, '0')}-${String(vstup.mesic).padStart(2, '0')}-01`]);
  const { zamestnanecId: _z, rok: _r, mesic: _m, ...hodnoty } = vstup;
  await d.insert(mesicniVstup).values(vstup).onConflictDoUpdate({ target: [mesicniVstup.zamestnanecId, mesicniVstup.rok, mesicniVstup.mesic], set: hodnoty });
  return c.json(vstup);
});

mesic.put('/dovolena', async (c) => {
  const d = db(c.env);
  const vstup: DovolenaZustatek = await nactiTelo(c.req, ulozDovolenou);
  await firmaZamestnance(d, vstup.zamestnanecId);
  await d.insert(dovolenaZustatek).values(vstup)
    .onConflictDoUpdate({ target: [dovolenaZustatek.zamestnanecId, dovolenaZustatek.rok], set: { prevodMin: vstup.prevodMin, narokNavicMin: vstup.narokNavicMin } });
  return c.json(vstup);
});
