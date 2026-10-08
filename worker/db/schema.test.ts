import { eq } from 'drizzle-orm';
import { VYCHOZI_NASTAVENI } from '../../src/shared/api';
import { vytvorTestovaciApp } from '../test/harness';
import { db } from './klient';
import { firma, sazba, zamestnanec } from './schema';

let testovaci: Awaited<ReturnType<typeof vytvorTestovaciApp>>;
beforeAll(async () => { testovaci = await vytvorTestovaciApp(); });
afterAll(async () => { await testovaci.zavri(); });

test('smazání firmy kaskádou smaže zaměstnance i jejich sazby', async () => {
  const d = db(testovaci.env);
  await d.insert(firma).values({ id: 'f1', nazev: 'Testovací firma', ico: null, adresa: null, ucet: null, nastaveni: VYCHOZI_NASTAVENI, vytvoreno: '2026-10-05T10:00:00Z' });
  await d.insert(zamestnanec).values({
    id: 'z1', firmaId: 'f1', jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 2400,
    nastup: '2026-01-01', ukonceni: null, prohlaseni: true, invalidita: 'ZADNA', ztpp: false, deti: [{ ztpp: false }],
    statniPojistenec: false, slevaNaPojistnem: false, ucet: null, poznamka: null, aktivni: true,
  });
  await d.insert(sazba).values({ id: 's1', zamestnanecId: 'z1', platiOd: '2026-01-01', hodinovaHal: 12000 });
  expect(await d.select().from(zamestnanec).where(eq(zamestnanec.id, 'z1'))).toHaveLength(1);
  expect(await d.select().from(sazba)).toHaveLength(1);

  await d.delete(firma).where(eq(firma.id, 'f1'));

  expect(await d.select().from(zamestnanec)).toHaveLength(0);
  expect(await d.select().from(sazba)).toHaveLength(0);
});
