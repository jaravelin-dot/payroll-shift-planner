import type { Den, NastaveniPlanovace, PlanSmeny, SablonaSmeny } from '../shared/api';
import {
  indexStridani, jeNepritomnost, jeOdpoledniTyden, jeZaviraci, kontrolaTydne, MEZ_KOMBINACI, navrhniTyden, type ClovekPlanovace, type VstupPlanovace,
} from './planovac';

const S = (id: string, zacatek: string, konec: string): SablonaSmeny =>
  ({ id, firmaId: 'f', nazev: id, zacatek, konec, prestavkaMin: 0, barva: null });
const SABLONY = [
  S('8-12', '08:00', '12:00'), S('10-14', '10:00', '14:00'), S('14-18', '14:00', '18:00'), S('11-15', '11:00', '15:00'),
  S('9-14', '09:00', '14:00'), S('8-14', '08:00', '14:00'), S('12-18', '12:00', '18:00'), S('8-16', '08:00', '16:00'), S('10-18', '10:00', '18:00'),
  S('9:30-13:30', '09:30', '13:30'),
];
/** Ranní okna obsazení (přesný počet). */
const RANNI = [{ od: '08:00', do: '09:00', lidi: 1 }, { od: '09:00', do: '09:30', lidi: 2 }, { od: '09:30', do: '10:00', lidi: 3 }];
/** Obsazení pro testy: ráno přesně, přes den aspoň 3. */
const OBSAZENI = [...RANNI, { od: '10:00', do: '18:00', lidi: 3, aspon: true }];
const NASTAVENI: NastaveniPlanovace = {
  planovacKasaOd: '08:00', planovacKasaDo: '18:00', planovacMinKasaru: 2, planovacOtevrenoOd: '08:00', planovacOtevrenoDo: '18:00',
  planovacSablony: ['8-12', '10-14', '14-18'], planovacKotva: '2026-09-07', planovacDozorNaKaseDo: '10:00', planovacObsazeni: OBSAZENI,
};
const c = (id: string, rolePlanu: ClovekPlanovace['rolePlanu'], stridaniSmen: string[] = [], smlouva: 'HPP' | 'DPP' = 'HPP'): ClovekPlanovace =>
  ({ id, jmeno: id, prijmeni: 'DOPLNIT', smlouva, nastup: '2026-01-01', ukonceni: null, rolePlanu, stridaniSmen });
const sm = (id: string, datum: string, sablonaId: string): PlanSmeny => ({ zamestnanecId: id, datum, typ: 'SMENA', sablonaId, minuty: 240 });
const jine = (id: string, datum: string, typ: PlanSmeny['typ']): PlanSmeny => ({ zamestnanecId: id, datum, typ, sablonaId: null, minuty: 240 });
const vstup = (zmeny: Partial<VstupPlanovace>): VstupPlanovace =>
  ({ pondeli: '2026-10-19', lide: [], plan: [], dochazka: [], sablony: SABLONY, nastaveni: NASTAVENI, ...zmeny });
const T19 = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const smena2 = (plan: PlanSmeny[], id: string, datum: string) => plan.find((p) => p.zamestnanecId === id && p.datum === datum)?.sablonaId;

describe('indexStridani', () => {
  test('po týdnech od kotvy, i před kotvou, přes přelom roku a s kotvou mimo pondělí', () => {
    expect(indexStridani('2026-09-07', '2026-09-07', 2)).toBe(0);
    expect(indexStridani('2026-09-07', '2026-09-14', 2)).toBe(1);
    expect(indexStridani('2026-09-07', '2026-09-21', 2)).toBe(0);
    expect(indexStridani('2026-09-07', '2026-08-31', 2)).toBe(1);
    expect(indexStridani('2026-09-07', '2027-01-04', 2)).toBe(1);
    expect(indexStridani('2026-09-09', '2026-09-23', 2)).toBe(0);
    expect(indexStridani('2026-09-07', '2026-09-28', 3)).toBe(0);
    expect(indexStridani('2026-09-07', '2026-09-28', 1)).toBe(0);
  });
});

