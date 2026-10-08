import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Den, ZamestnanecSeSazbami } from '../../shared/api';
import { zamestnanec } from '../test-utils';
import { PanelDne } from './PanelDne';

const den = (datum: string, typ: Den['typ'], minuty = 480, kasa = false, poznamka: string | null = null): Den =>
  ({ zamestnanecId: 'z1', datum, typ, minuty, kasa, poznamka });

function otevri({ datumy = ['2026-10-05'], dnyOsoby = [] as Den[], z = zamestnanec(), rezim = 'den' as 'den' | 'nemoc' } = {}) {
  const onUloz = vi.fn();
  const onZavrit = vi.fn();
  render(<PanelDne datumy={datumy} rezim={rezim} rok={2026} mesic={10} zamestnanec={z as ZamestnanecSeSazbami} dnyOsoby={dnyOsoby} onUloz={onUloz} onZavrit={onZavrit} />);
  return { onUloz, onZavrit, dialog: screen.getByRole('dialog') };
}

const hodiny = () => screen.getByRole('textbox', { name: /^Hodiny/ });

test('volba Dovolená + 8 h uloží den s minutami 480', async () => {
  const { onUloz, dialog } = otevri();
  expect(dialog).toHaveAccessibleName('Pondělí 5. října');
  await userEvent.click(screen.getByRole('radio', { name: /Dovolená/ }));
  await userEvent.clear(hodiny());
  await userEvent.click(screen.getByRole('button', { name: '8 h' }));
  expect(hodiny()).toHaveValue('8');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(onUloz).toHaveBeenCalledWith({ dny: [{ datum: '2026-10-05', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }] }, undefined);
});

