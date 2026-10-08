import { vypocitejMzdu } from './vypocet';
import { formatKc } from './penize';
import { den, dnyPrace, sazba, vstup, vstupVypoctu, zam } from './test-utils';
import { VYCHOZI_NASTAVENI } from '../shared/api';

const PRAC10 = ['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'];
const scenarA = [
  ...dnyPrace(PRAC10, 8, true),
  ...dnyPrace(['2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26'], 8),
  den('2026-10-03', 'PRACE', 6), den('2026-10-10', 'PRACE', 6), den('2026-10-11', 'PRACE', 5),
  den('2026-10-28', 'PRACE', 8), den('2026-10-30', 'DOVOLENA', 8),
];

test('A — plný měsíc HPP', () => {
  const r = vypocitejMzdu(vstupVypoctu({ dny: scenarA, prumernyVydelekHal: 19000, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }));
  expect(r.hrubaHal).toBe(3544000);
  expect(r.vzKc).toBe(35440);
  expect(r.stravne).toEqual({ smen: 22, celkemHal: 284900, osvobozenoHal: 284900, zdanitelneHal: 0 });
  expect(r.dan.danKc).toBe(2755);
  expect(r.cistaHal).toBe(2857300);
  expect(r.kVyplateHal).toBe(3142200);
  expect(r.nakladFirmyHal).toBe(5026900);
  expect(r.varovani).toEqual([]);
});
test('B — DPP pod hranicí bez prohlášení', () => {
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }), sazby: [sazba(180)],
    dny: dnyPrace(['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'], 8), prumernyVydelekHal: 18000 }));
  expect(r.pojisteni.pojisteny).toBe(false);
  expect(r.dan).toMatchObject({ rezim: 'SRAZKOVA', danKc: 1080 });
  expect(r.kVyplateHal).toBe(676750); // 7200 − 1080 + 5 × 129,50
});
test('C — DPP nad hranicí bez prohlášení', () => {
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }), sazby: [sazba(175)],
    dny: dnyPrace(PRAC10, 8), prumernyVydelekHal: 17500, nastaveni: { ...VYCHOZI_NASTAVENI, stravneProDpp: false } }));
  expect(r.cistaHal).toBe(1027600);
  expect(r.kVyplateHal).toBe(1027600);
  expect(r.nakladFirmyHal).toBe(1873200); // 14000 + 3472 + 1260
});
test('D — invalidní III. st., zkrácený úvazek, sleva 5 %', () => {
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ invalidita: 'III', uvazekMinTydne: 1200, slevaNaPojistnem: true }),
    sazby: [sazba(170)], dny: dnyPrace(PRAC10, 6), prumernyVydelekHal: 17000 }));
  expect(r.cistaHal).toBe(901600);
  expect(r.kVyplateHal).toBe(1031100);
  expect(r.nakladFirmyHal).toBe(1443300);
});
test('D bez invalidity — doplatek ZP do minima', () => {
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 1200 }), sazby: [sazba(170)], dny: dnyPrace(PRAC10, 6), prumernyVydelekHal: 17000 }));
  expect(r.pojisteni.doplatekZpKc).toBe(1647);
  expect(r.kVyplateHal).toBe(866400);
});
test('E — nemoc přes hranici měsíce, odměna propadla', () => {
  const zari = ['2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30']
    .map((d) => den(d, 'NEMOC', ['2026-09-26','2026-09-27'].includes(d) ? 0 : 8));
  const nemoc = ['01','02','03','04','05','06','07','08','09','10'].map((d) => den(`2026-10-${d}`, 'NEMOC', ['03','04','10'].includes(d) ? 0 : 8));
  const prace = dnyPrace(['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'], 8);
  const r = vypocitejMzdu(vstupVypoctu({ dny: [...nemoc, ...prace], dnyPredchozi: zari, sazby: [sazba(180)], prumernyVydelekHal: 20000,
    vstup: vstup({ odmenaZaDenHal: 18000 }) }));
  expect(r.nahradaNemocHal).toBe(518400);
  expect(r.pojisteni.doplatekZpKc).toBe(105);
  expect(r.cistaHal).toBe(1262400);
  expect(r.kVyplateHal).toBe(1910300);
  expect(r.varovani.map((v) => v.kod)).toEqual(expect.arrayContaining(['ODMENA_PROPADLA_NEMOC', 'NEMOC_PRES_14_DNU', 'ZP_DOPLATEK_MINIMUM']));
});
test('F — dvě děti, bonus', () => {
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ deti: [{ ztpp: false }, { ztpp: false }] }), sazby: [sazba(200)],
    dny: dnyPrace(PRAC10, 10), prumernyVydelekHal: 20000 }));
  expect(r.dan.bonusKc).toBe(2697);
  expect(r.cistaHal).toBe(2005300);
  expect(r.kVyplateHal).toBe(2134800);
});
test('PV neznámý → odhad ze sazby s varováním', () => {
  const r = vypocitejMzdu(vstupVypoctu({ dny: [den('2026-10-30', 'DOVOLENA', 8)] }));
  expect(r.pvHal).toBe(16000);
  expect(r.varovani.map((v) => v.kod)).toContain('PV_ODHADNUT');
});
test('DPP nad 300 h v roce', () => {
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dppMinutyPredMesicem: 295 * 60,
    dny: [den('2026-10-01', 'PRACE', 8)], prumernyVydelekHal: 16000 }));
  expect(r.varovani.map((v) => v.kod)).toContain('DPP_LIMIT_300H');
});
test('rok 2027 hlásí předběžné parametry', () => {
  const r = vypocitejMzdu(vstupVypoctu({ rok: 2027, mesic: 1, dny: [den('2027-01-04', 'PRACE', 8)], prumernyVydelekHal: 16000 }));
  expect(r.varovani.map((v) => v.kod)).toContain('PREDBEZNY_PARAMETR');
});

