import { describe, expect, it } from 'vitest';
import type { PlanSmeny, SablonaSmeny, TypPlanu } from '../shared/api';
import { casSablonyKratce, dnesVPraze, sestavRozpis, textBunky, textRozpisu } from './rozpis';
import { zam } from './test-utils';

const sab = (id: string, zacatek: string, konec: string): SablonaSmeny => ({ id, firmaId: 'f1', nazev: id, zacatek, konec, prestavkaMin: 0, barva: null });
const SABLONY = [sab('8-14', '08:00', '14:00'), sab('8-12', '08:00', '12:00'), sab('9:30-13:30', '09:30', '13:30'), sab('14-18', '14:00', '18:00')];
const polozka = (zamestnanecId: string, datum: string, typ: TypPlanu, sablonaId: string | null = null, minuty = 360): PlanSmeny => ({
  zamestnanecId, datum, typ, sablonaId, minuty,
});

describe('casSablonyKratce', () => {
  it('celé hodiny bez „:00“, jinak s minutami, pomlčka je en dash', () => {
    expect(casSablonyKratce({ zacatek: '08:00', konec: '14:00' })).toBe('8–14');
    expect(casSablonyKratce({ zacatek: '09:30', konec: '13:30' })).toBe('9:30–13:30');
    expect(casSablonyKratce({ zacatek: '14:00', konec: '18:00' })).toBe('14–18');
    expect(casSablonyKratce({ zacatek: '08:00', konec: '14:00' })).toContain('–');
  });
});

describe('textBunky', () => {
  const s = SABLONY[0]!;
  it('směna se šablonou ukáže čas šablony', () => {
    expect(textBunky(polozka('a', '2026-10-19', 'SMENA', '8-14'), s, false)).toBe('8–14');
  });
  it('směna bez šablony ukáže délku v hodinách česky', () => {
    expect(textBunky(polozka('a', '2026-10-19', 'SMENA', null, 300), undefined, false)).toBe('směna 5 h');
    expect(textBunky(polozka('a', '2026-10-19', 'SMENA', null, 270), undefined, false)).toBe('směna 4,5 h');
    expect(textBunky(polozka('a', '2026-10-19', 'SMENA', null, 100), undefined, false)).toBe('směna 1,67 h');
  });
  it('zavřeno', () => {
    expect(textBunky(polozka('a', '2026-10-28', 'ZAVRENO', null, 0), undefined, false)).toBe('zavřeno');
  });
  it('volno, dovolená, nemoc a žádný plán jsou prázdné', () => {
    for (const typ of ['VOLNO', 'DOVOLENA', 'NEMOC'] as const) expect(textBunky(polozka('a', '2026-10-19', typ), undefined, false)).toBe('');
    expect(textBunky(undefined, undefined, false)).toBe('');
  });
  it('nepřítomnost v docházce skryje i směnu a zavřeno', () => {
    expect(textBunky(polozka('a', '2026-10-19', 'SMENA', '8-14'), s, true)).toBe('');
    expect(textBunky(polozka('a', '2026-10-28', 'ZAVRENO', null, 0), undefined, true)).toBe('');
  });
});