test('existující den se předvyplní; kasa jen u práce; „Smazat den" ho smaže', async () => {
  const { onUloz } = otevri({ dnyOsoby: [den('2026-10-05', 'PRACE', 450, true, 'Inventura')] });
  expect(screen.getByRole('radio', { name: /Práce/ })).toBeChecked();
  expect(hodiny()).toHaveValue('7,5');
  expect(screen.getByRole('switch', { name: /Kasa/ })).toBeChecked();
  expect(screen.getByRole('textbox', { name: /Poznámka/ })).toHaveValue('Inventura');

  await userEvent.click(screen.getByRole('radio', { name: /Neplacené volno/ }));
  expect(screen.queryByRole('switch', { name: /Kasa/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Smazat den' }));
  expect(onUloz).toHaveBeenCalledWith({ dny: [], smazat: ['2026-10-05'] }, undefined);
});

test('práce s tlačítky ± po čtvrthodinách a kasou', async () => {
  const { onUloz } = otevri();
  expect(hodiny()).toHaveValue('8'); // obvyklá směna při úvazku 40 h
  await userEvent.click(screen.getByRole('button', { name: 'O čtvrt hodiny méně' }));
  await userEvent.click(screen.getByRole('button', { name: 'O čtvrt hodiny méně' }));
  expect(hodiny()).toHaveValue('7,5');
  await userEvent.click(screen.getByRole('switch', { name: /Kasa/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(onUloz).toHaveBeenCalledWith({ dny: [{ datum: '2026-10-05', typ: 'PRACE', minuty: 450, kasa: true, poznamka: null }] }, undefined);
});

test('výchozí hodiny podle posledního dne téhož typu', async () => {
  otevri({ dnyOsoby: [den('2026-10-01', 'DOVOLENA', 300), den('2026-10-02', 'PRACE', 360)] });
  expect(hodiny()).toHaveValue('6');
  await userEvent.click(screen.getByRole('radio', { name: /Dovolená/ }));
  expect(hodiny()).toHaveValue('5');
});

test('neplatné hodiny nic neuloží a řeknou proč', async () => {
  const { onUloz } = otevri();
  await userEvent.clear(hodiny());
  await userEvent.type(hodiny(), '25');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(onUloz).not.toHaveBeenCalled();
  expect(screen.getByText('Zadej hodiny od 0,25 do 24, např. 8 nebo 7,5.')).toBeInTheDocument();
  expect(hodiny()).toHaveFocus();
});

test('Svátek – zavřeno jen ve svátek (s názvem svátku) a ne u dohody', () => {
  otevri({ datumy: ['2026-10-28'] });
  expect(screen.getByText('Den vzniku samostatného československého státu')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Svátek – zavřeno/ })).toBeInTheDocument();
});

test('Svátek – zavřeno chybí v obyčejný den a u DPP', () => {
  otevri({ datumy: ['2026-10-27'] });
  expect(screen.queryByRole('radio', { name: /Svátek – zavřeno/ })).not.toBeInTheDocument();
});

test('DPP ve svátek „Svátek – zavřeno" nenabídne', () => {
  otevri({ datumy: ['2026-10-28'], z: zamestnanec({ smlouva: 'DPP', uvazekMinTydne: 0 }) });
  expect(screen.queryByRole('radio', { name: /Svátek – zavřeno/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole('radio')).toHaveLength(6);
});

test('Nemoc od–do zapíše každý kalendářní den, víkend s 0 h', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-08'] });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(screen.getByLabelText('Nemoc od')).toHaveValue('2026-10-08');
  expect(screen.getByLabelText('Nemoc do')).toHaveValue('2026-10-08');
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-13');
  expect(screen.getByText(/Zapíše se 6 dní, z toho 2 dny víkendu nebo svátku s 0 h\./)).toBeInTheDocument();
  expect(screen.getByText('Žádný vyplněný den se nepřepíše.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  const ulozene = onUloz.mock.calls[0]![0].dny as Den[];
  expect(ulozene.map((d) => [d.datum, d.typ, d.minuty])).toEqual([
    ['2026-10-08', 'NEMOC', 480], ['2026-10-09', 'NEMOC', 480], ['2026-10-10', 'NEMOC', 0], ['2026-10-11', 'NEMOC', 0],
    ['2026-10-12', 'NEMOC', 480], ['2026-10-13', 'NEMOC', 480],
  ]);
});

test('režim „Zadat nemoc" otevře rovnou nemoc s pevným typem; konec před začátkem neuloží', async () => {
  const { onUloz, dialog } = otevri({ datumy: ['2026-10-12'], rezim: 'nemoc' });
  expect(dialog).toHaveAccessibleName('Zadat nemoc');
  // Typ nejde přepnout, nadpis „Zadat nemoc" tak vždy sedí.
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.getByText(/Zapiš celou neschopenku od–do/)).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-01');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(onUloz).not.toHaveBeenCalled();
  expect(screen.getByText('Konec nemoci nesmí být před začátkem.')).toBeInTheDocument();
});

test('víc vybraných dní: jeden typ a hodiny pro všechny, smazání jen existujících', async () => {
  const { onUloz, dialog } = otevri({ datumy: ['2026-10-05', '2026-10-06', '2026-10-07'], dnyOsoby: [den('2026-10-06', 'PRACE', 480)] });
  expect(dialog).toHaveAccessibleName('Vybrané dny (3)');
  await userEvent.click(screen.getByRole('radio', { name: /Dovolená/ }));
  await userEvent.click(screen.getByRole('button', { name: '4 h' }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect((onUloz.mock.calls[0]![0].dny as Den[]).map((d) => [d.datum, d.typ, d.minuty])).toEqual([
    ['2026-10-05', 'DOVOLENA', 240], ['2026-10-06', 'DOVOLENA', 240], ['2026-10-07', 'DOVOLENA', 240],
  ]);
  await userEvent.click(screen.getByRole('button', { name: 'Smazat vybrané dny' }));
  expect(onUloz).toHaveBeenLastCalledWith({ dny: [], smazat: ['2026-10-06'] }, undefined);
});

test('„Zkopírovat minulý týden" doplní prázdné dny týdne a řekne kolik', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-14'], dnyOsoby: [den('2026-10-05', 'PRACE', 480, true), den('2026-10-07', 'DOVOLENA', 480), den('2026-10-13', 'PRACE', 360)] });
  const kopie = within(screen.getByRole('dialog')).getByRole('button', { name: 'Zkopírovat minulý týden' });
  await userEvent.click(kopie);
  expect(onUloz).toHaveBeenCalledWith(
    { dny: [{ datum: '2026-10-12', typ: 'PRACE', minuty: 480, kasa: true, poznamka: null }, { datum: '2026-10-14', typ: 'DOVOLENA', minuty: 480, kasa: false, poznamka: null }] },
    'Zkopírovány 2 dny z minulého týdne.',
  );
});

test('nemoc na jediný víkendový den má výchozí 0 h; po rozšíření rozsahu hodiny pracovního dne', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-10'] });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(hodiny()).toHaveValue('0');
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-12');
  expect(screen.getByRole('textbox', { name: 'Hodiny v pracovní dny' })).toHaveValue('8');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect((onUloz.mock.calls[0]![0].dny as Den[]).map((d) => [d.datum, d.minuty])).toEqual([['2026-10-10', 0], ['2026-10-11', 0], ['2026-10-12', 480]]);
});

const ulozeneDny = (onUloz: ReturnType<typeof vi.fn>) =>
  (onUloz.mock.calls.at(-1)![0].dny as Den[]).map((d) => [d.datum, d.typ, d.minuty, d.kasa, d.poznamka]);

test('víc dní s různými údaji: „Uložit" bez změn nechá každému dni hodiny, kasu i poznámku', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06'],
    dnyOsoby: [den('2026-10-05', 'PRACE', 480, true, 'Inventura'), den('2026-10-06', 'PRACE', 360, true, 'Školení')],
  });
  // Společné hodnoty předvyplněné, rozdílné „různé".
  expect(screen.getByRole('radio', { name: /Práce/ })).toBeChecked();
  expect(hodiny()).toHaveValue('');
  expect(hodiny()).toHaveAttribute('placeholder', 'různé');
  expect(screen.getByRole('switch', { name: /Kasa/ })).toBeChecked();
  expect(screen.getByRole('textbox', { name: /Poznámka/ })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: /Poznámka/ })).toHaveAttribute('placeholder', 'různé');

  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'PRACE', 480, true, 'Inventura'],
    ['2026-10-06', 'PRACE', 360, true, 'Školení'],
  ]);
});

