import { vypocitejPojisteni as vypocitejPojisteniJadro, jePojisteny } from './pojisteni';
import { parametryRoku } from './parametry';
import { zam } from './test-utils';
import { formatKc } from './penize';
const p = parametryRoku(2026);
// Sjednaný příjem 30 000 Kč: zaměstnání není malého rozsahu (kromě testů, které si ho přepíšou).
const zaklad = { rok: 2026, mesic: 10, dnyNemocKalendarni: 0, sjednanyPrijemKc: 30000 as number | null, p };
// Skutečný příjem v haléřích je ve většině testů právě VZ; jen testy účasti na pojištění ho zadávají zvlášť.
const vypocitejPojisteni = (a: Omit<Parameters<typeof vypocitejPojisteniJadro>[0], 'prijemHal'> & { prijemHal?: number }) =>
  vypocitejPojisteniJadro({ prijemHal: a.vzKc * 100, ...a });
test('scénář A', () => {
  const { pojisteni } = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 38895, zamestnanec: zam(), hodinyProSlevuMin: 169 * 60 });
  expect(pojisteni).toEqual({ pojisteny: true, socialniZamKc: 2762, zdravotniZamKc: 1751, doplatekZpKc: 0, socialniFirmaKc: 9646, zdravotniFirmaKc: 3500, slevaPojistneKc: 0 });
});
test('scénář C — DPP nad hranicí', () => {
  const { pojisteni } = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: 14000, zamestnanec: zam({ smlouva: 'DPP' }), hodinyProSlevuMin: 80 * 60 });
  expect(pojisteni).toMatchObject({ pojisteny: true, socialniZamKc: 994, zdravotniZamKc: 630, socialniFirmaKc: 3472, zdravotniFirmaKc: 1260 });
});
test('DPP pod hranicí nepojištěná', () => {
  expect(jePojisteny('DPP', 11999, p, null)).toEqual({ socialni: false, zdravotni: false });
  expect(jePojisteny('DPP', 12000, p, null)).toEqual({ socialni: true, zdravotni: true });
});
test('HPP: sociální pojištění podle sjednaného příjmu (§ 6 a § 7 z. 187/2006)', () => {
  // sjednaný příjem 30 000 Kč: zaměstnání není malého rozsahu, sociální se platí z jakéhokoli příjmu
  expect(jePojisteny('HPP', 4499, p, 30000)).toEqual({ socialni: true, zdravotni: true });
  expect(jePojisteny('HPP', 1, p, 30000)).toEqual({ socialni: true, zdravotni: true });
  expect(jePojisteny('HPP', 0, p, 30000)).toEqual({ socialni: false, zdravotni: true });
  // sjednaný příjem 3 000 Kč: malý rozsah, sociální až v měsíci, kdy skutečný příjem dosáhne rozhodného příjmu
  expect(jePojisteny('HPP', 4499, p, 3000)).toEqual({ socialni: false, zdravotni: true });
  expect(jePojisteny('HPP', 4500, p, 3000)).toEqual({ socialni: true, zdravotni: true });
  // hranice samotného sjednaného příjmu: 4 499 je malý rozsah, 4 500 už ne
  expect(jePojisteny('HPP', 4000, p, 4499)).toEqual({ socialni: false, zdravotni: true });
  expect(jePojisteny('HPP', 4000, p, 4500)).toEqual({ socialni: true, zdravotni: true });
  // neznámý sjednaný příjem (žádná sazba) se bere jako zaměstnání, které není malého rozsahu
  expect(jePojisteny('HPP', 100, p, null)).toEqual({ socialni: true, zdravotni: true });
});
test('scénář D — invalidní III. st., zkrácený úvazek: bez doplatku ZP, se slevou 5 %', () => {
  const z = zam({ invalidita: 'III', uvazekMinTydne: 1200, slevaNaPojistnem: true });
  const { pojisteni } = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 10200, zamestnanec: z, hodinyProSlevuMin: 60 * 60 });
  expect(pojisteni).toEqual({ pojisteny: true, socialniZamKc: 725, zdravotniZamKc: 459, doplatekZpKc: 0, socialniFirmaKc: 2530, zdravotniFirmaKc: 918, slevaPojistneKc: 510 });
});
test('scénář D bez invalidity — doplatek do minima ZP', () => {
  const r = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 10200, zamestnanec: zam({ uvazekMinTydne: 1200 }), hodinyProSlevuMin: 3600 });
  expect(r.pojisteni.doplatekZpKc).toBe(1647);
  expect(r.varovani.map((v) => v.kod)).toContain('ZP_DOPLATEK_MINIMUM');
});
test('scénář E — minimum ZP krácené o dny nemoci', () => {
  const r = vypocitejPojisteni({ ...zaklad, dnyNemocKalendarni: 10, smlouva: 'HPP', vzKc: 14400, zamestnanec: zam(), hodinyProSlevuMin: 80 * 60 });
  expect(r.pojisteni).toMatchObject({ socialniZamKc: 1023, zdravotniZamKc: 648, doplatekZpKc: 105, socialniFirmaKc: 3572, zdravotniFirmaKc: 1296 });
});
test('nástup v polovině měsíce krátí minimum', () => {
  const r = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 11200, zamestnanec: zam({ nastup: '2026-10-17' }), hodinyProSlevuMin: 80 * 60 });
  expect(r.pojisteni.doplatekZpKc).toBe(0); // minimum = ceil(22400 × 15/31) = 10839 < 11200
});
test('sleva 5 % se neuplatní při plném úvazku', () => {
  const r = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 30000, zamestnanec: zam({ slevaNaPojistnem: true, invalidita: 'I' }), hodinyProSlevuMin: 160 * 60 });
  expect(r.pojisteni.slevaPojistneKc).toBe(0);
  expect(r.varovani.map((v) => v.kod)).toContain('SLEVA_POJISTNE_NESPLNENA');
});