// --- Doplňkové testy chování mimo zlaté scénáře ---
test('DPP nepojištěná: náhrada za nemoc se vynuluje', () => {
  const dny = [...dnyPrace(['2026-10-05', '2026-10-06', '2026-10-07'], 8), ...['2026-10-19', '2026-10-20', '2026-10-21'].map((d) => den(d, 'NEMOC', 8))];
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), sazby: [sazba(180)], dny, prumernyVydelekHal: 20000 }));
  expect(r.pojisteni.pojisteny).toBe(false);
  expect(r.nahradaNemocHal).toBe(0);
  expect(r.nahradaNemocVzorec).toBe('');
});
test('DPP pojištěná: náhrada za nemoc zůstává (24 h × 60 % × 90 % × 200 Kč)', () => {
  const dny = [...dnyPrace(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'], 8),
    ...['2026-10-19', '2026-10-20', '2026-10-21'].map((d) => den(d, 'NEMOC', 8))];
  const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), sazby: [sazba(200)], dny, prumernyVydelekHal: 20000 }));
  expect(r.pojisteni.pojisteny).toBe(true);
  expect(r.nahradaNemocHal).toBe(259200);
});
test('chybí sazba i PV → PV z hodinové minimální mzdy a varování', () => {
  const r = vypocitejMzdu(vstupVypoctu({ sazby: [], dny: [den('2026-10-30', 'DOVOLENA', 8)] }));
  expect(r.pvHal).toBe(13440);
  expect(r.varovani.map((v) => v.kod)).toEqual(expect.arrayContaining(['CHYBI_SAZBA', 'PV_ODHADNUT']));
});
test('PV nižší než hodinová minimální mzda se zvedne na minimum', () => {
  const r = vypocitejMzdu(vstupVypoctu({ dny: [den('2026-10-30', 'DOVOLENA', 8)], prumernyVydelekHal: 10000 }));
  expect(r.pvHal).toBe(13440);
  expect(r.varovani.map((v) => v.kod)).not.toContain('PV_ODHADNUT');
});
test('stravné nad limitem: přebytek je zdanitelný a jde do VZ', () => {
  const r = vypocitejMzdu(vstupVypoctu({ dny: [den('2026-10-05', 'PRACE', 8)], prumernyVydelekHal: 16000,
    nastaveni: { ...VYCHOZI_NASTAVENI, stravnePausalHal: 15000 } }));
  expect(r.stravne).toEqual({ smen: 1, celkemHal: 15000, osvobozenoHal: 12950, zdanitelneHal: 2050 });
  expect(r.vzKc).toBe(Math.ceil((r.hrubaHal + 2050) / 100));
});
test('srážky snižují jen částku k výplatě, ne čistou mzdu', () => {
  const dny = dnyPrace(PRAC10, 8);
  const bez = vypocitejMzdu(vstupVypoctu({ dny, prumernyVydelekHal: 16000 }));
  const s = vypocitejMzdu(vstupVypoctu({ dny, prumernyVydelekHal: 16000, vstup: vstup({ srazkyHal: 50000 }) }));
  expect(s.cistaHal).toBe(bez.cistaHal);
  expect(s.kVyplateHal).toBe(bez.kVyplateHal - 50000);
});

