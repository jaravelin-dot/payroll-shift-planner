import { drizzle } from 'drizzle-orm/d1';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../worker/db/schema';
import { nactiMigrace } from '../worker/test/harness';
import { vytvorRozpis } from './index';

const NEPLATI = 'Odkaz neplatí. Požádej vedoucího o nový.';
const HLAVICKY: Record<string, string> = {
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

const TABLET = 'tablet-token-aaaaaaaaaaaaaaaaaaaaa';
const JANA = 'jana-token-bbbbbbbbbbbbbbbbbbbbbbb';
const ZRUSENY = 'zruseny-token-cccccccccccccccccccc';
const TABLET_B = 'tablet-b-token-dddddddddddddddddd';
const NEAKTIVNI = 'neaktivni-token-eeeeeeeeeeeeeeeeeee';
const UKONCEN_VCERA = 'ukoncen-vcera-token-fffffffffffff';
const UKONCEN_DNES = 'ukoncen-dnes-token-gggggggggggggg';

const clovek = (id: string, firmaId: string, jmeno: string, rolePlanu: typeof schema.zamestnanec.$inferInsert.rolePlanu) => ({
  id, firmaId, jmeno, prijmeni: 'Příjmení ' + id, smlouva: 'HPP' as const, uvazekMinTydne: 2400, nastup: '2026-01-01', ukonceni: null,
  prohlaseni: true, invalidita: 'ZADNA' as const, ztpp: false, deti: [], statniPojistenec: false, slevaNaPojistnem: false,
  ucet: 'TAJNY-UCET', poznamka: 'TAJNA-POZNAMKA', aktivni: true, rolePlanu,
});

let mf: Miniflare;
let env: { DB: D1Database };
// „Dnes" je pevně středa 7. 10. 2026 v Praze, aktuální týden je tedy 5.–11. 10.
const app = vytvorRozpis({ ted: () => new Date('2026-10-07T08:00:00Z') });
const nacti = (cesta: string) => app.request(cesta, {}, env);

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("") } }',
    d1Databases: { DB: 'rozpis-' + crypto.randomUUID() },
  }));
  const DB = await mf.getD1Database('DB');
  for (const prikaz of nactiMigrace()) await DB.prepare(prikaz).run();
  env = { DB };
  const d = drizzle(DB, { schema });
  await d.insert(schema.firma).values([
    { id: 'fa', nazev: 'Ukázková prodejna', nastaveni: {}, vytvoreno: '2026-01-01T00:00:00Z' },
    { id: 'fb', nazev: 'Cizí firma', nastaveni: {}, vytvoreno: '2026-01-01T00:00:00Z' },
  ]);
  // Po jednom: víc lidí v jednom příkazu překročí limit vázaných parametrů D1.
  for (const z of [
    clovek('jana', 'fa', 'Jana', 'KASA'),
    clovek('magda', 'fa', 'Magda', 'PRODEJNA'),
    clovek('petr', 'fa', 'Petr', 'PRODEJNA'),
    clovek('hacker', 'fa', '<script>alert(1)</script>', 'PRODEJNA'),
    clovek('sef', 'fa', 'Majitel', 'MIMO_PLAN'),
    clovek('host', 'fa', 'Brigádník', 'MIMO_PLAN'),
    clovek('cizinec', 'fb', 'Cizinec', 'KASA'),
    { ...clovek('neaktivni', 'fa', 'Neaktivní', 'MIMO_PLAN'), aktivni: false },
    { ...clovek('vcera', 'fa', 'Včera', 'MIMO_PLAN'), ukonceni: '2026-10-06' },
    { ...clovek('dnes', 'fa', 'Dnes', 'MIMO_PLAN'), ukonceni: '2026-10-07' },
  ]) await d.insert(schema.zamestnanec).values(z);
  await d.insert(schema.sablonaSmeny).values([
    { id: 's816', firmaId: 'fa', nazev: 'Ranní', zacatek: '08:00', konec: '16:30', prestavkaMin: 0, barva: null },
    { id: 's1220', firmaId: 'fa', nazev: 'Odpolední', zacatek: '12:00', konec: '20:00', prestavkaMin: 0, barva: null },
    { id: 'sb', firmaId: 'fb', nazev: 'Cizí', zacatek: '06:00', konec: '14:00', prestavkaMin: 0, barva: null },
  ]);
  const smena = (zamestnanecId: string, datum: string, sablonaId: string | null, typ: 'SMENA' | 'NEMOC' | 'DOVOLENA' | 'ZAVRENO' = 'SMENA') =>
    ({ zamestnanecId, datum, typ, sablonaId, minuty: 360 });
  await d.insert(schema.planSmeny).values([
    // Týden 19.–25. 10.
    smena('jana', '2026-10-19', 's816'), smena('jana', '2026-10-21', 's1220'),
    smena('magda', '2026-10-19', null, 'NEMOC'), smena('magda', '2026-10-20', null, 'DOVOLENA'), smena('magda', '2026-10-22', 's816'),
    smena('petr', '2026-10-20', 's816'),
    smena('hacker', '2026-10-23', 's816'),
    smena('host', '2026-10-24', 's1220'),
    smena('cizinec', '2026-10-19', 'sb'),
    // Aktuální týden 5.–11. 10.
    smena('jana', '2026-10-07', 's816'),
  ]);
  await d.insert(schema.den).values([
    // Petr má v plánu směnu, ale v docházce nemoc: buňka musí být prázdná.
    { zamestnanecId: 'petr', datum: '2026-10-20', typ: 'NEMOC', minuty: 0, kasa: false, poznamka: 'TAJNA-POZNAMKA-DNE' },
    // Brigádník (mimo plán) má směnu v sobotu, ale v docházce dovolenou: v rozpisu nebude vůbec.
    { zamestnanecId: 'host', datum: '2026-10-24', typ: 'DOVOLENA', minuty: 0, kasa: false, poznamka: null },
  ]);
  await d.insert(schema.odkazRozpisu).values([
    { id: 'o1', firmaId: 'fa', zamestnanecId: null, token: TABLET, nazev: 'Tablet v prodejně', vytvoreno: '2026-10-01T00:00:00Z', zruseno: null },
    { id: 'o2', firmaId: 'fa', zamestnanecId: 'jana', token: JANA, nazev: 'Jana Příjmení', vytvoreno: '2026-10-01T00:00:00Z', zruseno: null },
    { id: 'o3', firmaId: 'fa', zamestnanecId: null, token: ZRUSENY, nazev: 'Tablet v prodejně 2', vytvoreno: '2026-10-01T00:00:00Z', zruseno: '2026-10-02T00:00:00Z' },
    { id: 'o4', firmaId: 'fb', zamestnanecId: null, token: TABLET_B, nazev: 'Tablet v prodejně', vytvoreno: '2026-10-01T00:00:00Z', zruseno: null },
    { id: 'o5', firmaId: 'fa', zamestnanecId: 'neaktivni', token: NEAKTIVNI, nazev: 'Neaktivní', vytvoreno: '2026-10-01T00:00:00Z', zruseno: null },
    { id: 'o6', firmaId: 'fa', zamestnanecId: 'vcera', token: UKONCEN_VCERA, nazev: 'Včera', vytvoreno: '2026-10-01T00:00:00Z', zruseno: null },
    { id: 'o7', firmaId: 'fa', zamestnanecId: 'dnes', token: UKONCEN_DNES, nazev: 'Dnes', vytvoreno: '2026-10-01T00:00:00Z', zruseno: null },
  ]);
}, 60000);

