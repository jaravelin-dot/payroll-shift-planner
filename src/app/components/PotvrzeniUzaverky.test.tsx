import { render, screen, within } from '@testing-library/react';
import type { KodVarovani } from '../../core/typy';
import { obal, testovaciKlient } from '../test-utils';
import { PotvrzeniUzaverky, type SouhrnUzaverky } from './PotvrzeniUzaverky';

const v = (...kody: KodVarovani[]) => kody.map((kod) => ({ kod, text: kod }));

function otevri(lide: SouhrnUzaverky['lide']) {
  const Obal = obal(testovaciKlient());
  render(
    <Obal>
      <PotvrzeniUzaverky
        akce="uzavrit" firmaId="f1" rok={2026} mesic={10}
        souhrn={{ kVyplateHal: 100000, pocetLidi: lide.length, lide }}
        odkazNaCloveka={(id) => `/clovek/${id}`} onZavrit={() => {}} onHotovo={() => {}}
      />
    </Obal>,
  );
  return screen.getByRole('dialog', { name: 'Uzavřít říjen 2026?' });
}

test('přehled před uzavřením ukáže jen lidi s upozorněními, která mají smysl řešit (a odhadnutý průměr)', () => {
  const panel = otevri([
    { zamestnanecId: 'b', jmeno: 'Eva Bílá', varovani: v('PREDBEZNY_PARAMETR', 'SLEVA_POJISTNE_NESPLNENA', 'PRIPLATEK_POD_MINIMEM') },
    { zamestnanecId: 'c', jmeno: 'Petr Černý', varovani: v('PREDBEZNY_PARAMETR', 'PV_ODHADNUT') },
    { zamestnanecId: 'h', jmeno: 'Ivan Chalupa', varovani: v('ODMENA_PROPADLA_NEMOC') },
  ]);
  expect(within(panel).queryByRole('link', { name: 'Eva Bílá' })).not.toBeInTheDocument();
  const cerny = within(panel).getByRole('link', { name: 'Petr Černý' }).closest('li')!;
  expect(cerny).toHaveTextContent('Průměr odhadnutý');
  expect(cerny).not.toHaveTextContent('Předběžné hodnoty roku');
  expect(within(panel).getByRole('link', { name: 'Ivan Chalupa' })).toBeInTheDocument();
});

test('samé informační poznámky: „Žádná upozornění."', () => {
  const panel = otevri([{ zamestnanecId: 'b', jmeno: 'Eva Bílá', varovani: v('PREDBEZNY_PARAMETR') }]);
  expect(within(panel).getByText('Žádná upozornění.')).toBeInTheDocument();
  expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
});
