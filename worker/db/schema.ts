import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import type { Dite, NastaveniFirmy, UzaverkaRadek } from '../../src/shared/api';

export const firma = sqliteTable('firma', {
  id: text('id').primaryKey(),
  nazev: text('nazev').notNull(),
  ico: text('ico'), adresa: text('adresa'), ucet: text('ucet'),
  nastaveni: text('nastaveni', { mode: 'json' }).$type<Partial<NastaveniFirmy>>().notNull(),
  vytvoreno: text('vytvoreno').notNull(),
});
export const zamestnanec = sqliteTable('zamestnanec', {
  id: text('id').primaryKey(),
  firmaId: text('firma_id').notNull().references(() => firma.id, { onDelete: 'cascade' }),
  jmeno: text('jmeno').notNull(), prijmeni: text('prijmeni').notNull(),
  smlouva: text('smlouva', { enum: ['HPP', 'DPP'] }).notNull(),
  uvazekMinTydne: integer('uvazek_min_tydne').notNull(),
  nastup: text('nastup').notNull(), ukonceni: text('ukonceni'),
  prohlaseni: integer('prohlaseni', { mode: 'boolean' }).notNull(),
  invalidita: text('invalidita', { enum: ['ZADNA', 'I', 'II', 'III'] }).notNull(),
  ztpp: integer('ztpp', { mode: 'boolean' }).notNull(),
  deti: text('deti', { mode: 'json' }).$type<Dite[]>().notNull(),
  statniPojistenec: integer('statni_pojistenec', { mode: 'boolean' }).notNull(),
  slevaNaPojistnem: integer('sleva_na_pojistnem', { mode: 'boolean' }).notNull(),
  ucet: text('ucet'), poznamka: text('poznamka'),
  aktivni: integer('aktivni', { mode: 'boolean' }).notNull(),
  rolePlanu: text('role_planu', { enum: ['KASA', 'KASA_UCI_SE', 'PRODEJNA', 'DOZOR', 'MIMO_PLAN'] }).notNull().default('MIMO_PLAN'),
  stridaniSmen: text('stridani_smen', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  poradiPodkladu: integer('poradi_podkladu'),
  vPodkladu: integer('v_podkladu', { mode: 'boolean' }).notNull().default(true),
});
export const sazba = sqliteTable('sazba', {
  id: text('id').primaryKey(),
  zamestnanecId: text('zamestnanec_id').notNull().references(() => zamestnanec.id, { onDelete: 'cascade' }),
  platiOd: text('plati_od').notNull(), hodinovaHal: integer('hodinova_hal').notNull(),
});
export const den = sqliteTable('den', {
  zamestnanecId: text('zamestnanec_id').notNull().references(() => zamestnanec.id, { onDelete: 'cascade' }),
  datum: text('datum').notNull(),
  typ: text('typ', { enum: ['PRACE', 'DOVOLENA', 'NEMOC', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE', 'ABSENCE'] }).notNull(),
  minuty: integer('minuty').notNull(), kasa: integer('kasa', { mode: 'boolean' }).notNull(), poznamka: text('poznamka'),
}, (t) => [primaryKey({ columns: [t.zamestnanecId, t.datum] })]);
export const mesicniVstup = sqliteTable('mesicni_vstup', {
  zamestnanecId: text('zamestnanec_id').notNull().references(() => zamestnanec.id, { onDelete: 'cascade' }),
  rok: integer('rok').notNull(), mesic: integer('mesic').notNull(),
  odmenaZaDenHal: integer('odmena_za_den_hal').notNull(), aktivitaHal: integer('aktivita_hal').notNull(),
  jineOdmenyHal: integer('jine_odmeny_hal').notNull(), srazkyHal: integer('srazky_hal').notNull(),
  prumernyVydelekHal: integer('prumerny_vydelek_hal'), poznamka: text('poznamka'),
}, (t) => [primaryKey({ columns: [t.zamestnanecId, t.rok, t.mesic] })]);
export const uzaverka = sqliteTable('uzaverka', {
  firmaId: text('firma_id').notNull().references(() => firma.id, { onDelete: 'cascade' }),
  rok: integer('rok').notNull(), mesic: integer('mesic').notNull(), uzavreno: text('uzavreno').notNull(),
  vysledky: text('vysledky', { mode: 'json' }).$type<UzaverkaRadek[]>().notNull(),
}, (t) => [primaryKey({ columns: [t.firmaId, t.rok, t.mesic] })]);
export const dovolenaZustatek = sqliteTable('dovolena_zustatek', {
  zamestnanecId: text('zamestnanec_id').notNull().references(() => zamestnanec.id, { onDelete: 'cascade' }),
  rok: integer('rok').notNull(), prevodMin: integer('prevod_min').notNull(), narokNavicMin: integer('narok_navic_min').notNull(),
}, (t) => [primaryKey({ columns: [t.zamestnanecId, t.rok] })]);
export const sablonaSmeny = sqliteTable('sablona_smeny', {
  id: text('id').primaryKey(),
  firmaId: text('firma_id').notNull().references(() => firma.id, { onDelete: 'cascade' }),
  nazev: text('nazev').notNull(), zacatek: text('zacatek').notNull(), konec: text('konec').notNull(),
  prestavkaMin: integer('prestavka_min').notNull(), barva: text('barva'),
});
export const planSmeny = sqliteTable('plan_smeny', {
  zamestnanecId: text('zamestnanec_id').notNull().references(() => zamestnanec.id, { onDelete: 'cascade' }),
  datum: text('datum').notNull(),
  typ: text('typ', { enum: ['SMENA', 'VOLNO', 'DOVOLENA', 'ZAVRENO', 'NEMOC'] }).notNull(),
  sablonaId: text('sablona_id').references(() => sablonaSmeny.id, { onDelete: 'set null' }),
  minuty: integer('minuty').notNull(),
}, (t) => [primaryKey({ columns: [t.zamestnanecId, t.datum] })]);
// Tajné odkazy na veřejný rozpis směn (Worker `rozpis`). `zamestnanecId` null = tablet v prodejně; `zruseno` vyplněné = odkaz už neplatí.
export const odkazRozpisu = sqliteTable('odkaz_rozpisu', {
  id: text('id').primaryKey(),
  firmaId: text('firma_id').notNull().references(() => firma.id, { onDelete: 'cascade' }),
  zamestnanecId: text('zamestnanec_id').references(() => zamestnanec.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  nazev: text('nazev').notNull(),
  vytvoreno: text('vytvoreno').notNull(),
  zruseno: text('zruseno'),
});
