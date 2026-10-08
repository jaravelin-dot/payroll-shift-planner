import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SpodniPanel } from './SpodniPanel';

function SPanelem() {
  const [otevreno, nastav] = useState(false);
  return (
    <>
      <button type="button" onClick={() => nastav(true)}>Otevřít den</button>
      <SpodniPanel otevreno={otevreno} onZavrit={() => nastav(false)} nadpis="Čtvrtek 1. října">
        <button type="button">Práce</button>
        <button type="button">Dovolená</button>
      </SpodniPanel>
    </>
  );
}

async function otevri() {
  const uzivatel = userEvent.setup();
  render(<SPanelem />);
  await uzivatel.click(screen.getByRole('button', { name: 'Otevřít den' }));
  return uzivatel;
}

test('otevřený panel je modální dialog s nadpisem a fokusem uvnitř', async () => {
  await otevri();

  const dialog = screen.getByRole('dialog', { name: 'Čtvrtek 1. října' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
});

test('Esc panel zavře a fokus se vrátí na tlačítko, které ho otevřelo', async () => {
  const uzivatel = await otevri();

  await uzivatel.keyboard('{Escape}');

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Otevřít den' })).toHaveFocus();
});

test('klepnutí mimo panel ho zavře', async () => {
  const uzivatel = await otevri();

  await uzivatel.click(screen.getByTestId('pozadi-panelu'));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Tab neuteče z panelu (focus trap) v obou směrech', async () => {
  const uzivatel = await otevri();
  const zavrit = screen.getByRole('button', { name: 'Zavřít' });
  const dovolena = screen.getByRole('button', { name: 'Dovolená' });

  dovolena.focus();
  await uzivatel.tab();
  expect(zavrit).toHaveFocus();

  await uzivatel.tab({ shift: true });
  expect(dovolena).toHaveFocus();
});
