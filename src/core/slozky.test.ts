import { sazbaProDen, sazbaProMesic, vypocitejSlozky } from './slozky';
import { den, dnyPrace, sazba, vstup, vstupVypoctu, zam } from './test-utils';
import { VYCHOZI_NASTAVENI } from '../shared/api';

const scenarA = [
  ...dnyPrace(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'], 8, true),
  ...dnyPrace(['2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26'], 8),
  den('2026-10-03', 'PRACE', 6), den('2026-10-10', 'PRACE', 6), den('2026-10-11', 'PRACE', 5),
  den('2026-10-28', 'PRACE', 8), den('2026-10-30', 'DOVOLENA', 8),
];
const castka = (r: ReturnType<typeof vypocitejSlozky>, kod: string) => r.slozky.find((s) => s.kod === kod)?.castkaHal ?? 0;

test('scénář A — všechny složky', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: scenarA, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }), 19000);
  expect(castka(r, 'ZAKLAD')).toBe(2704000);
  expect(castka(r, 'PRIPLATEK_SOBOTA')).toBe(60000);
  expect(castka(r, 'PRIPLATEK_NEDELE')).toBe(30000);
  expect(castka(r, 'PRIPLATEK_SVATEK')).toBe(152000);
  expect(castka(r, 'ODMENA_ZA_DEN')).toBe(264000);
  expect(castka(r, 'AKTIVITA')).toBe(132000);
  expect(castka(r, 'KASA')).toBe(50000);
  expect(castka(r, 'DOPLATEK_MIN_MZDA')).toBe(0);
  expect(castka(r, 'NAHRADA_DOVOLENA')).toBe(152000);
  expect(r.hrubaHal).toBe(3544000);
  expect(r.nahradaNemocHal).toBe(0);
  expect(r.varovani).toEqual([]);
});
test('sobotní příplatek pod 10 % PV se zvýší', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-10-03', 'PRACE', 10)] }), 50000);
  expect(castka(r, 'PRIPLATEK_SOBOTA')).toBe(50000);
  expect(r.varovani.map((v) => v.kod)).toContain('PRIPLATEK_POD_MINIMEM');
});
test('doplatek do minimální mzdy', () => {
  const dny = dnyPrace(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'], 10);
  const r = vypocitejSlozky(vstupVypoctu({ dny, sazby: [sazba(120)] }), 13440);
  expect(castka(r, 'DOPLATEK_MIN_MZDA')).toBe(144000);
  expect(r.varovani.map((v) => v.kod)).toContain('DOPLATEK_MIN_MZDA');
});
test('odměna za den propadne při nemoci, ale hodnota bez podmínky se spočte', () => {
  const dny = [...dnyPrace(['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'], 8), den('2026-10-01', 'NEMOC', 8)];
  const r = vypocitejSlozky(vstupVypoctu({ dny, sazby: [sazba(180)], vstup: vstup({ odmenaZaDenHal: 18000 }) }), 20000);
  expect(castka(r, 'ODMENA_ZA_DEN')).toBe(0);
  expect(r.odmenaZaDenBezPodminkyHal).toBe(180000);
  expect(r.varovani.find((v) => v.kod === 'ODMENA_PROPADLA_NEMOC')?.text).toContain('1 800 Kč');
  const bez = vypocitejSlozky(vstupVypoctu({ dny, sazby: [sazba(180)], vstup: vstup({ odmenaZaDenHal: 18000 }),
    nastaveni: { ...VYCHOZI_NASTAVENI, odmenaZaDenPropadaPriNemoci: false } }), 20000);
  expect(castka(bez, 'ODMENA_ZA_DEN')).toBe(180000);
});
test('scénář E — náhrada za nemoc přes hranici měsíce', () => {
  const zari = ['2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30']
    .map((d) => den(d, 'NEMOC', ['2026-09-26','2026-09-27'].includes(d) ? 0 : 8));
  const nemoc = ['01','02','03','04','05','06','07','08','09','10'].map((d) => den(`2026-10-${d}`, 'NEMOC', ['03','04','10'].includes(d) ? 0 : 8));
  const prace = dnyPrace(['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'], 8);
  const r = vypocitejSlozky(vstupVypoctu({ dny: [...nemoc, ...prace], dnyPredchozi: zari, sazby: [sazba(180)] }), 20000);
  expect(r.nahradaNemocHal).toBe(518400);
  expect(r.hrubaHal).toBe(1440000);
  expect(r.varovani.map((v) => v.kod)).toContain('NEMOC_PRES_14_DNU');
});
test('práce ve svátek s náhradním volnem nedává příplatek', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-10-28', 'PRACE', 8)],
    nastaveni: { ...VYCHOZI_NASTAVENI, praceVeSvatek: 'NAHRADNI_VOLNO' } }), 19000);
  expect(castka(r, 'PRIPLATEK_SVATEK')).toBe(0);
  expect(r.hodiny.nahradniVolnoZiskaneMin).toBe(480);
});
test('DPP: bez náhrady za svátek, doplatek do minimální mzdy podle zákona (§ 111 ZP)', () => {
  const r = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), sazby: [sazba(120)],
    dny: [den('2026-10-01', 'PRACE', 8), den('2026-10-28', 'SVATEK_ZAVRENO', 8)] }), 13440);
  expect(castka(r, 'NAHRADA_SVATEK')).toBe(0);
  // 8 h × 134,40 Kč = 1 075,20 Kč − 960 Kč = 115,20 Kč → 115 Kč
  expect(castka(r, 'DOPLATEK_MIN_MZDA')).toBe(11500);
  const kody = r.varovani.map((v) => v.kod);
  expect(kody).toContain('DPP_SAZBA_POD_MINIMEM');
  expect(kody).toContain('DOPLATEK_MIN_MZDA');
});
test('změna sazby uprostřed měsíce', () => {
  const r = vypocitejSlozky(vstupVypoctu({ sazby: [sazba(150), sazba(170, '2026-10-16')],
    dny: [den('2026-10-15', 'PRACE', 8), den('2026-10-16', 'PRACE', 8)] }), 16000);
  expect(r.slozky.find((s) => s.kod === 'ZAKLAD')?.castkaHal).toBe(256000);
});

