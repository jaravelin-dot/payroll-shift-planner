import { configure, render, screen, within } from '@testing-library/react';
import { formatKc } from '../../core/penize';
import type { RadekVyplaty } from '../radkyVyplat';
import { zamestnanec } from '../test-utils';
import { vysledekA } from '../vystupy/test-scenar';
import { Platby } from './Platby';

// První dynamický import knihovny qrcode v testu trvá i několik sekund.
configure({ asyncUtilTimeout: 10_000 });
vi.setConfig({ testTimeout: 20_000 });

const text = (hal: number) => formatKc(hal).replace(/\s/g, ' ');
const radek = (zamestnanecId: string, jmeno: string, prijmeni: string, kVyplateHal: number): RadekVyplaty =>
  ({ zamestnanecId, jmeno, prijmeni, smlouva: 'HPP', vysledek: { ...vysledekA(), kVyplateHal } });

const RADKY = [
  radek('n', 'Jana', 'Nováková', 3396600),
  radek('c', 'Petr', 'Černý', 1200000),
  radek('d', 'Ivo', 'Dvořák', 0),
  radek('m', 'Eva', 'Malá', -50000),
];
const LIDE = [
  zamestnanec({ id: 'n', ucet: '19-24619/0800' }),
  zamestnanec({ id: 'c', ucet: null }),
  zamestnanec({ id: 'd', ucet: '19-24619/0800' }),
  zamestnanec({ id: 'm', ucet: '19-24619/0800' }),
];

test('QR platba u platného účtu, hotovost zvlášť, nula a záporná částka bez QR', async () => {
  render(<Platby radky={RADKY} zamestnanci={LIDE} rok={2026} mesic={10} />);

  const qr = await screen.findByRole('img', { name: /QR platba pro Jana Nováková/ });
  expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(screen.getAllByRole('img', { name: /QR platba/ })).toHaveLength(1);

  const seznam = screen.getByRole('list', { name: 'Platby lidí' });
  const polozka = (jmeno: string) => within(seznam).getByText(jmeno).closest('li')!;
  expect(polozka('Jana Nováková')).toHaveTextContent('19-24619/0800');
  expect(polozka('Jana Nováková')).toHaveTextContent('Zpráva: Mzda 10/2026 Nováková · VS 102026');
  expect(polozka('Petr Černý')).toHaveTextContent('Hotově');
  expect(polozka('Petr Černý')).toHaveTextContent(text(1200000));
  expect(polozka('Ivo Dvořák')).toHaveTextContent('Nic k výplatě');
  expect(polozka('Eva Malá')).toHaveTextContent('Výplata vychází záporná — zkontroluj');

  const souhrn = screen.getByRole('region', { name: 'Součty plateb' });
  expect(within(souhrn).getByText('Na účty').parentElement).toHaveTextContent(text(3396600));
  expect(within(souhrn).getByText('Na účty').parentElement).toHaveTextContent('1 člověk');
  expect(within(souhrn).getByText('Hotově').parentElement).toHaveTextContent(text(1200000));
});

test('neplatné číslo účtu: hotově a rada, kde ho opravit', () => {
  render(<Platby radky={[radek('b', 'Eva', 'Bílá', 500000)]} zamestnanci={[zamestnanec({ id: 'b', ucet: '124/0800' })]} rok={2026} mesic={10} />);
  const li = screen.getByText('Eva Bílá').closest('li')!;
  expect(li).toHaveTextContent('Hotově');
  expect(li).toHaveTextContent('Číslo účtu 124/0800 nesedí, oprav ho v Lidé.');
});

test('člověk jen ve snímku uzávěrky (už není mezi lidmi firmy): „Účet neznámý“ místo „Hotově“ a mimo součet hotovosti', () => {
  render(<Platby radky={[radek('c', 'Petr', 'Černý', 1200000), radek('o', 'Ota', 'Odešlý', 700000)]} zamestnanci={[zamestnanec({ id: 'c', ucet: null })]} rok={2026} mesic={10} />);
  const seznam = screen.getByRole('list', { name: 'Platby lidí' });
  const odesly = within(seznam).getByText('Ota Odešlý').closest('li')!;
  expect(odesly).toHaveTextContent('Účet neznámý');
  expect(odesly).not.toHaveTextContent('Hotově');
  expect(odesly).toHaveTextContent(text(700000));
  expect(within(seznam).getByText('Petr Černý').closest('li')).toHaveTextContent('Hotově');
  expect(odesly).toHaveTextContent('Zjisti, jak výplatu poslat.');
  const souhrn = within(screen.getByRole('region', { name: 'Součty plateb' }));
  const hotove = souhrn.getByText('Hotově').parentElement!;
  expect(hotove).toHaveTextContent(text(1200000));
  expect(hotove).toHaveTextContent('1 člověk');
  // Neznámý účet má vlastní součet, ať Na účty + Hotově + Neznámý účet dají všechny kladné platby.
  const neznamy = souhrn.getByText('Neznámý účet').parentElement!;
  expect(neznamy).toHaveTextContent(text(700000));
  expect(neznamy).toHaveTextContent('1 člověk');
});

test('bez člověka s neznámým účtem se součet „Neznámý účet" neukazuje', () => {
  render(<Platby radky={[radek('c', 'Petr', 'Černý', 1200000)]} zamestnanci={[zamestnanec({ id: 'c', ucet: null })]} rok={2026} mesic={10} />);
  expect(within(screen.getByRole('region', { name: 'Součty plateb' })).queryByText('Neznámý účet')).not.toBeInTheDocument();
});

test('QR knihovnu se nepodařilo načíst: místo věčného zástupného obrázku krátká chyba', async () => {
  vi.doMock('qrcode', () => { throw new Error('Chunk se nenačetl'); });
  try {
    render(<Platby radky={[radek('n', 'Jana', 'Nováková', 3396600)]} zamestnanci={[zamestnanec({ id: 'n', ucet: '19-24619/0800' })]} rok={2026} mesic={10} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('QR kódy se nepodařilo vytvořit');
    const polozka = screen.getByText('Jana Nováková').closest('li')!;
    expect(polozka).toHaveTextContent('QR kód se nepodařilo vytvořit');
    expect(within(polozka).queryByRole('img')).not.toBeInTheDocument();
    // Číslo účtu a částka zůstávají, platbu jde zadat ručně.
    expect(polozka).toHaveTextContent('19-24619/0800');
    expect(polozka).toHaveTextContent(text(3396600));
  } finally {
    vi.doUnmock('qrcode');
  }
});