// --- Oprava po revizi: PV při nástupu v měsíci, sociální pojištění HPP podle sjednaného příjmu, sleva 5 %, srážková daň ---
const kody = (r: ReturnType<typeof vypocitejMzdu>) => r.varovani.map((v) => v.kod);
const text = (r: ReturnType<typeof vypocitejMzdu>, kod: string) => r.varovani.find((v) => v.kod === kod)?.text ?? '';

describe('PV a sazba při nástupu uprostřed měsíce', () => {
  test('sazba platná až od 12. 10. se použije jako odhad PV, bez CHYBI_SAZBA', () => {
    const r = vypocitejMzdu(vstupVypoctu({ sazby: [sazba(200, '2026-10-12')], dny: [den('2026-10-20', 'DOVOLENA', 8)] }));
    expect(r.pvHal).toBe(20000);
    expect(kody(r)).toContain('PV_ODHADNUT');
    expect(kody(r)).not.toContain('CHYBI_SAZBA');
    expect(text(r, 'PV_ODHADNUT')).toContain('12. 10. 2026');
  });
  test('nejdřív se bere sazba platná k 1. dni, i když se později v měsíci mění', () => {
    const r = vypocitejMzdu(vstupVypoctu({ sazby: [sazba(170, '2020-01-01'), sazba(200, '2026-10-12')], dny: [den('2026-10-20', 'DOVOLENA', 8)] }));
    expect(r.pvHal).toBe(17000);
  });
  test('z několika sazeb v měsíci se bere nejdřívější', () => {
    const r = vypocitejMzdu(vstupVypoctu({ sazby: [sazba(220, '2026-10-20'), sazba(200, '2026-10-12')], dny: [den('2026-10-22', 'DOVOLENA', 8)] }));
    expect(r.pvHal).toBe(20000);
  });
  test('sazba až od příštího měsíce znamená, že sazba chybí', () => {
    const r = vypocitejMzdu(vstupVypoctu({ sazby: [sazba(200, '2026-11-01')], dny: [den('2026-10-20', 'DOVOLENA', 8)] }));
    expect(r.pvHal).toBe(13440);
    expect(kody(r)).toEqual(expect.arrayContaining(['CHYBI_SAZBA', 'PV_ODHADNUT']));
  });
});

