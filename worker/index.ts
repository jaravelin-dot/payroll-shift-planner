import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { JWTVerifyGetKey } from 'jose';
import { chybaApi } from './chyby';
import { pristup, type HonoTypy } from './pristup';
import { firmy } from './routes/firmy';
import { mesic } from './routes/mesic';
import { odkazyRozpisu } from './routes/odkazyRozpisu';
import { prevodPlanu } from './routes/prevodPlanu';
import { smeny } from './routes/smeny';
import { uzaverky } from './routes/uzaverka';
import { zaloha } from './routes/zaloha';
import { zamestnanci } from './routes/zamestnanci';

// Bezpečnostní hlavičky všech odpovědí /api/*. Statické soubory je dostávají z public/_headers (run_worker_first je jen pro
// /api/*, tam _headers nezabírá). CSP je přísná: API vrací jen JSON. No-store: mzdová data nesmí zůstat v cache prohlížeče ani proxy.
const HLAVICKY_API = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
} as const;

/** Metody, které nesou tělo; API ho přijímá jen jako JSON. */
const S_TELEM = new Set(['POST', 'PUT', 'PATCH']);
const JSON_TYP = /^application\/json\s*(;|$)/i;

export function vytvorApp(volby: { jwks?: JWTVerifyGetKey } = {}) {
  const app = new Hono<HonoTypy>().basePath('/api');
  app.onError(chybaApi);
  // První middleware, ať hlavičky mají i odpovědi 401/403/503, 404 a 500.
  app.use('*', async (c, next) => {
    await next();
    for (const [nazev, hodnota] of Object.entries(HLAVICKY_API)) c.header(nazev, hodnota);
  });
  // /zdravi musí být zaregistrováno před pristup(): Hono jede v pořadí registrace, takže ho ověření nezachytí.
  app.get('/zdravi', (c) => c.json({ ok: true }));
  // CSRF: zápis z cizího webu nesmí projít ani s platným přihlášením Access (cookie jde s požadavkem i z cizí stránky).
  // hono/csrf odmítne (403) formulářové typy těla z jiného původu; tělo navíc musí být JSON (jinak 415), a takový
  // požadavek z cizího původu prohlížeč pošle až po preflightu CORS, který API nepovolí.
  app.use('*', csrf());
  app.use('*', async (c, next) => {
    if (S_TELEM.has(c.req.method) && !JSON_TYP.test(c.req.header('Content-Type') ?? '')) {
      return c.json({ chyba: 'NEPLATNY_VSTUP', zprava: 'Tělo požadavku musí být JSON (Content-Type: application/json).' }, 415);
    }
    await next();
  });
  app.use('*', pristup(volby));
  app.get('/ja', (c) => c.json({ email: c.var.email }));
  for (const router of [firmy, zamestnanci, mesic, smeny, prevodPlanu, uzaverky, zaloha, odkazyRozpisu]) app.route('/', router);
  return app;
}

export default vytvorApp();
