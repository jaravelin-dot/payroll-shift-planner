import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PrepinacMesice } from './PrepinacMesice';

function Ovladany(vychozi: { rok: number; mesic: number }) {
  const [stav, nastav] = useState(vychozi);
  return <PrepinacMesice rok={stav.rok} mesic={stav.mesic} onZmena={(rok, mesic) => nastav({ rok, mesic })} />;
}

test('posune z října 2026 na listopad 2026', async () => {
  render(<Ovladany rok={2026} mesic={10} />);
  expect(screen.getByText('Říjen 2026')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Další měsíc' }));

  expect(screen.getByText('Listopad 2026')).toBeInTheDocument();
});

test('z ledna 2027 jde zpět na prosinec 2026', async () => {
  render(<Ovladany rok={2027} mesic={1} />);
  expect(screen.getByText('Leden 2027')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));

  expect(screen.getByText('Prosinec 2026')).toBeInTheDocument();
});

test('přes konec roku dopředu volá onZmena s novým rokem', async () => {
  const onZmena = vi.fn();
  render(<PrepinacMesice rok={2026} mesic={12} onZmena={onZmena} />);

  await userEvent.click(screen.getByRole('button', { name: 'Další měsíc' }));

  expect(onZmena).toHaveBeenCalledWith(2027, 1);
});
