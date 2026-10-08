import { dnyNemoci } from '../app/dochazka';
import type { Den, PlanSmeny } from '../shared/api';
import { denVTydnu, jeSvatek, posunDatum } from './kalendar';
import { dnyNahradyNemoci } from './nemoc';
import { doplnPlan, dnyTydne, jeVPomeru, minutySablony, planNaDny, pondeliTydne, prevedPlan } from './plan';
import { sazba, vstupVypoctu } from './test-utils';
import { vypocitejMzdu } from './vypocet';

const polozka = (datum: string, typ: PlanSmeny['typ'], minuty = 480, zamestnanecId = 'z1', sablonaId: string | null = null): PlanSmeny =>
  ({ zamestnanecId, datum, typ, sablonaId, minuty });
const den = (datum: string, zmeny: Partial<Den> = {}): Den => ({ zamestnanecId: 'z1', datum, typ: 'PRACE', minuty: 480, kasa: false, poznamka: null, ...zmeny });
const clovek = (id: string, zmeny: Partial<{ smlouva: 'HPP' | 'DPP'; nastup: string; ukonceni: string | null }> = {}) =>
  ({ id, smlouva: 'HPP' as const, nastup: '2025-01-01', ukonceni: null, ...zmeny });

describe('minutySablony', () => {
  test('konec − začátek − přestávka', () => {
    expect(minutySablony({ zacatek: '08:00', konec: '16:30', prestavkaMin: 30 })).toBe(480);
    expect(minutySablony({ zacatek: '12:00', konec: '20:00', prestavkaMin: 30 })).toBe(450);
    expect(minutySablony({ zacatek: '06:15', konec: '10:45', prestavkaMin: 0 })).toBe(270);
  });

  test('přes půlnoc se přičte 24 h', () => {
    expect(minutySablony({ zacatek: '22:00', konec: '06:00', prestavkaMin: 0 })).toBe(480);
    expect(minutySablony({ zacatek: '18:00', konec: '00:00', prestavkaMin: 30 })).toBe(330);
  });

  test('přestávka delší než směna dá 0, ne záporné číslo; neplatný čas je chyba', () => {
    expect(minutySablony({ zacatek: '08:00', konec: '08:30', prestavkaMin: 45 })).toBe(0);
    expect(() => minutySablony({ zacatek: '8:00', konec: '16:00', prestavkaMin: 0 })).toThrow(RangeError);
    expect(() => minutySablony({ zacatek: '08:00', konec: '24:00', prestavkaMin: 0 })).toThrow(RangeError);
  });
});

describe('planNaDny', () => {
  test('SMENA → PRACE, DOVOLENA → DOVOLENA, ZAVRENO → SVATEK_ZAVRENO s minutami; VOLNO nic', () => {
    const dny = planNaDny([
      polozka('2026-10-05', 'SMENA', 480, 'z1', 's1'),
      polozka('2026-10-06', 'VOLNO', 0),
      polozka('2026-10-07', 'DOVOLENA', 450),
      polozka('2026-10-28', 'ZAVRENO', 360),
    ], []);
    expect(dny).toEqual([
      den('2026-10-05', { typ: 'PRACE', minuty: 480 }),
      den('2026-10-07', { typ: 'DOVOLENA', minuty: 450 }),
      den('2026-10-28', { typ: 'SVATEK_ZAVRENO', minuty: 360 }),
    ]);
  });

  test('den, který už v docházce je, se přeskočí (i když má jiný typ); jiný člověk ve stejný den ne', () => {
    const dny = planNaDny(
      [polozka('2026-10-05', 'SMENA'), polozka('2026-10-06', 'SMENA'), polozka('2026-10-05', 'SMENA', 360, 'z2')],
      [den('2026-10-05', { typ: 'NEMOC', minuty: 0 })],
    );
    expect(dny).toEqual([den('2026-10-06'), den('2026-10-05', { zamestnanecId: 'z2', minuty: 360 })]);
  });

  test('NEMOC → NEMOC s minutami z plánu', () => {
    expect(planNaDny([polozka('2026-10-19', 'NEMOC', 240)], [])).toEqual([den('2026-10-19', { typ: 'NEMOC', minuty: 240 })]);
  });
});