describe('sociální pojištění HPP podle sjednaného příjmu', () => {
  // 25 dní nemoci a 2 odpracované dny po 8 h: VZ 2 880 Kč, ale sjednaný příjem 40 h × 4,348 × 180 Kč ≈ 31 306 Kč
  const nemoc25 = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31']
    .map((d) => den(`2026-10-${d}`, 'NEMOC', ['10', '11', '17', '18', '24', '25', '31'].includes(d) ? 0 : 8));
  test('HPP 40 h, 180 Kč, 25 dní nemoci a 2 dny práce: sociální se platí i z příjmu pod 4 500 Kč', () => {
    const r = vypocitejMzdu(vstupVypoctu({ sazby: [sazba(180)], prumernyVydelekHal: 18000,
      dny: [...dnyPrace(['2026-10-05', '2026-10-06'], 8), ...nemoc25] }));
    expect(r.vzKc).toBe(2880);
    expect(r.pojisteni.socialniZamKc).toBe(205); // ⌈2 880 × 7,1 %⌉ = ⌈204,48⌉
    expect(r.pojisteni.socialniFirmaKc).toBe(715); // ⌈2 880 × 24,8 %⌉ = ⌈714,24⌉
  });
  test('HPP malého rozsahu (5 h týdně, 200 Kč): sjednaný příjem 4 348 Kč, sociální 0 při příjmu pod 4 500 Kč', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }), sazby: [sazba(200)], prumernyVydelekHal: 20000,
      dny: dnyPrace(['2026-10-12', '2026-10-13'], 8) }));
    expect(r.vzKc).toBe(3200);
    expect(r.pojisteni.socialniZamKc).toBe(0);
    expect(r.pojisteni.socialniFirmaKc).toBe(0);
    expect(r.pojisteni.zdravotniZamKc).toBeGreaterThan(0);
  });
  test('malý rozsah, ale skutečný příjem dosáhne 4 500 Kč: sociální se platí z celého příjmu', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }), sazby: [sazba(200)], prumernyVydelekHal: 20000,
      dny: dnyPrace(['2026-10-12', '2026-10-13', '2026-10-14'], 8) }));
    expect(r.vzKc).toBe(4800);
    expect(r.pojisteni.socialniZamKc).toBe(341); // ⌈4 800 × 7,1 %⌉
  });
  test('sjednaný příjem 4 565 Kč (5 h týdně, 210 Kč) už není malý rozsah: sociální i z 3 360 Kč', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }), sazby: [sazba(210)], prumernyVydelekHal: 21000,
      dny: dnyPrace(['2026-10-12', '2026-10-13'], 8) }));
    expect(r.vzKc).toBe(3360);
    expect(r.pojisteni.socialniZamKc).toBe(239); // ⌈3 360 × 7,1 %⌉ = ⌈238,56⌉
  });
  test('sjednaný příjem se bere ze sazby platné od 12. 10., když k 1. dni žádná neplatí', () => {
    // 5 h týdně × 4,348 × 200 Kč = 4 348 Kč → malý rozsah, i když sazba začíná až uprostřed měsíce
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }), sazby: [sazba(200, '2026-10-12')], prumernyVydelekHal: 20000,
      dny: dnyPrace(['2026-10-12', '2026-10-13'], 8) }));
    expect(r.pojisteni.socialniZamKc).toBe(0);
  });
  test('bez jakékoli sazby v měsíci je sjednaný příjem neznámý a bere se jako zaměstnání, které není malého rozsahu', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }), sazby: [], prumernyVydelekHal: 20000,
      dny: [den('2026-10-12', 'DOVOLENA', 8)] }));
    expect(r.vzKc).toBe(1600); // 8 h × 200 Kč náhrady za dovolenou
    expect(r.pojisteni.socialniZamKc).toBe(114); // ⌈1 600 × 7,1 %⌉ = ⌈113,6⌉
  });
});

