import { render, screen } from '@testing-library/react';
import type { Upozorneni } from '../../core/planovac';
import { KontrolaObsazeni, textUpozorneni } from './KontrolaObsazeni';

const obsazeni = (od: string, k: string, pocet: number, cil: number): Upozorneni =>
  ({ druh: 'OBSAZENI', datum: '2026-10-19', od, do: k, jmena: [], pocet, cil });

test('ranní obsazení: nad cílem „stačí", pod cílem „má být", tvar slova podle počtu', () => {
  expect(textUpozorneni(obsazeni('08:00', '09:00', 3, 2))).toBe('Po 19. 10. 08:00–09:00: 3 lidé, stačí 2');
  expect(textUpozorneni(obsazeni('08:00', '09:00', 2, 3))).toBe('Po 19. 10. 08:00–09:00: 2 lidé, má být 3');
  expect(textUpozorneni(obsazeni('08:00', '09:00', 1, 2))).toBe('Po 19. 10. 08:00–09:00: 1 člověk, má být 2');
  expect(textUpozorneni(obsazeni('08:00', '09:00', 0, 2))).toBe('Po 19. 10. 08:00–09:00: 0 lidí, má být 2');
  expect(textUpozorneni(obsazeni('08:00', '09:00', 5, 2))).toBe('Po 19. 10. 08:00–09:00: 5 lidí, stačí 2');
  expect(textUpozorneni(obsazeni('08:00', '09:00', 4, 3))).toBe('Po 19. 10. 08:00–09:00: 4 lidé, stačí 3');
});

test('okno „aspoň": hlásí jen nedostatek, věta „má být aspoň"', () => {
  expect(textUpozorneni({ ...obsazeni('12:30', '13:00', 2, 3), aspon: true })).toBe('Po 19. 10. 12:30–13:00: 2 lidé, má být aspoň 3');
  expect(textUpozorneni({ ...obsazeni('13:00', '18:00', 1, 3), aspon: true })).toBe('Po 19. 10. 13:00–18:00: 1 člověk, má být aspoň 3');
});

test('ranní obsazení je v panelu oranžově', () => {
  render(<KontrolaObsazeni upozorneni={[obsazeni('08:00', '09:00', 3, 2)]} />);
  const polozka = screen.getByText('Po 19. 10. 08:00–09:00: 3 lidé, stačí 2');
  expect(polozka.querySelector('svg')).toHaveClass('text-varovani');
});
