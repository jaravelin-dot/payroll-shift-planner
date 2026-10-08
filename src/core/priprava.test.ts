import { VYCHOZI_NASTAVENI } from '../shared/api';
import type { Firma, MesicData, MesicniVstup, Uzaverka, ZamestnanecSeSazbami } from '../shared/api';
import { pripravVstup } from './priprava';
import { vypocitejMzdu } from './vypocet';
import { den, sazba, vstup, zam } from './test-utils';

function zamSeSazbami(c: Parameters<typeof zam>[0] = {}, sazby = [sazba(160)]): ZamestnanecSeSazbami {
  return { ...zam(c), sazby };
}
function firma(c: Partial<Firma> = {}): Firma {
  return { id: 'f1', nazev: 'Firma', ico: null, adresa: null, ucet: null, nastaveni: { ...VYCHOZI_NASTAVENI }, vytvoreno: '2026-01-01', ...c };
}
function data(c: Partial<MesicData> = {}): MesicData {
  return {
    firma: firma(), rok: 2026, mesic: 10,
    zamestnanci: [zamSeSazbami()],
    dny: [den('2026-09-30', 'NEMOC', 8), den('2026-10-01', 'PRACE', 8)],
    vstupy: [vstup({ prumernyVydelekHal: 19000 })],
    uzaverka: null, uzaverkyPredchozihoCtvrtleti: [], dppMinutyPredMesicem: {}, dovolenaRok: {}, zustatky: [], plan: [], sablony: [],
    ...c,
  };
}
const uzaverka = (mesic: number, sumaHal: number, min: number, dny: number, zamestnanecId = 'z1'): Uzaverka => ({
  firmaId: 'f1', rok: 2026, mesic, uzavreno: '', vysledky: [{ zamestnanecId, jmeno: 'J', smlouva: 'HPP', vysledek: {
    slozky: [{ kod: 'ZAKLAD', popis: '', vzorec: '', castkaHal: sumaHal }], hodiny: { praceMin: min, odpracovaneDny: dny } } }],
});