describe('sleva 5 % — hodiny s náhradou mzdy', () => {
  const slevaPojistneKc = (r: ReturnType<typeof vypocitejMzdu>) => r.pojisteni.slevaPojistneKc;
  const zamSleva = zam({ uvazekMinTydne: 1800, slevaNaPojistnem: true });
  test('30 h týdně, 300 Kč/h, 66 h práce a 60 h dovolené: VZ 37 800 Kč, sleva 1 890 Kč', () => {
    const prace = dnyPrace(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'], 6);
    const dovolena = ['2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30']
      .map((d) => den(d, 'DOVOLENA', 6));
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zamSleva, sazby: [sazba(300)], prumernyVydelekHal: 30000, dny: [...prace, ...dovolena] }));
    expect(r.hodiny.praceMin).toBe(66 * 60);
    expect(r.hodiny.dovolenaMin).toBe(60 * 60);
    expect(r.vzKc).toBe(37800);
    expect(slevaPojistneKc(r)).toBe(1890); // ⌈37 800 × 5 %⌉; 37 800 Kč / 126 h = 300 Kč/h (jen z 66 h by vyšlo 573 Kč/h)
    expect(kody(r)).not.toContain('SLEVA_POJISTNE_NESPLNENA');
    // sleva snižuje náklad firmy: hrubá + 11 × 129,50 Kč stravné + SP firma 9 375 − sleva 1 890 + ZP firma 3 402
    expect(r.nakladFirmyHal).toBe(3780000 + 11 * 12950 + (9375 - 1890 + 3402) * 100);
  });
  test('bez odpracovaných i nahrazených hodin se sleva neuplatní', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zamSleva, sazby: [sazba(160)], prumernyVydelekHal: 16000, dny: [],
      vstup: vstup({ jineOdmenyHal: 800000 }) }));
    expect(r.vzKc).toBe(8000);
    expect(slevaPojistneKc(r)).toBe(0);
    expect(text(r, 'SLEVA_POJISTNE_NESPLNENA')).toContain('žádné odpracované ani nahrazené hodiny');
  });
  test('nemoc do 14. dne se do hodin pro limit 138 h počítá: 100 h práce + 40 h nemoci = 140 h', () => {
    const prace = dnyPrace(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'], 10);
    const nemoc = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d) => den(d, 'NEMOC', 8));
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zamSleva, sazby: [sazba(160)], prumernyVydelekHal: 16000, dny: [...prace, ...nemoc] }));
    expect(slevaPojistneKc(r)).toBe(0);
    expect(text(r, 'SLEVA_POJISTNE_NESPLNENA')).toContain('odpracováno 140 h');
  });
  test('nemoc po 14. dni se do hodin nepočítá: 20 h práce + 14 dní × 8 h nahrazené nemoci = 132 h, sleva se uplatní', () => {
    const nemoc = Array.from({ length: 20 }, (_, i) => den(`2026-10-${String(i + 1).padStart(2, '0')}`, 'NEMOC', 8));
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: zamSleva, sazby: [sazba(160)], prumernyVydelekHal: 16000,
      dny: [...nemoc, ...dnyPrace(['2026-10-21', '2026-10-22'], 10)] }));
    expect(r.vzKc).toBe(3200);
    expect(slevaPojistneKc(r)).toBe(160); // ⌈3 200 × 5 %⌉; kdyby se počítaly i dny 15.–20., bylo by 180 h
    expect(kody(r)).toContain('NEMOC_PRES_14_DNU');
  });
});