describe('sestavRozpis', () => {
  const PONDELI = '2026-10-19';
  const daniel = zam({ id: 'daniel', jmeno: 'Daniel', prijmeni: 'K', rolePlanu: 'KASA' });
  const magda = zam({ id: 'magda', jmeno: 'Magda', prijmeni: 'M', rolePlanu: 'PRODEJNA' });
  const ruzena = zam({ id: 'ruzena', jmeno: 'Růžena', prijmeni: 'A', rolePlanu: 'PRODEJNA' });
  const sef = zam({ id: 'sef', jmeno: 'Majitel', prijmeni: 'B', rolePlanu: 'MIMO_PLAN' });
  const host = zam({ id: 'host', jmeno: 'Host', prijmeni: 'C', rolePlanu: 'MIMO_PLAN' });
  const plan = [
    polozka('daniel', '2026-10-19', 'SMENA', '8-14'), polozka('magda', '2026-10-19', 'SMENA', '8-12'), polozka('ruzena', '2026-10-19', 'SMENA', '14-18'),
    polozka('host', '2026-10-21', 'SMENA', '9:30-13:30'), polozka('sef', '2026-10-21', 'DOVOLENA'),
  ];
  const vstup = (zmeny: Partial<Parameters<typeof sestavRozpis>[0]> = {}) =>
    sestavRozpis({ pondeli: PONDELI, dnes: '2026-10-21', lide: [ruzena, magda, daniel, sef, host], plan, sablony: SABLONY, nepritomnosti: [], ...zmeny });

  it('MIMO_PLAN bez směny chybí, MIMO_PLAN se směnou je', () => {
    const jmena = vstup().radky.map((r) => r.jmeno);
    expect(jmena).not.toContain('Majitel');
    expect(jmena).toContain('Host');
  });
  it('neaktivní a člověk mimo pracovní poměr chybí, ukončení uprostřed týdne zůstává', () => {
    const neaktivni = zam({ id: 'n', jmeno: 'Neaktivní', prijmeni: 'N', rolePlanu: 'KASA', aktivni: false });
    const odesel = zam({ id: 'o', jmeno: 'Odešel', prijmeni: 'O', rolePlanu: 'KASA', ukonceni: '2026-10-18' });
    const konci = zam({ id: 'k', jmeno: 'Končí', prijmeni: 'K', rolePlanu: 'KASA', ukonceni: '2026-10-20' });
    const nastoupi = zam({ id: 'ns', jmeno: 'Nastoupí', prijmeni: 'N', rolePlanu: 'KASA', nastup: '2026-10-26' });
    const jmena = vstup({ lide: [daniel, neaktivni, odesel, konci, nastoupi] }).radky.map((r) => r.jmeno);
    expect(jmena).toContain('Končí');
    expect(jmena).not.toContain('Neaktivní');
    expect(jmena).not.toContain('Odešel');
    expect(jmena).not.toContain('Nastoupí');
  });
  it('MIMO_PLAN, jehož jediná směna je skrytá nepřítomností, v rozpisu chybí (prázdný řádek by prozradil nepřítomnost)', () => {
    const r = vstup({ nepritomnosti: [{ zamestnanecId: 'host', datum: '2026-10-21' }] });
    expect(r.radky.map((x) => x.jmeno)).not.toContain('Host');
  });
  it('MIMO_PLAN s viditelnou směnou je v rozpisu, i když jinou směnu má skrytou nepřítomností', () => {
    const p = [...plan, polozka('host', '2026-10-22', 'SMENA', '8-14')];
    const r = vstup({ plan: p, nepritomnosti: [{ zamestnanecId: 'host', datum: '2026-10-21' }] });
    const radek = r.radky.find((x) => x.zamestnanecId === 'host')!;
    expect(radek.bunky).toEqual(['', '', '', '8–14', '', '', '']);
  });
  it('směna po ukončení pracovního poměru se neukáže; MIMO_PLAN jen s takovou směnou chybí', () => {
    const konci = zam({ id: 'k', jmeno: 'Končí', prijmeni: 'K', rolePlanu: 'KASA', ukonceni: '2026-10-20' });
    const hostKonci = zam({ id: 'hk', jmeno: 'HostKonci', prijmeni: 'H', rolePlanu: 'MIMO_PLAN', ukonceni: '2026-10-20' });
    const p = [polozka('k', '2026-10-19', 'SMENA', '8-14'), polozka('k', '2026-10-22', 'SMENA', '8-14'), polozka('hk', '2026-10-22', 'SMENA', '8-14')];
    const r = vstup({ lide: [konci, hostKonci], plan: p });
    expect(r.radky.find((x) => x.zamestnanecId === 'k')!.bunky).toEqual(['8–14', '', '', '', '', '', '']);
    expect(r.radky.map((x) => x.zamestnanecId)).not.toContain('hk');
  });
  it('pořadí řádků nezávisí na směně skryté nepřítomností', () => {
    const a = zam({ id: 'a', jmeno: 'A', prijmeni: 'A', rolePlanu: 'KASA' });
    const b = zam({ id: 'b', jmeno: 'B', prijmeni: 'B', rolePlanu: 'KASA' });
    const p = [polozka('a', '2026-10-19', 'SMENA', '8-14'), polozka('a', '2026-10-21', 'SMENA', '14-18'), polozka('b', '2026-10-20', 'SMENA', '9:30-13:30')];
    const r = vstup({ lide: [a, b], plan: p, nepritomnosti: [{ zamestnanecId: 'a', datum: '2026-10-19' }] });
    expect(r.radky.map((x) => x.zamestnanecId)).toEqual(['b', 'a']);
  });
  it('řadí podle času (seradTyden) a vyplní buňky Po–Ne', () => {
    const r = vstup();
    expect(r.radky.map((x) => x.zamestnanecId)).toEqual(['magda', 'daniel', 'host', 'ruzena']);
    expect(r.radky[1]!.bunky).toEqual(['8–14', '', '', '', '', '', '']);
    expect(r.radky[2]!.bunky).toEqual(['', '', '9:30–13:30', '', '', '', '']);
  });
  it('nepřítomnost z docházky dá prázdnou buňku a rozpis neobsahuje nemoc ani dovolenou', () => {
    const r = vstup({ nepritomnosti: [{ zamestnanecId: 'daniel', datum: '2026-10-19' }] });
    expect(r.radky.find((x) => x.zamestnanecId === 'daniel')!.bunky[0]).toBe('');
    expect(JSON.stringify(r)).not.toMatch(/Nemoc|Dovolen|NEMOC|DOVOLENA/);
  });
  it('dny: zkratky, datum, dnes jen u jednoho dne', () => {
    const r = vstup();
    expect(r.dny.map((d) => d.zkratka)).toEqual(['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']);
    expect(r.dny[0]).toMatchObject({ datum: '2026-10-19', datumText: '19. 10.', svatek: null, dnes: false });
    expect(r.dny.filter((d) => d.dnes).map((d) => d.datum)).toEqual(['2026-10-21']);
  });
  it('dnes mimo týden: žádný den není dnes', () => {
    expect(vstup({ dnes: '2026-11-02' }).dny.some((d) => d.dnes)).toBe(false);
  });
  it('svátek 28. 10. 2026 má jméno', () => {
    const r = vstup({ pondeli: '2026-10-26' });
    expect(r.dny[2]).toMatchObject({ datum: '2026-10-28', datumText: '28. 10.', svatek: 'Den vzniku samostatného československého státu' });
    expect(r.dny[0]!.svatek).toBeNull();
  });
  it('nadpis: týden v měsíci, přes měsíc, přes rok', () => {
    expect(vstup().nadpis).toBe('Rozpis směn 19.–25. 10. 2026');
    expect(vstup({ pondeli: '2026-09-28' }).nadpis).toBe('Rozpis směn 28. 9.–4. 10. 2026');
    expect(vstup({ pondeli: '2026-12-28' }).nadpis).toBe('Rozpis směn 28. 12. 2026–3. 1. 2027');
    expect(vstup().pondeli).toBe('2026-10-19');
  });
  it('svátek přes hranici roku se hledá v roce toho dne', () => {
    const r = vstup({ pondeli: '2026-12-28' });
    expect(r.dny[4]).toMatchObject({ datum: '2027-01-01', svatek: 'Nový rok, Den obnovy samostatného českého státu' });
  });
});