describe('prevedPlan', () => {
  test('počítá přeskočené dny zvlášť: už v docházce, „zavřeno" u DPP, mimo pracovní poměr', () => {
    const plan = [
      polozka('2026-10-05', 'SMENA'), polozka('2026-10-06', 'SMENA'), polozka('2026-10-07', 'VOLNO', 0),
      polozka('2026-10-28', 'ZAVRENO', 480),
      polozka('2026-10-28', 'ZAVRENO', 360, 'dpp'), polozka('2026-10-29', 'SMENA', 360, 'dpp'),
      polozka('2026-10-09', 'SMENA', 480, 'novy'), polozka('2026-10-12', 'SMENA', 480, 'novy'),
      polozka('2026-10-05', 'SMENA', 480, 'neznamy'),
    ];
    const vysledek = prevedPlan(plan, [den('2026-10-06')], [clovek('z1'), clovek('dpp', { smlouva: 'DPP' }), clovek('novy', { nastup: '2026-10-12' })]);
    expect(vysledek.dny).toEqual([
      den('2026-10-05'),
      den('2026-10-28', { typ: 'SVATEK_ZAVRENO' }),
      den('2026-10-29', { zamestnanecId: 'dpp', minuty: 360 }),
      den('2026-10-12', { zamestnanecId: 'novy' }),
    ]);
    expect(vysledek).toMatchObject({ preskoceno: 1, preskocenoDpp: 1, mimoPomer: 2 });
  });

  test('po ukončení pracovního poměru se nic nevytvoří', () => {
    const vysledek = prevedPlan([polozka('2026-10-15', 'SMENA'), polozka('2026-10-16', 'SMENA')], [], [clovek('z1', { ukonceni: '2026-10-15' })]);
    expect(vysledek.dny.map((d) => d.datum)).toEqual(['2026-10-15']);
    expect(vysledek.mimoPomer).toBe(1);
  });
});