describe('srážková daň ze skutečného příjmu dolů', () => {
  const dpp = zam({ smlouva: 'DPP', prohlaseni: false });
  const tydenPrace = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  test('stravné 150 Kč za směnu: zdanitelných 20,50 Kč za směnu, příjem 7 319,50 Kč → základ 7 319, daň 1 097', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: dpp, sazby: [sazba(180)], prumernyVydelekHal: 18000, dny: dnyPrace(tydenPrace, 8),
      vstup: vstup({ jineOdmenyHal: 1700 }), nastaveni: { ...VYCHOZI_NASTAVENI, stravnePausalHal: 15000 } }));
    expect(r.hrubaHal).toBe(721700); // 5 × 8 h × 180 Kč + 17 Kč
    expect(r.stravne).toEqual({ smen: 5, celkemHal: 75000, osvobozenoHal: 64750, zdanitelneHal: 10250 });
    expect(r.vzKc).toBe(7320); // 7 319,50 nahoru
    expect(r.dan).toEqual({ rezim: 'SRAZKOVA', zakladKc: 7319, zalohaKc: 0, slevyKc: 0, zvyhodneniKc: 0, danKc: 1097, bonusKc: 0 }); // z 7 320 by bylo 1 098
    expect(r.cistaHal).toBe(622250); // 7 217 + 102,50 − 1 097
    expect(r.kVyplateHal).toBe(687000); // + 647,50 osvobozeného stravného
    expect(r.nakladFirmyHal).toBe(796700); // 7 217 + 750 stravné, DPP pod hranicí bez pojistného
  });
  test('zdanitelná část stravného jedné směny (paušál 150 Kč) je v čisté mzdě, k výplatě i v nákladu', () => {
    const r = vypocitejMzdu(vstupVypoctu({ zamestnanec: dpp, sazby: [sazba(160)], prumernyVydelekHal: 16000, dny: [den('2026-10-05', 'PRACE', 8)],
      nastaveni: { ...VYCHOZI_NASTAVENI, stravnePausalHal: 15000 } }));
    expect(r.hrubaHal).toBe(128000);
    expect(r.stravne).toEqual({ smen: 1, celkemHal: 15000, osvobozenoHal: 12950, zdanitelneHal: 2050 });
    expect(r.dan).toMatchObject({ rezim: 'SRAZKOVA', zakladKc: 1300, danKc: 195 }); // 1 300,50 dolů; ⌊1 300 × 15 %⌋
    expect(r.cistaHal).toBe(110550); // 1 280 + 20,50 − 195
    expect(r.kVyplateHal).toBe(123500); // + 129,50 osvobozeného stravného
    expect(r.nakladFirmyHal).toBe(143000); // 1 280 + 150 stravné
  });
});