// --- Doplňující testy (mimo zadání úkolu): okrajové případy a texty ---

test('sazbaProDen vybere poslední sazbu platnou k datu (i z neseřazeného pole)', () => {
  const s = [sazba(170, '2026-10-16'), sazba(150)];
  expect(sazbaProDen(s, '2026-10-15')).toBe(15000);
  expect(sazbaProDen(s, '2026-10-16')).toBe(17000);
  expect(sazbaProDen(s, '2026-12-31')).toBe(17000);
  expect(sazbaProDen([sazba(150, '2026-10-16')], '2026-10-15')).toBeNull();
  expect(sazbaProDen([], '2026-10-15')).toBeNull();
});
test('den bez sazby: varování CHYBI_SAZBA a do základu nejde', () => {
  const r = vypocitejSlozky(vstupVypoctu({ sazby: [sazba(150, '2026-10-16')],
    dny: [den('2026-10-15', 'PRACE', 8), den('2026-10-16', 'PRACE', 8)] }), 16000);
  expect(castka(r, 'ZAKLAD')).toBe(120000);
  const v = r.varovani.find((x) => x.kod === 'CHYBI_SAZBA');
  expect(v?.text).toContain('8 h');
  expect(v?.text).toContain('15. 10. 2026');
});
test('základ se zaokrouhluje až součet, ne každý den zvlášť', () => {
  // 6 × 1 minuta při 5 Kč/h = 6 × 8,33 haléře = přesně 50 haléřů → 1 Kč (po dnech by to bylo 6 × 8 = 48 → 0 Kč)
  const dny = dnyPrace(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08'], 1 / 60);
  const r = vypocitejSlozky(vstupVypoctu({ dny, sazby: [sazba(5)] }), 16000);
  expect(castka(r, 'ZAKLAD')).toBe(100);
});
test('vzorce složek: jedna sazba, více sazeb, nemoc', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: scenarA, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }), 19000);
  const vzorec = (kod: string) => r.slozky.find((s) => s.kod === kod)?.vzorec;
  expect(vzorec('ZAKLAD')).toBe('169 h × 160 Kč');
  expect(vzorec('PRIPLATEK_SOBOTA')).toBe('2 dny × 300 Kč');
  expect(vzorec('ODMENA_ZA_DEN')).toBe('22 dní × 120 Kč');
  expect(vzorec('NAHRADA_DOVOLENA')).toBe('8 h × 190 Kč');

  const vice = vypocitejSlozky(vstupVypoctu({ sazby: [sazba(150), sazba(170, '2026-10-16')],
    dny: [den('2026-10-15', 'PRACE', 8), den('2026-10-16', 'PRACE', 8)] }), 16000);
  expect(vice.slozky.find((s) => s.kod === 'ZAKLAD')?.vzorec).toBe('16 h podle sazeb platných v jednotlivé dny');

  const nemoc = ['01', '02', '05', '06', '07', '08'].map((d) => den(`2026-10-${d}`, 'NEMOC', 8));
  const n = vypocitejSlozky(vstupVypoctu({ dny: nemoc }), 20000);
  expect(n.nahradaNemocVzorec).toBe('6 dní, 48 h × 60 % × 180,00 Kč');
  expect(n.varovani.map((x) => x.kod)).not.toContain('NEMOC_PRES_14_DNU');
});
test('varování o propadlé odměně uvádí i větu o inspekci práce', () => {
  const dny = [...dnyPrace(['2026-10-12', '2026-10-13'], 8), den('2026-10-01', 'NEMOC', 8)];
  const r = vypocitejSlozky(vstupVypoctu({ dny, vstup: vstup({ odmenaZaDenHal: 18000 }) }), 20000);
  expect(r.varovani.find((v) => v.kod === 'ODMENA_PROPADLA_NEMOC')?.text)
    .toContain('Inspekce práce takovou podmínku pokutuje (viz výzkum)');
});
test('odměna za den bez odpracovaných dnů ani nemoci nic nehlásí', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-10-01', 'NEMOC', 8)], vstup: vstup({ odmenaZaDenHal: 18000 }) }), 20000);
  expect(r.odmenaZaDenBezPodminkyHal).toBe(0);
  expect(r.varovani.map((v) => v.kod)).not.toContain('ODMENA_PROPADLA_NEMOC');
});
test('doplatek do minima bere stanovenou týdenní dobu z nastavení firmy', () => {
  // 37,5 h týdně → hodinová min. mzda 143,40 Kč: 100 h × 143,40 − 100 h × 120 = 2 340 Kč
  const dny = dnyPrace(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'], 10);
  const r = vypocitejSlozky(vstupVypoctu({ dny, sazby: [sazba(120)],
    nastaveni: { ...VYCHOZI_NASTAVENI, tydenniPracovniDoba: 37.5 } }), 13440);
  expect(castka(r, 'DOPLATEK_MIN_MZDA')).toBe(234000);
});
test('HPP: náhrada za svátek a za náhradní volno jdou podle PV', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-10-28', 'SVATEK_ZAVRENO', 8), den('2026-10-29', 'NAHRADNI_VOLNO', 4)] }), 19000);
  expect(castka(r, 'NAHRADA_SVATEK')).toBe(152000);
  expect(castka(r, 'NAHRADA_NAHRADNI_VOLNO')).toBe(76000);
  expect(r.hrubaHal).toBe(228000);
});
test('DPP: odměny, kasa a paušál So/Ne jen s odmenyIProDpp; jiné odměny, příplatek za svátek a zákonných 10 % PV vždy', () => {
  const dny = [den('2026-10-03', 'PRACE', 8, true), den('2026-10-28', 'PRACE', 8, true)];
  const zakladniVstup = vstup({ odmenaZaDenHal: 18000, aktivitaHal: 9000, jineOdmenyHal: 5000 });
  const bez = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dny, sazby: [sazba(200)], vstup: zakladniVstup,
    nastaveni: { ...VYCHOZI_NASTAVENI, odmenyIProDpp: false } }), 19000);
  for (const kod of ['ODMENA_ZA_DEN', 'AKTIVITA', 'KASA']) expect(castka(bez, kod)).toBe(0);
  // 8 h × 10 % × 190 Kč = 152 Kč: příplatek za sobotu (§ 138 ZP) náleží i bez odměn pro DPP, jen v zákonné výši
  expect(castka(bez, 'PRIPLATEK_SOBOTA')).toBe(15200);
  expect(bez.odmenaZaDenBezPodminkyHal).toBe(0);
  expect(castka(bez, 'JINE_ODMENY')).toBe(5000);
  expect(castka(bez, 'PRIPLATEK_SVATEK')).toBe(152000);

  const s = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dny, sazby: [sazba(200)], vstup: zakladniVstup }), 19000);
  expect(castka(s, 'PRIPLATEK_SOBOTA')).toBe(30000);
  expect(castka(s, 'ODMENA_ZA_DEN')).toBe(36000);
  expect(castka(s, 'AKTIVITA')).toBe(18000);
  expect(castka(s, 'KASA')).toBe(10000);
});
test('DPP: příplatek za sobotu i neděli vždy aspoň zákonných 10 % PV, bez varování o paušálu', () => {
  const dny = [den('2026-10-03', 'PRACE', 8), den('2026-10-04', 'PRACE', 8)];
  const bez = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dny, sazby: [sazba(200)],
    nastaveni: { ...VYCHOZI_NASTAVENI, odmenyIProDpp: false } }), 19000);
  expect(castka(bez, 'PRIPLATEK_SOBOTA')).toBe(15200);
  expect(castka(bez, 'PRIPLATEK_NEDELE')).toBe(15200);
  expect(bez.slozky.find((x) => x.kod === 'PRIPLATEK_SOBOTA')?.vzorec).toBe('8 h × 10 % × 190 Kč');
  expect(bez.slozky.find((x) => x.kod === 'PRIPLATEK_NEDELE')?.vzorec).toBe('8 h × 10 % × 190 Kč');
  expect(bez.varovani.map((v) => v.kod)).not.toContain('PRIPLATEK_POD_MINIMEM');

  // S odmenyIProDpp jako u HPP: vyšší z paušálu 300 Kč a 10 % PV
  const s = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dny, sazby: [sazba(200)] }), 19000);
  expect(castka(s, 'PRIPLATEK_SOBOTA')).toBe(30000);
  expect(castka(s, 'PRIPLATEK_NEDELE')).toBe(30000);
  const vysoky = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dny: [den('2026-10-04', 'PRACE', 12)],
    sazby: [sazba(200)] }), 40000);
  expect(castka(vysoky, 'PRIPLATEK_NEDELE')).toBe(48000);
  expect(vysoky.varovani.map((v) => v.kod)).toContain('PRIPLATEK_POD_MINIMEM');
});
test('příplatek So/Ne: s nulovým paušálem jen zákonných 10 % PV, bez varování o paušálu', () => {
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-10-03', 'PRACE', 10)],
    nastaveni: { ...VYCHOZI_NASTAVENI, priplatekSobotaHal: 0 } }), 50000);
  expect(castka(r, 'PRIPLATEK_SOBOTA')).toBe(50000);
  expect(r.slozky.find((x) => x.kod === 'PRIPLATEK_SOBOTA')?.vzorec).toBe('10 h × 10 % × 500 Kč');
  expect(r.varovani.map((v) => v.kod)).not.toContain('PRIPLATEK_POD_MINIMEM');
});
test('příplatek So/Ne se vybírá po dnech: max(paušál, 10 % PV) za každý den zvlášť', () => {
  // So 4 h: 10 % × 400 Kč × 4 = 160 Kč < 300 Kč → 300 Kč; So 12 h: 480 Kč > 300 Kč → 480 Kč; celkem 780 Kč
  // (souhrnně za 16 h by vyšlo jen max(600, 640) = 640 Kč)
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-10-03', 'PRACE', 4), den('2026-10-10', 'PRACE', 12)] }), 40000);
  expect(castka(r, 'PRIPLATEK_SOBOTA')).toBe(78000);
  const v = r.varovani.find((x) => x.kod === 'PRIPLATEK_POD_MINIMEM');
  expect(v?.text).toContain('u 1 z 2 odpracovaných dnů');
  expect(v?.text).toContain('780 Kč místo 600 Kč');
});
test('svátek připadající na víkend dává příplatek za sobotu i za svátek', () => {
  // 26. 12. 2026 je sobota a státní svátek
  const r = vypocitejSlozky(vstupVypoctu({ dny: [den('2026-12-26', 'PRACE', 8)] }), 19000);
  expect(castka(r, 'PRIPLATEK_SOBOTA')).toBe(30000);
  expect(castka(r, 'PRIPLATEK_SVATEK')).toBe(152000);
});
test('DPP dostává náhradu mzdy za dovolenou podle PV', () => {
  const r = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), sazby: [sazba(200)],
    dny: [den('2026-10-01', 'PRACE', 8), den('2026-10-02', 'DOVOLENA', 8)] }), 19000);
  expect(castka(r, 'NAHRADA_DOVOLENA')).toBe(152000);
});
test('DPP: doplatek do minima bere základní hodinovou minimum bez přepočtu na týdenní dobu a bez příplatků', () => {
  // So 8 h při 120 Kč/h: základ 960 Kč, příplatek 300 Kč se do doplatku nepočítá; 8 × 134,40 − 960 = 115,20 → 115 Kč
  const dny = [den('2026-10-03', 'PRACE', 8)];
  const r = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva: 'DPP' }), dny, sazby: [sazba(120)],
    nastaveni: { ...VYCHOZI_NASTAVENI, tydenniPracovniDoba: 20 } }), 13440);
  expect(castka(r, 'PRIPLATEK_SOBOTA')).toBe(30000);
  expect(castka(r, 'DOPLATEK_MIN_MZDA')).toBe(11500);
  expect(r.slozky.find((x) => x.kod === 'DOPLATEK_MIN_MZDA')?.vzorec).toBe('134,40 Kč × 8 h − 960 Kč (mzda a odměny)');
});
test('doplatek do minima se nevyplácí za dny bez sazby (HPP i DPP)', () => {
  // 15. 10. bez sazby (CHYBI_SAZBA), 16. 10. při 150 Kč/h: 8 h × 134,40 = 1 075,20 Kč < 1 200 Kč → doplatek 0
  // (kdyby se počítalo 16 h, doplatek by byl 2 150,40 − 1 200 = 950 Kč)
  const dny = [den('2026-10-15', 'PRACE', 8), den('2026-10-16', 'PRACE', 8)];
  for (const smlouva of ['HPP', 'DPP'] as const) {
    const r = vypocitejSlozky(vstupVypoctu({ zamestnanec: zam({ smlouva }), dny, sazby: [sazba(150, '2026-10-16')] }), 16000);
    expect(r.varovani.map((v) => v.kod)).toContain('CHYBI_SAZBA');
    expect(castka(r, 'ZAKLAD')).toBe(120000);
    expect(castka(r, 'DOPLATEK_MIN_MZDA')).toBe(0);
    expect(r.varovani.map((v) => v.kod)).not.toContain('DOPLATEK_MIN_MZDA');
  }
});
test('aktivita při nemoci nepropadá (na rozdíl od odměny za den)', () => {
  const dny = [...dnyPrace(['2026-10-12', '2026-10-13'], 8), den('2026-10-01', 'NEMOC', 8)];
  const r = vypocitejSlozky(vstupVypoctu({ dny, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }), 20000);
  expect(castka(r, 'ODMENA_ZA_DEN')).toBe(0);
  expect(castka(r, 'AKTIVITA')).toBe(12000);
});

test('sazbaProMesic: sazba k 1. dni, jinak nejdřívější sazba platná v měsíci, jinak nic', () => {
  expect(sazbaProMesic([sazba(150, '2020-01-01'), sazba(170, '2026-10-16')], 2026, 10)).toEqual({ hodinovaHal: 15000, odDne: '2026-10-01' });
  expect(sazbaProMesic([sazba(170, '2026-10-20'), sazba(150, '2026-10-16')], 2026, 10)).toEqual({ hodinovaHal: 15000, odDne: '2026-10-16' });
  expect(sazbaProMesic([sazba(150, '2026-10-31')], 2026, 10)).toEqual({ hodinovaHal: 15000, odDne: '2026-10-31' });
  expect(sazbaProMesic([sazba(150, '2026-11-01')], 2026, 10)).toBeNull();
  expect(sazbaProMesic([], 2026, 10)).toBeNull();
  expect(sazbaProMesic([sazba(150, '2026-02-28')], 2026, 2)).toEqual({ hodinovaHal: 15000, odDne: '2026-02-28' });
});
