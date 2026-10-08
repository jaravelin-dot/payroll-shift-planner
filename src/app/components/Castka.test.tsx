import { render, screen } from '@testing-library/react';
import { Castka } from './Castka';

test('vykreslí 3889500 haléřů jako „38 895 Kč" (nezlomitelná mezera v tisících, úzká před Kč)', () => {
  render(<Castka hal={3889500} />);
  const castka = screen.getByText('38 895 Kč');
  expect(castka.textContent).toBe('38 895 Kč');
  expect(castka).toHaveClass('tabular-nums', 'text-right');
});

test('haléře a záporné částky s typografickým minus', () => {
  render(<Castka hal={-284950} />);
  expect(screen.getByText('−2 849,50 Kč')).toBeInTheDocument();
});
