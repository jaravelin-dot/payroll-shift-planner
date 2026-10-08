// Worker `rozpis`: veřejný rozpis směn pro zaměstnance (tablet v prodejně, osobní odkazy v mobilu), bez přihlášení.
// Přístup dává jen tajný token v adrese; token firmy A nikdy neukáže data firmy B (všechny dotazy jsou omezené firmou odkazu).
// Jen čte. Nečte sazby, mzdy, uzávěrky ani poznámky; typ nepřítomnosti z docházky slouží jen ke skrytí buňky.
// Rozpočet příkazů D1 na požadavek (limit 50): stránka 5 (odkaz + dávka lidé/plán/šablony/docházka), manifest 1.
import { and, between, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { posunDatum } from '../src/core/kalendar';
import { pondeliTydne } from '../src/core/plan';
import { jeNepritomnost } from '../src/core/planovac';
import { dnesVPraze, sestavRozpis } from '../src/core/rozpis';
import type { Zamestnanec } from '../src/shared/api';
import { db } from '../worker/db/klient';
import { den, firma, odkazRozpisu, planSmeny, sablonaSmeny, zamestnanec } from '../worker/db/schema';
import { strankaChyby, strankaNeplati, strankaRozpisu } from './stranka';

type Prostredi = { Bindings: { DB: D1Database } };

const HLAVICKY = {
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
} as const;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Pondělí týdne z `?tyden=` (kterýkoli den týdne); chybějící nebo nevalidní hodnota = aktuální týden. */
function pondeliZDotazu(tyden: string | undefined, dnes: string): string {
  if (tyden && DATUM.test(tyden)) {
    const ms = Date.parse(`${tyden}T00:00:00Z`);
    if (!Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === tyden) return pondeliTydne(tyden);
  }
  return pondeliTydne(dnes);
}

/**
 * Platný (nezrušený) odkaz s názvem firmy a u osobního odkazu jménem člověka té firmy; jinak undefined.
 * Osobní odkaz neaktivního člověka nebo po datu ukončení (`dnes` je v Praze) neplatí.
 */
async function nactiOdkaz(d: ReturnType<typeof db>, token: string, dnes: string) {
  const [odkaz] = await d
    .select({ firmaId: odkazRozpisu.firmaId, zamestnanecId: odkazRozpisu.zamestnanecId, firma: firma.nazev, jmeno: zamestnanec.jmeno,
      aktivni: zamestnanec.aktivni, ukonceni: zamestnanec.ukonceni,
    })
    .from(odkazRozpisu)
    .innerJoin(firma, eq(firma.id, odkazRozpisu.firmaId))
    .leftJoin(zamestnanec, and(eq(zamestnanec.id, odkazRozpisu.zamestnanecId), eq(zamestnanec.firmaId, odkazRozpisu.firmaId)))
    .where(and(eq(odkazRozpisu.token, token), isNull(odkazRozpisu.zruseno)));
  // Osobní odkaz na člověka, který k firmě odkazu nepatří, neplatí.
  if (!odkaz || (odkaz.zamestnanecId !== null && odkaz.jmeno === null)) return undefined;
  // Odešel (neaktivní nebo ukončený před dneškem): osobní odkaz neplatí jako zrušený. Tablet se netýká.
  if (odkaz.zamestnanecId !== null && (!odkaz.aktivni || (odkaz.ukonceni !== null && odkaz.ukonceni < dnes))) return undefined;
  return odkaz;
}

/** „10:42" v Europe/Prague. */
const casVPraze = (ted: Date) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' }).format(ted);

/** `ted` jen pro testy (pevné „dnes"). */
export function vytvorRozpis(volby: { ted?: () => Date } = {}): Hono<Prostredi> {
  const ted = volby.ted ?? (() => new Date());
  const app = new Hono<Prostredi>();
  // První middleware: hlavičky mají i odpovědi 404 a 500.
  app.use('*', async (c, next) => {
    await next();
    for (const [nazev, hodnota] of Object.entries(HLAVICKY)) c.header(nazev, hodnota);
  });
  app.notFound((c) => c.html(strankaNeplati(), 404));
  app.onError((chyba, c) => {
    console.error(chyba);
    return c.html(strankaChyby(), 500);
  });

  app.get('/r/:token', async (c) => {
    const d = db(c.env);
    const nyni = ted();
    const dnes = dnesVPraze(nyni);
    const odkaz = await nactiOdkaz(d, c.req.param('token'), dnes);
    if (!odkaz) return c.html(strankaNeplati(), 404);
    const pondeli = pondeliZDotazu(c.req.query('tyden'), dnes);
    const nedele = posunDatum(pondeli, 6);
    const lideFirmy = eq(zamestnanec.firmaId, odkaz.firmaId);
    const [lide, plan, sablony, dochazka] = await d.batch([
      // Jen sloupce pro výběr, řazení a jméno v rozpisu; sazby, účet ani poznámka se nečtou.
      d.select({
        id: zamestnanec.id, firmaId: zamestnanec.firmaId, jmeno: zamestnanec.jmeno, prijmeni: zamestnanec.prijmeni,
        smlouva: zamestnanec.smlouva, nastup: zamestnanec.nastup, ukonceni: zamestnanec.ukonceni,
        aktivni: zamestnanec.aktivni, rolePlanu: zamestnanec.rolePlanu,
      }).from(zamestnanec).where(lideFirmy),
      d.select({ zamestnanecId: planSmeny.zamestnanecId, datum: planSmeny.datum, typ: planSmeny.typ, sablonaId: planSmeny.sablonaId, minuty: planSmeny.minuty })
        .from(planSmeny).innerJoin(zamestnanec, eq(zamestnanec.id, planSmeny.zamestnanecId))
        .where(and(lideFirmy, between(planSmeny.datum, pondeli, nedele))),
      d.select().from(sablonaSmeny).where(eq(sablonaSmeny.firmaId, odkaz.firmaId)),
      // Všechny dny docházky týdne (ne jen ty s plánem): nepřítomnost skryje směnu i u řazení a výběru lidí.
      d.select({ zamestnanecId: den.zamestnanecId, datum: den.datum, typ: den.typ })
        .from(den).innerJoin(zamestnanec, eq(zamestnanec.id, den.zamestnanecId))
        .where(and(lideFirmy, between(den.datum, pondeli, nedele))),
    ]);
    // Ostatní pole `Zamestnanec` model rozpisu nepotřebuje: neutrální hodnoty jen kvůli typu.
    const lideModelu: Zamestnanec[] = lide.map((z) => ({
      ...z, uvazekMinTydne: 0, prohlaseni: false, invalidita: 'ZADNA', ztpp: false, deti: [], statniPojistenec: false,
      slevaNaPojistnem: false, ucet: null, poznamka: null, stridaniSmen: [], poradiPodkladu: null, vPodkladu: false,
    }));
    const rozpis = sestavRozpis({
      pondeli, dnes, lide: lideModelu, plan, sablony,
      nepritomnosti: dochazka.filter((dd) => jeNepritomnost(dd.typ)).map(({ zamestnanecId, datum }) => ({ zamestnanecId, datum })),
    });
    const osobni = odkaz.zamestnanecId !== null ? { zamestnanecId: odkaz.zamestnanecId, jmeno: odkaz.jmeno! } : null;
    return c.html(strankaRozpisu(rozpis, { osobni, firma: odkaz.firma, aktualizovano: casVPraze(nyni), odkaz: `/r/${c.req.param('token')}` }));
  });

  // Manifest jen pro osobní odkaz: „Přidat na plochu" otevře přímo jeho rozpis. Tablet manifest nemá.
  app.get('/r/:token/manifest.webmanifest', async (c) => {
    const token = c.req.param('token');
    const odkaz = await nactiOdkaz(db(c.env), token, dnesVPraze(ted()));
    if (!odkaz || odkaz.zamestnanecId === null) return c.html(strankaNeplati(), 404);
    const manifest = {
      name: `Rozpis – ${odkaz.jmeno}`,
      short_name: 'Rozpis',
      start_url: `/r/${token}`,
      scope: `/r/${token}`,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#111111',
      lang: 'cs',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    };
    return c.body(JSON.stringify(manifest), 200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
  });

  return app;
}

export default {
  fetch: (req, env, ctx) => vytvorRozpis().fetch(req, env, ctx),
} satisfies ExportedHandler<Prostredi['Bindings']>;