afterAll(async () => {
  await mf?.dispose();
});

function zkontrolujHlavicky(r: Response, popis: string) {
  for (const [nazev, hodnota] of Object.entries(HLAVICKY)) expect(r.headers.get(nazev), `${popis}: ${nazev}`).toBe(hodnota);
}

/** HTML řádku tabulky, ve kterém je dané jméno. */
function radek(stranka: string, jmeno: string): string {
  const zacatek = stranka.lastIndexOf('<tr', stranka.indexOf(`>${jmeno}<`));
  return stranka.slice(zacatek, stranka.indexOf('</tr>', zacatek));
}

describe('Worker rozpis', () => {
  it('platný tablet odkaz ukáže týden: nadpis, jména a čas šablony', async () => {
    const r = await nacti(`/r/${TABLET}?tyden=2026-10-21`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/^text\/html/);
    zkontrolujHlavicky(r, '200');
    const stranka = await r.text();
    expect(stranka).toContain('Rozpis směn 19.–25. 10. 2026');
    expect(stranka).toContain('>Jana<');
    expect(stranka).toContain('>Magda<');
    expect(stranka).toContain('8–16:30');
    expect(stranka).toContain('12–20');
    // Tablet nemá osobní kartu ani manifest.
    expect(stranka).not.toContain('Moje směny');
    expect(stranka).not.toContain('rel="manifest"');
  });

  it('neznámý i zrušený token vrátí 404 s textem a hlavičkami', async () => {
    for (const cesta of ['/r/neznamy-token', `/r/${ZRUSENY}`, `/r/${ZRUSENY}/manifest.webmanifest`, '/', '/neco']) {
      const r = await nacti(cesta);
      expect(r.status, cesta).toBe(404);
      zkontrolujHlavicky(r, cesta);
      expect(await r.text(), cesta).toContain(NEPLATI);
    }
  });

  it('?tyden= kterýkoli den týdne ukáže jeho týden, nevalidní hodnota aktuální týden', async () => {
    expect(await (await nacti(`/r/${TABLET}?tyden=2026-10-25`)).text()).toContain('Rozpis směn 19.–25. 10. 2026');
    for (const tyden of ['nesmysl', '2026-02-30', '2026-13-01', '']) {
      const r = await nacti(`/r/${TABLET}?tyden=${tyden}`);
      expect(r.status, tyden).toBe(200);
      expect(await r.text(), tyden).toContain('Rozpis směn 5.–11. 10. 2026');
    }
    expect(await (await nacti(`/r/${TABLET}`)).text()).toContain('Rozpis směn 5.–11. 10. 2026');
  });

  it('šipky vedou na předchozí a další týden, „Dnes" jen mimo aktuální týden', async () => {
    const jinyTyden = await (await nacti(`/r/${TABLET}?tyden=2026-10-21`)).text();
    expect(jinyTyden).toContain(`href="/r/${TABLET}?tyden=2026-10-12"`);
    expect(jinyTyden).toContain(`href="/r/${TABLET}?tyden=2026-10-26"`);
    expect(jinyTyden).toContain(`href="/r/${TABLET}"`);
    expect(jinyTyden).toContain('Dnes');
    const aktualni = await (await nacti(`/r/${TABLET}`)).text();
    expect(aktualni).not.toContain(`href="/r/${TABLET}"`);
  });

  it('nemoc, dovolená ani nepřítomnost z docházky se v HTML neobjeví, buňka je prázdná', async () => {
    const stranka = await (await nacti(`/r/${TABLET}?tyden=2026-10-21`)).text();
    expect(stranka).not.toMatch(/nemoc|dovolen/i);
    // Magda: Po nemoc a Út dovolená v plánu, Čt směna; Petr: Út směna, ale v docházce nemoc.
    expect(radek(stranka, 'Magda').match(/\d{1,2}(:\d\d)?–\d{1,2}(:\d\d)?/g)).toEqual(['8–16:30']);
    expect(radek(stranka, 'Petr')).toContain('>Petr<');
    expect(radek(stranka, 'Petr')).not.toMatch(/\d/);
    // Mimo plán: Majitel bez směny chybí, Brigádník má jedinou směnu v den dovolené z docházky, takže chybí také.
    expect(stranka).not.toContain('Majitel');
    expect(stranka).not.toContain('Brigádník');
    // Poznámky a čísla účtů se nečtou.
    expect(stranka).not.toContain('TAJN');
  });

  it('osobní odkaz: karta „Moje směny", zvýrazněný řádek a manifest', async () => {
    const r = await nacti(`/r/${JANA}?tyden=2026-10-19`);
    expect(r.status).toBe(200);
    zkontrolujHlavicky(r, 'osobní');
    const stranka = await r.text();
    expect(stranka).toContain('Moje směny');
    expect(stranka).toContain(`<link rel="manifest" href="/r/${JANA}/manifest.webmanifest">`);
    expect(radek(stranka, 'Jana')).toContain('class="ja"');

    const prazdny = await (await nacti(`/r/${JANA}?tyden=2026-11-02`)).text();
    expect(prazdny).toContain('Tento týden nemáš žádnou směnu.');

    const m = await nacti(`/r/${JANA}/manifest.webmanifest`);
    expect(m.status).toBe(200);
    expect(m.headers.get('Content-Type')).toMatch(/^application\/manifest\+json/);
    zkontrolujHlavicky(m, 'manifest');
    const manifest = await m.json() as { start_url: string; name: string; icons: { src: string }[] };
    expect(manifest.start_url).toBe(`/r/${JANA}`);
    expect(manifest.name).toBe('Rozpis – Jana');
    expect(manifest.icons.map((i) => i.src)).toContain('/icon-192.png');
  });

  it('tablet odkaz manifest nemá (404)', async () => {
    const r = await nacti(`/r/${TABLET}/manifest.webmanifest`);
    expect(r.status).toBe(404);
    zkontrolujHlavicky(r, 'manifest tabletu');
  });

  it('jméno se escapuje', async () => {
    const stranka = await (await nacti(`/r/${TABLET}?tyden=2026-10-21`)).text();
    expect(stranka).not.toContain('<script>alert(1)');
    expect(stranka).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('odkaz firmy A neukáže lidi ani šablony firmy B a naopak', async () => {
    const a = await (await nacti(`/r/${TABLET}?tyden=2026-10-19`)).text();
    expect(a).not.toContain('Cizinec');
    expect(a).not.toContain('6–14');
    const b = await (await nacti(`/r/${TABLET_B}?tyden=2026-10-19`)).text();
    expect(b).toContain('>Cizinec<');
    expect(b).toContain('6–14');
    expect(b).not.toContain('>Jana<');
  });

  it('tablet se plánovaně obnovuje na aktuální týden (location.replace bez ?tyden=), osobní stránka jen location.reload', async () => {
    const tablet = await (await nacti(`/r/${TABLET}?tyden=2026-10-21`)).text();
    expect(tablet).toContain(`location.replace("/r/${TABLET}")`);
    expect(tablet).not.toContain('location.reload');
    expect(tablet).not.toMatch(/location\.replace\([^)]*tyden/);
    const osobni = await (await nacti(`/r/${JANA}?tyden=2026-10-21`)).text();
    expect(osobni).toContain('location.reload()');
    expect(osobni).not.toContain('location.replace');
  });

  it('osobní odkaz neaktivního člověka nebo po datu ukončení neplatí (404), v den ukončení platí', async () => {
    for (const [token, popis] of [[NEAKTIVNI, 'neaktivní'], [UKONCEN_VCERA, 'ukončení včera']] as const) {
      for (const cesta of [`/r/${token}`, `/r/${token}/manifest.webmanifest`]) {
        const r = await nacti(cesta);
        expect(r.status, `${popis} ${cesta}`).toBe(404);
        zkontrolujHlavicky(r, `${popis} ${cesta}`);
        expect(await r.text(), `${popis} ${cesta}`).toContain(NEPLATI);
      }
    }
    expect((await nacti(`/r/${UKONCEN_DNES}`)).status).toBe(200);
    expect((await nacti(`/r/${UKONCEN_DNES}/manifest.webmanifest`)).status).toBe(200);
    // Tablet je nedotčený.
    expect((await nacti(`/r/${TABLET}`)).status).toBe(200);
  });

  it('chyba vrátí 500 s malou HTML stránkou, která se sama obnoví, bez podrobností chyby', async () => {
    const chyba = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await app.request(`/r/${TABLET}`, {}, {});
      expect(r.status).toBe(500);
      expect(r.headers.get('Content-Type')).toMatch(/^text\/html/);
      zkontrolujHlavicky(r, '500');
      const stranka = await r.text();
      expect(stranka).toContain('Rozpis se teď nepodařilo načíst. Zkusím to znovu za chvíli.');
      expect(stranka).toContain('location.reload()');
      expect(stranka).toContain('60000');
      expect(stranka).not.toMatch(/TypeError|Error|undefined|at |stack|\.ts/);
      expect(chyba).toHaveBeenCalled();
    } finally {
      chyba.mockRestore();
    }
  });

  it('HTML nikdy neobsahuje příjmení', async () => {
    for (const cesta of [`/r/${TABLET}?tyden=2026-10-21`, `/r/${TABLET}`, `/r/${JANA}?tyden=2026-10-19`, `/r/${JANA}`]) {
      expect(await (await nacti(cesta)).text(), cesta).not.toContain('Příjmení');
    }
  });
});
