import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Den } from '../../shared/api';
import { DochazkovaKarta } from './DochazkovaKarta';

const den = (datum: string, typ: Den['typ'], minuty = 480, kasa = false): Den => ({ zamestnanecId: 'z1', datum, typ, minuty, kasa, poznamka: null });

function Karta({ dny = [] as Den[], jenCteni = false, onOtevri = vi.fn(), pocatecniVyber = [] as string[], nastup = '2025-01-01', ukonceni = null as string | null }) {
  const [vybrane, nastavVybrane] = useState(pocatecniVyber);
  return (
    <DochazkovaKarta
      rok={2026} mesic={10} dny={dny} zamestnanec={{ nastup, ukonceni }} dnes="2026-10-06"
      jenCteni={jenCteni} vybrane={vybrane} onVyber={nastavVybrane} onOtevri={onOtevri}
    />
  );
}

const mrizka = () => screen.getByRole('group', { name: 'Docházka, říjen 2026' });
const policko = (nazev: RegExp) => within(mrizka()).getByRole('button', { name: nazev });

test('říjen 2026 začíná prázdnými políčky Po–St a 1. 10. je ve čtvrtek', () => {
  render(<Karta />);
  expect(screen.getAllByText(/^(Po|Út|St|Čt|Pá|So|Ne)$/).map((x) => x.textContent)).toEqual(['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']);
  const bunky = [...mrizka().children];
  expect(bunky.slice(0, 3).every((b) => b.hasAttribute('data-prazdne'))).toBe(true);
  expect(bunky[3]).not.toHaveAttribute('data-prazdne');
  expect(bunky[3]).toHaveRole('button');
  expect(bunky[3]).toHaveAccessibleName(/^Čtvrtek 1\. října/);
  expect(within(mrizka()).getAllByRole('button')).toHaveLength(31);
});

test('políčko ukáže písmeno typu a hodiny, kasu, svátek i bez záznamu a dnešek', () => {
  render(<Karta dny={[den('2026-10-05', 'PRACE', 480, true), den('2026-10-07', 'DOVOLENA', 450), den('2026-10-08', 'NEMOC', 0)]} />);
  const prace = policko(/^Pondělí 5\. října/);
  expect(prace).toHaveAccessibleName('Pondělí 5. října: práce 8 h, kasa');
  expect(prace).toHaveTextContent(/P/);
  expect(prace).toHaveTextContent('8 h');
  expect(policko(/^Středa 7\. října/)).toHaveTextContent('7,5 h');
  expect(policko(/^Čtvrtek 8\. října/)).toHaveAccessibleName('Čtvrtek 8. října: nemoc 0 h');
  const svatek = policko(/^Středa 28\. října/);
  expect(svatek).toHaveAccessibleName('Středa 28. října, svátek Den vzniku samostatného československého státu: nevyplněno');
  expect(svatek).toHaveAttribute('title', 'Den vzniku samostatného československého státu');
  expect(policko(/^Úterý 6\. října/)).toHaveAttribute('aria-current', 'date');
});

test('klik i Enter otevřou panel dne; šipky posouvají fokus po dnech a týdnech', async () => {
  const onOtevri = vi.fn();
  render(<Karta onOtevri={onOtevri} />);
  await userEvent.click(policko(/^Pondělí 5\. října/));
  expect(onOtevri).toHaveBeenLastCalledWith(['2026-10-05']);

  await userEvent.keyboard('{ArrowRight}');
  expect(policko(/^Úterý 6\. října/)).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');
  expect(policko(/^Úterý 13\. října/)).toHaveFocus();
  await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
  expect(policko(/^Čtvrtek 1\. října/)).not.toHaveFocus(); // 13 → 6 → první týden nemá úterý, fokus zůstane na 6.
  expect(policko(/^Úterý 6\. října/)).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(onOtevri).toHaveBeenLastCalledWith(['2026-10-06']);
  // Do karty vede jediná zastávka tabulátoru.
  expect(within(mrizka()).getAllByRole('button').filter((b) => b.tabIndex === 0)).toHaveLength(1);
});

test('Shift+klik označí rozsah dní, ve výběru klik přidává a ubírá; lišta otevře panel pro vybrané', async () => {
  const onOtevri = vi.fn();
  render(<Karta onOtevri={onOtevri} />);
  const uzivatel = userEvent.setup();
  await uzivatel.keyboard('{Shift>}');
  await uzivatel.click(policko(/^Pondělí 5\. října/));
  await uzivatel.click(policko(/^Čtvrtek 8\. října/));
  await uzivatel.keyboard('{/Shift}');
  expect(onOtevri).not.toHaveBeenCalled();
  expect(screen.getByText('Vybrány 4 dny')).toBeInTheDocument();
  expect(policko(/^Úterý 6\. října/)).toHaveAccessibleName(/vybráno$/);

  await uzivatel.click(policko(/^Úterý 6\. října/)); // odebere
  await uzivatel.click(policko(/^Pátek 16\. října/)); // přidá
  expect(screen.getByText('Vybrány 4 dny')).toBeInTheDocument();
  await uzivatel.click(screen.getByRole('button', { name: 'Vyplnit vybrané' }));
  expect(onOtevri).toHaveBeenCalledWith(['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-16']);

  await uzivatel.click(screen.getByRole('button', { name: 'Zrušit výběr' }));
  expect(screen.queryByText(/^Vybrán/)).not.toBeInTheDocument();
});

test('uzavřený měsíc: karta jen ke čtení, klik nic neotevře', async () => {
  const onOtevri = vi.fn();
  render(<Karta jenCteni onOtevri={onOtevri} dny={[den('2026-10-05', 'PRACE')]} />);
  const prace = policko(/^Pondělí 5\. října/);
  expect(prace).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(prace);
  await userEvent.keyboard('{Enter}');
  expect(onOtevri).not.toHaveBeenCalled();
});