describe('jeZaviraci a odpolední týden', () => {
  test('zavírací = končí v čas hlídání kasy nebo později, i přes půlnoc', () => {
    expect(jeZaviraci(S('a', '14:00', '18:00'), '18:00')).toBe(true);
    expect(jeZaviraci(S('a', '12:00', '18:00'), '18:00')).toBe(true);
    expect(jeZaviraci(S('a', '10:00', '18:30'), '18:00')).toBe(true);
    expect(jeZaviraci(S('a', '10:00', '14:00'), '18:00')).toBe(false);
    expect(jeZaviraci(S('a', '19:00', '03:00'), '18:00')).toBe(true);
  });

  test('odpolední týden = víc než polovina směn týdne je zavíracích; jiné týdny a typy se nepočítají', () => {
    const plan = [
      sm('a', '2026-10-12', '14-18'), sm('a', '2026-10-13', '14-18'), sm('a', '2026-10-14', '14-18'), sm('a', '2026-10-15', '10-14'), sm('a', '2026-10-16', '10-14'),
      sm('b', '2026-10-12', '14-18'), sm('b', '2026-10-13', '14-18'), sm('b', '2026-10-14', '10-14'), sm('b', '2026-10-15', '10-14'), jine('b', '2026-10-16', 'NEMOC'),
      sm('c', '2026-10-19', '14-18'), sm('c', '2026-10-09', '14-18'),
    ];
    expect(jeOdpoledniTyden('a', '2026-10-12', plan, SABLONY, '18:00')).toBe(true);
    expect(jeOdpoledniTyden('b', '2026-10-12', plan, SABLONY, '18:00')).toBe(false);
    expect(jeOdpoledniTyden('c', '2026-10-12', plan, SABLONY, '18:00')).toBe(false);
    expect(jeOdpoledniTyden('c', '2026-10-19', plan, SABLONY, '18:00')).toBe(true);
  });

  test('nepřítomnost v docházce = vše kromě práce', () => {
    expect(['PRACE', 'NEMOC', 'DOVOLENA', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE', 'ABSENCE'].map((t) => jeNepritomnost(t as Den['typ'])))
      .toEqual([false, true, true, true, true, true, true]);
  });
});

describe('kontrolaTydne', () => {
  // Bez ranního obsazení: tyhle testy hlídají jen kasu a prodejnu 9–13.
  const K = { ...NASTAVENI, planovacKasaOd: '10:00', planovacKasaDo: '14:00', planovacOtevrenoOd: '10:00', planovacOtevrenoDo: '14:00', planovacObsazeni: [] };

  test('chybějící kasař a málo lidí se sloučí do úseků po dnech; víkend a svátek se nekontrolují', () => {
    const lide = [c('Alena', 'KASA')];
    const plan = [sm('Alena', '2026-10-26', '10-14'), sm('Alena', '2026-10-31', '10-14')];
    const u = kontrolaTydne(vstup({ pondeli: '2026-10-26', lide, plan, nastaveni: K }));
    const po = u.filter((x) => x.datum === '2026-10-26');
    expect(po).toEqual([
      { druh: 'CHYBI_KASAR', datum: '2026-10-26', od: '10:00', do: '14:00', jmena: [] },
      { druh: 'MALO_LIDI', datum: '2026-10-26', od: '10:00', do: '14:00', jmena: [] },
    ]);
    expect(u.some((x) => x.datum === '2026-10-28' || x.datum === '2026-10-31')).toBe(false);
    expect(u.filter((x) => x.druh === 'CHYBI_KASAR').map((x) => x.datum)).toEqual(['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30']);
  });

  test('učící se zaskočí: úsek se jménem; mění-li se jména, úsek se rozdělí', () => {
    const lide = [c('Alena', 'KASA'), c('Patrika', 'KASA_UCI_SE'), c('Jiřina', 'KASA_UCI_SE')];
    const plan = [sm('Alena', '2026-10-19', '10-14'), sm('Patrika', '2026-10-19', '10-14'), sm('Jiřina', '2026-10-19', '11-15')];
    const u = kontrolaTydne(vstup({ lide, plan, nastaveni: K })).filter((x) => x.datum === '2026-10-19');
    expect(u).toEqual([
      { druh: 'ZASKAKUJE', datum: '2026-10-19', od: '10:00', do: '11:00', jmena: ['Patrika'] },
      { druh: 'ZASKAKUJE', datum: '2026-10-19', od: '11:00', do: '14:00', jmena: ['Jiřina', 'Patrika'] },
    ]);
  });

  test('podle docházky: směna v plánu, ale v docházce nemoc → upozornění a člověk se nepočítá', () => {
    const lide = [c('Alena', 'KASA'), c('Magda', 'KASA')];
    const plan = [sm('Alena', '2026-10-19', '10-14'), sm('Magda', '2026-10-19', '10-14')];
    const dochazka: Den[] = [{ zamestnanecId: 'Magda', datum: '2026-10-19', typ: 'NEMOC', minuty: 240, kasa: false, poznamka: null }];
    const u = kontrolaTydne(vstup({ lide, plan, dochazka, nastaveni: K })).filter((x) => x.datum === '2026-10-19');
    expect(u).toContainEqual({ druh: 'PODLE_DOCHAZKY', datum: '2026-10-19', od: null, do: null, jmena: ['Magda'] });
    expect(u).toContainEqual({ druh: 'CHYBI_KASAR', datum: '2026-10-19', od: '10:00', do: '14:00', jmena: [] });
  });

  test('odpolední týden podruhé jen u lidí bez pevného střídání; stejné křestní jméno se doplní příjmením', () => {
    const kristyna = { ...c('k1', 'PRODEJNA'), jmeno: 'Kristýna', prijmeni: 'Nová' };
    const katka2 = { ...c('k2', 'PRODEJNA', ['14-18']), jmeno: 'Kristýna', prijmeni: 'Stará' };
    const plan = [...['2026-10-12', '2026-10-19'].flatMap((po) => [0, 1, 2].map((i) => {
      const d = new Date(`${po}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10);
    })).flatMap((d) => [sm('k1', d, '14-18'), sm('k2', d, '14-18')])];
    const u = kontrolaTydne(vstup({ lide: [kristyna, katka2], plan, nastaveni: K })).filter((x) => x.druh === 'ODPOLEDNE_PODRUHE');
    expect(u).toEqual([{ druh: 'ODPOLEDNE_PODRUHE', datum: '2026-10-19', od: null, do: null, jmena: ['Kristýna Nová'] }]);
  });

  test('odpolední týden podruhé se u dohody (DPP) nehlásí, plánovač ji neplánuje', () => {
    const hpp = c('k1', 'PRODEJNA');
    const dpp = c('d1', 'PRODEJNA', [], 'DPP');
    const plan = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-19', '2026-10-20', '2026-10-21']
      .flatMap((d) => [sm('k1', d, '14-18'), sm('d1', d, '14-18')]);
    const u = kontrolaTydne(vstup({ lide: [hpp, dpp], plan, nastaveni: K })).filter((x) => x.druh === 'ODPOLEDNE_PODRUHE');
    expect(u).toEqual([{ druh: 'ODPOLEDNE_PODRUHE', datum: '2026-10-19', od: null, do: null, jmena: ['k1'] }]);
  });

  test('den mimo pracovní poměr se nepočítá; bez problémů prázdný seznam', () => {
    const lide = [c('Alena', 'KASA'), { ...c('Magda', 'KASA'), nastup: '2026-10-20' }];
    const plan = T19.flatMap((d) => [sm('Alena', d, '10-14'), sm('Magda', d, '10-14')]);
    const u = kontrolaTydne(vstup({ lide, plan, nastaveni: K }));
    expect(u.map((x) => [x.druh, x.datum])).toEqual([['CHYBI_KASAR', '2026-10-19'], ['MALO_LIDI', '2026-10-19']]);
  });

  test('dozor se počítá na kasu do planovacDozorNaKaseDo, od té doby už ne', () => {
    const lide = [c('Honza', 'DOZOR', ['8-16']), c('Alena', 'KASA')];
    const plan = [sm('Honza', '2026-10-19', '8-16'), sm('Alena', '2026-10-19', '8-12')];
    const bezObsazeni = { ...NASTAVENI, planovacObsazeni: [] };
    const po = (nastaveni: typeof NASTAVENI) => kontrolaTydne(vstup({ lide, plan, nastaveni })).filter((x) => x.datum === '2026-10-19').map((x) => [x.druh, x.od, x.do]);
    expect(po(bezObsazeni)).toEqual([['CHYBI_KASAR', '10:00', '18:00'], ['MALO_LIDI', '12:00', '18:00']]);
    expect(po({ ...bezObsazeni, planovacDozorNaKaseDo: '09:00' })).toEqual([['CHYBI_KASAR', '09:00', '18:00'], ['MALO_LIDI', '12:00', '18:00']]);
  });

  test('ranní obsazení: nad i pod cílem; dozor do hranice se počítá, mimo plán ne; úseky se slučují jen při stejném počtu i cíli', () => {
    const lide = [c('A', 'KASA'), c('B', 'KASA'), c('C', 'KASA'), c('Honza', 'DOZOR'), c('Milan', 'MIMO_PLAN', [], 'DPP')];
    const plan = [
      ...['A', 'B', 'C'].map((id) => sm(id, '2026-10-19', '8-14')),
      sm('A', '2026-10-20', '8-14'), sm('Honza', '2026-10-20', '8-16'), sm('Milan', '2026-10-20', '9:30-13:30'), sm('B', '2026-10-20', '10-14'),
      sm('A', '2026-10-22', '8-14'),
    ];
    const u = kontrolaTydne(vstup({ lide, plan, nastaveni: { ...K, planovacObsazeni: RANNI } }));
    const den =(d: string) => u.filter((x) => x.datum === d).map(({ druh, od, do: k, pocet, cil }) => ({ druh, od, do: k, pocet, cil }));
    expect(u.filter((x) => x.druh === 'OBSAZENI').every((x) => x.jmena.length === 0)).toBe(true);
    expect(den('2026-10-19')).toEqual([
      { druh: 'OBSAZENI', od: '08:00', do: '09:00', pocet: 3, cil: 1 },
      { druh: 'OBSAZENI', od: '09:00', do: '09:30', pocet: 3, cil: 2 },
    ]);
    // Út: A a Honza (dozor ráno) jsou v 8–9 dva, cíl je jeden; Milan (mimo plán) se v 9:30 nepočítá.
    expect(den('2026-10-20')).toEqual([
      { druh: 'OBSAZENI', od: '08:00', do: '09:00', pocet: 2, cil: 1 },
      { druh: 'OBSAZENI', od: '09:30', do: '10:00', pocet: 2, cil: 3 },
    ]);
    // Pořadí v dni: kasa, ranní obsazení, málo lidí.
    expect(den('2026-10-22')).toEqual([
      { druh: 'CHYBI_KASAR', od: '10:00', do: '14:00', pocet: undefined, cil: undefined },
      { druh: 'OBSAZENI', od: '09:00', do: '09:30', pocet: 1, cil: 2 },
      { druh: 'OBSAZENI', od: '09:30', do: '10:00', pocet: 1, cil: 3 },
      { druh: 'MALO_LIDI', od: '10:00', do: '14:00', pocet: undefined, cil: undefined },
    ]);
    // Sousední okna se stejným cílem a stejným počtem se sloučí do jednoho úseku.
    const dve = kontrolaTydne(vstup({ lide, plan, nastaveni: { ...K, planovacObsazeni: [{ od: '08:00', do: '09:00', lidi: 2 }, { od: '09:00', do: '10:00', lidi: 2 }] } }));
    expect(dve.filter((x) => x.datum === '2026-10-19').map((x) => [x.druh, x.od, x.do, x.pocet, x.cil])).toEqual([['OBSAZENI', '08:00', '10:00', 3, 2]]);
  });

  test('okno „aspoň": nadbytek se nehlásí, nedostatek ano; dozor po hranici a mimo plán se nepočítají', () => {
    const lide = [c('A', 'KASA'), c('B', 'KASA_UCI_SE'), c('C', 'PRODEJNA'), c('D', 'PRODEJNA'), c('E', 'PRODEJNA'), c('Honza', 'DOZOR'), c('Milan', 'MIMO_PLAN', [], 'DPP')];
    const plan = [
      ...['A', 'B', 'C', 'D', 'E'].map((id) => sm(id, '2026-10-19', '10-14')),
      sm('A', '2026-10-20', '10-14'), sm('Honza', '2026-10-20', '10-14'), sm('Milan', '2026-10-20', '10-14'), sm('B', '2026-10-20', '11-15'),
    ];
    const nastaveni = { ...K, planovacMinKasaru: 1, planovacObsazeni: [{ od: '10:00', do: '14:00', lidi: 3, aspon: true }] };
    const dny = (n: typeof nastaveni) => kontrolaTydne(vstup({ lide, plan, nastaveni: n })).filter((x) => x.datum <= '2026-10-20');
    // Po: 5 lidí na okno „aspoň 3" je v pořádku. Út: Honza je po 10:00 dozor a Milan mimo plán, takže v 10–11 je jen A.
    expect(dny(nastaveni)).toEqual([
      { druh: 'OBSAZENI', datum: '2026-10-20', od: '10:00', do: '11:00', jmena: [], pocet: 1, cil: 3, aspon: true },
      { druh: 'OBSAZENI', datum: '2026-10-20', od: '11:00', do: '14:00', jmena: [], pocet: 2, cil: 3, aspon: true },
    ]);
    // Dozor do 11:00: Honza se v 10–11 počítá, s A jsou dva jako v 11–14 s B, úseky se sloučí.
    expect(dny({ ...nastaveni, planovacDozorNaKaseDo: '11:00' })).toEqual([
      { druh: 'OBSAZENI', datum: '2026-10-20', od: '10:00', do: '14:00', jmena: [], pocet: 2, cil: 3, aspon: true },
    ]);
  });
});

describe('navrhniTyden — ukázková prodejna, týden 19.–23. 1. 2026', () => {
  // Vymyšlený provoz: jedna kasařka se střídá po týdnech ráno/odpoledne, dohodářka má pevnou odpolední,
  // ostatním směny navrhuje plánovač.
  const SABLONY_B = [
    S('8-13', '08:00', '13:00'), S('8-16', '08:00', '16:00'), S('10-18', '10:00', '18:00'), S('9-15', '09:00', '15:00'),
    S('11-16', '11:00', '16:00'), S('12-18', '12:00', '18:00'), S('13-18', '13:00', '18:00'),
  ];
  const LIDE = [
    c('Klára', 'KASA', ['8-13', '13-18']),
    c('Bára', 'KASA'), c('Monika', 'KASA'), c('Zdeňka', 'KASA'), c('Vojta', 'KASA_UCI_SE'), c('Hynek', 'PRODEJNA'), c('Eliška', 'PRODEJNA'),
    c('Dagmar', 'KASA'), c('Olga', 'PRODEJNA', ['13-18'], 'DPP'), c('Libor', 'MIMO_PLAN', [], 'DPP'),
  ];
  const TYDEN = ['2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23'];
  const MINULY = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16'];
  const cely = (id: string, sablona: string, dny = MINULY) => dny.map((d) => sm(id, d, sablona));
  /** Minulý týden: Bára a Hynek měli odpolední týden. */
  const MINULY_PLAN: PlanSmeny[] = [
    ...cely('Klára', '13-18'),
    ...cely('Bára', '13-18'), ...cely('Monika', '8-13'), ...cely('Zdeňka', '9-15'), ...cely('Vojta', '8-13'),
    ...cely('Hynek', '13-18'), ...cely('Eliška', '11-16'), ...cely('Dagmar', '8-13'), ...cely('Olga', '13-18', MINULY.slice(2)),
  ];
  /** Co už v týdnu je: dovolená, přání směny a volna, směna dohody. */
  const PRANI: PlanSmeny[] = [
    ...TYDEN.map((d) => jine('Dagmar', d, 'DOVOLENA')),
    sm('Monika', '2026-01-21', '11-16'), jine('Eliška', '2026-01-23', 'VOLNO'), sm('Olga', '2026-01-20', '13-18'),
  ];
  const N: NastaveniPlanovace = {
    ...NASTAVENI, planovacKotva: '2026-01-05', planovacSablony: ['8-13', '9-15', '11-16', '13-18'],
    planovacObsazeni: [{ od: '08:00', do: '09:00', lidi: 2 }, { od: '09:00', do: '18:00', lidi: 3, aspon: true }],
  };
  const v = (zmeny: Partial<VstupPlanovace> = {}) =>
    vstup({ pondeli: '2026-01-19', sablony: SABLONY_B, lide: LIDE, plan: [...MINULY_PLAN, ...PRANI], nastaveni: N, ...zmeny });
  const navrh = navrhniTyden(v());
  const smena = (id: string, datum: string) => navrh.nove.find((p) => p.zamestnanecId === id && p.datum === datum)?.sablonaId;
  const sablona = new Map(SABLONY_B.map((s) => [s.id, s]));
  const kdoJe = (plan: PlanSmeny[], datum: string, cas: string) => plan
    .filter((p) => p.datum === datum && p.typ === 'SMENA' && p.sablonaId)
    .filter((p) => { const s = sablona.get(p.sablonaId!)!; return s.zacatek <= cas && cas < s.konec; })
    .map((p) => p.zamestnanecId).sort();

  test('pevné střídání podle kotvy: Klára má sudý týden od 5. 1. ranní 8–13', () => {
    for (const d of TYDEN) expect(smena('Klára', d)).toBe('8-13');
  });

  test('kasa: Bára ráno (minulý týden měla odpolední), Zdeňka a Monika odpoledne', () => {
    for (const d of TYDEN) expect([smena('Bára', d), smena('Zdeňka', d)]).toEqual(['8-13', '13-18']);
    expect(['2026-01-19', '2026-01-20', '2026-01-22', '2026-01-23'].map((d) => smena('Monika', d))).toEqual(['13-18', '13-18', '13-18', '13-18']);
  });

  test('přání, dovolená, dohody a mimo plán zůstanou; kdo měl odpolední týden, nedostane 13–18', () => {
    expect(navrh.nove.filter((p) => ['Dagmar', 'Olga', 'Libor'].includes(p.zamestnanecId))).toEqual([]);
    expect([smena('Monika', '2026-01-21'), smena('Eliška', '2026-01-23')]).toEqual([undefined, undefined]);
    expect(navrh.nove.filter((p) => ['Bára', 'Hynek'].includes(p.zamestnanecId) && p.sablonaId === '13-18')).toEqual([]);
  });

  test('návrh je z prohledání všech kombinací (vejde se do rozpočtu)', () => {
    expect(navrh.presny).toBe(true);
  });

  test('jediné upozornění: ve středu po přání Moniky (11–16) jistí kasu od 16:00 učící se Vojta', () => {
    expect(navrh.upozorneni).toEqual([{ druh: 'ZASKAKUJE', datum: '2026-01-21', od: '16:00', do: '18:00', jmena: ['Vojta'] }]);
  });

  test('ráno: v 8:00 přesně dvě kasařky (Bára a Klára), v 9:00 přijde prodejna; kontrola bez obsazení, kasaře i málo lidí', () => {
    const plan = [...PRANI, ...navrh.nove];
    for (const d of TYDEN) {
      expect(kdoJe(plan, d, '08:00')).toEqual(['Bára', 'Klára']);
      expect(kdoJe(plan, d, '08:30')).toEqual(['Bára', 'Klára']);
      expect(kdoJe(plan, d, '09:00').length).toBeGreaterThanOrEqual(3);
    }
    const u = kontrolaTydne(v({ plan: [...MINULY_PLAN, ...PRANI, ...navrh.nove] }));
    expect(u).toEqual(navrh.upozorneni);
    expect(u.filter((x) => ['OBSAZENI', 'CHYBI_KASAR', 'MALO_LIDI'].includes(x.druh))).toEqual([]);
  });

  test('přes den: v 9–18 každou půlhodinu aspoň 3 lidé, v 16–18 nejvýš 5', () => {
    const plan = [...PRANI, ...navrh.nove];
    const casy = Array.from({ length: 18 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
    for (const d of TYDEN) {
      for (const cas of casy) {
        const pocet = kdoJe(plan, d, cas).length;
        expect(pocet).toBeGreaterThanOrEqual(3);
        if (cas >= '16:00') expect(pocet).toBeLessThanOrEqual(5);
      }
    }
  });

  test('postupné zlepšování najde stejný týden jako všechny kombinace', () => {
    const vsechny = navrhniTyden(v(), { rozpocetUzlu: Infinity }).nove;
    const postupne = navrhniTyden(v(), { mezKombinaci: 0 });
    expect(postupne.presny).toBe(false);
    expect(postupne.nove).toEqual(vsechny);
  });

  test('lichý týden střídání: Klára 13–18; v 8:00 přesně dva kasaři, kasař nechybí', () => {
    const tyden = navrhniTyden(v({ pondeli: '2026-01-12', plan: [] }));
    const kasa = new Set(LIDE.filter((z) => z.rolePlanu === 'KASA').map((z) => z.id));
    for (const d of MINULY) {
      expect(smena2(tyden.nove, 'Klára', d)).toBe('13-18');
      const v8 = kdoJe(tyden.nove, d, '08:00');
      expect(v8).toHaveLength(2);
      expect(v8.filter((id) => kasa.has(id))).toHaveLength(2);
    }
    expect(tyden.upozorneni.filter((x) => x.druh === 'CHYBI_KASAR')).toEqual([]);
  });

  test('stejný výsledek při jiném pořadí lidí', () => {
    const znovu = navrhniTyden(v({ lide: [...LIDE].reverse(), plan: [...PRANI, ...MINULY_PLAN] }));
    const serad = (a: PlanSmeny[]) => [...a].sort((x, y) => `${x.zamestnanecId}${x.datum}`.localeCompare(`${y.zamestnanecId}${y.datum}`));
    expect(serad(znovu.nove)).toEqual(serad(navrh.nove));
  });
});

describe('navrhniTyden — pravidla', () => {
  const K = { ...NASTAVENI, planovacKasaOd: '10:00', planovacKasaDo: '18:00', planovacOtevrenoOd: '10:00', planovacOtevrenoDo: '18:00', planovacObsazeni: [] };

  test('přeskočí svátek, den mimo poměr, nepřítomnost v docházce a vyplněný den; DOZOR bez střídání neplánuje', () => {
    const lide = [{ ...c('Alena', 'KASA', ['10-14']), nastup: '2026-10-27' }, c('Honza', 'DOZOR')];
    const plan = [sm('Alena', '2026-10-30', '14-18')];
    const dochazka: Den[] = [{ zamestnanecId: 'Alena', datum: '2026-10-29', typ: 'NEMOC', minuty: 240, kasa: false, poznamka: null }];
    const { nove } = navrhniTyden(vstup({ pondeli: '2026-10-26', lide, plan, dochazka, nastaveni: K }));
    expect(nove.map((p) => [p.zamestnanecId, p.datum, p.sablonaId])).toEqual([['Alena', '2026-10-27', '10-14']]);
  });

  test('kdo měl odpolední týden, jde ráno, i když by pořadí šablon dalo odpoledne', () => {
    const lide = [c('Adam', 'PRODEJNA'), c('Bára', 'PRODEJNA')];
    const plan = ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => sm('Adam', d, '14-18'));
    // Otevírací doba nulová, ať o výsledku nerozhoduje „aspoň 2 lidé" (to by oba poslalo na stejnou směnu).
    const { nove } = navrhniTyden(vstup({ lide, plan, nastaveni: { ...K, planovacMinKasaru: 1, planovacOtevrenoDo: '10:00', planovacSablony: ['14-18', '10-14'] } }));
    expect(new Set(nove.filter((p) => p.zamestnanecId === 'Adam').map((p) => p.sablonaId))).toEqual(new Set(['10-14']));
    expect(new Set(nove.filter((p) => p.zamestnanecId === 'Bára').map((p) => p.sablonaId))).toEqual(new Set(['14-18']));
  });

  test('nedostatek kasařů: zaskočí učící se; když ani to nejde, chybí kasař', () => {
    const N = { ...K, planovacKasaDo: '14:00', planovacOtevrenoDo: '14:00', planovacSablony: ['10-14'] };
    const s = navrhniTyden(vstup({ lide: [c('Alena', 'KASA'), c('Patrika', 'KASA_UCI_SE')], nastaveni: N }));
    expect(s.upozorneni.map((u) => [u.druh, u.od, u.do, u.jmena])).toEqual(T19.map(() => ['ZASKAKUJE', '10:00', '14:00', ['Patrika']]));
    const bez = navrhniTyden(vstup({ lide: [c('Alena', 'KASA')], nastaveni: N }));
    expect(bez.upozorneni.filter((u) => u.druh === 'CHYBI_KASAR')).toHaveLength(5);
  });

  test('okno „aspoň": návrh nadbytek netrestá, nedostatek ano', () => {
    const lide = [c('K1', 'KASA', ['10-14']), c('X', 'PRODEJNA'), c('Y', 'PRODEJNA')];
    // Kasa i otevírací doba jen 10–14, ať rozhoduje obsazení; směna 14–18 do hlídaného času nespadá.
    const N = { ...K, planovacMinKasaru: 1, planovacKasaDo: '14:00', planovacOtevrenoDo: '14:00' };
    const smeny = (planovacSablony: string[], okno: { od: string; do: string; lidi: number; aspon?: boolean }) => {
      const { nove } = navrhniTyden(vstup({ lide, nastaveni: { ...N, planovacSablony, planovacObsazeni: [okno] } }));
      return ['X', 'Y'].map((id) => [...new Set(nove.filter((p) => p.zamestnanecId === id).map((p) => p.sablonaId))]);
    };
    expect(smeny(['10-14', '14-18'], { od: '10:00', do: '14:00', lidi: 1 })).toEqual([['14-18'], ['14-18']]);
    expect(smeny(['10-14', '14-18'], { od: '10:00', do: '14:00', lidi: 1, aspon: true })).toEqual([['10-14'], ['10-14']]);
    expect(smeny(['14-18', '10-14'], { od: '10:00', do: '14:00', lidi: 3, aspon: true })).toEqual([['10-14'], ['10-14']]);
  });

  test('bez šablon plánovače dostanou směnu jen lidé s pevným střídáním', () => {
    const { nove } = navrhniTyden(vstup({ lide: [c('Daniel', 'KASA', ['8-14']), c('Alena', 'KASA')], nastaveni: { ...NASTAVENI, planovacSablony: [] } }));
    expect(new Set(nove.map((p) => p.zamestnanecId))).toEqual(new Set(['Daniel']));
  });

  test('nad mez kombinací postupné zlepšování: každý dostane jednu směnu na týden, kasa je pokrytá, stejně jako všechny kombinace', () => {
    const lide = [
      c('K1', 'KASA', ['8-14']), c('K2', 'KASA', ['8-14']), c('K3', 'KASA', ['12-18']), c('K4', 'KASA', ['12-18']),
      ...Array.from({ length: 14 }, (_, i) => c(`P${String(i).padStart(2, '0')}`, 'PRODEJNA')),
    ];
    expect(3 ** 14).toBeGreaterThan(MEZ_KOMBINACI);
    const zacatek = Date.now();
    const { nove, upozorneni } = navrhniTyden(vstup({ lide }));
    expect(Date.now() - zacatek).toBeLessThan(10_000);
    expect(nove).toEqual(navrhniTyden(vstup({ lide }), { mezKombinaci: Infinity, rozpocetUzlu: Infinity }).nove);
    for (const z of lide.slice(4)) {
      const smeny = nove.filter((p) => p.zamestnanecId === z.id);
      expect(smeny).toHaveLength(5);
      expect(new Set(smeny.map((p) => p.sablonaId)).size).toBe(1);
    }
    expect(upozorneni.filter((u) => u.druh === 'CHYBI_KASAR' || u.druh === 'MALO_LIDI')).toEqual([]);
  });

  test('přeplněný týden, kde odhady nic neořežou: po rozpočtu uzlů postupné zlepšování, do 2 s a s platným plánem', () => {
    // 9 lidí prodejny × 5 šablon, 4 kasaři s pevnou směnou, bez oken obsazení; nemoc každého v jiný den rozbije souměrnost.
    const prodejna = Array.from({ length: 9 }, (_, i) => c(`P${i}`, 'PRODEJNA'));
    const lide = [c('K1', 'KASA', ['8-14']), c('K2', 'KASA', ['8-14']), c('K3', 'KASA', ['12-18']), c('K4', 'KASA', ['12-18']), ...prodejna];
    const dochazka: Den[] = prodejna.map((z, i) => ({ zamestnanecId: z.id, datum: T19[i % 5]!, typ: 'NEMOC', minuty: 240, kasa: false, poznamka: null }));
    const v = vstup({ lide, dochazka, nastaveni: { ...NASTAVENI, planovacObsazeni: [], planovacSablony: ['8-12', '9:30-13:30', '10-14', '11-15', '14-18'] } });
    const zacatek = Date.now();
    const navrh = navrhniTyden(v);
    expect(Date.now() - zacatek).toBeLessThan(5_000);
    expect(navrh.presny).toBe(false);
    expect(navrh.nove).toEqual(navrhniTyden(v, { mezKombinaci: 0 }).nove);
    prodejna.forEach((z, i) => {
      const smeny = navrh.nove.filter((p) => p.zamestnanecId === z.id);
      expect(smeny.map((p) => p.datum)).toEqual(T19.filter((d) => d !== T19[i % 5]));
      expect(new Set(smeny.map((p) => p.sablonaId)).size).toBe(1);
    });
    expect(navrh.upozorneni.filter((u) => u.druh === 'CHYBI_KASAR' || u.druh === 'MALO_LIDI')).toEqual([]);
  });

  test('odhady a vynechání prohozených stejných lidí nic neztratí: náhodné týdny = všechny kombinace bez ořezávání', () => {
    // Pevné semínko: pokaždé stejné týdny.
    let semeno = 20261019;
    const nahoda = () => {
      semeno = (semeno + 0x6d2b79f5) | 0;
      let t = Math.imul(semeno ^ (semeno >>> 15), 1 | semeno);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const vyber = <T,>(a: readonly T[]) => a[Math.floor(nahoda() * a.length)]!;
    const ROLE = ['KASA', 'KASA', 'KASA_UCI_SE', 'PRODEJNA'] as const;
    const SABL = ['8-12', '9:30-13:30', '10-14', '11-15', '14-18', '12-18', '9-14'];
    const OKNA = [
      [], OBSAZENI, RANNI, [{ od: '10:00', do: '18:00', lidi: 3, aspon: true }], [{ od: '11:00', do: '15:00', lidi: 4 }, { od: '14:00', do: '18:00', lidi: 2, aspon: true }],
    ];
    for (let pokus = 0; pokus < 40; pokus++) {
      const volni = Array.from({ length: 2 + Math.floor(nahoda() * 5) }, (_, i) => c(`V${i}`, vyber(ROLE)));
      const pevni = [c('Honza', 'DOZOR', [vyber(['8-16', '10-18'])]), ...(nahoda() < 0.7 ? [c('Daniel', 'KASA', [vyber(['8-14', '12-18'])])] : [])];
      const sablony = [...SABL].sort(() => nahoda() - 0.5).slice(0, 2 + Math.floor(nahoda() * 3));
      const dochazka: Den[] = volni.filter(() => nahoda() < 0.3)
        .map((z) => ({ zamestnanecId: z.id, datum: vyber(T19), typ: 'NEMOC', minuty: 240, kasa: false, poznamka: null }));
      const plan = [
        ...volni.filter(() => nahoda() < 0.4).flatMap((z) => ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => sm(z.id, d, '14-18'))),
        ...volni.filter(() => nahoda() < 0.2).map((z) => sm(z.id, vyber(T19), vyber(SABL))),
      ];
      const nastaveni = {
        ...NASTAVENI, planovacSablony: sablony, planovacObsazeni: vyber(OKNA), planovacMinKasaru: vyber([1, 2, 2]), planovacDozorNaKaseDo: vyber(['09:00', '10:00', '11:00']),
      };
      const v = vstup({ lide: [...pevni, ...volni], plan, dochazka, nastaveni });
      const orezane = navrhniTyden(v, { mezKombinaci: Infinity, rozpocetUzlu: Infinity });
      const vsechny = navrhniTyden(v, { mezKombinaci: Infinity, rozpocetUzlu: Infinity, bezOrezavani: true });
      expect(orezane.presny && vsechny.presny).toBe(true);
      expect(orezane.nove, `pokus ${pokus}`).toEqual(vsechny.nove);
    }
  });
});