test('víc dní: změna jen typu ponechá hodiny i poznámky, změna jen hodin ponechá kasu i poznámky', async () => {
  const dnyOsoby = [den('2026-10-05', 'PRACE', 480, true, 'Inventura'), den('2026-10-06', 'PRACE', 360, true, 'Školení')];
  const { onUloz } = otevri({ datumy: ['2026-10-05', '2026-10-06'], dnyOsoby });
  await userEvent.click(screen.getByRole('radio', { name: /Dovolená/ }));
  expect(hodiny()).toHaveValue(''); // hodiny zůstanou „různé", typ je nepřepíše výchozími
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'DOVOLENA', 480, false, 'Inventura'],
    ['2026-10-06', 'DOVOLENA', 360, false, 'Školení'],
  ]);

  await userEvent.click(screen.getByRole('radio', { name: /Práce/ }));
  await userEvent.click(screen.getByRole('button', { name: '4 h' }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'PRACE', 240, true, 'Inventura'],
    ['2026-10-06', 'PRACE', 240, true, 'Školení'],
  ]);
});

test('víc dní s různými typy a kasou: nic z toho se nepřepíše, dokud to uživatel nezmění', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06', '2026-10-07'],
    dnyOsoby: [den('2026-10-05', 'PRACE', 480, true), den('2026-10-06', 'DOVOLENA', 480), den('2026-10-07', 'PRACE', 480)],
  });
  expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
  expect(screen.getByText(/Vybrané dny mají různé typy/)).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /Kasa \(různé\)/ })).not.toBeChecked();
  expect(hodiny()).toHaveValue('8'); // hodiny mají všechny stejné

  await userEvent.click(screen.getByRole('button', { name: '6 h' }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'PRACE', 360, true, null],
    ['2026-10-06', 'DOVOLENA', 360, false, null],
    ['2026-10-07', 'PRACE', 360, false, null],
  ]);
});

