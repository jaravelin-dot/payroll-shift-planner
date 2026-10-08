import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { den, dnyPrace, vstup, vstupVypoctu } from '../../core/test-utils';
import { vypocitejMzdu } from '../../core/vypocet';
import { Uctenka } from './Uctenka';

const PRAC10 = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'];
const scenarA = [
  ...dnyPrace(PRAC10, 8, true),
  ...dnyPrace(['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'], 8),
  den('2026-10-03', 'PRACE', 6), den('2026-10-10', 'PRACE', 6), den('2026-10-11', 'PRACE', 5),
  den('2026-10-28', 'PRACE', 8), den('2026-10-30', 'DOVOLENA', 8),
];
const vysledekA = vypocitejMzdu(vstupVypoctu({ dny: scenarA, prumernyVydelekHal: 19000, vstup: vstup({ odmenaZaDenHal: 12000, aktivitaHal: 6000 }) }));

const radek = (nazev: string) => screen.getByRole('button', { name: new RegExp(`^${nazev}`) });

test('scénář A: K výplatě 31 422 Kč, pod tím náklad firmy', () => {
  render(<Uctenka vysledek={vysledekA} />);
  const kVyplate = screen.getByTestId('k-vyplate');
  expect(kVyplate).toHaveTextContent('K výplatě');
  expect(kVyplate).toHaveTextContent('31 422 Kč');
  // „Kč" odsazené úzkou nezlomitelnou mezerou (U+202F), tisíce nezlomitelnou mezerou.
  expect(within(kVyplate).getByText(/Kč$/).textContent).toBe('31\u00a0422\u202fKč');
  expect(radek('Náklad firmy')).toHaveTextContent('50 269 Kč');
  expect(radek('Hrubá mzda')).toHaveTextContent('35 440 Kč');
  expect(radek('Sociální pojištění')).toHaveTextContent('−2 517 Kč');
  expect(radek('Slevy na dani')).toHaveTextContent('+2 570 Kč');
});

test('klik na řádek ukáže, jak částka vznikla, a druhý klik ji schová', async () => {
  render(<Uctenka vysledek={vysledekA} />);
  const zaklad = radek('Základní mzda');
  expect(zaklad).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(zaklad);
  expect(zaklad).toHaveAttribute('aria-expanded', 'true');
  const vzorec = document.getElementById(zaklad.getAttribute('aria-controls')!)!;
  expect(vzorec).toHaveTextContent('169 h × 160 Kč');
  await userEvent.click(zaklad);
  expect(zaklad).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('169 h × 160 Kč')).not.toBeInTheDocument();
});

test('stravné ukazuje počet nároků × částku', async () => {
  render(<Uctenka vysledek={vysledekA} />);
  await userEvent.click(radek('Stravenkový paušál'));
  expect(within(screen.getByRole('list', { name: 'Rozpis výplaty' })).getByText('22 nároků na stravenkový paušál × 129,50 Kč')).toBeInTheDocument();
});

test('záporná výplata se ukáže barvou chyby, ne zeleně', () => {
  render(<Uctenka vysledek={{ ...vysledekA, kVyplateHal: -12300 }} />);
  const castka = within(screen.getByTestId('k-vyplate')).getByText(/123 Kč/);
  expect(castka).toHaveClass('text-chyba');
  expect(castka).not.toHaveClass('text-penize');
});