// --- Doplňující testy (hranice a texty varování) ---
const hpp = (vzKc: number, z = zam(), extra: Partial<Parameters<typeof vypocitejPojisteni>[0]> = {}) =>
  vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc, zamestnanec: z, hodinyProSlevuMin: 80 * 60, ...extra });
const kody = (r: ReturnType<typeof vypocitejPojisteni>) => r.varovani.map((v) => v.kod);

test('varování o doplatku ZP obsahuje částky', () => {
  const r = hpp(10200, zam({ uvazekMinTydne: 1200 }), { hodinyProSlevuMin: 3600 });
  const text = r.varovani.find((v) => v.kod === 'ZP_DOPLATEK_MINIMUM')?.text ?? '';
  expect(text).toContain(formatKc(1020000)); // vyměřovací základ
  expect(text).toContain(formatKc(2240000)); // minimální základ
  expect(text).toContain(formatKc(164700)); // doplatek
  expect(text).toContain('31 z 31');
});
test('ukončení v polovině měsíce krátí minimum', () => {
  // dny 1.–15. v poměru: minimum = ceil(22400 × 15/31) = 10839 → VZ 10838 nestačí o 1 Kč
  const r = hpp(10838, zam({ ukonceni: '2026-10-15' }));
  expect(r.pojisteni.doplatekZpKc).toBe(1); // ⌈1 × 13,5 %⌉
  expect(hpp(10839, zam({ ukonceni: '2026-10-15' })).pojisteni.doplatekZpKc).toBe(0);
});
test('minimum ZP se neuplatní u ZTP/P ani státního pojištěnce, ani u DPP', () => {
  expect(hpp(10200, zam({ ztpp: true })).pojisteni.doplatekZpKc).toBe(0);
  expect(hpp(10200, zam({ statniPojistenec: true })).pojisteni.doplatekZpKc).toBe(0);
  expect(hpp(10200, zam({ invalidita: 'I' })).pojisteni.doplatekZpKc).toBe(0);
  expect(hpp(10200, zam({ invalidita: 'II' })).pojisteni.doplatekZpKc).toBe(0);
  const dpp = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: 12000, zamestnanec: zam({ smlouva: 'DPP' }), hodinyProSlevuMin: 80 * 60 });
  expect(dpp.pojisteni.doplatekZpKc).toBe(0);
});
test('HPP malého rozsahu pod rozhodným příjmem: sociální 0, zdravotní se platí, bez slevy 5 %', () => {
  const r = hpp(4000, zam({ slevaNaPojistnem: true, uvazekMinTydne: 1200, invalidita: 'III' }), { hodinyProSlevuMin: 20 * 60, sjednanyPrijemKc: 3000 });
  expect(r.pojisteni).toEqual({ pojisteny: true, socialniZamKc: 0, zdravotniZamKc: 180, doplatekZpKc: 0, socialniFirmaKc: 0, zdravotniFirmaKc: 360, slevaPojistneKc: 0 });
  expect(kody(r)).toEqual(['SLEVA_POJISTNE_NESPLNENA']);
  expect(r.varovani[0]?.text).toContain('malého rozsahu');
});
test('HPP, které není malého rozsahu, platí sociální i z příjmu pod rozhodným příjmem', () => {
  const r = hpp(4000, zam(), { hodinyProSlevuMin: 20 * 60 });
  expect(r.pojisteni).toMatchObject({ socialniZamKc: 284, socialniFirmaKc: 992, zdravotniZamKc: 180, zdravotniFirmaKc: 360 }); // ⌈4000 × 7,1 %⌉, ⌈4000 × 24,8 %⌉
});
test('záporný vyměřovací základ se bere jako nula', () => {
  const r = hpp(-500, zam({ statniPojistenec: true }));
  expect(r.pojisteni).toEqual({ pojisteny: true, socialniZamKc: 0, zdravotniZamKc: 0, doplatekZpKc: 0, socialniFirmaKc: 0, zdravotniFirmaKc: 0, slevaPojistneKc: 0 });
  const dpp = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: -500, zamestnanec: zam({ smlouva: 'DPP' }), hodinyProSlevuMin: 0 });
  expect(dpp.pojisteni.pojisteny).toBe(false);
});
test('DPP pod hranicí: vše nula a nepojištěná', () => {
  const r = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: 11999, zamestnanec: zam({ smlouva: 'DPP' }), hodinyProSlevuMin: 80 * 60 });
  expect(r.pojisteni).toEqual({ pojisteny: false, socialniZamKc: 0, zdravotniZamKc: 0, doplatekZpKc: 0, socialniFirmaKc: 0, zdravotniFirmaKc: 0, slevaPojistneKc: 0 });
  expect(r.varovani).toEqual([]);
});
describe('účast na pojištění podle skutečného příjmu, ne podle VZ zaokrouhleného nahoru', () => {
  const dpp = zam({ smlouva: 'DPP' });
  test('DPP: příjem 11 999,50 Kč (VZ 12 000 Kč) je pod hranicí, nepojištěná, vše 0', () => {
    const r = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: 12000, prijemHal: 1199950, zamestnanec: dpp, hodinyProSlevuMin: 80 * 60 });
    expect(r.pojisteni).toEqual({ pojisteny: false, socialniZamKc: 0, zdravotniZamKc: 0, doplatekZpKc: 0, socialniFirmaKc: 0, zdravotniFirmaKc: 0, slevaPojistneKc: 0 });
  });
  test('DPP: příjem přesně 12 000,00 Kč je pojištěná a pojistné se počítá z VZ', () => {
    const r = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: 12000, prijemHal: 1200000, zamestnanec: dpp, hodinyProSlevuMin: 80 * 60 });
    expect(r.pojisteni).toMatchObject({ pojisteny: true, socialniZamKc: 852, zdravotniZamKc: 540, socialniFirmaKc: 2976, zdravotniFirmaKc: 1080 });
  });
  test('HPP malého rozsahu: příjem 4 499,50 Kč (VZ 4 500 Kč) bez sociálního, 4 500,00 Kč se sociálním z VZ', () => {
    const malyRozsah = { ...zaklad, smlouva: 'HPP' as const, sjednanyPrijemKc: 4348, zamestnanec: zam(), hodinyProSlevuMin: 20 * 60 };
    const pod = vypocitejPojisteni({ ...malyRozsah, vzKc: 4500, prijemHal: 449950 });
    expect(pod.pojisteni).toMatchObject({ pojisteny: true, socialniZamKc: 0, socialniFirmaKc: 0, zdravotniZamKc: 203, zdravotniFirmaKc: 405 });
    const na = vypocitejPojisteni({ ...malyRozsah, vzKc: 4500, prijemHal: 450000 });
    expect(na.pojisteni).toMatchObject({ socialniZamKc: 320, socialniFirmaKc: 1116 }); // ⌈4 500 × 7,1 %⌉, ⌈4 500 × 24,8 %⌉
  });
  test('HPP mimo malý rozsah: sociální od příjmu 1 Kč; příjem 0,50 Kč (dolů 0 Kč) sociální nezakládá', () => {
    const r = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 1, prijemHal: 50, zamestnanec: zam(), hodinyProSlevuMin: 60 });
    expect(r.pojisteni.socialniZamKc).toBe(0); // příjem dolů na Kč je 0: sociální se neplatí
    const jedna = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 1, prijemHal: 100, zamestnanec: zam(), hodinyProSlevuMin: 60 });
    expect(jedna.pojisteni.socialniZamKc).toBe(1);
  });
  test('varování o slevě 5 % při malém rozsahu ukazuje skutečný příjem na haléře, ne VZ', () => {
    const r = vypocitejPojisteni({ ...zaklad, smlouva: 'HPP', vzKc: 4500, prijemHal: 449950, sjednanyPrijemKc: 4348,
      zamestnanec: zam({ slevaNaPojistnem: true, uvazekMinTydne: 1200 }), hodinyProSlevuMin: 20 * 60 });
    const t = r.varovani.find((v) => v.kod === 'SLEVA_POJISTNE_NESPLNENA')?.text ?? '';
    expect(t).toContain(`příjem ${formatKc(449950)} jsou pod rozhodným příjmem ${formatKc(450000)}`);
  });
});