test('vstup obsahuje jen dny měsíce a dny předchozího měsíce zvlášť', () => {
  const v = pripravVstup(data(), 'z1');
  expect(v.rok).toBe(2026);
  expect(v.mesic).toBe(10);
  expect(v.dny.map((d) => d.datum)).toEqual(['2026-10-01']);
  expect(v.dnyPredchozi.map((d) => d.datum)).toEqual(['2026-09-30']);
  expect(v.prumernyVydelekHal).toBe(19000);
  expect(v.nastaveni).toEqual(VYCHOZI_NASTAVENI);
  expect(v.vstup).toEqual(vstup({ prumernyVydelekHal: 19000 }));
  expect(v.sazby).toEqual([sazba(160)]);
  expect(v.zamestnanec).toEqual(zam());
  expect(v.zamestnanec).not.toHaveProperty('sazby');
  expect(v.dppMinutyPredMesicem).toBe(0);
});
test('vybere jen dny a vstup požadovaného zaměstnance', () => {
  const jiny: MesicniVstup = vstup({ zamestnanecId: 'z2', prumernyVydelekHal: 30000 });
  const d = data({
    zamestnanci: [zamSeSazbami(), zamSeSazbami({ id: 'z2' }, [sazba(200)])],
    dny: [den('2026-10-01', 'PRACE', 8), { ...den('2026-10-02', 'PRACE', 8), zamestnanecId: 'z2' }, { ...den('2026-09-29', 'PRACE', 8), zamestnanecId: 'z2' }],
    vstupy: [vstup({ prumernyVydelekHal: 19000 }), jiny],
  });
  const v2 = pripravVstup(d, 'z2');
  expect(v2.zamestnanec.id).toBe('z2');
  expect(v2.dny.map((x) => x.datum)).toEqual(['2026-10-02']);
  expect(v2.dnyPredchozi.map((x) => x.datum)).toEqual(['2026-09-29']);
  expect(v2.prumernyVydelekHal).toBe(30000);
  expect(v2.vstup).toEqual(jiny);
  const v1 = pripravVstup(d, 'z1');
  expect(v1.dny.map((x) => x.datum)).toEqual(['2026-10-01']);
  expect(v1.dnyPredchozi).toEqual([]);
  expect(v1.prumernyVydelekHal).toBe(19000);
});
test('předchozí měsíc v lednu je prosinec minulého roku', () => {
  const v = pripravVstup(data({ rok: 2027, mesic: 1, dny: [den('2026-12-31', 'NEMOC', 8), den('2027-01-04', 'PRACE', 8), den('2026-11-30', 'PRACE', 8)], vstupy: [] }), 'z1');
  expect(v.dny.map((d) => d.datum)).toEqual(['2027-01-04']);
  expect(v.dnyPredchozi.map((d) => d.datum)).toEqual(['2026-12-31']);
});
test('nastavení firmy se předá beze změny', () => {
  const nastaveni = { ...VYCHOZI_NASTAVENI, stravnePausalHal: 14000, urovneOdmenyZaDenHal: [1, 2, 3] };
  expect(pripravVstup(data({ firma: firma({ nastaveni }) }), 'z1').nastaveni).toEqual(nastaveni);
});
test('měsíc bez vstupu má vstup null a PV se bere z uzávěrek předchozího čtvrtletí', () => {
  const v = pripravVstup(data({ vstupy: [], uzaverkyPredchozihoCtvrtleti: [uzaverka(7, 3000000, 10000, 21), uzaverka(8, 3000000, 10000, 21), uzaverka(9, 3000000, 10000, 21)] }), 'z1');
  expect(v.vstup).toBeNull();
  expect(v.prumernyVydelekHal).toBe(18000);
});
test('neznámý PV se předá jako null', () => {
  expect(pripravVstup(data({ vstupy: [] }), 'z1').prumernyVydelekHal).toBeNull();
});
test('PV je aspoň hodinová minimální mzda: HPP podle týdenní doby firmy, DPP základní', () => {
  // 2026: základní min. mzda 134,40 Kč/h; při 37 h týdně 134,40 × 40 / 37 = 145,30 Kč/h (na desetihaléře nahoru)
  const hpp37 = data({ firma: firma({ nastaveni: { ...VYCHOZI_NASTAVENI, tydenniPracovniDoba: 37 } }), vstupy: [vstup({ prumernyVydelekHal: 10000 })] });
  expect(pripravVstup(hpp37, 'z1').prumernyVydelekHal).toBe(14530);
  const dpp = data({ zamestnanci: [zamSeSazbami({ smlouva: 'DPP' })], vstupy: [vstup({ prumernyVydelekHal: 10000 })] });
  expect(pripravVstup(dpp, 'z1').prumernyVydelekHal).toBe(13440);
  // při 40 h týdně je to pro HPP totéž co základní sazba
  expect(pripravVstup(data({ vstupy: [vstup({ prumernyVydelekHal: 10000 })] }), 'z1').prumernyVydelekHal).toBe(13440);
});
test('DPP minuty před měsícem se vezmou z dat zaměstnance, jinak 0', () => {
  expect(pripravVstup(data({ dppMinutyPredMesicem: { z1: 4500 } }), 'z1').dppMinutyPredMesicem).toBe(4500);
  expect(pripravVstup(data({ dppMinutyPredMesicem: { z2: 4500 } }), 'z1').dppMinutyPredMesicem).toBe(0);
});
test('neznámý zaměstnanec je chyba s jasnou zprávou', () => {
  expect(() => pripravVstup(data(), 'nikdo')).toThrow(/nikdo/);
});
test('vstup jde rovnou do výpočtu mzdy: PV z dat, bez odhadu', () => {
  const r = vypocitejMzdu(pripravVstup(data(), 'z1'));
  expect(r.pvHal).toBe(19000);
  expect(r.varovani.map((v) => v.kod)).not.toContain('PV_ODHADNUT');
  // bez PV se vypočítá odhad a přidá varování
  const bezPv = vypocitejMzdu(pripravVstup(data({ vstupy: [] }), 'z1'));
  expect(bezPv.varovani.map((v) => v.kod)).toContain('PV_ODHADNUT');
});
test('docházka mimo pracovní poměr se nezaplatí a varování vypíše vynechané dny', () => {
  // Pracovní poměr skončil 15. 10.; práce 20. a 21. 10. je po ukončení.
  const d = data({
    zamestnanci: [zamSeSazbami({ ukonceni: '2026-10-15' })],
    dny: [den('2026-10-12', 'PRACE', 8), den('2026-10-20', 'PRACE', 8), den('2026-10-21', 'PRACE', 8)],
  });
  const v = pripravVstup(d, 'z1');
  expect(v.dny.map((x) => x.datum)).toEqual(['2026-10-12']);
  expect(v.dnyMimoPomer).toEqual(['2026-10-20', '2026-10-21']);
  const r = vypocitejMzdu(v);
  expect(r.hodiny.praceMin).toBe(480);
  const mimo = r.varovani.filter((x) => x.kod === 'DEN_MIMO_POMER');
  expect(mimo).toHaveLength(1);
  expect(mimo[0]!.text).toContain('20. 10. 2026, 21. 10. 2026');
  expect(mimo[0]!.text).toContain('do 15. 10. 2026');
  expect(mimo[0]!.text).not.toContain('12. 10. 2026');
});
test('docházka před nástupem se nezaplatí, ani v předchozím měsíci (epizoda nemoci)', () => {
  const d = data({
    zamestnanci: [zamSeSazbami({ nastup: '2026-10-05' })],
    dny: [den('2026-09-30', 'NEMOC', 8), den('2026-10-01', 'PRACE', 8), den('2026-10-05', 'PRACE', 8)],
  });
  const v = pripravVstup(d, 'z1');
  expect(v.dny.map((x) => x.datum)).toEqual(['2026-10-05']);
  expect(v.dnyPredchozi).toEqual([]);
  expect(v.dnyMimoPomer).toEqual(['2026-10-01']);
  expect(vypocitejMzdu(v).varovani.find((x) => x.kod === 'DEN_MIMO_POMER')?.text).toContain('1. 10. 2026');
});
test('bez docházky mimo pracovní poměr žádné varování DEN_MIMO_POMER', () => {
  const v = pripravVstup(data(), 'z1');
  expect(v.dnyMimoPomer).toEqual([]);
  expect(vypocitejMzdu(v).varovani.map((x) => x.kod)).not.toContain('DEN_MIMO_POMER');
});
