import { porovnejOdmeny } from './varianty';
import { den, dnyPrace, sazba, vstup, vstupVypoctu } from './test-utils';

// Scénář E z vypocet.test.ts: nemoc přes hranici měsíce, odměna za den 180 Kč při nemoci propadá.
function vstupScenareE() {
  const zari = ['2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30']
    .map((d) => den(d, 'NEMOC', ['2026-09-26','2026-09-27'].includes(d) ? 0 : 8));
  const nemoc = ['01','02','03','04','05','06','07','08','09','10'].map((d) => den(`2026-10-${d}`, 'NEMOC', ['03','04','10'].includes(d) ? 0 : 8));
  const prace = dnyPrace(['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'], 8);
  return vstupVypoctu({ dny: [...nemoc, ...prace], dnyPredchozi: zari, sazby: [sazba(180)], prumernyVydelekHal: 20000,
    vstup: vstup({ odmenaZaDenHal: 18000 }) });
}

test('porovnání odměn — scénář E: odměna propadá vs. platí poměrně', () => {
  const r = porovnejOdmeny([vstupScenareE()])[0]!;
  expect(r.dnes.kVyplateHal).toBe(1910300);
  expect(r.bezPodminky.kVyplateHal).toBe(2079900);
  expect(r.rozdilKVyplateHal).toBe(169600);
  expect(r.bezPodminky.hrubaHal - r.dnes.hrubaHal).toBe(180000);
  // náklad: o 1 800 Kč víc hrubé mzdy + pojistné firmy z 16 200 Kč (SP 4 018 + ZP 1 458) místo z 14 400 Kč (SP 3 572 + ZP 1 296) = +608 Kč
  expect(r.dnes.nakladFirmyHal).toBe(2574700);
  expect(r.rozdilNakladuHal).toBe(240800);
  expect(r.bezPodminky.nakladFirmyHal - r.dnes.nakladFirmyHal).toBe(r.rozdilNakladuHal);
});