test('různé typy s prázdným dnem: bez volby typu nic neuloží a řekne proč', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05', '2026-10-06', '2026-10-07'], dnyOsoby: [den('2026-10-06', 'PRACE', 360, false, 'Školení')] });
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(onUloz).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Vyber typ dne: 2 vybrané dny jsou zatím prázdné.');

  await userEvent.click(screen.getByRole('radio', { name: /Práce/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  // Vyplněný den si nechá hodiny i poznámku, prázdné dostanou výchozí hodiny (poslední práce 6 h).
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'PRACE', 360, false, null],
    ['2026-10-06', 'PRACE', 360, false, 'Školení'],
    ['2026-10-07', 'PRACE', 360, false, null],
  ]);
});

test('nemoc u výběru s mezerami: varuje, že se zapíšou i dny mezi, a vypíše, co se přepíše', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-08'],
    dnyOsoby: [den('2026-10-05', 'PRACE', 480), den('2026-10-06', 'PRACE', 480, true), den('2026-10-07', 'DOVOLENA', 480)],
  });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(screen.getByLabelText('Nemoc od')).toHaveValue('2026-10-05');
  expect(screen.getByLabelText('Nemoc do')).toHaveValue('2026-10-08');
  expect(screen.getByText(/Vybrané dny nejdou za sebou\. Nemoc se zapíše na každý den od–do, i na dny mezi nimi/)).toBeInTheDocument();
  expect(screen.getByText(/Zapíše se 4 dny\./)).toBeInTheDocument();
  expect(screen.getByText(/^Přepíšou se 3 už vyplněné dny: 5\. 10\. Práce 8\sh, 6\. 10\. Práce 8\sh, 7\. 10\. Dovolená 8\sh\.$/)).toBeInTheDocument();

  // Zúžení rozsahu na první vybraný den: přepíše se jen ten.
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-05');
  expect(screen.getByText(/^Přepíše se 1 už vyplněný den: 5\. 10\. Práce 8\sh\.$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz)).toEqual([['2026-10-05', 'NEMOC', 480, false, null]]);
});

test('nemoc přes souvislý rozsah s vyplněnými dny vypíše, co se přepíše (víc než 5 zkráceně)', async () => {
  otevri({
    datumy: ['2026-10-05'],
    dnyOsoby: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13'].map((d) => den(d, 'PRACE', 480)),
  });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-13');
  expect(screen.queryByText(/nejdou za sebou/)).not.toBeInTheDocument();
  expect(screen.getByText(/^Přepíše se 7 už vyplněných dní: 5\. 10\. Práce 8\sh, .*, 9\. 10\. Práce 8\sh a 2 další\.$/)).toBeInTheDocument();
});

test('výběr víc svátků ukáže jejich názvy', () => {
  otevri({ datumy: ['2026-12-24', '2026-12-25', '2026-12-26'] });
  expect(screen.getByText('Svátky ve výběru')).toBeInTheDocument();
  expect(screen.getByText('Štědrý den')).toBeInTheDocument();
  expect(screen.getByText('1. svátek vánoční')).toBeInTheDocument();
  expect(screen.getByText('2. svátek vánoční')).toBeInTheDocument();
});

const poznamkaPole = () => screen.getByRole('textbox', { name: /Poznámka/ });

