import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Prostredi } from './env';

export type Promenne = { email: string };
/** Typy prostředí Hona sdílené všemi routery. */
export type HonoTypy = { Bindings: Prostredi; Variables: Promenne };
const sady = new Map<string, JWTVerifyGetKey>();
/** Kde smí platit DEV_BYPASS: jen požadavek na tenhle počítač (vite, wrangler dev). Na ostré adrese se ignoruje. */
const MISTNI_HOSTITELE = new Set(['localhost', '127.0.0.1', '[::1]']);

export function pristup(volby: { jwks?: JWTVerifyGetKey } = {}) {
  return createMiddleware<HonoTypy>(async (c, next) => {
    if (c.env.DEV_BYPASS === '1' && MISTNI_HOSTITELE.has(new URL(c.req.url).hostname)) { c.set('email', 'dev@localhost'); return next(); }
    const tym = c.env.ACCESS_TEAM_DOMAIN?.trim();
    const aud = c.env.ACCESS_AUD?.trim();
    if (!tym || !aud) return c.json({ chyba: 'PRISTUP_NENASTAVEN' }, 503);
    let adresaKlicu: URL;
    try { adresaKlicu = new URL(`https://${tym}/cdn-cgi/access/certs`); } catch { return c.json({ chyba: 'PRISTUP_NENASTAVEN' }, 503); }
    const token = c.req.header('Cf-Access-Jwt-Assertion');
    if (!token) return c.json({ chyba: 'NEPRIHLASEN' }, 401);
    let jwks = volby.jwks ?? sady.get(tym);
    if (!jwks) { jwks = createRemoteJWKSet(adresaKlicu); sady.set(tym, jwks); }
    let email: string;
    try {
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'], issuer: `https://${tym}`, audience: aud });
      email = String(payload.email ?? '').toLowerCase();
    } catch {
      return c.json({ chyba: 'NEPRIHLASEN' }, 401);
    }
    const povolene = (c.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!email || !povolene.includes(email)) return c.json({ chyba: 'ZAKAZANO' }, 403);
    c.set('email', email);
    return next();
  });
}
