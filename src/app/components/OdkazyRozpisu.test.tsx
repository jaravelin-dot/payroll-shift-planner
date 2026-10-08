import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OdkazRozpisu } from '../../shared/api';
import { json, mockApi, obal, testovaciKlient, zamestnanec } from '../test-utils';
import { OdkazyRozpisu } from './OdkazyRozpisu';

const LIDE = [
  zamestnanec({ id: 'daniel', jmeno: 'Daniel', prijmeni: 'Novák' }),
  zamestnanec({ id: 'magda', jmeno: 'Magda', prijmeni: 'Bílá' }),
  zamestnanec({ id: 'odesel', jmeno: 'Adam', prijmeni: 'Starý', ukonceni: '2026-09-30' }),
  zamestnanec({ id: 'neaktivni', jmeno: 'Božena', prijmeni: 'Dávná', aktivni: false }),
];
const odkaz = (zmeny: Partial<OdkazRozpisu>): OdkazRozpisu =>
  ({ id: 'o1', firmaId: 'f1', zamestnanecId: null, token: 'TOKENTABLET', nazev: 'Tablet v prodejně', vytvoreno: '2026-10-07T08:00:00.000Z', ...zmeny });
const ADRESA = 'https://rozpis.ukazka.example/r/';

type Volani = { metoda: string; cesta: string; telo: unknown };

function otevri(odkazy: OdkazRozpisu[] = []) {
  const volani: Volani[] = [];
  mockApi({
    'GET /api/firmy/f1/odkazy-rozpisu': () => json(odkazy),
    'GET /api/firmy/f1/zamestnanci': () => json(LIDE),
    'POST /api/odkazy-rozpisu': (init) => {
      volani.push({ metoda: 'POST', cesta: '/api/odkazy-rozpisu', telo: JSON.parse(String(init?.body)) });
      return json(odkaz({ id: 'novy', token: 'NOVYTOKEN' }), 201);
    },
    'DELETE /api/odkazy-rozpisu/o1': () => {
      volani.push({ metoda: 'DELETE', cesta: '/api/odkazy-rozpisu/o1', telo: undefined });
      return new Response(null, { status: 204 });
    },
  });
  const uzivatel = userEvent.setup({ delay: null });
  const zapis = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  const Obal = obal(testovaciKlient());
  render(
    <Obal>
      <OdkazyRozpisu firmaId="f1" dnes="2026-10-07" />
    </Obal>,
  );
  return { uzivatel, volani, zapis };
}

test('tablet: „Přidat odkaz pro tablet“ pošle odkaz bez člověka', async () => {
  const { uzivatel, volani } = otevri();

  await uzivatel.click(await screen.findByRole('button', { name: 'Přidat odkaz pro tablet' }));

  await vi.waitFor(() => expect(volani).toEqual([{ metoda: 'POST', cesta: '/api/odkazy-rozpisu', telo: { firmaId: 'f1', zamestnanecId: null } }]));
});

test('tablet: odkaz jde zkopírovat (s hláškou), otevřít v nové záložce a po potvrzení zrušit', async () => {
  const { uzivatel, volani, zapis } = otevri([odkaz({})]);

  await uzivatel.click(await screen.findByRole('button', { name: 'Kopírovat odkaz: Tablet v prodejně' }));
  expect(zapis).toHaveBeenCalledWith(`${ADRESA}TOKENTABLET`);
  expect(await screen.findByText('Zkopírováno')).toBeInTheDocument();

  const otevrit = screen.getByRole('link', { name: 'Otevřít: Tablet v prodejně' });
  expect(otevrit).toHaveAttribute('href', `${ADRESA}TOKENTABLET`);
  expect(otevrit).toHaveAttribute('target', '_blank');
  expect(otevrit.getAttribute('rel')).toContain('noopener');

  await uzivatel.click(screen.getByRole('button', { name: 'Zrušit odkaz: Tablet v prodejně' }));
  const potvrzeni = await screen.findByRole('dialog', { name: 'Zrušit odkaz?' });
  expect(volani).toEqual([]);
  await uzivatel.click(within(potvrzeni).getByRole('button', { name: 'Zrušit odkaz' }));

  await vi.waitFor(() => expect(volani).toEqual([{ metoda: 'DELETE', cesta: '/api/odkazy-rozpisu/o1', telo: undefined }]));
});

test('lidé: jen aktivní a ještě pracující, podle jména; člověk bez odkazu má „Vytvořit odkaz“', async () => {
  const { uzivatel, volani } = otevri();

  const daniel = await screen.findByRole('button', { name: 'Vytvořit odkaz: Daniel Novák' });
  const jmena = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(jmena).toEqual([expect.stringContaining('Daniel Novák'), expect.stringContaining('Magda Bílá')]);
  expect(screen.queryByText(/Adam/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Božena/)).not.toBeInTheDocument();

  await uzivatel.click(daniel);
  await vi.waitFor(() => expect(volani).toEqual([{ metoda: 'POST', cesta: '/api/odkazy-rozpisu', telo: { firmaId: 'f1', zamestnanecId: 'daniel' } }]));
});