test('hromadná úprava nemoci 8 h + 4 h: změna jen poznámky nechá každému dni hodiny', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05', '2026-10-06'], dnyOsoby: [den('2026-10-05', 'NEMOC', 480), den('2026-10-06', 'NEMOC', 240)] });
  expect(screen.getByRole('radio', { name: /Nemoc/ })).toBeChecked();
  expect(hodiny()).toHaveValue('');
  expect(hodiny()).toHaveAttribute('placeholder', 'různé');
  await userEvent.type(poznamkaPole(), 'Neschopenka');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'NEMOC', 480, false, 'Neschopenka'],
    ['2026-10-06', 'NEMOC', 240, false, 'Neschopenka'],
  ]);
});

test('nemoc Pá 8 h + So 8 h: uložení beze změny nechá i sobotě 8 h', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-09', '2026-10-10'], dnyOsoby: [den('2026-10-09', 'NEMOC', 480), den('2026-10-10', 'NEMOC', 480)] });
  expect(screen.getByRole('textbox', { name: 'Hodiny v pracovní dny' })).toHaveValue('8');
  expect(screen.getByText(/^Žádný vyplněný den se nepřepíše\.$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-09', 'NEMOC', 480, false, null],
    ['2026-10-10', 'NEMOC', 480, false, null],
  ]);
});

test('tři dny nemoci 8/4/6 h: změna jen poznámky hodiny ponechá', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06', '2026-10-07'],
    dnyOsoby: [den('2026-10-05', 'NEMOC', 480), den('2026-10-06', 'NEMOC', 240), den('2026-10-07', 'NEMOC', 360)],
  });
  await userEvent.type(poznamkaPole(), 'Lékař');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz)).toEqual([
    ['2026-10-05', 'NEMOC', 480, false, 'Lékař'],
    ['2026-10-06', 'NEMOC', 240, false, 'Lékař'],
    ['2026-10-07', 'NEMOC', 360, false, 'Lékař'],
  ]);
});