test('dny mimo pracovní poměr nejdou otevřít', async () => {
  const onOtevri = vi.fn();
  render(<Karta onOtevri={onOtevri} nastup="2026-10-10" />);
  const pred = policko(/^Pátek 9\. října/);
  expect(pred).toHaveAccessibleName('Pátek 9. října: mimo pracovní poměr');
  await userEvent.click(pred);
  expect(onOtevri).not.toHaveBeenCalled();
  await userEvent.click(policko(/^Sobota 10\. října/));
  expect(onOtevri).toHaveBeenCalledWith(['2026-10-10']);
});

test('dlouhé podržení prstem den vybere a následný klik panel neotevře', async () => {
  vi.useFakeTimers();
  try {
    const onOtevri = vi.fn();
    render(<Karta onOtevri={onOtevri} />);
    const den = policko(/^Středa 14\. října/);
    fireEvent.pointerDown(den, { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.pointerUp(den, { pointerType: 'touch' });
    fireEvent.click(den);
    expect(onOtevri).not.toHaveBeenCalled();
    expect(screen.getByText('Vybrán 1 den')).toBeInTheDocument();
    // Krátké klepnutí ve výběru den přidá.
    fireEvent.pointerDown(policko(/^Čtvrtek 15\. října/), { pointerType: 'touch' });
    fireEvent.pointerUp(policko(/^Čtvrtek 15\. října/), { pointerType: 'touch' });
    fireEvent.click(policko(/^Čtvrtek 15\. října/));
    expect(screen.getByText('Vybrány 2 dny')).toBeInTheDocument();
    expect(onOtevri).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

/** Dlouhé podržení prstem na 14. 10. (den se vybere), dál podle `konec`. */
function podrz(konec: (den: HTMLElement) => void) {
  const den = policko(/^Středa 14\. října/);
  fireEvent.pointerDown(den, { pointerType: 'touch' });
  act(() => { vi.advanceTimersByTime(500); });
  konec(den);
  expect(screen.getByText('Vybrán 1 den')).toBeInTheDocument();
}

test('dlouhé podržení bez kliku (posun prstem, odjetí z dne) nespolkne další klepnutí', () => {
  vi.useFakeTimers();
  try {
    render(<Karta />);
    const patnact = () => policko(/^Čtvrtek 15\. října/);
    // Prohlížeč začal posouvat: přijde pointercancel a klik už ne. Další klik (třeba Enter) se musí počítat.
    podrz((den) => fireEvent.pointerCancel(den, { pointerType: 'touch' }));
    fireEvent.click(patnact());
    expect(screen.getByText('Vybrány 2 dny')).toBeInTheDocument();

    // Prst odjel z dne ještě při držení: klik na tenhle den nepřijde, další klik se počítá.
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit výběr' }));
    podrz((den) => fireEvent.pointerLeave(den, { pointerType: 'touch' }));
    fireEvent.click(patnact());
    expect(screen.getByText('Vybrány 2 dny')).toBeInTheDocument();

    // Nový stisk (i myší) začíná načisto.
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit výběr' }));
    podrz(() => {});
    fireEvent.pointerDown(patnact(), { pointerType: 'mouse' });
    fireEvent.click(patnact());
    expect(screen.getByText('Vybrány 2 dny')).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('po puštění prstu přijde pointerleave ještě před klikem: klik po dlouhém podržení se pořád spolkne', () => {
  vi.useFakeTimers();
  try {
    const onOtevri = vi.fn();
    render(<Karta onOtevri={onOtevri} />);
    podrz((den) => {
      fireEvent.pointerUp(den, { pointerType: 'touch' });
      fireEvent.pointerLeave(den, { pointerType: 'touch' });
      fireEvent.click(den);
    });
    expect(onOtevri).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test('den mimo pracovní poměr se zápisem jde otevřít (kvůli smazání), vybrat ho ale nejde', async () => {
  const onOtevri = vi.fn();
  render(<Karta onOtevri={onOtevri} ukonceni="2026-10-15" dny={[den('2026-10-20', 'PRACE')]} />);
  const zapsany = policko(/^Úterý 20\. října/);
  expect(zapsany).toHaveAccessibleName('Úterý 20. října: mimo pracovní poměr, zapsáno práce 8 h, nezapočítá se');
  expect(zapsany).not.toHaveAttribute('aria-disabled');
  const prazdny = policko(/^Středa 21\. října/);
  expect(prazdny).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(prazdny);
  expect(onOtevri).not.toHaveBeenCalled();
  await userEvent.click(zapsany);
  expect(onOtevri).toHaveBeenCalledWith(['2026-10-20']);

  // Ve výběru se den mimo pracovní poměr nepřidá a panel neotevře.
  onOtevri.mockClear();
  const uzivatel = userEvent.setup();
  await uzivatel.keyboard('{Control>}');
  await uzivatel.click(policko(/^Pondělí 12\. října/));
  await uzivatel.keyboard('{/Control}');
  expect(screen.getByText('Vybrán 1 den')).toBeInTheDocument();
  await uzivatel.click(policko(/^Úterý 20\. října/));
  expect(screen.getByText('Vybrán 1 den')).toBeInTheDocument();
  expect(onOtevri).not.toHaveBeenCalled();
});

test('uzavřený měsíc: ani den mimo pracovní poměr se zápisem nejde otevřít', async () => {
  const onOtevri = vi.fn();
  render(<Karta jenCteni onOtevri={onOtevri} ukonceni="2026-10-15" dny={[den('2026-10-20', 'PRACE')]} />);
  await userEvent.click(policko(/^Úterý 20\. října/));
  expect(onOtevri).not.toHaveBeenCalled();
});
