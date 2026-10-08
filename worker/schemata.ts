// Zod schémata těl požadavků (kontrakt: src/shared/api.ts). Chybové hlášky zodu jsou česky.
import { z } from 'zod';
import type { NastaveniFirmy, NovaFirma, NovaSablona, NovyOdkazRozpisu, NovyZamestnanec, UlozDny, UlozPlan } from '../src/shared/api';

z.config(z.locales.cs());

const jeDatum = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const datum = z.string().refine(jeDatum, 'Datum musí být skutečné datum ve tvaru RRRR-MM-DD.');
const cas = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Čas musí být ve tvaru HH:MM.');
const text = z.string().trim().min(1).max(200);
const volitelnyText = z.string().trim().max(500).nullish().transform((v) => (v ? v : null));
// U úpravy (PUT) se rozlišuje vynechané pole (undefined = beze změny) od výslovného null (= vymazat).
const nepovinnyText = z.string().trim().max(500).nullable().optional().transform((v) => (v === undefined ? undefined : v ? v : null));
const volitelneDatum = datum.nullish().transform((v) => v ?? null);
/** Nejvyšší částka, kterou přijmou formuláře appky: 10 000 000 Kč v haléřích. */
const NEJVIC_HALERU = 10_000_000 * 100;
const halere = z.number().int().min(0).max(NEJVIC_HALERU);
const minutyDne = z.number().int().min(0).max(1440);
/** Týdenní úvazek nebo pracovní doba nejvýš 40 h (§ 79 ZP), v minutách. */
const NEJVIC_MINUT_TYDNE = 40 * 60;
/** Převod a nárok dovolené navíc nejvýš ±1 000 h, v minutách. */
const NEJVIC_MINUT_DOVOLENE = 1000 * 60;
const rok = z.number().int().min(2000).max(2100);
const mesic = z.number().int().min(1).max(12);
const id = z.string().min(1).max(100);
const rolePlanu = z.enum(['KASA', 'KASA_UCI_SE', 'PRODEJNA', 'DOZOR', 'MIMO_PLAN']);

export const nastaveniFirmy = z.object({
  tydenniPracovniDoba: z.number().min(1).max(40),
  stravnePausalHal: halere,
  stravneProDpp: z.boolean(),
  priplatekSobotaHal: halere,
  priplatekNedeleHal: halere,
  priplatekKasaHal: halere,
  praceVeSvatek: z.enum(['PRIPLATEK', 'NAHRADNI_VOLNO']),
  odmenaZaDenPropadaPriNemoci: z.boolean(),
  urovneOdmenyZaDenHal: z.array(halere).max(20),
  urovneAktivityHal: z.array(halere).max(20),
  odmenyIProDpp: z.boolean(),
  zaokrouhleniZpZamestnanec: z.literal('TRETINA_NAHORU'),
  planovacKasaOd: cas,
  planovacKasaDo: cas,
  planovacMinKasaru: z.number().int().min(1).max(20),
  planovacOtevrenoOd: cas,
  planovacOtevrenoDo: cas,
  planovacSablony: z.array(id).max(30),
  planovacKotva: datum,
  planovacDozorNaKaseDo: cas,
  planovacObsazeni: z.array(z.object({ od: cas, do: cas, lidi: z.number().int().min(0).max(50), aspon: z.boolean().optional() })).max(24),
}).partial() satisfies z.ZodType<Partial<NastaveniFirmy>>;

export const novaFirma = z.object({
  nazev: text, ico: volitelnyText, adresa: volitelnyText, ucet: volitelnyText, nastaveni: nastaveniFirmy.optional(),
}) satisfies z.ZodType<NovaFirma, unknown>;

/** `PUT /api/firmy/:id`: vynechané ico/adresa/ucet/nastaveni zůstanou, výslovné null vymaže ico/adresu/účet, nastavení se slučuje. */
export const upravaFirmy = z.object({
  nazev: text, ico: nepovinnyText, adresa: nepovinnyText, ucet: nepovinnyText, nastaveni: nastaveniFirmy.optional(),
}) satisfies z.ZodType<NovaFirma, unknown>;

