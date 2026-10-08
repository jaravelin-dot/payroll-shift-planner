import { fireEvent, render, screen, within } from '@testing-library/react';
import { formatKc } from '../../core/penize';
import type { MesicNakladu } from '../vystupy/naklady';
import { GrafNakladu } from './GrafNakladu';

// Tabulka a graf mají přes 200 prvků; pod zátěží (běží víc testů naráz) se výchozích 5 s nemusí stihnout.
vi.setConfig({ testTimeout: 20_000 });

const text = (hal: number) => formatKc(hal).replace(/\s/g, ' ');
const prazdny = (mesic: number): MesicNakladu =>
  ({ mesic, stav: 'NEUZAVRENO', pocetLidi: 0, hrubeHal: 0, odvodyHal: 0, stravneHal: 0, nemocHal: 0, celkemHal: 0 });
const MESICE: MesicNakladu[] = Array.from({ length: 12 }, (_, i) => prazdny(i + 1));
MESICE[8] = { mesic: 9, stav: 'UZAVRENO', pocetLidi: 4, hrubeHal: 15000000, odvodyHal: 5070000, stravneHal: 1100000, nemocHal: 0, celkemHal: 21170000 };
MESICE[9] = { mesic: 10, stav: 'ROZPRACOVANO', pocetLidi: 4, hrubeHal: 12000000, odvodyHal: 4056000, stravneHal: 900000, nemocHal: 300000, celkemHal: 17256000 };

test('tabulka pod grafem: 12 měsíců se stavem a částkami, součet roku', () => {
  render(<GrafNakladu rok={2026} mesice={MESICE} />);
  const tabulka = screen.getByRole('table', { name: /Náklady firmy po měsících 2026/ });
  const radky = within(tabulka).getAllByRole('row');
  expect(radky).toHaveLength(1 + 12 + 1);
  expect(within(tabulka).getAllByRole('columnheader').map((b) => b.textContent)).toEqual(
    ['Měsíc', 'Stav', 'Náklad celkem', 'Hrubé mzdy', 'Odvody firmy', 'Stravné', 'Náhrada za nemoc'],
  );
  const zari = within(tabulka).getByRole('rowheader', { name: 'Září' }).closest('tr')!;
  expect(zari).toHaveTextContent('Uzavřeno');
  expect(zari).toHaveTextContent(text(15000000));
  expect(zari).toHaveTextContent(text(21170000));
  const rijen = within(tabulka).getByRole('rowheader', { name: 'Říjen' }).closest('tr')!;
  expect(rijen).toHaveTextContent('Rozpracováno');
  expect(rijen).toHaveTextContent(text(300000));
  const leden = within(tabulka).getByRole('rowheader', { name: 'Leden' }).closest('tr')!;
  expect(leden).toHaveTextContent('Neuzavřeno');
  expect(leden).not.toHaveTextContent('Kč');
  const celkem = radky.at(-1)!;
  expect(celkem).toHaveTextContent(text(21170000 + 17256000));
  expect(celkem).toHaveTextContent('vč. rozpracovaného');
});

test('graf: legenda, sloupec s hodnotami v popisku, rozpracovaný a neuzavřené měsíce označené', () => {
  render(<GrafNakladu rok={2026} mesice={MESICE} />);
  const graf = screen.getByRole('figure', { name: /Náklady firmy 2026/ });
  const legenda = within(graf).getByRole('list', { name: 'Legenda' });
  expect(within(legenda).getAllByRole('listitem').map((l) => l.textContent)).toEqual(
    ['Hrubé mzdy', 'Odvody firmy', 'Stravné', 'Náhrada za nemoc', 'Rozpracovaný měsíc (světlejší)'],
  );
  const zari = within(graf).getByRole('img', { name: /^Září 2026/ });
  expect(zari.getAttribute('aria-label')!.replace(/\s/g, ' ')).toBe(
    `Září 2026, uzavřeno: náklad ${text(21170000)}; hrubé mzdy ${text(15000000)}, odvody firmy ${text(5070000)}, stravné ${text(1100000)}, náhrada za nemoc ${text(0)}`,
  );
  expect(within(graf).getByRole('img', { name: /^Říjen 2026, rozpracováno/ })).toBeInTheDocument();
  expect(within(graf).getAllByText('neuzavřeno')).toHaveLength(10);

  // Najetí nebo fokus ukáže rozpis měsíce.
  fireEvent.focus(zari);
  const tip = within(graf).getByRole('tooltip');
  expect(tip).toHaveTextContent('Září 2026');
  expect(tip).toHaveTextContent(text(5070000));
  fireEvent.blur(zari);
  expect(within(graf).queryByRole('tooltip')).not.toBeInTheDocument();
});

test('rok bez dat: místo prázdného grafu věta', () => {
  render(<GrafNakladu rok={2025} mesice={Array.from({ length: 12 }, (_, i) => prazdny(i + 1))} />);
  expect(screen.getByText('Za rok 2025 zatím není žádný uzavřený měsíc.')).toBeInTheDocument();
  expect(screen.queryByRole('figure')).not.toBeInTheDocument();
});
