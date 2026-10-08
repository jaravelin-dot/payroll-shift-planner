// Sestavení `MesicData` (vše, co obrazovka měsíce firmy potřebuje). Sdílí ho `GET …/mesic/:rok/:mesic`
// i uzávěrka měsíce, která z něj počítá výsledky.
import { and, asc, between, eq, getTableColumns, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { dnyMesice, mesiceCtvrtleti, predchoziCtvrtleti, predchoziMesic } from '../src/core/kalendar';
import type { MesicData } from '../src/shared/api';
import type { Db } from './db/klient';
import { den, dovolenaZustatek, firma, mesicniVstup, planSmeny, sablonaSmeny, sazba, uzaverka, zamestnanec } from './db/schema';
import { naFirmu, naUzaverku, sSazbami } from './prevody';

const soucetMinut = sql<number>`sum(${den.minuty})`.mapWith(Number);

/** Vrátí data měsíce firmy, nebo `null`, když firma neexistuje. `mesic` je 1–12. */
export async function nactiMesicData(dbi: Db, firmaId: string, rok: number, mesic: number): Promise<MesicData | null> {
  const [firmaRadek] = await dbi.select().from(firma).where(eq(firma.id, firmaId));
  if (!firmaRadek) return null;

  const dny = dnyMesice(rok, mesic);
  const prvniDen = dny[0];
  const posledniDen = dny[dny.length - 1];
  const predchozi = predchoziMesic(rok, mesic);
  const dnyPredchozi = dnyMesice(predchozi.rok, predchozi.mesic);
  const [prvniMesicCtvrtleti, , posledniMesicCtvrtleti] = mesiceCtvrtleti(rok, mesic);
  const [prvniPredCtvrtleti, , posledniMesicPredCtvrtleti] = predchoziCtvrtleti(rok, mesic);
  const zacatekRoku = `${String(rok).padStart(4, '0')}-01-01`;
  const konecRoku = `${String(rok).padStart(4, '0')}-12-31`;
  const konecPredchozihoMesice = dnyPredchozi[dnyPredchozi.length - 1];
  const patriFirme = eq(zamestnanec.firmaId, firmaId);

  // Jedna dávka = jedna cesta po síti a konzistentní snímek všech částí.
  const [zamestnanciRadky, sazbyRadky, dnyRadky, vstupyRadky, uzaverkyRadky, dppRadky, rocniRadky, zustatkyRadky, planRadky, sablonyRadky] = await dbi.batch([
    dbi.select().from(zamestnanec)
      .where(and(patriFirme, lte(zamestnanec.nastup, posledniDen), or(isNull(zamestnanec.ukonceni), gte(zamestnanec.ukonceni, prvniDen))))
      .orderBy(asc(zamestnanec.prijmeni), asc(zamestnanec.jmeno), asc(zamestnanec.id)),
    dbi.select(getTableColumns(sazba)).from(sazba).innerJoin(zamestnanec, eq(sazba.zamestnanecId, zamestnanec.id)).where(patriFirme),
    dbi.select(getTableColumns(den)).from(den).innerJoin(zamestnanec, eq(den.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, between(den.datum, dnyPredchozi[0], posledniDen)))
      .orderBy(asc(den.datum), asc(den.zamestnanecId)),
    dbi.select(getTableColumns(mesicniVstup)).from(mesicniVstup).innerJoin(zamestnanec, eq(mesicniVstup.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, eq(mesicniVstup.rok, rok), between(mesicniVstup.mesic, prvniMesicCtvrtleti.mesic, posledniMesicCtvrtleti.mesic)))
      .orderBy(asc(mesicniVstup.mesic), asc(mesicniVstup.zamestnanecId)),
    dbi.select().from(uzaverka).where(and(
      eq(uzaverka.firmaId, firmaId),
      or(
        and(eq(uzaverka.rok, rok), eq(uzaverka.mesic, mesic)),
        and(eq(uzaverka.rok, prvniPredCtvrtleti.rok), between(uzaverka.mesic, prvniPredCtvrtleti.mesic, posledniMesicPredCtvrtleti.mesic)),
      ),
    )).orderBy(asc(uzaverka.rok), asc(uzaverka.mesic)),
    dbi.select({ zamestnanecId: den.zamestnanecId, minuty: soucetMinut }).from(den).innerJoin(zamestnanec, eq(den.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, eq(den.typ, 'PRACE'), between(den.datum, zacatekRoku, konecPredchozihoMesice)))
      .groupBy(den.zamestnanecId),
    dbi.select({ zamestnanecId: den.zamestnanecId, typ: den.typ, minuty: soucetMinut }).from(den).innerJoin(zamestnanec, eq(den.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, inArray(den.typ, ['PRACE', 'DOVOLENA']), between(den.datum, zacatekRoku, konecRoku)))
      .groupBy(den.zamestnanecId, den.typ),
    dbi.select(getTableColumns(dovolenaZustatek)).from(dovolenaZustatek).innerJoin(zamestnanec, eq(dovolenaZustatek.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, eq(dovolenaZustatek.rok, rok))),
    dbi.select(getTableColumns(planSmeny)).from(planSmeny).innerJoin(zamestnanec, eq(planSmeny.zamestnanecId, zamestnanec.id))
      .where(and(patriFirme, between(planSmeny.datum, prvniDen, posledniDen)))
      .orderBy(asc(planSmeny.datum), asc(planSmeny.zamestnanecId)),
    dbi.select().from(sablonaSmeny).where(eq(sablonaSmeny.firmaId, firmaId)).orderBy(asc(sablonaSmeny.nazev), asc(sablonaSmeny.id)),
  ]);

  const zamestnanci = sSazbami(zamestnanciRadky, sazbyRadky);
  const aktivni = new Set(zamestnanciRadky.map((z) => z.id));
  const jeAktivni = <T extends { zamestnanecId: string }>(radek: T) => aktivni.has(radek.zamestnanecId);

  const dppMinutyPredMesicem: MesicData['dppMinutyPredMesicem'] = {};
  for (const z of zamestnanci) if (z.smlouva === 'DPP') dppMinutyPredMesicem[z.id] = 0;
  for (const r of dppRadky) if (r.zamestnanecId in dppMinutyPredMesicem) dppMinutyPredMesicem[r.zamestnanecId] = r.minuty;

  const dovolenaRok: MesicData['dovolenaRok'] = {};
  for (const z of zamestnanci) dovolenaRok[z.id] = { cerpanoMin: 0, praceMin: 0 };
  for (const r of rocniRadky) {
    const polozka = dovolenaRok[r.zamestnanecId];
    if (polozka) { if (r.typ === 'DOVOLENA') polozka.cerpanoMin = r.minuty; else polozka.praceMin = r.minuty; }
  }

  const uzaverky = uzaverkyRadky.map(naUzaverku);
  return {
    firma: naFirmu(firmaRadek),
    rok, mesic,
    zamestnanci,
    dny: dnyRadky.filter(jeAktivni),
    vstupy: vstupyRadky.filter(jeAktivni),
    uzaverka: uzaverky.find((u) => u.rok === rok && u.mesic === mesic) ?? null,
    uzaverkyPredchozihoCtvrtleti: uzaverky.filter((u) => !(u.rok === rok && u.mesic === mesic)),
    dppMinutyPredMesicem,
    dovolenaRok,
    zustatky: zustatkyRadky.filter(jeAktivni),
    plan: planRadky.filter(jeAktivni),
    sablony: sablonyRadky,
  };
}