test('nemoc s různými hodinami a prázdným víkendem: beze změny zůstanou, zadané hodiny platí jen na pracovní dny', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'],
    dnyOsoby: [den('2026-10-09', 'NEMOC', 480), den('2026-10-10', 'NEMOC', 300), den('2026-10-12', 'NEMOC', 240)],
  });
  // Prázdná neděle má jiný typ než ostatní, Nemoc se vybere ručně.
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(hodiny()).toHaveAttribute('placeholder', 'různé');
  expect(screen.getByText(/Když je nezměníš, každý den si nechá své hodiny\./)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  // So 5 h (ručně zadaná) zůstane, prázdná neděle 0 h.
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-09', 480], ['2026-10-10', 300], ['2026-10-11', 0], ['2026-10-12', 240]]);

  // Zadané hodiny přepíšou pracovní dny; víkendová nemoc s ručně zadanými hodinami zůstane.
  await userEvent.click(screen.getByRole('button', { name: '6 h' }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-09', 360], ['2026-10-10', 300], ['2026-10-11', 0], ['2026-10-12', 360]]);
});

test('nemoc přes konec měsíce: řekne, ať se zadá v dalším měsíci, nic neuloží a netvrdí, že se nic nepřepíše', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-29'] });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-11-02');
  expect(screen.getByText('Nemoc, která pokračuje do dalšího měsíce, zadej v dalším měsíci od 1. dne — počítání 14 dní na to naváže.')).toBeInTheDocument();
  expect(screen.queryByText(/nepřepíše/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Zapíše se/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(onUloz).not.toHaveBeenCalled();

  // Do konce měsíce to jde.
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-31');
  expect(screen.queryByText(/pokračuje do dalšího měsíce/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => d[0])).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
});

test('nemoc jde zadat nejdřív od 1. dne předchozího měsíce', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05'], rezim: 'nemoc' });
  await userEvent.clear(screen.getByLabelText('Nemoc od'));
  await userEvent.type(screen.getByLabelText('Nemoc od'), '2026-08-31');
  expect(screen.getByText(/Nemoc jde tady zadat nejdřív od 1\. 9\./)).toBeInTheDocument();
  expect(screen.queryByText(/nepřepíše/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(onUloz).not.toHaveBeenCalled();
});

test('jediný prázdný den: vymazané hodiny neuloží výchozí, ale řeknou, ať se vyplní', async () => {
  const { onUloz } = otevri();
  await userEvent.clear(hodiny());
  expect(screen.queryByText(/různé hodiny/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(onUloz).not.toHaveBeenCalled();
  expect(screen.getByText('Zadej hodiny od 0,25 do 24, např. 8 nebo 7,5.')).toBeInTheDocument();
});

test('jeden vyplněný a jeden prázdný den: hodiny nejsou „různé" a vymazání neuloží', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05', '2026-10-06'], dnyOsoby: [den('2026-10-05', 'PRACE', 360)] });
  await userEvent.click(screen.getByRole('radio', { name: /Práce/ }));
  expect(hodiny()).toHaveValue('6');
  expect(hodiny()).not.toHaveAttribute('placeholder');
  await userEvent.clear(hodiny());
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(onUloz).not.toHaveBeenCalled();
  expect(screen.getByText('Zadej hodiny od 0,25 do 24, např. 8 nebo 7,5.')).toBeInTheDocument();
});

test('různé hodiny a prázdný den: nápověda řekne, kolik hodin dostane prázdný den', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05', '2026-10-06', '2026-10-07'], dnyOsoby: [den('2026-10-05', 'PRACE', 480), den('2026-10-06', 'PRACE', 360)] });
  await userEvent.click(screen.getByRole('radio', { name: /Práce/ }));
  expect(screen.getByText(/^Vybrané dny mají různé hodiny\. Když je nezměníš, každý den si nechá své\. Prázdný den dostane 6\sh\.$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-05', 480], ['2026-10-06', 360], ['2026-10-07', 360]]);
});

test('různé poznámky: vymazaná napsaná poznámka je zase „různé"; smazat jde jen výslovně', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06'],
    dnyOsoby: [den('2026-10-05', 'PRACE', 480, false, 'Inventura'), den('2026-10-06', 'PRACE', 480, false, 'Školení')],
  });
  await userEvent.type(poznamkaPole(), 'x');
  await userEvent.clear(poznamkaPole());
  expect(poznamkaPole()).toHaveAttribute('placeholder', 'různé');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz).map((d) => d[4])).toEqual(['Inventura', 'Školení']);

  await userEvent.click(screen.getByRole('button', { name: 'Smazat poznámky' }));
  expect(screen.getByText(/Poznámky vybraných dní se smažou\./)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz).map((d) => d[4])).toEqual([null, null]);
});

test('nemoc od–do: poznámka jednoho dne se neukazuje jako poznámka rozsahu, napsaná platí pro celý rozsah', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05'], dnyOsoby: [den('2026-10-05', 'PRACE', 480, false, 'Inventura')] });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-07');
  expect(poznamkaPole()).toHaveValue('');
  expect(screen.getByText(/Napsaná poznámka se zapíše ke všem dnům od–do\./)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => d[4])).toEqual(['Inventura', null, null]);

  await userEvent.type(poznamkaPole(), 'Neschopenka');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => d[4])).toEqual(['Neschopenka', 'Neschopenka', 'Neschopenka']);
});

test('rozšíření z víkendové nemoci 0 h: pracovní dny dostanou obvyklou směnu, ne 0', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-10'], dnyOsoby: [den('2026-10-10', 'NEMOC', 0)] });
  expect(hodiny()).toHaveValue('0');
  await userEvent.clear(screen.getByLabelText('Nemoc do'));
  await userEvent.type(screen.getByLabelText('Nemoc do'), '2026-10-12');
  expect(screen.getByRole('textbox', { name: 'Hodiny v pracovní dny' })).toHaveValue('8');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-10', 0], ['2026-10-11', 0], ['2026-10-12', 480]]);
});