test('lidé: bere se seznam všech lidí firmy, nezávisle na datech vybraného měsíce', async () => {
  // Nový člověk, který v žádném měsíci ještě není (nástup později), se musí dát vybrat; neaktivní ne.
  const lide = [zamestnanec({ id: 'nova', jmeno: 'Nová', prijmeni: 'Budoucí', nastup: '2027-01-01' }), zamestnanec({ id: 'off', jmeno: 'Off', prijmeni: 'Neaktivní', aktivni: false })];
  mockApi({
    'GET /api/firmy/f1/odkazy-rozpisu': () => json([]),
    'GET /api/firmy/f1/zamestnanci': () => json(lide),
  });
  const Obal = obal(testovaciKlient());
  render(
    <Obal>
      <OdkazyRozpisu firmaId="f1" dnes="2026-10-07" />
    </Obal>,
  );

  expect(await screen.findByRole('button', { name: 'Vytvořit odkaz: Nová Budoucí' })).toBeInTheDocument();
  expect(screen.queryByText(/Off/)).not.toBeInTheDocument();
});

test('osobní odkaz: kopírování a WhatsApp s přesně zakódovanou zprávou', async () => {
  const { uzivatel, zapis } = otevri([odkaz({ id: 'o2', zamestnanecId: 'daniel', token: 'TOKENDUSAN', nazev: 'Daniel Novák' })]);

  await uzivatel.click(await screen.findByRole('button', { name: 'Kopírovat odkaz: Daniel Novák' }));
  expect(zapis).toHaveBeenCalledWith(`${ADRESA}TOKENDUSAN`);

  const text = `Ahoj Daniel, tady je tvůj rozpis směn: ${ADRESA}TOKENDUSAN — ulož si ho na plochu telefonu.`;
  const wa = screen.getByRole('link', { name: 'Poslat do WhatsAppu: Daniel Novák' });
  expect(wa).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(text)}`);
  expect(wa).toHaveAttribute('target', '_blank');
  expect(wa.getAttribute('rel')).toContain('noopener');
  // Magda odkaz nemá, tak tam „Vytvořit odkaz" zůstává.
  expect(screen.getByRole('button', { name: 'Vytvořit odkaz: Magda Bílá' })).toBeInTheDocument();
});

test('osobní odkaz: „Zrušit“ se nejdřív zeptá a DELETE pošle až po potvrzení', async () => {
  const { uzivatel, volani } = otevri([odkaz({ id: 'o1', zamestnanecId: 'daniel', token: 'TOKENDUSAN', nazev: 'Daniel Novák' })]);

  await uzivatel.click(await screen.findByRole('button', { name: 'Zrušit odkaz: Daniel Novák' }));
  const potvrzeni = await screen.findByRole('dialog', { name: 'Zrušit odkaz?' });
  expect(within(potvrzeni).getByText(/Odkaz Daniel Novák hned přestane platit/)).toBeInTheDocument();
  expect(volani).toEqual([]);
  await uzivatel.click(within(potvrzeni).getByRole('button', { name: 'Zrušit odkaz' }));

  await vi.waitFor(() => expect(volani).toEqual([{ metoda: 'DELETE', cesta: '/api/odkazy-rozpisu/o1', telo: undefined }]));
});

test('„Nový odkaz“ se nejdřív zeptá a pak vytvoří nový odkaz téhož člověka', async () => {
  const { uzivatel, volani } = otevri([odkaz({ id: 'o2', zamestnanecId: 'daniel', token: 'TOKENDUSAN', nazev: 'Daniel Novák' })]);

  await uzivatel.click(await screen.findByRole('button', { name: 'Nový odkaz: Daniel Novák' }));
  const potvrzeni = await screen.findByRole('dialog', { name: 'Vytvořit nový odkaz?' });
  expect(volani).toEqual([]);
  await uzivatel.click(within(potvrzeni).getByRole('button', { name: 'Vytvořit nový odkaz' }));

  await vi.waitFor(() => expect(volani).toEqual([{ metoda: 'POST', cesta: '/api/odkazy-rozpisu', telo: { firmaId: 'f1', zamestnanecId: 'daniel' } }]));
});

test('selhání schránky nevyhodí chybu, jen řekne, že kopírování nevyšlo', async () => {
  const { uzivatel, zapis } = otevri([odkaz({})]);
  zapis.mockRejectedValue(new Error('zakázáno'));

  await uzivatel.click(await screen.findByRole('button', { name: 'Kopírovat odkaz: Tablet v prodejně' }));

  expect(await screen.findByText('Odkaz se nepodařilo zkopírovat.')).toBeInTheDocument();
});
