import type { PlanSmeny, SablonaSmeny } from '../shared/api';
import { klicBunky } from './plan';
import { seradDen, seradTyden } from './razeniRozpisu';
import { zam as zamestnanec } from './test-utils';

const DNY = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
const sab = (id: string, zacatek: string, konec: string): SablonaSmeny => ({ id, firmaId: 'f1', nazev: id, zacatek, konec, prestavkaMin: 0, barva: null });
const SABLONY = new Map(
  [
    sab('8-14', '08:00', '14:00'), sab('8-12', '08:00', '12:00'), sab('9-14', '09:00', '14:00'), sab('9:30-13:30', '09:30', '13:30'),
    sab('10-18', '10:00', '18:00'), sab('10-14', '10:00', '14:00'), sab('14-18', '14:00', '18:00'), sab('22-6', '22:00', '06:00'), sab('22-23', '22:00', '23:00'),
  ].map((s) => [s.id, s]),
);

const lide = {
  daniel: zamestnanec({ id: 'daniel', jmeno: 'Daniel', prijmeni: 'K' }),
  magda: zamestnanec({ id: 'magda', jmeno: 'Magda', prijmeni: 'M' }),
  romana: zamestnanec({ id: 'romana', jmeno: 'Romana', prijmeni: 'R' }),
  bohdana: zamestnanec({ id: 'bohdana', jmeno: 'Bohdana', prijmeni: 'B' }),
  honza: zamestnanec({ id: 'honza', jmeno: 'Honza', prijmeni: 'J' }),
  kristyna: zamestnanec({ id: 'kristyna', jmeno: 'Kristýna', prijmeni: 'T' }),
  alena: zamestnanec({ id: 'alena', jmeno: 'Alena', prijmeni: 'A' }),
  kamila: zamestnanec({ id: 'kamila', jmeno: 'Kamila', prijmeni: 'Č' }),
  tibor: zamestnanec({ id: 'tibor', jmeno: 'Tibor', prijmeni: 'Z' }),
};
const ids = (z: { id: string }[]) => z.map((x) => x.id);

/** Plán: člověk má šablonu ve vybraných dnech (index 0 = pondělí). */
function planZ(...radky: [string, string, number[]][]): Map<string, PlanSmeny> {
  const plan = new Map<string, PlanSmeny>();
  for (const [kdo, sablonaId, indexy] of radky) {
    for (const i of indexy) plan.set(klicBunky(kdo, DNY[i]!), { zamestnanecId: kdo, datum: DNY[i]!, typ: 'SMENA', sablonaId, minuty: 360 });
  }
  return plan;
}
const PO_PA = [0, 1, 2, 3, 4];