// Obvyklá směna 8 h (dvě práce po 8 h), aby se dalo poznat, že nemoc bere hodiny dne, ne obvyklou směnu.
const smeny8h = [den('2026-10-13', 'PRACE', 480), den('2026-10-14', 'PRACE', 480)];

test('jediný den Práce 6 h přepnutý na Nemoc nabídne 6 h (vlastní hodiny dne), ne obvyklou směnu', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-05'], dnyOsoby: [den('2026-10-05', 'PRACE', 360), ...smeny8h] });
  expect(hodiny()).toHaveValue('6');
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(hodiny()).toHaveValue('6');
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[1], d[2]])).toEqual([['2026-10-05', 'NEMOC', 360]]);
});

test('jediný den Dovolená 5 h přepnutý na Nemoc: 5 h; ručně zadané hodiny mají přednost', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-06'], dnyOsoby: [den('2026-10-06', 'DOVOLENA', 300), ...smeny8h] });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(hodiny()).toHaveValue('5');
  await userEvent.click(screen.getByRole('button', { name: '4 h' }));
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => d[2])).toEqual([240]);
});

test('nemoc přes víc dní: každý už zapsaný den si nechá své hodiny, prázdný pracovní den dostane obvyklou směnu', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06', '2026-10-07'],
    dnyOsoby: [den('2026-10-05', 'DOVOLENA', 360), den('2026-10-06', 'PRACE', 240), ...smeny8h],
  });
  await userEvent.click(screen.getByRole('radio', { name: /Nemoc/ }));
  expect(hodiny()).toHaveAttribute('placeholder', 'různé');
  expect(screen.getByText(/^Dny nemoci mají různé hodiny\. Když je nezměníš, každý den si nechá své hodiny, prázdné pracovní dny dostanou 8\sh\.$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[1], d[2]])).toEqual([['2026-10-05', 'NEMOC', 360], ['2026-10-06', 'NEMOC', 240], ['2026-10-07', 'NEMOC', 480]]);
});

test('nemoc Pá–Ne: už zapsaná sobota s hodinami si je nechá, prázdná neděle 0 h, prázdný pátek obvyklá směna', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-09', '2026-10-10', '2026-10-11'], rezim: 'nemoc',
    dnyOsoby: [den('2026-10-10', 'PRACE', 300), ...smeny8h],
  });
  expect(screen.getByText(/Víkendy a svátky se zapíšou s 0 h \(už zapsaný den si hodiny nechá\)/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-09', 480], ['2026-10-10', 300], ['2026-10-11', 0]]);
});

test('„Svátek – zavřeno" přepnutý na nemoc o svátku nenese hodiny, svátek zůstane 0 h', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-27', '2026-10-28'], rezim: 'nemoc', dnyOsoby: [den('2026-10-28', 'SVATEK_ZAVRENO', 480), ...smeny8h] });
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-27', 480], ['2026-10-28', 0]]);
});

test('nemoc, kde se mění jen poznámka: náhled neříká „Přepíšou se", ale „Změní se jen poznámka u N dní"', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06', '2026-10-07'],
    dnyOsoby: [den('2026-10-05', 'NEMOC', 480), den('2026-10-06', 'NEMOC', 480), den('2026-10-07', 'NEMOC', 480)],
  });
  expect(screen.getByText(/^Žádný vyplněný den se nepřepíše\.$/)).toBeInTheDocument();
  await userEvent.type(poznamkaPole(), 'Neschopenka');
  expect(screen.getByText(/^Změní se jen poznámka u 3 dní\.$/)).toBeInTheDocument();
  expect(screen.queryByText(/Přepíšou se|Přepíše se/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[2], d[4]])).toEqual([[480, 'Neschopenka'], [480, 'Neschopenka'], [480, 'Neschopenka']]);

  // Změna hodin vedle poznámky už je přepsání obsahu.
  await userEvent.click(screen.getByRole('button', { name: '6 h' }));
  expect(screen.getByText(/^Přepíšou se 3 už vyplněné dny: 5\. 10\. Nemoc 8\sh, 6\. 10\. Nemoc 8\sh, 7\. 10\. Nemoc 8\sh\.$/)).toBeInTheDocument();
  expect(screen.queryByText(/Změní se jen poznámka/)).not.toBeInTheDocument();
});