describe('účast na pojištění podle skutečného příjmu, ne podle VZ zaokrouhleného nahoru (z. 187/2006 § 3 písm. e, § 7, § 7a)', () => {
  const tydenPrace = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const nemoc = den('2026-10-12', 'NEMOC', 8);
  // DPP bez prohlášení, směny po 8 h × 180 Kč, na každé směně 20,50 Kč zdanitelného stravného (paušál 150 Kč), jiné odměny
  // v celých Kč (hrubá je v celých Kč, půl koruny vzniká jen ze stravného); den nemoci ověřuje, že náhrada mzdy se u
  // nepojištěné DPP vynuluje
  const dppPrijem = (pocetSmen: number, jineOdmenyHal: number) => vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP', prohlaseni: false }),
    sazby: [sazba(180)], prumernyVydelekHal: 18000, dny: [...dnyPrace(tydenPrace.slice(0, pocetSmen), 8), nemoc], vstup: vstup({ jineOdmenyHal }),
    nastaveni: { ...VYCHOZI_NASTAVENI, stravnePausalHal: 15000 } }));
  test('DPP s příjmem 11 999,50 Kč (VZ 12 000 Kč): nepojištěná, SP = ZP = 0, bez náhrady za nemoc, srážková daň', () => {
    const r = dppPrijem(5, 469700); // 7 200 + 4 697 + 5 × 20,50
    expect(r.hrubaHal).toBe(1189700);
    expect(r.stravne.zdanitelneHal).toBe(10250);
    expect(r.vzKc).toBe(12000);
    expect(r.pojisteni).toMatchObject({ pojisteny: false, socialniZamKc: 0, zdravotniZamKc: 0, socialniFirmaKc: 0, zdravotniFirmaKc: 0 });
    expect(r.nahradaNemocHal).toBe(0);
    expect(r.dan).toMatchObject({ rezim: 'SRAZKOVA', zakladKc: 11999, danKc: 1799 }); // ⌊11 999 × 15 %⌋
  });
  test('DPP s příjmem přesně 12 000,00 Kč: pojištěná, náhrada za nemoc zůstává, záloha', () => {
    const r = dppPrijem(4, 615800); // 4 × 8 h × 180 Kč = 5 760 + 6 158 + 4 × 20,50 = 12 000,00
    expect(r.hrubaHal).toBe(1191800);
    expect(r.vzKc).toBe(12000);
    expect(r.pojisteni).toMatchObject({ pojisteny: true, socialniZamKc: 852, zdravotniZamKc: 540 });
    expect(r.nahradaNemocHal).toBeGreaterThan(0);
    expect(r.dan.rezim).toBe('ZALOHA');
  });
  // HPP 5 h týdně × 200 Kč: sjednaný příjem 4 348 Kč = zaměstnání malého rozsahu; směny po 3 h × 200 Kč = 600 Kč
  // se zdanitelným stravným 20,50 Kč na směně (paušál 150 Kč) + jiné odměny v celých Kč
  const malyRozsah = (pocetSmen: number, jineOdmenyHal: number) => vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }),
    sazby: [sazba(200)], prumernyVydelekHal: 20000, dny: dnyPrace(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].slice(0, pocetSmen), 3),
    vstup: vstup({ jineOdmenyHal }), nastaveni: { ...VYCHOZI_NASTAVENI, stravnePausalHal: 15000 } }));
  test('malý rozsah, příjem 4 499,50 Kč (VZ 4 500 Kč): sociální 0, zdravotní se platí', () => {
    const r = malyRozsah(3, 263800); // 3 × 600 + 2 638 + 3 × 20,50
    expect(r.hrubaHal).toBe(443800);
    expect(r.stravne.zdanitelneHal).toBe(6150);
    expect(r.vzKc).toBe(4500);
    expect(r.pojisteni.socialniZamKc).toBe(0);
    expect(r.pojisteni.socialniFirmaKc).toBe(0);
    expect(r.pojisteni.zdravotniZamKc).toBeGreaterThan(0);
  });
  test('malý rozsah, příjem přesně 4 500,00 Kč: sociální z VZ 4 500 Kč', () => {
    const r = malyRozsah(4, 201800); // 4 × 600 + 2 018 + 4 × 20,50
    expect(r.hrubaHal).toBe(441800);
    expect(r.stravne.zdanitelneHal).toBe(8200);
    expect(r.vzKc).toBe(4500);
    expect(r.pojisteni.socialniZamKc).toBe(320); // ⌈4 500 × 7,1 %⌉ = ⌈319,5⌉
    expect(r.pojisteni.socialniFirmaKc).toBe(1116);
  });
  test('sjednaný příjem se před porovnáním s rozhodným příjmem nezaokrouhluje: 4 499,96 Kč je malý rozsah, 4 500,18 Kč ne', () => {
    const maly = (hodinovaKc: number) => vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ uvazekMinTydne: 300 }),
      sazby: [sazba(hodinovaKc)], prumernyVydelekHal: Math.round(hodinovaKc * 100), dny: dnyPrace(['2026-10-12', '2026-10-13'], 8) }));
    // 5 h × 4,348 × 206,99 Kč = 4 499,96 Kč (zaokrouhleno na Kč by to bylo 4 500)
    expect(maly(206.99).pojisteni.socialniZamKc).toBe(0);
    // 5 h × 4,348 × 207 Kč = 4 500,18 Kč; 2 × 8 h × 207 Kč = 3 312 Kč
    expect(maly(207).vzKc).toBe(3312);
    expect(maly(207).pojisteni.socialniZamKc).toBe(236); // ⌈3 312 × 7,1 %⌉ = ⌈235,15⌉
  });
});

