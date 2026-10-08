// Ukázková firma se čtyřmi smyšlenými lidmi a docházkou pro zadaný měsíc (první spuštění appky).
import { denVTydnu, dnyMesice, posunDatum } from '../src/core/kalendar';
import type { Dite, Firma, Invalidita, Smlouva } from '../src/shared/api';
import { vlozRadky } from './db/davky';
import { davka, type Db } from './db/klient';
import { den, firma, mesicniVstup, sablonaSmeny, sazba, zamestnanec } from './db/schema';
import { naFirmu } from './prevody';

type Osoba = { jmeno: string; prijmeni: string; smlouva: Smlouva; uvazekMinTydne: number; hodinovaHal: number; prohlaseni: boolean; invalidita: Invalidita; deti: Dite[]; slevaNaPojistnem: boolean };

const OSOBY: Osoba[] = [
  { jmeno: 'Hana', prijmeni: 'Svobodová', smlouva: 'HPP', uvazekMinTydne: 2400, hodinovaHal: 16500, prohlaseni: true, invalidita: 'ZADNA', deti: [{ ztpp: false }], slevaNaPojistnem: false },
  { jmeno: 'Tomáš', prijmeni: 'Král', smlouva: 'HPP', uvazekMinTydne: 1800, hodinovaHal: 15800, prohlaseni: true, invalidita: 'III', deti: [], slevaNaPojistnem: true },
  { jmeno: 'Lenka', prijmeni: 'Dvořáková', smlouva: 'HPP', uvazekMinTydne: 2400, hodinovaHal: 17200, prohlaseni: true, invalidita: 'ZADNA', deti: [], slevaNaPojistnem: false },
  { jmeno: 'Marek', prijmeni: 'Beneš', smlouva: 'DPP', uvazekMinTydne: 0, hodinovaHal: 15000, prohlaseni: false, invalidita: 'ZADNA', deti: [], slevaNaPojistnem: false },
];

/** Vytvoří ukázkovou firmu; docházku a měsíční vstupy vyplní pro `rok`/`mesic` (1–12). */
export async function vytvorDemo(dbi: Db, rok: number, mesic: number): Promise<Firma> {
  const firmaRadek = { id: crypto.randomUUID(), nazev: 'Ukázková prodejna s.r.o.', ico: null, adresa: null, ucet: null, nastaveni: {}, vytvoreno: new Date().toISOString() };
  const lide = OSOBY.map((o) => ({ ...o, id: crypto.randomUUID() }));
  const [hana, tomas, lenka, marek] = lide;

  const dny = dnyMesice(rok, mesic);
  // Státní svátky se v ukázce neřeší: svátek ve všední den je pro všechny obyčejný odpracovaný den.
  const vsedni = dny.filter((d) => denVTydnu(d) <= 5);
  const dovolenaHany = vsedni[9];
  const prvniUtery = dny.find((d) => denVTydnu(d) === 2)!;
  const nemocLenky = [prvniUtery, posunDatum(prvniUtery, 1)];

  const dnyRadky: (typeof den.$inferInsert)[] = [];
  const pridejDen = (zamestnanecId: string, datum: string, typ: 'PRACE' | 'DOVOLENA' | 'NEMOC', minuty: number, kasa = false) =>
    dnyRadky.push({ zamestnanecId, datum, typ, minuty, kasa, poznamka: null });
  let odpracovanychDnuHany = 0;
  for (const datum of vsedni) {
    if (datum === dovolenaHany) pridejDen(hana.id, datum, 'DOVOLENA', 480);
    else pridejDen(hana.id, datum, 'PRACE', 480, odpracovanychDnuHany++ % 2 === 0); // kasa každý druhý odpracovaný den
    pridejDen(lenka.id, datum, nemocLenky.includes(datum) ? 'NEMOC' : 'PRACE', 480);
    if (denVTydnu(datum) <= 4) pridejDen(tomas.id, datum, 'PRACE', 360);
  }
  for (const datum of dny.filter((d) => denVTydnu(d) === 6).slice(0, 2)) pridejDen(marek.id, datum, 'PRACE', 360);

  const vstup = (zamestnanecId: string, odmenaZaDenHal: number, aktivitaHal: number) =>
    ({ zamestnanecId, rok, mesic, odmenaZaDenHal, aktivitaHal, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null });

  // Rozpočet D1: celé demo je jedna dávka o 10 příkazech (limit je 50) — firma, lidé (1), sazby (1), docházka (nejvýš 5 po 16 dnech,
  // v 31denním měsíci od pondělí 67 dnů), vstupy (1), šablony (1) — díky vícerádkovým INSERTům z db/davky.ts.
  await davka(dbi, [
    dbi.insert(firma).values(firmaRadek),
    ...vlozRadky(dbi, zamestnanec, lide.map(({ hodinovaHal: _h, ...o }) => ({ ...o, firmaId: firmaRadek.id, nastup: '2025-01-01', ukonceni: null, ztpp: false, statniPojistenec: false, ucet: null, poznamka: null, aktivni: true }))),
    ...vlozRadky(dbi, sazba, lide.map((o) => ({ id: crypto.randomUUID(), zamestnanecId: o.id, platiOd: '2025-01-01', hodinovaHal: o.hodinovaHal }))),
    ...vlozRadky(dbi, den, dnyRadky),
    ...vlozRadky(dbi, mesicniVstup, [vstup(hana.id, 12000, 6000), vstup(lenka.id, 8000, 0)]),
    ...vlozRadky(dbi, sablonaSmeny, [
      { id: crypto.randomUUID(), firmaId: firmaRadek.id, nazev: 'Ranní', zacatek: '08:00', konec: '16:30', prestavkaMin: 30, barva: '#2B3FBF' },
      { id: crypto.randomUUID(), firmaId: firmaRadek.id, nazev: 'Odpolední', zacatek: '12:00', konec: '20:00', prestavkaMin: 30, barva: '#0E7C86' },
    ]),
  ]);
  return naFirmu(firmaRadek);
}