test('nemoc s jedním dnem se změnou hodin a druhým jen s poznámkou: náhled přidá, kolika dalším dnům se změní poznámka', async () => {
  otevri({ datumy: ['2026-10-05', '2026-10-06'], dnyOsoby: [den('2026-10-05', 'NEMOC', 480), den('2026-10-06', 'NEMOC', 360)] });
  await userEvent.click(screen.getByRole('button', { name: '6 h' }));
  await userEvent.type(poznamkaPole(), 'Lékař');
  expect(screen.getByText(/^Přepíše se 1 už vyplněný den: 5\. 10\. Nemoc 8\sh\. Poznámka se změní i u 1 dalšího dne\.$/)).toBeInTheDocument();
});

test('změna jen poznámky u jednoho dne: „u 1 dne"', async () => {
  otevri({ datumy: ['2026-10-05'], dnyOsoby: [den('2026-10-05', 'NEMOC', 480, false, 'Stará')], rezim: 'nemoc' });
  await userEvent.clear(poznamkaPole());
  await userEvent.type(poznamkaPole(), 'Nová');
  expect(screen.getByText(/^Změní se jen poznámka u 1 dne\.$/)).toBeInTheDocument();
});

test('„Smazat poznámky" se po dalším psaní zruší a nevrátí se, když pole zase vymažu', async () => {
  const { onUloz } = otevri({
    datumy: ['2026-10-05', '2026-10-06'],
    dnyOsoby: [den('2026-10-05', 'PRACE', 480, false, 'Inventura'), den('2026-10-06', 'PRACE', 480, false, 'Školení')],
  });
  await userEvent.click(screen.getByRole('button', { name: 'Smazat poznámky' }));
  expect(screen.getByRole('button', { name: 'Nechat poznámky' })).toBeInTheDocument();
  await userEvent.type(poznamkaPole(), 'x');
  await userEvent.clear(poznamkaPole());
  // Vymazané pole je zase „různé" a nabízí se zase „Smazat poznámky", ne „Nechat poznámky".
  expect(poznamkaPole()).toHaveAttribute('placeholder', 'různé');
  expect(screen.queryByRole('button', { name: 'Nechat poznámky' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Smazat poznámky' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(ulozeneDny(onUloz).map((d) => d[4])).toEqual(['Inventura', 'Školení']);
});

test('nemoc jen přes víkend s ručně zadanými hodinami: panel řekne, že víkend zůstane 0 h', async () => {
  const { onUloz } = otevri({ datumy: ['2026-10-10', '2026-10-11'], rezim: 'nemoc', dnyOsoby: smeny8h });
  // Bez zadání pole jen nabízí obvyklou směnu a běžná nápověda.
  expect(screen.queryByText(/jsou jen víkendy a svátky/)).not.toBeInTheDocument();
  await userEvent.clear(hodiny());
  await userEvent.type(hodiny(), '6');
  expect(screen.getByText(/^V tomhle rozsahu jsou jen víkendy a svátky, zadané hodiny se nepoužijí: zůstanou s 0 h\. Každý den jde pak upravit\.$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Uložit nemoc' }));
  expect(ulozeneDny(onUloz).map((d) => [d[0], d[2]])).toEqual([['2026-10-10', 0], ['2026-10-11', 0]]);
});

test('s pracovním dnem v rozsahu se upozornění na víkend neukáže', async () => {
  otevri({ datumy: ['2026-10-09', '2026-10-10', '2026-10-11'], rezim: 'nemoc', dnyOsoby: smeny8h });
  await userEvent.clear(hodiny());
  await userEvent.type(hodiny(), '6');
  expect(screen.queryByText(/jsou jen víkendy a svátky/)).not.toBeInTheDocument();
});