describe('ochrany a varování', () => {
  test('neceločíselný průměrný hodinový výdělek je chyba', () => {
    expect(() => vypocitejMzdu(vstupVypoctu({ prumernyVydelekHal: 160.5, dny: [den('2026-10-30', 'DOVOLENA', 8)] }))).toThrow(RangeError);
    expect(() => vypocitejMzdu(vstupVypoctu({ prumernyVydelekHal: 160.5, dny: [] }))).toThrow(/celé číslo/);
  });
  test('srážky vyšší než výplata: záporná výplata s varováním', () => {
    const r = vypocitejMzdu(vstupVypoctu({ prumernyVydelekHal: 16000, dny: dnyPrace(PRAC10, 8), vstup: vstup({ srazkyHal: 10000000 }) }));
    expect(r.kVyplateHal).toBeLessThan(0);
    expect(kody(r)).toContain('VYPLATA_ZAPORNA');
    expect(text(r, 'VYPLATA_ZAPORNA')).toContain('Srážky jsou vyšší než výplata. Zkontroluj srážky.');
  });
  test('záporná výplata bez srážek (doplatek ZP do minima, žádná práce): varování mluví o docházce, ne o srážkách', () => {
    const r = vypocitejMzdu(vstupVypoctu({ prumernyVydelekHal: 16000, dny: [] }));
    expect(r.pojisteni.doplatekZpKc).toBe(3024); // ⌈22 400 × 13,5 %⌉
    expect(r.kVyplateHal).toBe(-302400);
    expect(kody(r)).toContain('VYPLATA_ZAPORNA');
    const t = text(r, 'VYPLATA_ZAPORNA');
    expect(t).toContain('Výplata vychází záporná (např. doplatek zdravotního pojištění do minima nebo neplacené volno). Zkontroluj docházku.');
    expect(t).toContain(formatKc(-302400));
    expect(t).not.toContain('Srážky');
  });
  test('srážky vyšší než výplata: text o srážkách se nezmění ani s doplatkem ZP', () => {
    const r = vypocitejMzdu(vstupVypoctu({ prumernyVydelekHal: 16000, dny: [], vstup: vstup({ srazkyHal: 100000 }) }));
    expect(text(r, 'VYPLATA_ZAPORNA')).toContain('Srážky jsou vyšší než výplata. Zkontroluj srážky.');
    expect(text(r, 'VYPLATA_ZAPORNA')).not.toContain('docházku');
  });
  test('kladná výplata varování o záporné výplatě nemá', () => {
    const r = vypocitejMzdu(vstupVypoctu({ prumernyVydelekHal: 16000, dny: dnyPrace(PRAC10, 8) }));
    expect(kody(r)).not.toContain('VYPLATA_ZAPORNA');
  });
  test('varování o předběžných parametrech vyjmenuje všechny předběžné položky', () => {
    const r = vypocitejMzdu(vstupVypoctu({ rok: 2027, mesic: 1, dny: [den('2027-01-04', 'PRACE', 8)], prumernyVydelekHal: 16000 }));
    const t = text(r, 'PREDBEZNY_PARAMETR');
    expect(r.parametry.predbezne.length).toBeGreaterThan(0);
    for (const polozka of r.parametry.predbezne) expect(t).toContain(polozka);
    expect(t).toContain('hranice DPP 12 500 Kč');
    expect(t).toContain('rozhodný příjem 5 000 Kč');
    expect(t).toContain('2027');
  });
  describe('limit 300 hodin DPP', () => {
    const dpp300 = (predMin: number, praceHodin: number) => vypocitejMzdu(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }),
      dppMinutyPredMesicem: predMin, dny: [den('2026-10-01', 'PRACE', praceHodin)], prumernyVydelekHal: 16000 }));
    test('přesně 300 h: bez varování', () => {
      expect(kody(dpp300(295 * 60, 5))).not.toContain('DPP_LIMIT_300H');
    });
    test('300 h a 1 minuta: varování', () => {
      const r = dpp300(295 * 60 + 1, 5);
      expect(kody(r)).toContain('DPP_LIMIT_300H');
      expect(text(r, 'DPP_LIMIT_300H')).toContain('300,02 h');
    });
    test('HPP limit DPP nikdy nehlásí', () => {
      const r = vypocitejMzdu(vstupVypoctu({ dppMinutyPredMesicem: 1000 * 60, dny: [den('2026-10-01', 'PRACE', 8)], prumernyVydelekHal: 16000 }));
      expect(kody(r)).not.toContain('DPP_LIMIT_300H');
    });
  });
});
