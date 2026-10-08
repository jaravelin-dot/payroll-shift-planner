import { den, mesicniVstup, planSmeny, sazba, zamestnanec } from './schema';
import { bloky, radkuVBloku, smazHodnoty, vlozNeboPrepis, vlozRadky } from './davky';
import { davka, db, MAX_PARAMETRU, MAX_PRIKAZU, sRozpoctem } from './klient';

// Příkazy se jen skládají (`toSQL`), do D1 se nesahá.
const d = db({} as never);
const sql = (prikaz: unknown) => (prikaz as { toSQL(): { sql: string; params: unknown[] } }).toSQL();

const dnyRadky = (pocet: number): (typeof den.$inferInsert)[] =>
  Array.from({ length: pocet }, (_, i) => ({ zamestnanecId: 'z1', datum: `2026-01-${String(i).padStart(3, '0')}`, typ: 'PRACE' as const, minuty: 480, kasa: false, poznamka: null }));

describe('radkuVBloku a bloky', () => {
  test('počet řádků v bloku = podíl 100 parametrů a počtu sloupců', () => {
    expect(radkuVBloku(6)).toBe(16);
    expect(radkuVBloku(5)).toBe(20);
    expect(radkuVBloku(17)).toBe(5);
    expect(radkuVBloku(100)).toBe(1);
    expect(radkuVBloku(150)).toBe(1);
  });

  test('bloky zachovají pořadí a poslední blok je kratší', () => {
    expect(bloky([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(bloky([], 16)).toEqual([]);
  });
});

describe('vlozNeboPrepis', () => {
  test('400 dní (6 sloupců) → 25 příkazů po nejvýš 16 řádcích a 96 parametrech', () => {
    const prikazy = vlozNeboPrepis(d, den, dnyRadky(400), [den.zamestnanecId, den.datum]);
    expect(prikazy).toHaveLength(25);
    const parametry = prikazy.map((p) => sql(p).params.length);
    expect(Math.max(...parametry)).toBe(96);
    expect(parametry.reduce((a, b) => a + b, 0)).toBe(400 * 6);
    expect(prikazy.length).toBeLessThanOrEqual(MAX_PRIKAZU);
  });

  test('jeden vícerádkový INSERT s ON CONFLICT … DO UPDATE přes excluded a bez parametrů v SET', () => {
    const [prikaz] = vlozNeboPrepis(d, den, dnyRadky(3), [den.zamestnanecId, den.datum]);
    const { sql: text, params } = sql(prikaz);
    expect(text).toBe('insert into "den" ("zamestnanec_id", "datum", "typ", "minuty", "kasa", "poznamka") values (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?) '
      + 'on conflict ("den"."zamestnanec_id", "den"."datum") do update set "typ" = excluded."typ", "minuty" = excluded."minuty", "kasa" = excluded."kasa", "poznamka" = excluded."poznamka"');
    expect(params).toHaveLength(18);
  });

  test('plán (5 sloupců) → 20 řádků na příkaz; měsíční vstup (8 sloupců) → 12; klíč se nepřepisuje', () => {
    const plan = Array.from({ length: 400 }, (_, i) => ({ zamestnanecId: 'z1', datum: `d${i}`, typ: 'VOLNO' as const, sablonaId: null, minuty: 0 }));
    expect(vlozNeboPrepis(d, planSmeny, plan, [planSmeny.zamestnanecId, planSmeny.datum])).toHaveLength(20);
    const vstupy = Array.from({ length: 25 }, (_, i) => ({ zamestnanecId: 'z1', rok: 2026, mesic: i, odmenaZaDenHal: 0, aktivitaHal: 0, jineOdmenyHal: 0, srazkyHal: 0, prumernyVydelekHal: null, poznamka: null }));
    const prikazy = vlozNeboPrepis(d, mesicniVstup, vstupy, [mesicniVstup.zamestnanecId, mesicniVstup.rok, mesicniVstup.mesic]);
    expect(prikazy).toHaveLength(3);
    expect(sql(prikazy[0]).sql).not.toContain('"rok" = excluded');
    expect(sql(prikazy[0]).sql).toContain('"odmena_za_den_hal" = excluded."odmena_za_den_hal"');
  });

  test('prázdný seznam → žádný příkaz', () => {
    expect(vlozNeboPrepis(d, den, [], [den.zamestnanecId, den.datum])).toEqual([]);
  });
});

describe('vlozRadky', () => {
  test('sazby (4 sloupce) → 25 řádků na příkaz; 100 sazeb = 4 příkazy', () => {
    const sazby = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, zamestnanecId: 'z1', platiOd: '2026-01-01', hodinovaHal: i }));
    const prikazy = vlozRadky(d, sazba, sazby);
    expect(prikazy).toHaveLength(4);
    expect(prikazy.every((p) => sql(p).params.length === 100)).toBe(true);
  });

  test('zaměstnanec (21 sloupců) → 4 řádky na příkaz; prázdný seznam → žádný příkaz', () => {
    const osoba = (i: number): typeof zamestnanec.$inferInsert => ({
      id: `z${i}`, firmaId: 'f1', jmeno: 'Jana', prijmeni: 'Nováková', smlouva: 'HPP', uvazekMinTydne: 2400, nastup: '2026-01-01', ukonceni: null,
      prohlaseni: true, invalidita: 'ZADNA', ztpp: false, deti: [], statniPojistenec: false, slevaNaPojistnem: false, ucet: null, poznamka: null, aktivni: true,
    });
    expect(vlozRadky(d, zamestnanec, [1, 2, 3, 4].map(osoba))).toHaveLength(1);
    expect(vlozRadky(d, zamestnanec, [1, 2, 3, 4, 5].map(osoba))).toHaveLength(2);
    expect(vlozRadky(d, sazba, [])).toEqual([]);
  });
});