describe('sleva 5 % — hranice podmínek', () => {
  const sleva = (vzKc: number, hodinyProSlevuMin: number, uvazekMinTydne = 1200) =>
    hpp(vzKc, zam({ slevaNaPojistnem: true, uvazekMinTydne }), { hodinyProSlevuMin });
  const text = (r: ReturnType<typeof vypocitejPojisteni>) => r.varovani.find((v) => v.kod === 'SLEVA_POJISTNE_NESPLNENA')?.text ?? '';

  test('na hranicích všech podmínek se uplatní', () => {
    expect(sleva(73451, 8280, 480).pojisteni.slevaPojistneKc).toBe(3673); // strop VZ, 138 h, úvazek 8 h; 73451 / 138 h = 532 Kč/h
    expect(sleva(564 * 100, 6000, 1800).pojisteni.slevaPojistneKc).toBe(2820); // přesně 564 Kč/h, úvazek 30 h
    expect(kody(sleva(73451, 8280, 480))).toEqual([]);
  });
  test('úvazek mimo 8–30 h', () => {
    expect(sleva(10000, 3600, 479).pojisteni.slevaPojistneKc).toBe(0);
    expect(text(sleva(10000, 3600, 479))).toContain('úvazek 7,98 h');
    expect(sleva(10000, 3600, 1801).pojisteni.slevaPojistneKc).toBe(0);
    expect(text(sleva(10000, 3600, 1801))).toContain('úvazek 30,02 h');
  });
  test('odpracováno přes 138 h', () => {
    const r = sleva(10000, 8281);
    expect(r.pojisteni.slevaPojistneKc).toBe(0);
    expect(text(r)).toContain('odpracováno 138,02 h');
    expect(text(r)).toContain('včetně hodin s náhradou mzdy');
  });
  test('vyměřovací základ nad stropem', () => {
    const r = sleva(73452, 8280);
    expect(r.pojisteni.slevaPojistneKc).toBe(0);
    expect(text(r)).toContain(`nad stropem ${formatKc(7345100)}`);
  });
  test('vyměřovací základ na hodinu nad limitem', () => {
    const r = sleva(5641, 600); // 10 h práce: 564,1 Kč/h
    expect(r.pojisteni.slevaPojistneKc).toBe(0);
    // 5 641 Kč / 10 h = 564,10 Kč/h, v textu přesně na haléře (ne zaokrouhleno nahoru na 565 Kč)
    expect(text(r)).toContain(`${formatKc(56410)}) je nad limitem ${formatKc(56400)}`);
  });
  test('Kč na hodinu v textu je přesné na haléře a nikdy nevypadá rovné limitu', () => {
    // 56 401 Kč za 100 h = 564,01 Kč/h
    const r = sleva(56401, 6000);
    expect(r.pojisteni.slevaPojistneKc).toBe(0);
    expect(text(r)).toContain(`${formatKc(56401)}) je nad limitem ${formatKc(56400)}`);
  });
  test('bez jakýchkoli hodin se sleva neuplatní a varování to řekne', () => {
    const r = sleva(8000, 0);
    expect(r.pojisteni.slevaPojistneKc).toBe(0);
    expect(text(r)).toContain('žádné odpracované ani nahrazené hodiny');
  });
  test('příznak na DPP: sleva 0 s varováním', () => {
    const r = vypocitejPojisteni({ ...zaklad, smlouva: 'DPP', vzKc: 14000, zamestnanec: zam({ smlouva: 'DPP', slevaNaPojistnem: true }), hodinyProSlevuMin: 80 * 60 });
    expect(r.pojisteni.slevaPojistneKc).toBe(0);
    expect(text(r)).toContain('jen pracovního poměru');
  });
  test('bez příznaku se nic nehlásí', () => {
    const r = hpp(10000, zam({ uvazekMinTydne: 1200 }), { hodinyProSlevuMin: 3600 });
    expect(kody(r)).toEqual(['ZP_DOPLATEK_MINIMUM']);
  });
});
