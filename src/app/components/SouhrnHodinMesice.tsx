import type { SouhrnHodin } from '../../core/typy';
import { formatHodin } from '../cisla';

const dni = (pocet: number) => `${pocet} ${pocet === 1 ? 'den' : pocet >= 2 && pocet <= 4 ? 'dny' : 'dní'}`;
const smen = (pocet: number) => `${pocet} ${pocet === 1 ? 'směna' : pocet >= 2 && pocet <= 4 ? 'směny' : 'směn'}`;

/** Krátký souhrn docházky pod kartou: jen nenulové položky. */
export function SouhrnHodinMesice({ hodiny: h }: { hodiny: SouhrnHodin }) {
  const polozky: [string, string][] = [
    ['Odpracováno', `${formatHodin(h.praceMin)} (${dni(h.odpracovaneDny)})`],
    ...(h.sobotaMin + h.nedeleMin > 0 ? [['Víkendy', formatHodin(h.sobotaMin + h.nedeleMin)] as [string, string]] : []),
    ...(h.svatekPraceMin > 0 ? [['Práce ve svátek', formatHodin(h.svatekPraceMin)] as [string, string]] : []),
    ...(h.dovolenaMin > 0 ? [['Dovolená', formatHodin(h.dovolenaMin)] as [string, string]] : []),
    ...(h.dnyNemocKalendarni > 0 ? [['Nemoc', dni(h.dnyNemocKalendarni)] as [string, string]] : []),
    ...(h.svatekZavrenoMin > 0 ? [['Svátek – zavřeno', formatHodin(h.svatekZavrenoMin)] as [string, string]] : []),
    ...(h.nahradniVolnoMin > 0 ? [['Náhradní volno', formatHodin(h.nahradniVolnoMin)] as [string, string]] : []),
    ...(h.neplaceneMin + h.absenceMin > 0 ? [['Neplacené a absence', formatHodin(h.neplaceneMin + h.absenceMin)] as [string, string]] : []),
    ['Stravenky', smen(h.smenyStravne)],
  ];
  return (
    <dl aria-label="Souhrn docházky" className="-mt-2 flex flex-wrap gap-x-6 gap-y-2 px-1 text-15">
      {polozky.map(([nazev, hodnota]) => (
        <div key={nazev} className="flex flex-col">
          <dt className="text-13 text-tlumeny">{nazev}</dt>
          <dd className="font-medium tabular-nums">{hodnota}</dd>
        </div>
      ))}
    </dl>
  );
}