describe('smazHodnoty', () => {
  test('400 dat → 5 příkazů, každý nejvýš 100 parametrů (zaměstnanec + 99 dat)', () => {
    const data = Array.from({ length: 400 }, (_, i) => `2026-01-${String(i).padStart(3, '0')}`);
    const prikazy = smazHodnoty(d, den, den.zamestnanecId, 'z1', den.datum, data);
    expect(prikazy).toHaveLength(5);
    const parametry = prikazy.map((p) => sql(p).params.length);
    expect(parametry).toEqual([100, 100, 100, 100, 5]);
    expect(sql(prikazy[0]).sql).toMatch(/^delete from "den" where \("den"\."zamestnanec_id" = \? and "den"\."datum" in \(\?(, \?){98}\)\)$/);
  });

  test('žádná data → žádný příkaz', () => {
    expect(smazHodnoty(d, den, den.zamestnanecId, 'z1', den.datum, [])).toEqual([]);
  });
});

describe('hlídání limitů D1', () => {
  test('davka odmítne víc než 50 příkazů dřív, než sáhne do databáze', async () => {
    const prikazy = Array.from({ length: MAX_PRIKAZU + 1 }, () => d.delete(den));
    await expect(davka(d, prikazy)).rejects.toThrow(/51 příkazů, limit D1 je 50/);
    await expect(davka(d, [])).resolves.toBeUndefined();
  });

  test('sRozpoctem: 51. příkaz a příkaz se 101 parametry vyhodí chybu, počítá se při bind', () => {
    const ps = { bind: (...h: unknown[]) => ({ h }) };
    const d1 = sRozpoctem({ prepare: () => ps, batch: async () => [] } as never);
    d1.prepare('select 1'); // bez bind se nepočítá
    for (let i = 0; i < MAX_PRIKAZU; i++) d1.prepare('select ?').bind(i);
    expect(d1.pocetPrikazu()).toBe(50);
    expect(() => d1.prepare('select ?').bind(1)).toThrow(/limit D1 50 příkazů/);

    const druhy = sRozpoctem({ prepare: () => ps, batch: async () => [] } as never);
    expect(() => druhy.prepare('x').bind(...Array(MAX_PARAMETRU).fill(0))).not.toThrow();
    expect(() => druhy.prepare('x').bind(...Array(MAX_PARAMETRU + 1).fill(0))).toThrow(/101 vázaných parametrů/);
  });
});