describe('seradTyden', () => {
  const plan = planZ(
    ['daniel', '8-14', PO_PA], ['magda', '8-12', PO_PA], ['romana', '9-14', PO_PA], ['bohdana', '9:30-13:30', PO_PA], ['honza', '10-18', PO_PA],
    ['kristyna', '14-18', [0]], ['kristyna', '10-14', [1, 2, 3, 4]], ['alena', '14-18', PO_PA],
  );
  plan.set(klicBunky('kamila', DNY[0]!), { zamestnanecId: 'kamila', datum: DNY[0]!, typ: 'NEMOC', sablonaId: null, minuty: 480 });
  const vsichni = [lide.tibor, lide.alena, lide.kamila, lide.kristyna, lide.honza, lide.bohdana, lide.romana, lide.daniel, lide.magda];

  test('podle nejčastějšího začátku a konce; bez směny na konec podle jména', () => {
    expect(ids(seradTyden(vsichni, DNY, plan, SABLONY))).toEqual(['magda', 'daniel', 'romana', 'bohdana', 'kristyna', 'honza', 'alena', 'kamila', 'tibor']);
  });

  test('nemění vstupní pole', () => {
    const kopie = [...vsichni];
    seradTyden(vsichni, DNY, plan, SABLONY);
    expect(vsichni).toEqual(kopie);
  });

  test('shoda četnosti začátků: vyhraje dřívější začátek', () => {
    const p = planZ(['daniel', '14-18', [0, 1]], ['daniel', '8-14', [2, 3]], ['magda', '9-14', PO_PA]);
    expect(ids(seradTyden([lide.magda, lide.daniel], DNY, p, SABLONY))).toEqual(['daniel', 'magda']);
  });

  test('shoda četnosti konců se stejným začátkem: vyhraje dřívější konec', () => {
    // Daniel: 10–18 jednou (pondělí) a 10–14 jednou → klíč 10–14, tedy před Magdou s 10–14 celý týden jen podle jména.
    const p = planZ(['daniel', '10-18', [0]], ['daniel', '10-14', [1]], ['magda', '10-14', PO_PA]);
    expect(ids(seradTyden([lide.magda, lide.daniel], DNY, p, SABLONY))).toEqual(['daniel', 'magda']);
  });

  test('směna bez šablony se nepočítá (člověk jde na konec)', () => {
    const p = planZ(['magda', '9-14', [0]]);
    p.set(klicBunky('daniel', DNY[0]!), { zamestnanecId: 'daniel', datum: DNY[0]!, typ: 'SMENA', sablonaId: null, minuty: 480 });
    p.set(klicBunky('romana', DNY[0]!), { zamestnanecId: 'romana', datum: DNY[0]!, typ: 'SMENA', sablonaId: 'neexistuje', minuty: 480 });
    expect(ids(seradTyden([lide.romana, lide.daniel, lide.magda], DNY, p, SABLONY))).toEqual(['magda', 'daniel', 'romana']);
  });

  test('dny mimo zobrazený týden se nepočítají', () => {
    const p = planZ(['daniel', '8-14', [0]]);
    p.set(klicBunky('magda', '2026-10-26'), { zamestnanecId: 'magda', datum: '2026-10-26', typ: 'SMENA', sablonaId: '8-12', minuty: 240 });
    expect(ids(seradTyden([lide.magda, lide.daniel], DNY, p, SABLONY))).toEqual(['daniel', 'magda']);
  });

  test('směna přes půlnoc má konec později než jakýkoli denní', () => {
    const p = planZ(['daniel', '22-6', PO_PA], ['magda', '22-23', PO_PA]);
    expect(ids(seradTyden([lide.daniel, lide.magda], DNY, p, SABLONY))).toEqual(['magda', 'daniel']);
  });

  test('stejný čas: příjmení a jméno česky (Č až za C), pak id', () => {
    const p = planZ(['a', '10-18', PO_PA], ['b', '10-18', PO_PA], ['c', '10-18', PO_PA], ['d', '10-18', PO_PA]);
    const a = zamestnanec({ id: 'a', jmeno: 'Zora', prijmeni: 'Čech' });
    const b = zamestnanec({ id: 'b', jmeno: 'Ota', prijmeni: 'Cyril' });
    const c = zamestnanec({ id: 'c', jmeno: 'Ota', prijmeni: 'Cyril' });
    const d = zamestnanec({ id: 'd', jmeno: 'Ada', prijmeni: 'Dub' });
    expect(ids(seradTyden([d, c, a, b], DNY, p, SABLONY))).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('seradDen', () => {
  const plan = planZ(
    ['daniel', '8-14', PO_PA], ['magda', '8-12', PO_PA], ['romana', '9-14', PO_PA], ['honza', '10-18', PO_PA],
    ['kristyna', '14-18', [0]], ['kristyna', '10-14', [1, 2, 3, 4]], ['alena', '14-18', PO_PA],
  );
  plan.set(klicBunky('kamila', DNY[0]!), { zamestnanecId: 'kamila', datum: DNY[0]!, typ: 'NEMOC', sablonaId: null, minuty: 480 });
  const vsichni = [lide.tibor, lide.kristyna, lide.kamila, lide.alena, lide.honza, lide.romana, lide.daniel, lide.magda];

  test('pondělí: Kristýna je mezi odpoledními, nemoc a nic na konci podle jména', () => {
    expect(ids(seradDen(vsichni, DNY[0]!, plan, SABLONY))).toEqual(['magda', 'daniel', 'romana', 'honza', 'alena', 'kristyna', 'kamila', 'tibor']);
  });

  test('úterý: Kristýna 10–14 před Honzou 10–18', () => {
    expect(ids(seradDen(vsichni, DNY[1]!, plan, SABLONY))).toEqual(['magda', 'daniel', 'romana', 'kristyna', 'honza', 'alena', 'kamila', 'tibor']);
  });

  test('směna bez šablony se nepočítá; nemění vstup', () => {
    const p = planZ(['magda', '9-14', [0]]);
    p.set(klicBunky('daniel', DNY[0]!), { zamestnanecId: 'daniel', datum: DNY[0]!, typ: 'SMENA', sablonaId: null, minuty: 480 });
    const vstup = [lide.daniel, lide.magda];
    expect(ids(seradDen(vstup, DNY[0]!, p, SABLONY))).toEqual(['magda', 'daniel']);
    expect(ids(vstup)).toEqual(['daniel', 'magda']);
  });
});