describe('textRozpisu', () => {
  const daniel = zam({ id: 'daniel', jmeno: 'Daniel', prijmeni: 'K', rolePlanu: 'KASA' });
  const magda = zam({ id: 'magda', jmeno: 'Magda', prijmeni: 'M', rolePlanu: 'PRODEJNA' });
  const kamila = zam({ id: 'kamila', jmeno: 'Kamila', prijmeni: 'Č', rolePlanu: 'PRODEJNA' });
  const plan = [
    polozka('daniel', '2026-10-19', 'SMENA', '8-14'), polozka('magda', '2026-10-19', 'SMENA', '8-12'), polozka('daniel', '2026-10-20', 'SMENA', '8-14'),
    polozka('kamila', '2026-10-19', 'NEMOC'), polozka('kamila', '2026-10-20', 'DOVOLENA'), polozka('magda', '2026-10-22', 'ZAVRENO', null, 0),
  ];
  const r = sestavRozpis({ pondeli: '2026-10-19', dnes: '2026-10-19', lide: [kamila, magda, daniel], plan, sablony: SABLONY, nepritomnosti: [] });
  const radky = textRozpisu(r).split('\n');

  it('první řádek je rozsah bez roku, pak sedm dnů v pořadí', () => {
    expect(radky[0]).toBe('Rozpis směn 19.–25. 10.');
    expect(radky).toHaveLength(8);
    expect(radky.slice(1).map((l) => l.split(':')[0])).toEqual(['Po 19. 10.', 'Út 20. 10.', 'St 21. 10.', 'Čt 22. 10.', 'Pá 23. 10.', 'So 24. 10.', 'Ne 25. 10.']);
  });
  it('jen neprázdné buňky v pořadí řádků, zavřeno jako „jméno zavřeno“, den bez nikoho „nikdo“', () => {
    expect(radky[1]).toBe('Po 19. 10.: Magda 8–12, Daniel 8–14');
    expect(radky[2]).toBe('Út 20. 10.: Daniel 8–14');
    expect(radky[3]).toBe('St 21. 10.: nikdo');
    expect(radky[4]).toBe('Čt 22. 10.: Magda zavřeno');
    expect(radky[7]).toBe('Ne 25. 10.: nikdo');
  });
  it('nikdy neobsahuje nemoc ani dovolenou ani jméno člověka, který má jen nepřítomnost', () => {
    const text = textRozpisu(r);
    expect(text).not.toMatch(/Nemoc|Dovolen|nemoc|dovolen/);
    expect(text).not.toContain('Kamila');
  });
  it('přes hranici měsíce a roku', () => {
    const mesic = sestavRozpis({ pondeli: '2026-09-28', dnes: '2026-10-01', lide: [], plan: [], sablony: [], nepritomnosti: [] });
    expect(textRozpisu(mesic).split('\n')[0]).toBe('Rozpis směn 28. 9.–4. 10.');
    const rok = sestavRozpis({ pondeli: '2026-12-28', dnes: '2026-12-28', lide: [], plan: [], sablony: [], nepritomnosti: [] });
    expect(textRozpisu(rok).split('\n')[0]).toBe('Rozpis směn 28. 12.–3. 1.');
  });
});

describe('dnesVPraze', () => {
  it('v půlnoci UTC je v Praze už další den (letní i zimní čas)', () => {
    expect(dnesVPraze(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16');
    expect(dnesVPraze(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-15');
    expect(dnesVPraze(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(dnesVPraze(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12-31');
  });
  it('bez argumentu vrací datum ve tvaru RRRR-MM-DD', () => {
    expect(dnesVPraze()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