describe('týden a pracovní poměr', () => {
  test('pondeliTydne: týden začíná pondělím, neděle patří k předchozímu pondělí', () => {
    expect(pondeliTydne('2026-10-05')).toBe('2026-10-05');
    expect(pondeliTydne('2026-10-11')).toBe('2026-10-05');
    expect(pondeliTydne('2026-10-01')).toBe('2026-09-28');
    expect(dnyTydne('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  test('jeVPomeru včetně dne nástupu i ukončení', () => {
    const z = clovek('z1', { nastup: '2026-10-12', ukonceni: '2026-10-20' });
    expect(['2026-10-11', '2026-10-12', '2026-10-20', '2026-10-21'].map((d) => jeVPomeru(z, d))).toEqual([false, true, true, false]);
    expect(jeVPomeru(clovek('z2'), '2030-01-01')).toBe(true);
  });
});

describe('doplnPlan', () => {
  const minulyTyden = (datum: string) => {
    const d = new Date(`${datum}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  };

  test('zkopíruje směny a volno jen do prázdných dnů; dovolenou a „zavřeno" ne', () => {
    const plan = [
      polozka('2026-10-19', 'SMENA', 480, 'z1', 's1'), polozka('2026-10-20', 'VOLNO', 0), polozka('2026-10-21', 'DOVOLENA'),
      polozka('2026-10-22', 'SMENA', 450, 'z1', 's2'), polozka('2026-10-29', 'SMENA', 300),
    ];
    const nove = doplnPlan(plan, [clovek('z1')], dnyTydne('2026-10-26'), minulyTyden);
    // 28. 10. je svátek: zůstane prázdný, ať se rozhodne ručně; 29. 10. už něco má.
    expect(nove).toEqual([polozka('2026-10-26', 'SMENA', 480, 'z1', 's1'), polozka('2026-10-27', 'VOLNO', 0)]);
  });

  test('vynechá dny mimo pracovní poměr a lidi bez vzoru', () => {
    const plan = [polozka('2026-10-05', 'SMENA'), polozka('2026-10-06', 'SMENA'), polozka('2026-10-05', 'SMENA', 480, 'z2')];
    const nove = doplnPlan(plan, [clovek('z1', { ukonceni: '2026-10-12' }), clovek('z3')], ['2026-10-12', '2026-10-13'], minulyTyden);
    expect(nove).toEqual([polozka('2026-10-12', 'SMENA')]);
  });

  test('nemoc se nekopíruje', () => {
    expect(doplnPlan([polozka('2026-10-19', 'NEMOC', 240)], [clovek('z1')], ['2026-10-26'], minulyTyden)).toEqual([]);
  });
});

describe('nemoc z plánu tvoří v docházce stejnou epizodu jako nemoc zadaná od–do', () => {
  const z1 = clovek('z1', { nastup: '2020-01-01' });
  const dnyOdDo = (od: string, do_: string) => {
    const dny: string[] = [];
    for (let d = od; d <= do_; d = posunDatum(d, 1)) dny.push(d);
    return dny;
  };
  const pracovni = (od: string, do_: string) => dnyOdDo(od, do_).filter((d) => denVTydnu(d) < 6 && !jeSvatek(d));
  /** Docházka „Zadat nemoc" od–do v panelu dne (stejná funkce jako appka). */
  const zDochazky = (od: string, do_: string): Den[] => dnyNemoci(od, do_, 480, z1).map((d) => ({ zamestnanecId: 'z1', ...d }));
  const serad = (dny: Den[]) => [...dny].sort((a, b) => a.datum.localeCompare(b.datum));
  const vyplata = (dny: Den[]) => vypocitejMzdu(vstupVypoctu({ dny: serad(dny), sazby: [sazba(180)], prumernyVydelekHal: 20000 }));

  test('dva týdny Po–Pá zadané v plánu po dnech: převod doplní víkend s 0 min a výplata vyjde stejně', () => {
    const plan = pracovni('2026-10-12', '2026-10-23').map((d) => polozka(d, 'NEMOC'));
    const { dny } = prevedPlan(plan, [], [z1]);
    const ocekavane = zDochazky('2026-10-12', '2026-10-23');
    expect(serad(dny)).toEqual(ocekavane);
    expect(dny.filter((d) => d.minuty === 0).map((d) => d.datum)).toEqual(['2026-10-17', '2026-10-18']);
    const zPlanu = vyplata(dny);
    expect(zPlanu.hodiny.dnyNemocKalendarni).toBe(12);
    expect(zPlanu).toEqual(vyplata(ocekavane));
  });

  test('tři týdny 5.–23. 10.: od 15. kalendářního dne (19. 10.) už náhradu neplatí firma, stejně jako v docházce', () => {
    const plan = pracovni('2026-10-05', '2026-10-23').map((d) => polozka(d, 'NEMOC'));
    const { dny } = prevedPlan(plan, [], [z1]);
    const ocekavane = zDochazky('2026-10-05', '2026-10-23');
    expect(serad(dny)).toEqual(ocekavane);
    expect(dnyNahradyNemoci(serad(dny), []).nadLimit.map((d) => d.datum)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    const zPlanu = vyplata(dny);
    expect(zPlanu.nahradaNemocHal).toBeGreaterThan(0);
    expect(zPlanu).toEqual(vyplata(ocekavane));
  });

  test('nemoc zadaná v plánu od–do (každý den, víkend s 0 min) se převede beze změny', () => {
    const plan = dnyNemoci('2026-10-12', '2026-10-23', 480, z1).map((d) => polozka(d.datum, 'NEMOC', d.minuty));
    const { dny } = prevedPlan(plan, [], [z1]);
    expect(serad(dny)).toEqual(zDochazky('2026-10-12', '2026-10-23'));
    expect(vyplata(dny)).toEqual(vyplata(zDochazky('2026-10-12', '2026-10-23')));
  });

  test('pojistka doplní jen volné dny bez plánu a bez docházky mezi dvěma dny nemoci', () => {
    const nemocPaPo = [polozka('2026-10-16', 'NEMOC'), polozka('2026-10-19', 'NEMOC')];
    // V mezeře je volno v plánu → nedoplní se nic.
    expect(prevedPlan([...nemocPaPo, polozka('2026-10-17', 'VOLNO', 0)], [], [z1]).dny.map((d) => d.datum)).toEqual(['2026-10-16', '2026-10-19']);
    // Neděle už je v docházce → nedoplní se ani sobota (epizodu přerušuje, co v docházce je).
    expect(prevedPlan(nemocPaPo, [den('2026-10-18', { typ: 'PRACE', minuty: 240 })], [z1]).dny.map((d) => d.datum)).toEqual(['2026-10-16', '2026-10-19']);
    // Mezi nemocemi je pracovní den bez nemoci → epizoda je přerušená, nic se nedoplní.
    expect(prevedPlan([polozka('2026-10-15', 'NEMOC'), polozka('2026-10-19', 'NEMOC')], [], [z1]).dny.map((d) => d.datum)).toEqual(['2026-10-15', '2026-10-19']);
    // V pátek už je v docházce práce → nemoc z plánu tam nevznikne a víkend se nedoplní.
    expect(prevedPlan(nemocPaPo, [den('2026-10-16')], [z1]).dny.map((d) => d.datum)).toEqual(['2026-10-19']);
    // Pátek je nemoc už v docházce, pondělí z plánu → víkend se doplní.
    expect(prevedPlan(nemocPaPo, [den('2026-10-16', { typ: 'NEMOC' })], [z1]).dny.map((d) => [d.datum, d.minuty]))
      .toEqual([['2026-10-19', 480], ['2026-10-17', 0], ['2026-10-18', 0]]);
    // Svátek 28. 10. ve středu mezi nemocí v úterý a ve čtvrtek se doplní; jiný člověk ne.
    const svatek = prevedPlan([polozka('2026-10-27', 'NEMOC'), polozka('2026-10-29', 'NEMOC'), polozka('2026-10-29', 'NEMOC', 480, 'z2')], [], [z1, clovek('z2')]);
    expect(svatek.dny.map((d) => [d.zamestnanecId, d.datum, d.typ, d.minuty])).toEqual([
      ['z1', '2026-10-27', 'NEMOC', 480], ['z1', '2026-10-29', 'NEMOC', 480], ['z2', '2026-10-29', 'NEMOC', 480], ['z1', '2026-10-28', 'NEMOC', 0],
    ]);
    expect(svatek).toMatchObject({ preskoceno: 0, preskocenoDpp: 0, mimoPomer: 0 });
  });
});
