import { formatHodin, souhrnHodin } from './hodiny';
import { den, dnyPrace } from './test-utils';
import { VYCHOZI_NASTAVENI } from '../shared/api';
const scenarA = [
  ...dnyPrace(['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'], 8, true),
  ...dnyPrace(['2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26'], 8),
  den('2026-10-03', 'PRACE', 6), den('2026-10-10', 'PRACE', 6), den('2026-10-11', 'PRACE', 5),
  den('2026-10-28', 'PRACE', 8), den('2026-10-30', 'DOVOLENA', 8),
];
test('souhrn scénáře A', () => {
  const s = souhrnHodin(scenarA, VYCHOZI_NASTAVENI, 'HPP');
  expect(s.praceMin).toBe(169 * 60);
  expect(s.praceVsedniMin).toBe(144 * 60);
  expect(s.sobotaMin).toBe(12 * 60);
  expect(s.nedeleMin).toBe(5 * 60);
  expect(s.svatekPraceMin).toBe(8 * 60);
  expect(s.dovolenaMin).toBe(8 * 60);
  expect(s.odpracovaneDny).toBe(22);
  expect(s.dnySobota).toBe(2);
  expect(s.dnyNedele).toBe(1);
  expect(s.dnySvatek).toBe(1);
  expect(s.dnyKasa).toBe(10);
  expect(s.smenyStravne).toBe(22);
  expect(s.nahradniVolnoZiskaneMin).toBe(0);
});
test('stravné: < 3 h nic, > 11 h dvakrát; DPP podle nastavení', () => {
  const dny = [den('2026-10-01', 'PRACE', 2.5), den('2026-10-02', 'PRACE', 3), den('2026-10-05', 'PRACE', 11.5)];
  expect(souhrnHodin(dny, VYCHOZI_NASTAVENI, 'HPP').smenyStravne).toBe(3);
  expect(souhrnHodin(dny, { ...VYCHOZI_NASTAVENI, stravneProDpp: false }, 'DPP').smenyStravne).toBe(0);
});
test('svátek s náhradním volnem', () => {
  const s = souhrnHodin([den('2026-10-28', 'PRACE', 8)], { ...VYCHOZI_NASTAVENI, praceVeSvatek: 'NAHRADNI_VOLNO' }, 'HPP');
  expect(s.nahradniVolnoZiskaneMin).toBe(480);
});

test('stravné: přesně 11 h je jedna směna, DPP se stravným se počítá', () => {
  const dny = [den('2026-10-01', 'PRACE', 11), den('2026-10-02', 'PRACE', 11.5)];
  expect(souhrnHodin(dny, VYCHOZI_NASTAVENI, 'HPP').smenyStravne).toBe(3);
  expect(souhrnHodin(dny, VYCHOZI_NASTAVENI, 'DPP').smenyStravne).toBe(3);
});
test('svátek, který je zároveň nedělí nebo sobotou, se počítá do obou', () => {
  // 5. 7. 2026 je neděle a svátek, 26. 12. 2026 je sobota a svátek.
  const s = souhrnHodin([den('2026-07-05', 'PRACE', 6), den('2026-12-26', 'PRACE', 4)], VYCHOZI_NASTAVENI, 'HPP');
  expect(s.praceMin).toBe(10 * 60);
  expect(s.praceVsedniMin).toBe(0);
  expect(s.nedeleMin).toBe(6 * 60);
  expect(s.sobotaMin).toBe(4 * 60);
  expect(s.svatekPraceMin).toBe(10 * 60);
  expect(s.dnyNedele).toBe(1);
  expect(s.dnySobota).toBe(1);
  expect(s.dnySvatek).toBe(2);
  expect(s.dnyVsedni).toBe(0);
  expect(s.odpracovaneDny).toBe(2);
});
test('práce 0 minut není odpracovaný den, stravné ani kasa', () => {
  const s = souhrnHodin([den('2026-10-01', 'PRACE', 0, true), den('2026-10-02', 'PRACE', 8, true)], VYCHOZI_NASTAVENI, 'HPP');
  expect(s.odpracovaneDny).toBe(1);
  expect(s.dnyVsedni).toBe(1);
  expect(s.dnyKasa).toBe(1);
  expect(s.smenyStravne).toBe(1);
  expect(s.praceMin).toBe(480);
});
test('ostatní typy dnů: minuty a počty', () => {
  const s = souhrnHodin([
    den('2026-10-01', 'DOVOLENA', 8), den('2026-10-02', 'DOVOLENA', 4),
    den('2026-10-05', 'SVATEK_ZAVRENO', 8),
    den('2026-10-06', 'NAHRADNI_VOLNO', 8),
    den('2026-10-07', 'NEMOC', 8), den('2026-10-08', 'NEMOC', 8), den('2026-10-10', 'NEMOC', 0),
    den('2026-10-12', 'NEPLACENE', 8),
    den('2026-10-13', 'ABSENCE', 8),
  ], VYCHOZI_NASTAVENI, 'HPP');
  expect(s.dovolenaMin).toBe(12 * 60);
  expect(s.dnyDovolena).toBe(2);
  expect(s.svatekZavrenoMin).toBe(8 * 60);
  expect(s.dnySvatekZavreno).toBe(1);
  expect(s.nahradniVolnoMin).toBe(8 * 60);
  expect(s.nemocMin).toBe(16 * 60);
  expect(s.dnyNemocKalendarni).toBe(3);
  expect(s.neplaceneMin).toBe(8 * 60);
  expect(s.absenceMin).toBe(8 * 60);
  expect(s.praceMin).toBe(0);
  expect(s.odpracovaneDny).toBe(0);
  expect(s.smenyStravne).toBe(0);
  expect(s.nahradniVolnoZiskaneMin).toBe(0);
});
test('prázdný měsíc dává samé nuly', () => {
  const s = souhrnHodin([], VYCHOZI_NASTAVENI, 'HPP');
  expect(Object.values(s).every((v) => v === 0)).toBe(true);
});
test('formát hodin z minut: celé bez čárky, jinak na dvě desetinná místa s čárkou', () => {
  expect(formatHodin(0)).toBe('0');
  expect(formatHodin(300 * 60)).toBe('300');
  expect(formatHodin(2250)).toBe('37,5');
  expect(formatHodin(20)).toBe('0,33');
  expect(formatHodin(8281)).toBe('138,02');
});