export const novyZamestnanec = z.object({
  firmaId: id,
  jmeno: text, prijmeni: text,
  smlouva: z.enum(['HPP', 'DPP']),
  uvazekMinTydne: z.number().int().min(0).max(NEJVIC_MINUT_TYDNE),
  nastup: datum, ukonceni: volitelneDatum,
  prohlaseni: z.boolean(),
  invalidita: z.enum(['ZADNA', 'I', 'II', 'III']),
  ztpp: z.boolean(),
  deti: z.array(z.object({ ztpp: z.boolean() })).max(20),
  statniPojistenec: z.boolean(), slevaNaPojistnem: z.boolean(),
  ucet: volitelnyText, poznamka: volitelnyText,
  aktivni: z.boolean().optional(),
  rolePlanu: rolePlanu.optional(),
  stridaniSmen: z.array(id).max(14).optional(),
  poradiPodkladu: z.number().int().min(1).max(999).nullable().optional(),
  vPodkladu: z.boolean().optional(),
  sazby: z.array(z.object({ platiOd: datum, hodinovaHal: halere })).max(100),
}).refine((v) => !v.ukonceni || v.ukonceni >= v.nastup, { message: 'Ukončení nesmí být před nástupem.', path: ['ukonceni'] }) satisfies z.ZodType<NovyZamestnanec, unknown>;

export const ulozDny = z.object({
  zamestnanecId: id,
  dny: z.array(z.object({
    datum, minuty: minutyDne, kasa: z.boolean().default(false), poznamka: volitelnyText,
    typ: z.enum(['PRACE', 'DOVOLENA', 'NEMOC', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE', 'ABSENCE']),
  })).max(400),
  smazat: z.array(datum).max(400).optional(),
}) satisfies z.ZodType<UlozDny, unknown>;

export const ulozVstup = z.object({
  zamestnanecId: id, rok, mesic,
  odmenaZaDenHal: halere, aktivitaHal: halere, jineOdmenyHal: halere, srazkyHal: halere,
  prumernyVydelekHal: halere.nullish().transform((v) => v ?? null),
  poznamka: volitelnyText,
});

export const ulozDovolenou = z.object({
  zamestnanecId: id, rok,
  prevodMin: z.number().int().min(-NEJVIC_MINUT_DOVOLENE).max(NEJVIC_MINUT_DOVOLENE),
  narokNavicMin: z.number().int().min(0).max(NEJVIC_MINUT_DOVOLENE),
});

export const novaSablona = z.object({
  firmaId: id, nazev: text, zacatek: cas, konec: cas,
  prestavkaMin: minutyDne, barva: z.string().trim().max(32).nullish().transform((v) => (v ? v : null)),
}) satisfies z.ZodType<NovaSablona, unknown>;

export const ulozPlan = z.object({
  zamestnanecId: id,
  polozky: z.array(z.object({
    datum, typ: z.enum(['SMENA', 'VOLNO', 'DOVOLENA', 'ZAVRENO', 'NEMOC']),
    sablonaId: id.nullish().transform((v) => v ?? null), minuty: minutyDne,
  })).max(400),
  smazat: z.array(datum).max(400).optional(),
}) satisfies z.ZodType<UlozPlan, unknown>;

export const novyOdkazRozpisu = z.object({ firmaId: id, zamestnanecId: id.nullable() }) satisfies z.ZodType<NovyOdkazRozpisu, unknown>;

/** `POST /api/demo`: měsíc v těle je volitelný (jen pro testy); appka posílá `{}`. */
export const demoTelo = z.object({ rok: rok.optional(), mesic: mesic.optional() })
  .refine((v) => (v.rok === undefined) === (v.mesic === undefined), 'Zadej rok i měsíc, nebo ani jedno.');

/** Parametry cesty `:rok/:mesic`. */
export const rokMesicVCeste = z.object({
  rok: z.string().regex(/^\d{4}$/).transform(Number).pipe(rok),
  mesic: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(mesic),
});
