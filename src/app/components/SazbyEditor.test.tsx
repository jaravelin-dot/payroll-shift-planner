import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SazbyEditor, type RadekSazby } from './SazbyEditor';

function Ovladany({ vychozi }: { vychozi: RadekSazby[] }) {
  const [sazby, nastav] = useState(vychozi);
  return <SazbyEditor sazby={sazby} onZmena={nastav} dnes="2026-10-06" />;
}

test('poslední sazbu nejde odebrat; přidaná jde a pak zase zbyde jedna, kterou odebrat nejde', async () => {
  const uzivatel = userEvent.setup();
  render(<Ovladany vychozi={[{ klic: 'a', platiOd: '2025-01-01', kc: '165' }]} />);

  expect(screen.getByRole('button', { name: /Odebrat sazbu/ })).toHaveAttribute('aria-disabled', 'true');

  await uzivatel.click(screen.getByRole('button', { name: 'Přidat sazbu' }));
  const odebrat = screen.getAllByRole('button', { name: /Odebrat sazbu/ });
  expect(odebrat).toHaveLength(2);
  for (const tlacitko of odebrat) expect(tlacitko).not.toHaveAttribute('aria-disabled');
  // Nová sazba platí od prvního dne dalšího měsíce a fokus je rovnou v částce.
  expect(screen.getAllByLabelText(/Platí od/)[1]).toHaveValue('2026-11-01');
  expect(screen.getAllByLabelText(/Hodinová sazba/)[1]).toHaveFocus();

  await uzivatel.click(odebrat[0]);

  expect(screen.getAllByLabelText(/Hodinová sazba/)).toHaveLength(1);
  expect(screen.getByLabelText(/Platí od/)).toHaveValue('2026-11-01');
  expect(screen.getByRole('button', { name: /Odebrat sazbu/ })).toHaveAttribute('aria-disabled', 'true');
});

test('tlačítko u poslední sazby zůstane v pořadí tabulátoru, vysvětlí se a nic neodebere', async () => {
  const uzivatel = userEvent.setup();
  render(<Ovladany vychozi={[{ klic: 'a', platiOd: '2025-01-01', kc: '165' }]} />);

  const odebrat = screen.getByRole('button', { name: /Odebrat sazbu/ });
  expect(odebrat).not.toBeDisabled();
  expect(odebrat).toHaveAccessibleDescription('Aspoň jedna sazba musí zůstat.');

  // Z pole sazby jedním Tabem na tlačítko: přeskočit ho by znamenalo, že čtečka vysvětlení nikdy neřekne.
  await uzivatel.click(screen.getByLabelText(/Hodinová sazba/));
  await uzivatel.tab();
  expect(odebrat).toHaveFocus();

  await uzivatel.keyboard('{Enter}');
  await uzivatel.click(odebrat);
  expect(screen.getAllByLabelText(/Hodinová sazba/)).toHaveLength(1);
  expect(odebrat).toBeInTheDocument();
});

test('každý řádek je skupina „Sazba N" s vlastním datem a částkou', async () => {
  const uzivatel = userEvent.setup();
  render(
    <Ovladany
      vychozi={[
        { klic: 'a', platiOd: '2025-01-01', kc: '150' },
        { klic: 'b', platiOd: '2026-10-01', kc: '165' },
      ]}
    />,
  );

  const druha = within(screen.getByRole('group', { name: 'Sazba 2' }));
  expect(druha.getByLabelText(/Platí od/)).toHaveValue('2026-10-01');
  expect(druha.getByLabelText(/Hodinová sazba/)).toHaveValue('165');
  expect(within(screen.getByRole('group', { name: 'Sazba 1' })).getByLabelText(/Hodinová sazba/)).toHaveValue('150');

  await uzivatel.click(screen.getByRole('button', { name: 'Přidat sazbu' }));
  expect(screen.getByRole('group', { name: 'Sazba 3' })).toBeInTheDocument();
});

test('jednotka Kč/h je v popisu pole, ne jen vedle něj', () => {
  render(<Ovladany vychozi={[{ klic: 'a', platiOd: '2025-01-01', kc: '165' }]} />);

  expect(screen.getByLabelText(/Hodinová sazba/)).toHaveAccessibleDescription('Kč/h');
});

test('chyba celé historie označí „Platí od" jen u uvedeného řádku a odkáže na hlášku', () => {
  const zprava = 'Dvě sazby nemůžou platit od stejného dne.';
  render(
    <SazbyEditor
      sazby={[
        { klic: 'a', platiOd: '2026-10-06', kc: '150' },
        { klic: 'b', platiOd: '2026-10-06', kc: '165' },
      ]}
      onZmena={() => {}}
      dnes="2026-10-06"
      chyba={zprava}
      chybaRadek="a"
    />,
  );

  const [prvni, druhe] = screen.getAllByLabelText(/Platí od/);
  expect(prvni).toHaveAttribute('aria-invalid', 'true');
  expect(prvni).toHaveAccessibleDescription(expect.stringContaining(zprava));
  expect(druhe).not.toHaveAttribute('aria-invalid');
  expect(druhe).not.toHaveAccessibleDescription(expect.stringContaining(zprava));
  // Sazba platná dnes si nápovědu „Platí dnes" ponechá vedle hlášky.
  expect(prvni).toHaveAccessibleDescription(expect.stringContaining('Platí dnes'));
});

test('bez chyby celé historie se žádné pole neoznačí', () => {
  render(
    <SazbyEditor sazby={[{ klic: 'a', platiOd: '2026-10-06', kc: '150' }]} onZmena={() => {}} dnes="2026-10-06" chybaRadek="a" />,
  );

  expect(screen.getByLabelText(/Platí od/)).not.toHaveAttribute('aria-invalid');
});

test('sazbu platnou dnes označí', () => {
  render(
    <Ovladany
      vychozi={[
        { klic: 'a', platiOd: '2025-01-01', kc: '150' },
        { klic: 'b', platiOd: '2026-10-01', kc: '165' },
        { klic: 'c', platiOd: '2026-11-01', kc: '170' },
      ]}
    />,
  );

  const dnes = screen.getAllByText('Platí dnes');
  expect(dnes).toHaveLength(1);
  expect(screen.getAllByLabelText(/Platí od/)[1]).toHaveAccessibleDescription('Platí dnes');
});
